"use client"

import { useMemo, useState, useEffect } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { GlassSurface } from "@/components/ui/GlassSurface"
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
import { subscriptionCatalog, type Period } from "@/lib/subscriptionCatalog"
import { useAuth } from "@/lib/supabase/auth"
import { supabase } from "@/lib/supabase/client"
import { useToast } from "@/components/ToastProvider"
import { humanizeError, withTimeout } from "@/lib/humanizeError"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

interface AddSubscriptionFormProps {
  onSuccess: (created?: {
    id: string
    service: string
    plan: string | null
    price_cents: number
    period: "monthly" | "yearly"
    category: string
    cancelled: boolean
    renewal_date: string | null
    reminder_days: number
    created_at: string
  }) => void
  defaultOpen?: boolean
}

export default function AddSubscriptionForm({ onSuccess, defaultOpen = false }: AddSubscriptionFormProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const { user } = useAuth()
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
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string>("")
  const [touched, setTouched] = useState<{ service: boolean; price: boolean }>({
    service: false,
    price: false,
  })
  const [errors, setErrors] = useState<{
    service?: string
    price?: string
  }>({})

  const selectedService = useMemo(() => {
    const key = formData.serviceName.trim().toLowerCase()
    if (!key) return undefined
    return subscriptionCatalog.find((s) => s.serviceName.trim().toLowerCase() === key)
  }, [formData.serviceName])

  const planOptions = useMemo(() => {
    if (!selectedService) return []
    const fromDefaults = selectedService.defaultPlans ?? []
    const fromLegacyPlans = (selectedService.plans ?? []).map((p) => p.name)
    const merged = [...fromDefaults, ...fromLegacyPlans].map((s) => s.trim()).filter(Boolean)
    return Array.from(new Set(merged))
  }, [selectedService])
  const priceNumber = parseFloat(formData.price)
  const isValidPrice = !!formData.price.trim() && !isNaN(priceNumber) && priceNumber > 0
  const canSubmit = !!formData.serviceName.trim() && isValidPrice && !loading
  const serviceError =
    errors.service ?? (touched.service && !formData.serviceName.trim() ? "Service is required" : undefined)
  const priceError =
    errors.price ??
    (touched.price && !formData.price.trim()
      ? "Price is required"
      : touched.price && !isValidPrice
        ? "Please enter a valid price"
        : undefined)

  const applyServiceSelection = (nextServiceName: string) => {
    const name = nextServiceName.trim()
    const match = subscriptionCatalog.find((s) => s.serviceName.trim().toLowerCase() === name.toLowerCase())

    setFormData((prev) => {
      const nextCategory = match?.category ? match.category : prev.category
      const nextPeriod = match?.defaultPeriod ?? prev.period
      const nextPrice =
        typeof match?.defaultPriceCents === "number"
          ? (match.defaultPriceCents / 100).toFixed(2)
          : prev.price
      const nextPlan =
        match && match.defaultPlans?.length === 1 ? (match.defaultPlans?.[0] ?? "") : ""

      return {
        ...prev,
        serviceName: name,
        plan: nextPlan,
        category: nextCategory,
        period: nextPeriod,
        price: nextPrice,
      }
    })

    setServiceQuery("")
    setServicePickerOpen(false)
    setTouched((t) => ({ ...t, service: true }))
    setErrors((e) => ({ ...e, service: undefined }))
    setSubmitError("")
  }

  const validateForm = (): boolean => {
    const newErrors: { service?: string; price?: string } = {}
    setTouched({ service: true, price: true })

    if (!formData.serviceName.trim()) {
      newErrors.service = "Service is required"
    }

    const price = parseFloat(formData.price)
    if (!formData.price.trim()) {
      newErrors.price = "Price is required"
    } else if (isNaN(price) || price <= 0) {
      newErrors.price = "Please enter a valid price"
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
    setSubmitError("")

    if (!user) {
      setLoading(false)
      toast({
        title: "You’re signed out",
        description: "Please sign in again and retry.",
        variant: "error",
      })
      return
    }

    const price = parseFloat(formData.price)
    const priceCents = Math.round(price * 100)
    const period = formData.period === "monthly" || formData.period === "yearly" 
      ? formData.period 
      : "monthly"

    // Sanitize category: trim, limit length, remove invalid characters
    const sanitizedCategory = formData.category
      .trim()
      .substring(0, 50)
      .replace(/[<>]/g, "")
    const safeCategory = (sanitizedCategory ?? "").trim() || "Other"

    try {
      const { data: created, error } = await withTimeout(
        supabase
          .from("subscriptions")
          .insert({
            user_id: user.id,
            service: formData.serviceName.trim(),
            plan: formData.plan.trim() ? formData.plan.trim() : null,
            price_cents: priceCents,
            period: period,
            category: safeCategory,
            cancelled: false,
            cancel_url: selectedService?.cancelUrl?.trim() ? selectedService.cancelUrl.trim() : null,
          })
          .select("id,service,plan,price_cents,period,category,cancelled,renewal_date,reminder_days,created_at")
          .single()
      )

      if (error) {
        setSubmitError(humanizeError(error))
        toast({ title: "Couldn’t add subscription", description: humanizeError(error), variant: "error" })
        return
      }

      // Reset form
      setFormData({
        serviceName: "",
        plan: "",
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceQuery("")
      setErrors({})
      setTouched({ service: false, price: false })
      setIsOpen(false)
      toast({ title: "Subscription added", description: created?.service ?? formData.serviceName.trim(), variant: "success" })
      onSuccess(created || undefined)
    } catch (error: unknown) {
      const msg = humanizeError(error)
      setSubmitError(msg)
      toast({ title: "Couldn’t add subscription", description: msg, variant: "error" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setIsOpen(defaultOpen)
  }, [defaultOpen])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      // Reset form when accordion closes
      setFormData({
        serviceName: "",
        plan: "",
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceQuery("")
      setErrors({})
      setSubmitError("")
      setTouched({ service: false, price: false })
    }
  }

  return (
    <GlassSurface variant="subtle" className="p-0">
      <Accordion 
        type="single" 
        collapsible 
        className="w-full" 
        value={isOpen ? "add-subscription" : undefined}
        onValueChange={(value) => handleOpenChange(value === "add-subscription")}
      >
        <AccordionItem value="add-subscription" className="border-none">
          <AccordionTrigger
            className="px-5 sm:px-6 py-4 hover:no-underline rounded-[24px] text-foreground/90 transition-colors hover:bg-white/5 data-[state=open]:bg-white/5"
            disabled={loading}
          >
            <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Plus className="h-4 w-4 text-foreground/70" aria-hidden="true" />
              Add subscription
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-5 sm:px-6 pb-6 pt-0">
            <div>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="service">
                    Service <span className="text-muted-foreground">*</span>
                  </Label>
                  <Popover open={servicePickerOpen} onOpenChange={(open) => setServicePickerOpen(open)}>
                    <PopoverTrigger asChild>
                      <Button
                        id="service"
                        type="button"
                        variant="outline"
                        disabled={loading}
                        className={cn(
                          "w-full justify-between h-11 rounded-xl bg-white/5 border-white/10 text-foreground/90",
                          "hover:bg-white/6",
                          "active:scale-[0.99] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100",
                          serviceError ? "border-destructive" : ""
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
                            const exact = subscriptionCatalog.find(
                              (s) => s.serviceName.trim().toLowerCase() === q.toLowerCase()
                            )
                            applyServiceSelection(exact ? exact.serviceName : q)
                          }}
                        />
                        <CommandList>
                          {(() => {
                            const q = serviceQuery.trim().toLowerCase()
                            const filtered = q
                              ? subscriptionCatalog.filter((s) => s.serviceName.toLowerCase().includes(q))
                              : subscriptionCatalog
                            const byCategory = new Map<string, typeof filtered>()
                            for (const svc of filtered) {
                              const cat = (svc.category || "Other").trim() || "Other"
                              const list = byCategory.get(cat) ?? []
                              list.push(svc)
                              byCategory.set(cat, list)
                            }

                            const exactMatch = q
                              ? subscriptionCatalog.some((s) => s.serviceName.trim().toLowerCase() === q)
                              : false

                            return (
                              <>
                                <CommandEmpty>
                                  {q ? "No matches." : "Start typing to search."}
                                </CommandEmpty>

                                {q && !exactMatch ? (
                                  <>
                                    <CommandGroup heading="Custom">
                                      <CommandItem
                                        value={`__create__:${q}`}
                                        onSelect={() => applyServiceSelection(serviceQuery)}
                                      >
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
                                        .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
                                        .slice(0, 50)
                                        .map((svc) => {
                                          const isSelected =
                                            formData.serviceName.trim().toLowerCase() === svc.serviceName.trim().toLowerCase()
                                          return (
                                            <CommandItem
                                              key={svc.id}
                                              value={svc.serviceName}
                                              onSelect={() => applyServiceSelection(svc.serviceName)}
                                            >
                                              <Check
                                                className={cn(
                                                  "mr-2 h-4 w-4",
                                                  isSelected ? "opacity-100 text-foreground/90" : "opacity-0"
                                                )}
                                                aria-hidden="true"
                                              />
                                              <span className="truncate">{svc.serviceName}</span>
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
                  {serviceError && (
                    <p className="text-sm text-destructive">{serviceError}</p>
                  )}
                </div>

                {selectedService && planOptions.length > 0 ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="plan">Plan</Label>
                    <Select
                      value={formData.plan}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, plan: value }))}
                      disabled={loading}
                    >
                      <SelectTrigger id="plan" disabled={loading}>
                        <SelectValue placeholder="Select a plan (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {planOptions.map((plan) => (
                          <SelectItem key={plan} value={plan}>
                            {plan}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="price">
                    Price <span className="text-muted-foreground">*</span>
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
                      setSubmitError("")
                    }}
                    onBlur={() => setTouched((prev) => ({ ...prev, price: true }))}
                    className={priceError ? "border-destructive" : ""}
                    disabled={loading}
                  />
                  {priceError && (
                    <p className="text-sm text-destructive">{priceError}</p>
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
                    onChange={(e) => {
                      // Limit input length and sanitize
                      const value = e.target.value.substring(0, 50).replace(/[<>]/g, "")
                      setFormData({ ...formData, category: value })
                    }}
                    maxLength={50}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional (defaults to Other). Max 50 characters.
                  </p>
                </div>

                <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
                  <div className="flex-1 self-center min-h-5">
                    {submitError ? (
                      <p className="text-sm text-destructive">{submitError}</p>
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!canSubmit}
                    className={cn(
                      "w-full sm:w-auto",
                      "active:scale-[0.98] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
                    )}
                    loading={loading}
                    loadingText="Adding…"
                  >
                    Add
                  </Button>
                </div>
              </form>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </GlassSurface>
  )
}
