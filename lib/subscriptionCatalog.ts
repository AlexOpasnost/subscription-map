export type Period = "monthly" | "yearly"

export interface Plan {
  name: string
  price: number
  period: Period
}

export interface SubscriptionService {
  serviceName: string
  country: string
  currency: string
  plans: Plan[]
  cancelUrl: string
}

export const subscriptionCatalog: SubscriptionService[] = [
  {
    serviceName: "Netflix",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Standard with Ads", price: 6.99, period: "monthly" },
      { name: "Standard", price: 15.49, period: "monthly" },
      { name: "Premium", price: 22.99, period: "monthly" },
    ],
    cancelUrl: "https://help.netflix.com/en/node/407",
  },
  {
    serviceName: "Spotify",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Individual", price: 10.99, period: "monthly" },
      { name: "Individual", price: 109.0, period: "yearly" },
      { name: "Duo", price: 14.99, period: "monthly" },
      { name: "Family", price: 16.99, period: "monthly" },
    ],
    cancelUrl: "https://www.spotify.com/us/account/subscription/",
  },
  {
    serviceName: "YouTube Premium",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Individual", price: 13.99, period: "monthly" },
      { name: "Family", price: 22.99, period: "monthly" },
    ],
    cancelUrl: "https://www.youtube.com/paid_memberships",
  },
  {
    serviceName: "Apple iCloud",
    country: "US",
    currency: "USD",
    plans: [
      { name: "50GB", price: 0.99, period: "monthly" },
      { name: "200GB", price: 2.99, period: "monthly" },
      { name: "2TB", price: 9.99, period: "monthly" },
      { name: "6TB", price: 29.99, period: "monthly" },
      { name: "12TB", price: 59.99, period: "monthly" },
    ],
    cancelUrl: "https://support.apple.com/en-us/HT201238",
  },
  {
    serviceName: "Google One",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Basic (100GB)", price: 1.99, period: "monthly" },
      { name: "Standard (200GB)", price: 2.99, period: "monthly" },
      { name: "Premium (2TB)", price: 9.99, period: "monthly" },
    ],
    cancelUrl: "https://one.google.com/storage",
  },
  {
    serviceName: "Amazon Prime",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Monthly", price: 14.99, period: "monthly" },
      { name: "Annual", price: 139.0, period: "yearly" },
    ],
    cancelUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GXH8F8BZJZQXZQJZ",
  },
  {
    serviceName: "Disney+",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Disney+ (with Ads)", price: 7.99, period: "monthly" },
      { name: "Disney+ (No Ads)", price: 13.99, period: "monthly" },
      { name: "Disney+ (No Ads) Annual", price: 139.99, period: "yearly" },
    ],
    cancelUrl: "https://help.disneyplus.com/article/cancel-subscription",
  },
  {
    serviceName: "Hulu",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Hulu (with Ads)", price: 7.99, period: "monthly" },
      { name: "Hulu (No Ads)", price: 17.99, period: "monthly" },
    ],
    cancelUrl: "https://help.hulu.com/s/article/cancel-subscription",
  },
  {
    serviceName: "HBO Max/Max",
    country: "US",
    currency: "USD",
    plans: [
      { name: "With Ads", price: 9.99, period: "monthly" },
      { name: "Ad-Free", price: 15.99, period: "monthly" },
      { name: "Ultimate Ad-Free", price: 19.99, period: "monthly" },
    ],
    cancelUrl: "https://help.max.com/contact-us",
  },
  {
    serviceName: "PlayStation Plus",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Essential (1 Month)", price: 9.99, period: "monthly" },
      { name: "Essential (12 Months)", price: 79.99, period: "yearly" },
      { name: "Extra (12 Months)", price: 134.99, period: "yearly" },
      { name: "Premium (12 Months)", price: 159.99, period: "yearly" },
    ],
    cancelUrl: "https://www.playstation.com/en-us/support/subscriptions/manage-cancel/",
  },
  {
    serviceName: "Xbox Game Pass",
    country: "US",
    currency: "USD",
    plans: [
      { name: "PC Game Pass", price: 9.99, period: "monthly" },
      { name: "Xbox Game Pass Ultimate", price: 16.99, period: "monthly" },
    ],
    cancelUrl: "https://account.microsoft.com/services/",
  },
  {
    serviceName: "Dropbox",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Plus (2TB)", price: 9.99, period: "monthly" },
      { name: "Plus (2TB) Annual", price: 99.99, period: "yearly" },
      { name: "Professional (3TB)", price: 16.99, period: "monthly" },
    ],
    cancelUrl: "https://www.dropbox.com/account/plan",
  },
  {
    serviceName: "Notion",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Plus", price: 8.0, period: "monthly" },
      { name: "Plus Annual", price: 80.0, period: "yearly" },
      { name: "Business", price: 15.0, period: "monthly" },
    ],
    cancelUrl: "https://www.notion.so/help/billing",
  },
  {
    serviceName: "Grammarly",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Premium Monthly", price: 12.0, period: "monthly" },
      { name: "Premium Annual", price: 144.0, period: "yearly" },
      { name: "Business", price: 15.0, period: "monthly" },
    ],
    cancelUrl: "https://www.grammarly.com/settings/subscription",
  },
  {
    serviceName: "ChatGPT Plus",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Plus", price: 20.0, period: "monthly" },
    ],
    cancelUrl: "https://chat.openai.com/account/billing",
  },
  {
    serviceName: "Canva",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Pro", price: 12.99, period: "monthly" },
      { name: "Pro Annual", price: 119.99, period: "yearly" },
    ],
    cancelUrl: "https://www.canva.com/help/article/cancel-subscription",
  },
  {
    serviceName: "Figma",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Professional", price: 12.0, period: "monthly" },
      { name: "Professional Annual", price: 120.0, period: "yearly" },
      { name: "Organization", price: 45.0, period: "monthly" },
    ],
    cancelUrl: "https://help.figma.com/hc/en-us/articles/360041003114",
  },
  {
    serviceName: "Adobe CC",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Creative Cloud All Apps", price: 59.99, period: "monthly" },
      { name: "Creative Cloud All Apps Annual", price: 599.88, period: "yearly" },
      { name: "Photoshop", price: 22.99, period: "monthly" },
    ],
    cancelUrl: "https://www.adobe.com/account/cancel.html",
  },
  {
    serviceName: "Microsoft 365",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Personal", price: 6.99, period: "monthly" },
      { name: "Personal Annual", price: 69.99, period: "yearly" },
      { name: "Family", price: 9.99, period: "monthly" },
      { name: "Family Annual", price: 99.99, period: "yearly" },
    ],
    cancelUrl: "https://account.microsoft.com/services/",
  },
  {
    serviceName: "Tinder",
    country: "US",
    currency: "USD",
    plans: [
      { name: "Tinder Plus", price: 7.99, period: "monthly" },
      { name: "Tinder Gold", price: 24.99, period: "monthly" },
      { name: "Tinder Platinum", price: 32.99, period: "monthly" },
    ],
    cancelUrl: "https://www.help.tinder.com/hc/en-us/articles/360029546932",
  },
]

