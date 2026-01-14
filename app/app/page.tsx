"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import Link from "next/link"
import PageShell from "@/components/PageShell"

interface Subscription {
  id: string
  service: string
  plan: string | null
  price_cents: number
  period: Period
  category: string
  cancelled: boolean
  created_at: string
}

export default function AppPage() {
  const { user, signOut } = useAuth()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    serviceName: "",
    selectedPlanIndex: null as number | null,
    price: "",
    period: "monthly" as Period,
    category: "",
  })
  const [serviceSearch, setServiceSearch] = useState("")
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const serviceDropdownRef = useRef<HTMLDivElement>(null)
  const serviceInputRef = useRef<HTMLInputElement>(null)

  // Filter services based on search
  const filteredServices = subscriptionCatalog.filter((service) =>
    service.serviceName.toLowerCase().includes(serviceSearch.toLowerCase())
  )

  // Get selected service
  const selectedService = subscriptionCatalog.find(
    (service) => service.serviceName === formData.serviceName
  )

  // Get available plans for selected service
  const availablePlans = selectedService?.plans || []

  // Load subscriptions from Supabase
  const loadSubscriptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,service,plan,price_cents,period,category,cancelled,created_at")
        .order("created_at", { ascending: false })

      if (error) {
        console.error(error)
        return
      }
      setSubscriptions(data || [])
    } catch (error: any) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    loadSubscriptions()
  }, [user, loadSubscriptions])

  // Close dropdown when clicking outside
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

    // Validate required fields
    if (!formData.serviceName || !formData.price || !formData.category) {
      return
    }

    // Check if plan is selected (required)
    if (formData.selectedPlanIndex === null || availablePlans.length === 0) {
      alert("Please select a plan")
      return
    }

    const selectedPlan = availablePlans[formData.selectedPlanIndex]
    if (!selectedPlan) {
      alert("Invalid plan selected. Please select a plan again.")
      return
    }

    const price = parseFloat(formData.price)
    if (isNaN(price) || price <= 0) {
      return
    }

    // Get user_id from Supabase auth session to ensure RLS works
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !authUser) {
      console.error("Failed to get authenticated user:", {
        error: authError,
        message: authError?.message || "Unknown auth error",
        code: authError?.code || "No code",
      })
      return
    }

    const priceCents = Math.round(price * 100)

    // Validate period is exactly 'monthly' or 'yearly'
    const period = formData.period === "monthly" || formData.period === "yearly" 
      ? formData.period 
      : "monthly"

    try {
      const insertData = {
        user_id: authUser.id,
        service: formData.serviceName.trim(),
        plan: selectedPlan.name.trim(),
        price_cents: priceCents,
        period: period,
        category: formData.category.trim(),
        cancelled: false,
      }

      const { error } = await supabase
        .from("subscriptions")
        .insert(insertData)

      if (error) {
        console.error(error)
        return
      }

      // Reload subscriptions after successful insert
      await loadSubscriptions()

      setFormData({
        serviceName: "",
        selectedPlanIndex: null,
        price: "",
        period: "monthly",
        category: "",
      })
      setServiceSearch("")
    } catch (error: any) {
      console.error(error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", id)

      if (error) {
        console.error(error)
        return
      }

      setSubscriptions(subscriptions.filter((sub) => sub.id !== id))
    } catch (error: any) {
      console.error(error)
    }
  }

  const handleToggleCancelled = async (id: string) => {
    const subscription = subscriptions.find((sub) => sub.id === id)
    if (!subscription) return

    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ cancelled: !subscription.cancelled })
        .eq("id", id)

      if (error) {
        console.error(error)
        return
      }

      setSubscriptions(
        subscriptions.map((sub) =>
          sub.id === id ? { ...sub, cancelled: !sub.cancelled } : sub
        )
      )
    } catch (error: any) {
      console.error(error)
    }
  }

  const handleCancelSubscription = async (id: string) => {
    const subscription = subscriptions.find((sub) => sub.id === id)
    if (!subscription) return

    // Find the service in catalog to get cancelUrl
    const catalogService = subscriptionCatalog.find(
      (service) => service.serviceName === subscription.service
    )
    const cancelUrl = catalogService?.cancelUrl

    // If no cancel URL, show friendly message
    if (!cancelUrl) {
      alert(
        `Cancel URL not available for ${subscription.service}. Please visit the provider's website to cancel your subscription.`
      )
      return
    }

    // Open cancel URL in new tab immediately (before async operations to avoid popup blocker)
    const newWindow = window.open(cancelUrl, "_blank", "noopener,noreferrer")

    // Mark as cancelled in DB (if not already cancelled)
    if (!subscription.cancelled) {
      try {
        const { error } = await supabase
          .from("subscriptions")
          .update({ cancelled: true })
          .eq("id", id)

        if (error) {
          console.error(error)
          // If window was blocked, user can try again
          if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
            alert("Popup was blocked. Please allow popups for this site and try again, or manually visit the cancel page.")
          }
          return
        }

        setSubscriptions(
          subscriptions.map((sub) =>
            sub.id === id ? { ...sub, cancelled: true } : sub
          )
        )
      } catch (error: any) {
        console.error(error)
      }
    }
  }


  // Calculate totals (excluding cancelled subscriptions)
  const activeSubscriptions = subscriptions.filter((sub) => !sub.cancelled)

  const totalMonthly = activeSubscriptions.reduce((sum, sub) => {
    const price = sub.price_cents / 100
    if (sub.period === "monthly") {
      return sum + price
    } else {
      return sum + price / 12
    }
  }, 0)

  const totalYearly = activeSubscriptions.reduce((sum, sub) => {
    const price = sub.price_cents / 100
    if (sub.period === "yearly") {
      return sum + price
    } else {
      return sum + price * 12
    }
  }, 0)

  if (loading) {
    return (
      <PageShell title="Subscriptions" maxWidth="4xl">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Subscriptions"
      description="Make informed decisions about recurring expenses"
      actions={
        <>
          <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
            <Link href="/app/map">View Map</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={signOut} className="w-full sm:w-auto">
            Sign Out
          </Button>
        </>
      }
      maxWidth="4xl"
    >

      <Card className="mb-6 sm:mb-8">
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

            <div className="sm:col-span-2">
              <Button type="submit" className="w-full sm:w-auto">Add Subscription</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6 sm:space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Your active subscriptions</CardDescription>
          </CardHeader>
          <CardContent>
            {subscriptions.length === 0 ? (
              <div className="py-12 sm:py-16 text-center space-y-4">
                <h3 className="text-lg sm:text-xl font-semibold">
                  You're all set — now add your first subscription
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
                  Add a subscription to start visualizing where your money goes every month.
                </p>
                <Button
                  onClick={() => {
                    document.getElementById("service")?.focus()
                  }}
                  className="mt-4"
                >
                  Add subscription
                </Button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {subscriptions.map((sub) => {
                  const price = sub.price_cents / 100
                  const monthlyPrice = sub.period === "monthly" ? price : price / 12
                  const yearlyPrice = sub.period === "yearly" ? price : price * 12
                  return (
                    <div
                      key={sub.id}
                      className={`group relative bg-card border border-border rounded-xl p-3 sm:p-5 shadow-sm transition-all hover:shadow-md ${
                        sub.cancelled ? "opacity-50" : ""
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className={`text-base sm:text-lg font-semibold leading-tight break-words ${
                              sub.cancelled ? "line-through text-muted-foreground" : ""
                            }`}>
                              {sub.service}
                            </h3>
                          </div>
                          <div className="flex items-baseline gap-2 shrink-0">
                            <span className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                              ${monthlyPrice.toFixed(2)}
                            </span>
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                              /mo
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {sub.plan && (
                            <span className="text-xs sm:text-sm text-muted-foreground break-words">
                              {sub.plan}
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                            {sub.category}
                          </span>
                          {sub.cancelled && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                              Inactive
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            ${yearlyPrice.toFixed(0)}/yr
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                          {!sub.cancelled && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelSubscription(sub.id)}
                                className="w-full sm:w-auto"
                              >
                                Manage
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Delete ${sub.service}? This cannot be undone.`)) {
                                    handleDelete(sub.id)
                                  }
                                }}
                                className="w-full sm:w-auto"
                              >
                                Delete
                              </Button>
                            </>
                          )}
                          <Checkbox
                            checked={sub.cancelled || false}
                            onChange={() => handleToggleCancelled(sub.id)}
                            label="Paused"
                            className="shrink-0"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {subscriptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
              <CardDescription>
                Your subscription costs {activeSubscriptions.length !== subscriptions.length && `(excluding ${subscriptions.length - activeSubscriptions.length} inactive)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm sm:text-base text-muted-foreground">Total Monthly Cost:</span>
                  <span className="font-semibold text-base sm:text-lg">
                    ${totalMonthly.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm sm:text-base text-muted-foreground">Total Yearly Cost:</span>
                  <span className="font-semibold text-base sm:text-lg">
                    ${totalYearly.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  )
}
