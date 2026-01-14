"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import PageShell from "@/components/PageShell"

export default function NewSubscriptionPage() {
  const router = useRouter()
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!formData.serviceName || !formData.price || !formData.category) {
      setLoading(false)
      return
    }

    if (formData.selectedPlanIndex === null || availablePlans.length === 0) {
      alert("Please select a plan")
      setLoading(false)
      return
    }

    const selectedPlan = availablePlans[formData.selectedPlanIndex]
    if (!selectedPlan) {
      alert("Invalid plan selected. Please select a plan again.")
      setLoading(false)
      return
    }

    const price = parseFloat(formData.price)
    if (isNaN(price) || price <= 0) {
      setLoading(false)
      return
    }

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !authUser) {
      console.error("Failed to get authenticated user:", authError)
      setLoading(false)
      return
    }

    const priceCents = Math.round(price * 100)
    const period = formData.period === "monthly" || formData.period === "yearly" 
      ? formData.period 
      : "monthly"

    try {
      const { error } = await supabase
        .from("subscriptions")
        .insert({
          user_id: authUser.id,
          service: formData.serviceName.trim(),
          plan: selectedPlan.name.trim(),
          price_cents: priceCents,
          period: period,
          category: formData.category.trim(),
          cancelled: false,
        })

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      router.push("/app")
    } catch (error: any) {
      console.error(error)
      setLoading(false)
    }
  }

  return (
    <PageShell
      title="Add Subscription"
      maxWidth="2xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Add Subscription</CardTitle>
          <CardDescription>Enter the details of your subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="service">Service</Label>
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
                  }}
                  onFocus={() => setShowServiceDropdown(true)}
                  required
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
            </div>

            {selectedService && availablePlans.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="plan">Plan</Label>
                <Select 
                  value={formData.selectedPlanIndex !== null ? formData.selectedPlanIndex.toString() : ""} 
                  onValueChange={handlePlanSelect}
                >
                  <SelectTrigger id="plan">
                    <SelectValue placeholder="Select a plan" />
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
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
              />
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
                required
              />
            </div>

            <div className="sm:col-span-2 flex gap-3">
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1 sm:flex-initial">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 sm:flex-initial">
                {loading ? "Adding..." : "Add Subscription"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  )
}
