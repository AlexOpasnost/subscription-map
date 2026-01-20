"use client"

import { useState, useEffect, useRef } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
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
    selectedPlanIndex: null as number | null,
    price: "",
    period: "monthly" as Period,
    category: "",
  })
  const [serviceSearch, setServiceSearch] = useState("")
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
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
  const serviceDropdownRef = useRef<HTMLDivElement>(null)
  const serviceInputRef = useRef<HTMLInputElement>(null)

  const filteredServices = subscriptionCatalog.filter((service) =>
    service.serviceName.toLowerCase().includes(serviceSearch.toLowerCase())
  )

  const selectedService = subscriptionCatalog.find(
    (service) => service.serviceName === formData.serviceName
  )

  const availablePlans = selectedService?.plans || []
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        serviceDropdownRef.current &&
        !serviceDropdownRef.current.contains(event.target as Node) &&
        serviceInputRef.current &&
        !serviceInputRef.current.contains(event.target as Node)
      ) {
        setShowServiceDropdown(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleServiceSelect = (serviceName: string) => {
    setFormData({
      ...formData,
      serviceName,
      selectedPlanIndex: null,
      price: "",
      period: "monthly",
    })
    setServiceSearch(serviceName)
    setShowServiceDropdown(false)
    setErrors({ ...errors, service: undefined })
    setSubmitError("")
  }

  const handlePlanSelect = (planIndexStr: string) => {
    const planIndex = parseInt(planIndexStr, 10)
    const plan = availablePlans[planIndex]
    if (plan !== undefined) {
      setFormData({
        ...formData,
        selectedPlanIndex: planIndex,
        price: plan.price.toString(),
        period: plan.period,
      })
    }
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

    const selectedPlan = formData.selectedPlanIndex !== null && availablePlans.length > 0
      ? availablePlans[formData.selectedPlanIndex]
      : null

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
            plan: selectedPlan ? selectedPlan.name.trim() : null,
            price_cents: priceCents,
            period: period,
            category: safeCategory,
            cancelled: false,
            cancel_url: selectedService?.cancelUrl ?? null,
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
        selectedPlanIndex: null,
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceSearch("")
      setErrors({})
      setTouched({ service: false, price: false })
      setIsOpen(false)
      toast({ title: "Subscription added", variant: "success" })
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
        selectedPlanIndex: null,
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceSearch("")
      setErrors({})
      setSubmitError("")
      setTouched({ service: false, price: false })
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm border bg-card">
      <Accordion 
        type="single" 
        collapsible 
        className="w-full" 
        value={isOpen ? "add-subscription" : undefined}
        onValueChange={(value) => handleOpenChange(value === "add-subscription")}
      >
        <AccordionItem value="add-subscription" className="border-none">
          <AccordionTrigger
            className="px-4 py-3 hover:no-underline rounded-2xl bg-muted/20 text-foreground/90 shadow-sm border border-border/70 transition-colors hover:bg-accent"
            disabled={loading}
          >
            <span className="text-base font-medium">+ Add subscription</span>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="pt-0 pb-4">
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="service">
                    Service <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      ref={serviceInputRef}
                      id="service"
                      type="text"
                      placeholder="Search for a service..."
                      value={serviceSearch}
                      onChange={(e) => {
                        const next = e.target.value
                        setServiceSearch(next)
                        // Treat free-typed input as the service name (fixes “feels broken” when users don't click a dropdown item).
                        setFormData({ ...formData, serviceName: next, selectedPlanIndex: null })
                        setShowServiceDropdown(true)
                        setErrors({ ...errors, service: undefined })
                        setSubmitError("")
                      }}
                      onFocus={() => setShowServiceDropdown(true)}
                      onBlur={() => setTouched((prev) => ({ ...prev, service: true }))}
                      className={serviceError ? "border-destructive" : ""}
                      disabled={loading}
                    />
                    {showServiceDropdown && filteredServices.length > 0 && (
                      <div
                        ref={serviceDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
                      >
                        {filteredServices.map((service) => (
                          <button
                            key={service.serviceName}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
                            onClick={() => handleServiceSelect(service.serviceName)}
                            disabled={loading}
                          >
                            {service.serviceName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {serviceError && (
                    <p className="text-sm text-destructive">{serviceError}</p>
                  )}
                </div>

                {selectedService && availablePlans.length > 0 && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="plan">Plan</Label>
                    <Select 
                      value={formData.selectedPlanIndex !== null ? formData.selectedPlanIndex.toString() : ""} 
                      onValueChange={handlePlanSelect}
                    >
                      <SelectTrigger id="plan" disabled={loading}>
                        <SelectValue placeholder="Select a plan (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlans.map((plan, idx) => (
                          <SelectItem key={`plan-${idx}`} value={idx.toString()}>
                            {plan.name} - ${plan.price.toFixed(2)}/{plan.period === "monthly" ? "mo" : "yr"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

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
                    disabled={!canSubmit}
                    className="w-full sm:w-auto"
                    loading={loading}
                    loadingText="Adding…"
                  >
                    Add
                  </Button>
                </div>
              </form>
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}
