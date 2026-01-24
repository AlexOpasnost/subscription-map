"use client"

import { useMemo, useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { subscriptionCatalog, type Period, type Plan } from "@/lib/subscriptionCatalog"
import { supabase } from "@/lib/supabase/client"
import { useToast } from "@/components/ToastProvider"
import { humanizeError } from "@/lib/humanizeError"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"

function formatPriceDollars(price: number): string {
  return Number.isFinite(price) ? price.toFixed(2) : "0.00"
}

function planKey(p: Plan): string {
  return `${p.name}__${p.period}__${p.price}`
}

function isCustomPlan(p: Plan | undefined): boolean {
  if (!p) return true
  return p.name.trim().toLowerCase() === "custom" || p.price === 0
}

const FALLBACK_CUSTOM_PLAN: Plan = {
  name: "Custom",
  period: "monthly",
  price: 0,
  note: "Set your own price",
}

interface AddSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function AddSubscriptionDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddSubscriptionDialogProps) {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    serviceName: "",
    plan: "",
    price: "",
    period: "monthly" as Period,
    category: "",
  })
  const [servicePickerOpen, setServicePickerOpen] = useState(false)
  const [serviceQuery, setServiceQuery] = useState("")
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{
    service?: string
    price?: string
  }>({})

  useEffect(() => {
    if (!open) {
      // Reset form when dialog closes
      setFormData({
        serviceName: "",
        plan: "",
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceQuery("")
      setSelectedPlanKey("")
      setErrors({})
    }
  }, [open])

  const selectedService = useMemo(() => {
    const key = formData.serviceName.trim().toLowerCase()
    if (!key) return undefined
    return subscriptionCatalog.find((s) => s.name.trim().toLowerCase() === key)
  }, [formData.serviceName])

  const applyServiceSelection = (nextServiceName: string) => {
    const name = nextServiceName.trim()
    const match = subscriptionCatalog.find((s) => s.name.trim().toLowerCase() === name.toLowerCase())
    const plans = match?.plans ?? []
    const preferred =
      (match?.defaultPlanName
        ? plans.find((p) => p.name === match.defaultPlanName) ?? plans.find((p) => p.name.toLowerCase() === match.defaultPlanName!.toLowerCase())
        : undefined) ?? plans[0]

    setFormData((prev) => ({
      ...prev,
      serviceName: name,
      category: match?.category ?? prev.category,
      plan: preferred?.name ?? "",
      period: preferred?.period ?? prev.period,
      price: preferred && preferred.price > 0 ? formatPriceDollars(preferred.price) : "",
    }))
    setSelectedPlanKey(preferred ? planKey(preferred) : planKey(FALLBACK_CUSTOM_PLAN))
    setServicePickerOpen(false)
    setServiceQuery("")
    setErrors((e) => ({ ...e, service: undefined }))
  }

  const handlePlanSelection = (key: string) => {
    if (loading) return
    const plans = selectedService?.plans ?? (formData.serviceName.trim() ? [FALLBACK_CUSTOM_PLAN] : [])
    const match = plans.find((p) => planKey(p) === key)
    if (!match) return

    setFormData((prev) => ({
      ...prev,
      plan: match.name,
      period: match.period,
      price: match.price > 0 ? formatPriceDollars(match.price) : "",
      category: selectedService?.category ?? prev.category,
    }))
    setSelectedPlanKey(key)
  }

  const validateForm = (): boolean => {
    const newErrors: { service?: string; price?: string } = {}

    if (!formData.serviceName.trim()) {
      newErrors.service = "Service is required"
    }

    const effectivePlans = selectedService?.plans ?? (formData.serviceName.trim() ? [FALLBACK_CUSTOM_PLAN] : [])
    const selectedPlan = effectivePlans.find((p) => planKey(p) === selectedPlanKey) ?? effectivePlans[0]
    const typed = parseFloat(formData.price)
    const hasTyped = formData.price.trim().length > 0
    const typedValid = hasTyped && !Number.isNaN(typed) && typed > 0

    if (isCustomPlan(selectedPlan)) {
      if (!typedValid) newErrors.price = "Enter your price"
    } else {
      if (!typedValid && !(selectedPlan && selectedPlan.price > 0)) newErrors.price = "Price is required"
      if (hasTyped && !typedValid) newErrors.price = "Please enter a valid price"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (loading) return
    
    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

      if (authError || !authUser) {
        if (process.env.NODE_ENV !== "production") console.error("Failed to get authenticated user:", authError)
        toast({
          title: "You’re signed out",
          description: "Please sign in again and retry.",
          variant: "error",
        })
        return
      }

      const effectivePlans = selectedService?.plans ?? (formData.serviceName.trim() ? [FALLBACK_CUSTOM_PLAN] : [])
      const selectedPlan = effectivePlans.find((p) => planKey(p) === selectedPlanKey) ?? effectivePlans[0]
      const typed = parseFloat(formData.price)
      const typedValid = formData.price.trim().length > 0 && !Number.isNaN(typed) && typed > 0
      const priceCents =
        typedValid ? Math.round(typed * 100) : selectedPlan && selectedPlan.price > 0 ? Math.round(selectedPlan.price * 100) : 0
      const period = formData.period === "monthly" || formData.period === "yearly" 
        ? formData.period 
        : "monthly"
      const safeCategory = (formData.category ?? "").trim() || "Other"

      const { error } = await supabase
        .from("subscriptions")
        .insert({
          user_id: authUser.id,
          service: formData.serviceName.trim(),
          plan: formData.plan.trim() ? formData.plan.trim() : null,
          price_cents: priceCents,
          period: period,
          category: safeCategory,
          cancelled: false,
          cancel_url: selectedService?.cancelUrl?.trim() ? selectedService.cancelUrl.trim() : null,
        })

      if (error) {
        if (process.env.NODE_ENV !== "production") console.error(error)
        toast({
          title: "Couldn’t add subscription",
          description: humanizeError(error),
          variant: "error",
        })
        return
      }

      onOpenChange(false)
      toast({ title: "Subscription added", variant: "success" })
      onSuccess()
    } catch (error: unknown) {
      if (process.env.NODE_ENV !== "production") console.error(error)
      toast({
        title: "Couldn’t add subscription",
        description: humanizeError(error),
        variant: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add subscription</DialogTitle>
          <DialogDescription>
            Enter the details of your subscription
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="service">
                Service <span className="text-destructive">*</span>
              </Label>
              <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="service"
                    type="button"
                    variant="outline"
                    disabled={loading}
                    className={cn(
                      "w-full justify-between h-11 rounded-xl bg-white/5 border-white/10 text-foreground/90",
                      "hover:bg-white/6",
                      errors.service ? "border-destructive" : ""
                    )}
                    aria-label="Select a service"
                  >
                    <span className={cn("truncate text-left", formData.serviceName.trim() ? "" : "text-muted-foreground")}>
                      {formData.serviceName.trim() ? formData.serviceName.trim() : "Search services…"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[--radix-popover-trigger-width] p-0 bg-[rgba(19,20,23,0.92)] border border-white/10 rounded-2xl shadow-[0_22px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search (or type a custom service)…"
                      value={serviceQuery}
                      onValueChange={setServiceQuery}
                      disabled={loading}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return
                        const q = serviceQuery.trim()
                        if (!q) return
                        e.preventDefault()
                        const exact = subscriptionCatalog.find((s) => s.name.trim().toLowerCase() === q.toLowerCase())
                        applyServiceSelection(exact ? exact.name : q)
                      }}
                    />
                    <CommandList>
                      {(() => {
                        const q = serviceQuery.trim().toLowerCase()
                        const filtered = q ? subscriptionCatalog.filter((s) => s.name.toLowerCase().includes(q)) : subscriptionCatalog
                        const byCategory = new Map<string, typeof filtered>()
                        for (const svc of filtered) {
                          const cat = (svc.category || "Other").trim() || "Other"
                          const list = byCategory.get(cat) ?? []
                          list.push(svc)
                          byCategory.set(cat, list)
                        }

                        const exactMatch = q ? subscriptionCatalog.some((s) => s.name.trim().toLowerCase() === q) : false

                        return (
                          <>
                            <CommandEmpty>{q ? "No matches." : "Start typing to search."}</CommandEmpty>

                            {q && !exactMatch ? (
                              <>
                                <CommandGroup heading="Custom">
                                  <CommandItem value={`__create__:${q}`} onSelect={() => applyServiceSelection(serviceQuery)}>
                                    <span className="truncate">
                                      Create <span className="text-foreground/90 font-medium">“{serviceQuery.trim()}”</span>
                                    </span>
                                  </CommandItem>
                                </CommandGroup>
                                <CommandSeparator />
                              </>
                            ) : null}

                            {Array.from(byCategory.entries())
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([category, services]) => (
                                <CommandGroup key={category} heading={category}>
                                  {services
                                    .slice()
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .slice(0, 50)
                                    .map((svc) => {
                                      const isSelected =
                                        formData.serviceName.trim().toLowerCase() === svc.name.trim().toLowerCase()
                                      return (
                                        <CommandItem key={svc.name} value={svc.name} onSelect={() => applyServiceSelection(svc.name)}>
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              isSelected ? "opacity-100 text-foreground/90" : "opacity-0"
                                            )}
                                            aria-hidden="true"
                                          />
                                          <span className="truncate">{svc.name}</span>
                                        </CommandItem>
                                      )
                                    })}
                                </CommandGroup>
                              ))}
                          </>
                        )
                      })()}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.service && (
                <p className="text-sm text-destructive">{errors.service}</p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan">Plan</Label>
              <Select value={selectedPlanKey} onValueChange={handlePlanSelection} disabled={loading || !formData.serviceName.trim()}>
                <SelectTrigger id="plan" disabled={loading || !formData.serviceName.trim()}>
                  <SelectValue placeholder={formData.serviceName.trim() ? "Select a plan" : "Select a service first"} />
                </SelectTrigger>
                <SelectContent>
                  {(selectedService?.plans ?? [FALLBACK_CUSTOM_PLAN]).map((p) => (
                    <SelectItem key={planKey(p)} value={planKey(p)}>
                      {p.name} • {p.price > 0 ? `$${p.price.toFixed(2)}` : "Set price"} /{p.period === "monthly" ? "mo" : "yr"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Defaults are editable. Prices may vary by region.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">
                Price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => {
                  setFormData({ ...formData, price: e.target.value })
                  setErrors({ ...errors, price: undefined })
                }}
                className={errors.price ? "border-destructive" : ""}
                disabled={loading}
              />
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="period">Period</Label>
              <Select
                value={formData.period}
                onValueChange={(value: Period) =>
                  setFormData({ ...formData, period: value })
                }
                disabled={loading}
              >
                <SelectTrigger id="period" disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                type="text"
                placeholder="e.g., Entertainment"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} loadingText="Adding…">
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
