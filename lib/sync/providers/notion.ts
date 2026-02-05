import type { SupabaseClient } from "@supabase/supabase-js"

import type { IntegrationRow, SyncAction } from "@/lib/sync/types"
import { getObject, getString, isRecord } from "@/lib/sync/shared"

type TaskRow = { id: string; title: string; due_at: string | null; due_date: string | null; status: string; amount_cents: number | null; currency: string; meta: unknown }
type SubscriptionRow = { id: string; service: string; renewal_date: string | null; price_cents: number; period: string; cancelled: boolean; meta: unknown }
type PersonRow = { id: string; name: string; birth_date: string | null }

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

async function updateIntegrationMeta(
  supabase: SupabaseClient,
  integrationId: string,
  nextMeta: Record<string, unknown>,
  nextMetadata?: Record<string, unknown>
) {
  const payload: Record<string, unknown> = { meta: nextMeta }
  if (nextMetadata) payload.metadata = nextMetadata
  const { error } = await supabase.from("integrations").update(payload).eq("id", integrationId)
  if (error) throw error
}

async function getExternalId(
  supabase: SupabaseClient,
  input: { userId: string; provider: "notion"; targetType: string; targetId: string }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .maybeSingle()
  if (error) return null
  const id = typeof (data as any)?.external_id === "string" ? String((data as any).external_id) : ""
  return id.trim() ? id.trim() : null
}

async function upsertExternalId(
  supabase: SupabaseClient,
  input: { userId: string; provider: "notion"; targetType: string; targetId: string; externalId: string }
) {
  await supabase
    .from("external_links")
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        target_type: input.targetType,
        target_id: input.targetId,
        external_id: input.externalId,
      },
      { onConflict: "user_id,provider,target_type,target_id" }
    )
}

async function deleteExternalId(
  supabase: SupabaseClient,
  input: { userId: string; provider: "notion"; targetType: string; targetId: string }
) {
  await supabase
    .from("external_links")
    .delete()
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
}

type NotionPropertyMap = {
  title: string
  type?: { name: string; kind: "select" | "multi_select" | "rich_text" }
  date?: { name: string }
  amount?: { name: string }
  status?: { name: string; kind: "status" | "select" | "rich_text" }
}

function pickPropertyByName(props: Record<string, unknown>, names: string[], type?: string): string | null {
  const normalized = new Map<string, string>()
  for (const k of Object.keys(props)) normalized.set(k.trim().toLowerCase(), k)
  for (const wanted of names) {
    const found = normalized.get(wanted.trim().toLowerCase())
    if (!found) continue
    if (!type) return found
    const def = props[found]
    if (isRecord(def) && def.type === type) return found
  }
  return null
}

async function resolvePropertyMap(accessToken: string, databaseId: string): Promise<NotionPropertyMap> {
  const db = await notionRequest(accessToken, `/databases/${databaseId}`, { method: "GET" })
  if (!isRecord(db)) throw new Error("Notion database response invalid")
  const props = isRecord(db.properties) ? (db.properties as Record<string, unknown>) : null
  if (!props) throw new Error("Notion database has no properties")

  const title = (() => {
    for (const [name, def] of Object.entries(props)) {
      if (isRecord(def) && def.type === "title") return name
    }
    return ""
  })()
  if (!title) throw new Error("Could not find a title property in the Notion database")

  const typeSelect = pickPropertyByName(props, ["Type", "Item Type"], "select")
  const typeMulti = pickPropertyByName(props, ["Type", "Item Type"], "multi_select")
  const typeRich = pickPropertyByName(props, ["Type", "Item Type"], "rich_text")
  const date = pickPropertyByName(props, ["Date", "Due", "When"], "date")
  const amount = pickPropertyByName(props, ["Amount", "Price", "Cost"], "number")
  const statusStatus = pickPropertyByName(props, ["Status"], "status")
  const statusSelect = pickPropertyByName(props, ["Status"], "select")
  const statusRich = pickPropertyByName(props, ["Status"], "rich_text")

  const out: NotionPropertyMap = { title }
  if (typeSelect) out.type = { name: typeSelect, kind: "select" }
  else if (typeMulti) out.type = { name: typeMulti, kind: "multi_select" }
  else if (typeRich) out.type = { name: typeRich, kind: "rich_text" }
  if (date) out.date = { name: date }
  if (amount) out.amount = { name: amount }
  if (statusStatus) out.status = { name: statusStatus, kind: "status" }
  else if (statusSelect) out.status = { name: statusSelect, kind: "select" }
  else if (statusRich) out.status = { name: statusRich, kind: "rich_text" }
  return out
}

