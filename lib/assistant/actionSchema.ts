import { z } from "zod"

export const PeriodSchema = z.enum(["monthly", "yearly"])
export type Period = z.infer<typeof PeriodSchema>

export const TimeframeSchema = z.enum(["month", "year", "all"])
export type Timeframe = z.infer<typeof TimeframeSchema>

const IsoDateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
  .refine((s) => Number.isFinite(new Date(`${s}T00:00:00Z`).getTime()), "Invalid date")

const SuggestionsSchema = z.array(z.string().min(1).max(200)).min(1).max(6)

export const AddTaskActionSchema = z
  .object({
    type: z.literal("add_task"),
    title: z.string().min(1).max(200),
    due_date: IsoDateOnlySchema.optional(),
    remind_days_before: z.number().int().min(0).max(365).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()

export const AddSubscriptionActionSchema = z
  .object({
    type: z.literal("add_subscription"),
    service: z.string().min(1).max(120),
    plan: z.string().min(1).max(120).optional(),
    price_cents: z.number().int().positive().optional(),
    period: PeriodSchema.optional(),
    category: z.string().min(1).max(50).optional(),
    next_renewal: IsoDateOnlySchema.optional(),
    remind_days_before: z.number().int().min(0).max(365).optional(),
  })
  .strict()

export const AddPlanActionSchema = z
  .object({
    type: z.literal("add_plan"),
    title: z.string().min(1).max(200),
    date: IsoDateOnlySchema.optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()

export const QuestionSpendingActionSchema = z
  .object({
    type: z.literal("question_spending"),
    timeframe: TimeframeSchema.optional(),
  })
  .strict()

export const TimelineActionSchema = z
  .object({
    type: z.literal("timeline"),
    from: IsoDateOnlySchema.optional(),
    to: IsoDateOnlySchema.optional(),
  })
  .strict()

export const UnsupportedActionSchema = z
  .object({
    type: z.literal("unsupported"),
    reason: z.string().min(1).max(400),
    suggestions: SuggestionsSchema,
  })
  .strict()

export const ActionSchema = z.discriminatedUnion("type", [
  AddTaskActionSchema,
  AddSubscriptionActionSchema,
  AddPlanActionSchema,
  QuestionSpendingActionSchema,
  TimelineActionSchema,
  UnsupportedActionSchema,
])

export type Action = z.infer<typeof ActionSchema>

export function unsupported(reason: string, suggestions?: string[]): Action {
  return {
    type: "unsupported",
    reason,
    suggestions:
      suggestions && suggestions.length
        ? suggestions.slice(0, 6)
        : [
            "Add Spotify subscription $14.99 monthly",
            "Remind me to cancel Netflix on February 22",
            "How much am I spending this month?",
            "What do I have coming up this week?",
          ],
  }
}

