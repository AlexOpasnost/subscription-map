import type { SupabaseClient } from "@supabase/supabase-js"

import type { IntegrationRow, SyncAction } from "@/lib/sync/types"
import { getObject, getString, isRecord } from "@/lib/sync/shared"

type TaskRow = { id: string; title: string; meta: unknown }
type PlanRow = { id: string; title: string; meta: unknown }
type SubscriptionRow = { id: string; service: string; meta: unknown }

async function notionRequest<T = unknown>(
  accessToken: string,
  path: string,
  init: RequestInit & { method: "GET" | "POST" | "PATCH" }
): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })

  if (!res.ok) {
    const details = await res.text()
    throw new Error(`Notion API error (${res.status}): ${details.slice(0, 800)}`)
  }

  return (await res.json()) as T
}

async function resolveNotionTitlePropertyName(accessToken: string, databaseId: string): Promise<string> {
  const db = await notionRequest(accessToken, `/databases/${databaseId}`, { method: "GET" })
  if (!isRecord(db)) throw new Error("Notion database response invalid")
  const props = db.properties
  if (!isRecord(props)) throw new Error("Notion database has no properties")
  for (const [name, def] of Object.entries(props)) {
    if (isRecord(def) && def.type === "title") return name
  }
  throw new Error("Could not find a title property in the Notion database")
}

async function updateIntegrationMeta(supabase: SupabaseClient, integrationId: string, nextMeta: Record<string, unknown>) {
  const { error } = await supabase.from("integrations").update({ meta: nextMeta }).eq("id", integrationId)
  if (error) throw error
}

async function updateRecordMeta(
  supabase: SupabaseClient,
  table: "tasks" | "plans" | "subscriptions",
  id: string,
  nextMeta: Record<string, unknown>
) {
  const { error } = await supabase.from(table).update({ meta: nextMeta }).eq("id", id)
  if (error) throw error
}

async function upsertNotionPage(
  accessToken: string,
  input: { databaseId: string; titleProperty: string; title: string; existingPageId?: string }
): Promise<{ pageId: string }> {
  if (input.existingPageId) {
    const pageId = input.existingPageId
    const updated = await notionRequest(accessToken, `/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          [input.titleProperty]: {
            title: [{ text: { content: input.title } }],
          },
        },
      }),
    })
    const id = getString(isRecord(updated) ? updated.id : "")
    if (!id) throw new Error("Notion update returned no page id")
    return { pageId: id }
  }

  const created = await notionRequest(accessToken, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: input.databaseId },
      properties: {
        [input.titleProperty]: {
          title: [{ text: { content: input.title } }],
        },
      },
    }),
  })
  const id = getString(isRecord(created) ? created.id : "")
  if (!id) throw new Error("Notion create returned no page id")
  return { pageId: id }
}

export async function pushToNotion(
  supabase: SupabaseClient,
  integration: IntegrationRow,
  input: { action: SyncAction; recordId: string; log: (msg: string) => Promise<void> }
): Promise<void> {
  const meta = getObject(integration.meta)
  const databaseId = getString(meta.notion_database_id)
  if (!databaseId) {
    throw new Error("Notion database id is not set. Set integrations.meta.notion_database_id first.")
  }

  const accessToken = integration.access_token

  let titleProperty = getString(meta.notion_title_property)
  if (!titleProperty) {
    await input.log("Resolving Notion title property from database schema…")
    titleProperty = await resolveNotionTitlePropertyName(accessToken, databaseId)
    const nextMeta = { ...meta, notion_title_property: titleProperty }
    await updateIntegrationMeta(supabase, integration.id, nextMeta)
    await input.log(`Saved notion_title_property=${titleProperty}`)
  }

  if (input.action === "push_task") {
    const { data, error } = await supabase.from("tasks").select("id,title,meta").eq("id", input.recordId).single()
    if (error) throw error
    const task = data as TaskRow
    const existingPageId = getString(getObject(task.meta).notion_page_id)
    await input.log(existingPageId ? "Updating Notion page for task…" : "Creating Notion page for task…")
    const { pageId } = await upsertNotionPage(accessToken, {
      databaseId,
      titleProperty,
      title: task.title,
      existingPageId: existingPageId || undefined,
    })
    const nextMeta = { ...getObject(task.meta), notion_page_id: pageId }
    await updateRecordMeta(supabase, "tasks", task.id, nextMeta)
    await input.log(`Saved notion_page_id=${pageId}`)
    return
  }

  if (input.action === "push_plan") {
    const { data, error } = await supabase.from("plans").select("id,title,meta").eq("id", input.recordId).single()
    if (error) throw error
    const plan = data as PlanRow
    const existingPageId = getString(getObject(plan.meta).notion_page_id)
    await input.log(existingPageId ? "Updating Notion page for plan…" : "Creating Notion page for plan…")
    const { pageId } = await upsertNotionPage(accessToken, {
      databaseId,
      titleProperty,
      title: plan.title,
      existingPageId: existingPageId || undefined,
    })
    const nextMeta = { ...getObject(plan.meta), notion_page_id: pageId }
    await updateRecordMeta(supabase, "plans", plan.id, nextMeta)
    await input.log(`Saved notion_page_id=${pageId}`)
    return
  }

  if (input.action === "push_subscription") {
    const { data, error } = await supabase.from("subscriptions").select("id,service,meta").eq("id", input.recordId).single()
    if (error) throw error
    const sub = data as SubscriptionRow
    const existingPageId = getString(getObject(sub.meta).notion_page_id)
    await input.log(existingPageId ? "Updating Notion page for subscription…" : "Creating Notion page for subscription…")
    const { pageId } = await upsertNotionPage(accessToken, {
      databaseId,
      titleProperty,
      title: sub.service,
      existingPageId: existingPageId || undefined,
    })
    const nextMeta = { ...getObject(sub.meta), notion_page_id: pageId }
    await updateRecordMeta(supabase, "subscriptions", sub.id, nextMeta)
    await input.log(`Saved notion_page_id=${pageId}`)
    return
  }

  const neverAction: never = input.action
  throw new Error(`Unsupported action: ${neverAction}`)
}