async function upsertNotionPage(
  accessToken: string,
  input: { databaseId: string; props: Record<string, unknown>; existingPageId?: string }
): Promise<{ pageId: string }> {
  if (input.existingPageId) {
    const pageId = input.existingPageId
    const updated = await notionRequest(accessToken, `/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: input.props,
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
      properties: input.props,
    }),
  })
  const id = getString(isRecord(created) ? created.id : "")
  if (!id) throw new Error("Notion create returned no page id")
  return { pageId: id }
}

export async function pushToNotion(
  supabase: SupabaseClient,
  integration: IntegrationRow,
  input: { action: SyncAction; targetType: string; targetId: string; log: (msg: string) => Promise<void> }
): Promise<void> {
  const mergedMeta = getObject(integration.metadata ?? integration.meta)
  const databaseId = getString(mergedMeta.notion_database_id)
  if (!databaseId) {
    throw new Error("Notion database id is not set. Set it in Settings → Integrations.")
  }

  const accessToken = integration.access_token

  // Resolve (and cache) property mapping.
  let propMap = (mergedMeta as any).notion_property_map as unknown
  let map: NotionPropertyMap | null = null
  if (isRecord(propMap) && typeof (propMap as any).title === "string") {
    map = propMap as NotionPropertyMap
  }
  if (!map) {
    await input.log("Resolving Notion database property mapping…")
    map = await resolvePropertyMap(accessToken, databaseId)
    const nextMeta = { ...mergedMeta, notion_property_map: map }
    await updateIntegrationMeta(supabase, integration.id, nextMeta, nextMeta)
    await input.log("Saved Notion property mapping.")
  }

  const userId = integration.user_id
  const targetType = input.targetType
  const targetId = input.targetId

  if (input.action === "delete") {
    const pageId = await getExternalId(supabase, { userId, provider: "notion", targetType, targetId })
    if (pageId) {
      // Notion "delete" is archive.
      await input.log("Archiving Notion page…")
      await notionRequest(accessToken, `/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ archived: true }) })
    }
    await deleteExternalId(supabase, { userId, provider: "notion", targetType, targetId })
    await input.log("Deleted external link.")
    return
  }

  function buildProps(input: {
    title: string
    type?: string
    dateIsoOrDateOnly?: string | null
    amountNumber?: number | null
    status?: string
  }): Record<string, unknown> {
    const props: Record<string, unknown> = {
      [map!.title]: { title: [{ text: { content: input.title } }] },
    }
    if (map!.type && input.type) {
      if (map!.type.kind === "select") props[map!.type.name] = { select: { name: input.type } }
      else if (map!.type.kind === "multi_select") props[map!.type.name] = { multi_select: [{ name: input.type }] }
      else props[map!.type.name] = { rich_text: [{ text: { content: input.type } }] }
    }
    if (map!.date && input.dateIsoOrDateOnly) {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(input.dateIsoOrDateOnly)
      props[map!.date.name] = { date: { start: m ? m[1] : input.dateIsoOrDateOnly } }
    }
    if (map!.amount && typeof input.amountNumber === "number" && Number.isFinite(input.amountNumber)) {
      props[map!.amount.name] = { number: input.amountNumber }
    }
    if (map!.status && input.status) {
      if (map!.status.kind === "status") props[map!.status.name] = { status: { name: input.status } }
      else if (map!.status.kind === "select") props[map!.status.name] = { select: { name: input.status } }
      else props[map!.status.name] = { rich_text: [{ text: { content: input.status } }] }
    }
    return props
  }

  if (targetType === "task") {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,due_at,due_date,status,amount_cents,currency,meta")
      .eq("id", targetId)
      .single()
    if (error) throw error
    const task = data as TaskRow
    const existingPageId = await getExternalId(supabase, { userId, provider: "notion", targetType: "task", targetId: task.id })
    const due = task.due_at ?? task.due_date
    const amount = typeof task.amount_cents === "number" ? task.amount_cents / 100 : null
    const props = buildProps({ title: task.title, type: "Task", dateIsoOrDateOnly: due, amountNumber: amount, status: task.status })
    await input.log(existingPageId ? "Updating Notion page for task…" : "Creating Notion page for task…")
    const { pageId } = await upsertNotionPage(accessToken, { databaseId, props, existingPageId: existingPageId || undefined })
    await upsertExternalId(supabase, { userId, provider: "notion", targetType: "task", targetId: task.id, externalId: pageId })
    await input.log(`Saved notion_page_id=${pageId}`)
    return
  }

  if (targetType === "subscription") {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,service,renewal_date,price_cents,period,cancelled,meta")
      .eq("id", targetId)
      .single()
    if (error) throw error
    const sub = data as SubscriptionRow
    const existingPageId = await getExternalId(supabase, { userId, provider: "notion", targetType: "subscription", targetId: sub.id })
    const amount = typeof sub.price_cents === "number" ? sub.price_cents / 100 : null
    const status = sub.cancelled ? "Cancelled" : "Active"
    const props = buildProps({
      title: sub.service,
      type: "Subscription",
      dateIsoOrDateOnly: sub.renewal_date,
      amountNumber: amount,
      status,
    })
    await input.log(existingPageId ? "Updating Notion page for subscription…" : "Creating Notion page for subscription…")
    const { pageId } = await upsertNotionPage(accessToken, { databaseId, props, existingPageId: existingPageId || undefined })
    await upsertExternalId(supabase, { userId, provider: "notion", targetType: "subscription", targetId: sub.id, externalId: pageId })
    await input.log(`Saved notion_page_id=${pageId}`)
    return
  }

  if (targetType === "person") {
    const { data, error } = await supabase.from("people").select("id,name,birth_date").eq("id", targetId).single()
    if (error) throw error
    const person = data as PersonRow
    const existingPageId = await getExternalId(supabase, { userId, provider: "notion", targetType: "person", targetId: person.id })
    // Use next occurrence as the date (helps "what's coming up").
    let dateOnly: string | null = null
    if (person.birth_date) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.birth_date.trim())
      if (m) {
        const mm = Number(m[2])
        const dd = Number(m[3])
        const now = new Date()
        const y = now.getUTCFullYear()
        const thisYear = new Date(Date.UTC(y, mm - 1, dd, 0, 0, 0))
        dateOnly = thisYear.getTime() >= now.getTime() ? `${y}-${m[2]}-${m[3]}` : `${y + 1}-${m[2]}-${m[3]}`
      }
    }
    const props = buildProps({ title: person.name, type: "Birthday", dateIsoOrDateOnly: dateOnly, status: "Active" })
    await input.log(existingPageId ? "Updating Notion page for birthday…" : "Creating Notion page for birthday…")
    const { pageId } = await upsertNotionPage(accessToken, { databaseId, props, existingPageId: existingPageId || undefined })
    await upsertExternalId(supabase, { userId, provider: "notion", targetType: "person", targetId: person.id, externalId: pageId })
    await input.log(`Saved notion_page_id=${pageId}`)
    return
  }

  throw new Error(`Unsupported target_type for Notion: ${targetType}`)
}

