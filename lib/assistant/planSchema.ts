import { z } from "zod"

export const DestinationSchema = z.enum(["supabase", "notion", "google_calendar"])
export type Destination = z.infer<typeof DestinationSchema>

export const ActionTypeSchema = z.enum([
  "add_subscription",
  "create_task",
  "create_event",
  "create_note",
  "clarify",
  "query",
])
export type ActionType = z.infer<typeof ActionTypeSchema>

const CurrencySchema = z.enum(["USD", "EUR", "RUB"])
const PeriodSchema = z.enum(["monthly", "yearly"])

const IsoDateOnlySchema = z
  .string()
  .regex(/^\\d{4}-\\d{2}-\\d{2}$/, "Expected YYYY-MM-DD")
  .refine((s) => Number.isFinite(new Date(`${s}T00:00:00Z`).getTime()), "Invalid date")

const IsoDateTimeSchema = z
  .string()
  .refine((s) => Number.isFinite(new Date(s).getTime()), "Expected ISO datetime")

export const AssistantActionSchema = z
  .object({
    type: ActionTypeSchema,
    title: z.string().min(1).max(200),
    service: z.string().min(1).max(200).nullable(),
    plan: z.string().min(1).max(120).nullable(),
    price_cents: z.number().int().positive().nullable(),
    currency: CurrencySchema.nullable(),
    period: PeriodSchema.nullable(),
    category: z.string().min(1).max(50).nullable(),
    due_date: IsoDateOnlySchema.nullable(),
    start_datetime: IsoDateTimeSchema.nullable(),
    end_datetime: IsoDateTimeSchema.nullable(),
    remind_before_days: z.number().int().min(0).max(365).nullable(),
    destination: z.array(DestinationSchema).default(["supabase"]),
    details: z.string().max(2000).nullable(),
  })
  .strict()

export type AssistantAction = z.infer<typeof AssistantActionSchema>

export const AssistantPlanSchema = z
  .object({
    actions: z.array(AssistantActionSchema).min(1).max(8),
    reply: z.string().min(1).max(2000),
  })
  .strict()

export type AssistantPlan = z.infer<typeof AssistantPlanSchema>

function fallbackClarifyPlan(message: string): AssistantPlan {
  return {
    actions: [
      {
        type: "clarify",
        title: "Clarify your request",
        service: null,
        plan: null,
        price_cents: null,
        currency: null,
        period: null,
        category: null,
        due_date: null,
        start_datetime: null,
        end_datetime: null,
        remind_before_days: null,
        destination: ["supabase"],
        details: message.slice(0, 1800),
      },
    ],
    reply: "I need a bit more detail to proceed. What would you like me to create, and when/for how much?",
  }
}

export function parsePlanSafe(
  json: unknown
): { ok: true; plan: AssistantPlan } | { ok: false; error: string; fallbackPlan: AssistantPlan } {
  const parsed = AssistantPlanSchema.safeParse(json)
  if (parsed.success) return { ok: true, plan: parsed.data }

  const error = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
  return { ok: false, error, fallbackPlan: fallbackClarifyPlan(error) }
}

