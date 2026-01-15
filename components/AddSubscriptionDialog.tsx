"use client"

import { useState, useEffect, useRef } from "react"
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
  const { user } = useAuth()
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

  useEffect(() => {
    if (!open) {
      // Reset form when dialog closes
      setFormData({
        serviceName: "",
        selectedPlanIndex: null,
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceSearch("")
      setErrors({})
    }
  }, [open])

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
    
    if (!validateForm()) {
      return
    }

    setLoading(true)

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !authUser) {
      console.error("Failed to get authenticated user:", authError)
      setLoading(false)
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

    try {
      const { error } = await supabase
        .from("subscriptions")
        .insert({
          user_id: authUser.id,
          service: formData.serviceName.trim(),
          plan: selectedPlan ? selectedPlan.name.trim() : null,
          price_cents: priceCents,
          period: period,
          category: formData.category.trim() || null,
          cancelled: false,
        })

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error(error)
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
              <div className="relative">
                <Input
                  ref={serviceInputRef}
                  id="service"
                  type="text"
                  placeholder="Search for a service..."
                  value={serviceSearch}
                  onChange={(e) => {
                    setServiceSearch(e.target.value)
                    setShowServiceDropdown(true)
                    if (!e.target.value) {
                      setFormData({ ...formData, serviceName: "", selectedPlanIndex: null, price: "", period: "monthly" })
                    }
                    setErrors({ ...errors, service: undefined })
                  }}
                  onFocus={() => setShowServiceDropdown(true)}
                  className={errors.service ? "border-destructive" : ""}
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
                      >
                        {service.serviceName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.service && (
                <p className="text-sm text-destructive">{errors.service}</p>
              )}
            </div>

            {selectedService && availablePlans.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="plan">Plan</Label>
                <Select 
                  value={formData.selectedPlanIndex !== null ? formData.selectedPlanIndex.toString() : ""} 
                  onValueChange={handlePlanSelect}
                >
                  <SelectTrigger id="plan">
                    <SelectValue placeholder="Select a plan (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlans.map((plan, idx) => (
                      <SelectItem key={idx.toString()} value={idx.toString()}>
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
                }}
                className={errors.price ? "border-destructive" : ""}
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
              >
                <SelectTrigger id="period">
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
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
