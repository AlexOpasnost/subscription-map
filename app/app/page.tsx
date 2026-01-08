"use client"

import { useState, useEffect } from "react"
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

type Period = "monthly" | "yearly"

interface Subscription {
  id: string
  name: string
  price: number
  period: Period
  category: string
}

export default function AppPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    period: "monthly" as Period,
    category: "",
  })

  // Load subscriptions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("subscriptions")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setSubscriptions(parsed)
      } catch (error) {
        console.error("Failed to load subscriptions:", error)
      }
    }
  }, [])

  // Save subscriptions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("subscriptions", JSON.stringify(subscriptions))
  }, [subscriptions])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.price || !formData.category) {
      return
    }

    const price = parseFloat(formData.price)
    if (isNaN(price) || price <= 0) {
      return
    }

    const newSubscription: Subscription = {
      id: Date.now().toString(),
      name: formData.name,
      price,
      period: formData.period,
      category: formData.category,
    }

    setSubscriptions([...subscriptions, newSubscription])
    setFormData({
      name: "",
      price: "",
      period: "monthly",
      category: "",
    })
  }

  const handleDelete = (id: string) => {
    setSubscriptions(subscriptions.filter((sub) => sub.id !== id))
  }

  // Calculate totals
  const totalMonthly = subscriptions.reduce((sum, sub) => {
    if (sub.period === "monthly") {
      return sum + sub.price
    } else {
      return sum + sub.price / 12
    }
  }, 0)

  const totalYearly = subscriptions.reduce((sum, sub) => {
    if (sub.period === "yearly") {
      return sum + sub.price
    } else {
      return sum + sub.price * 12
    }
  }, 0)

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Subscription Map</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add Subscription</CardTitle>
          <CardDescription>Enter the details of your subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Netflix"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

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

            <div className="space-y-2">
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

            <Button type="submit">Add Subscription</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Your active subscriptions</CardDescription>
          </CardHeader>
          <CardContent>
            {subscriptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No subscriptions yet. Add one above to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-4 border rounded-md"
                  >
                    <div>
                      <h3 className="font-semibold">{sub.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {sub.category} • ${sub.price.toFixed(2)}/{sub.period === "monthly" ? "mo" : "yr"}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(sub.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {subscriptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
              <CardDescription>Your subscription costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Monthly Cost:</span>
                  <span className="font-semibold text-lg">
                    ${totalMonthly.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Yearly Cost:</span>
                  <span className="font-semibold text-lg">
                    ${totalYearly.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

