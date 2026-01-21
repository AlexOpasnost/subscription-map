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
import { subscriptionCatalog, type Period } from "@/lib/subscriptionCatalog"
import { supabase } from "@/lib/supabase/client"
import { useToast } from "@/components/ToastProvider"
import { humanizeError } from "@/lib/humanizeError"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"

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

    setFormData((prev) => ({
      ...prev,
      serviceName: name,
      category: match?.category ?? prev.category,
      period: match?.defaultPeriod ?? prev.period,
      price:
        match?.defaultPriceCents && match.defaultPriceCents > 0
          ? (match.defaultPriceCents / 100).toFixed(2)
          : prev.price,
    }))
    setServicePickerOpen(false)
    setServiceQuery("")
    setErrors((e) => ({ ...e, service: undefined }))
  }

  const validateForm = (): boolean => {
    const newErrors: { service?: string; price?: string } = {}

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

      const price = parseFloat(formData.price)
      const priceCents = Math.round(price * 100)
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
              <Input
                id="plan"
                type="text"
                placeholder="Optional (e.g., Family, Pro, Premium)"
                value={formData.plan}
                onChange={(e) => setFormData((prev) => ({ ...prev, plan: e.target.value }))}
                disabled={loading}
              />
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
