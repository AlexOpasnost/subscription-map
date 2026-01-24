export type Period = "monthly" | "yearly"

/**
 * Catalog types requested by the product spec.
 * - `price` is in USD (dollars), not cents.
 */
export type CatalogPlan = {
  name: string
  price: number
  period: Period
  category?: string
  note?: string
}

export type CatalogService = {
  id: string
  name: string
  category?: string
  plans: CatalogPlan[] // 2–5
  logo?: string
  cancelUrl?: string
  defaultPlanName?: string
}

// Backwards-compatible aliases (older components used these names).
export type Plan = CatalogPlan
export type ServiceCatalogItem = CatalogService

const PRICE_NOTE = "Price varies by region."
const CUSTOM_PLAN: CatalogPlan = { name: "Custom", price: 0, period: "monthly", note: "Set your own price" }

export const subscriptionCatalog: CatalogService[] = [
  {
    id: "netflix",
    name: "Netflix",
    category: "Streaming",
    cancelUrl: "https://help.netflix.com/en/node/407",
    defaultPlanName: "Standard",
    plans: [
      { name: "Standard", price: 15.49, period: "monthly", note: PRICE_NOTE },
      { name: "Premium", price: 22.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "spotify",
    name: "Spotify",
    category: "Music",
    cancelUrl: "https://www.spotify.com/account/subscription/",
    defaultPlanName: "Individual",
    plans: [
      { name: "Individual", price: 10.99, period: "monthly", note: PRICE_NOTE },
      { name: "Duo", price: 14.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 16.99, period: "monthly", note: PRICE_NOTE },
      { name: "Student", price: 5.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "icloud",
    name: "Apple iCloud",
    category: "Cloud",
    cancelUrl: "https://support.apple.com/en-us/HT201238",
    defaultPlanName: "200GB",
    plans: [
      { name: "50GB", price: 0.99, period: "monthly", note: PRICE_NOTE },
      { name: "200GB", price: 2.99, period: "monthly", note: PRICE_NOTE },
      { name: "2TB", price: 9.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "amazon-prime",
    name: "Amazon Prime",
    category: "Streaming",
    cancelUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GXH8F8BZJZQXZQJZ",
    defaultPlanName: "Monthly",
    plans: [
      { name: "Monthly", price: 14.99, period: "monthly", note: PRICE_NOTE },
      { name: "Annual", price: 139.0, period: "yearly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "youtube-premium",
    name: "YouTube Premium",
    category: "Streaming",
    cancelUrl: "https://www.youtube.com/paid_memberships",
    defaultPlanName: "Individual",
    plans: [
      { name: "Individual", price: 13.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 22.99, period: "monthly", note: PRICE_NOTE },
      { name: "Student", price: 7.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "disney-plus",
    name: "Disney+",
    category: "Streaming",
    cancelUrl: "https://help.disneyplus.com/article/disneyplus-cancel-subscription",
    defaultPlanName: "Standard",
    plans: [
      { name: "Standard", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "Premium", price: 13.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "hbo-max",
    name: "HBO Max",
    category: "Streaming",
    cancelUrl: "https://help.max.com/",
    defaultPlanName: "Ad-Free",
    plans: [
      { name: "With Ads", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "Ad-Free", price: 15.99, period: "monthly", note: PRICE_NOTE },
      { name: "Ultimate", price: 19.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  // Backwards-compatible alias (older catalog used "Max")
  {
    id: "max",
    name: "Max",
    category: "Streaming",
    cancelUrl: "https://help.max.com/",
    defaultPlanName: "Ad-Free",
    plans: [
      { name: "With Ads", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "Ad-Free", price: 15.99, period: "monthly", note: PRICE_NOTE },
      { name: "Ultimate", price: 19.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    category: "Productivity",
    cancelUrl: "https://account.microsoft.com/services/",
    defaultPlanName: "Personal",
    plans: [
      { name: "Personal", price: 6.99, period: "monthly", note: PRICE_NOTE },
      { name: "Personal", price: 69.99, period: "yearly", note: PRICE_NOTE },
      { name: "Family", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 99.99, period: "yearly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "Cloud",
    cancelUrl: "https://www.dropbox.com/account/billing",
    defaultPlanName: "Plus",
    plans: [
      { name: "Plus", price: 11.99, period: "monthly", note: PRICE_NOTE },
      { name: "Professional", price: 19.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "google-one",
    name: "Google One",
    category: "Cloud",
    cancelUrl: "https://one.google.com/settings",
    defaultPlanName: "Basic",
    plans: [
      { name: "Basic", price: 1.99, period: "monthly", note: PRICE_NOTE },
      { name: "Standard", price: 2.99, period: "monthly", note: PRICE_NOTE },
      { name: "Premium", price: 9.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "apple-music",
    name: "Apple Music",
    category: "Music",
    cancelUrl: "https://support.apple.com/en-us/HT202039",
    defaultPlanName: "Individual",
    plans: [
      { name: "Individual", price: 10.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 16.99, period: "monthly", note: PRICE_NOTE },
      { name: "Student", price: 5.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "tidal",
    name: "Tidal",
    category: "Music",
    cancelUrl: "https://tidal.com/",
    defaultPlanName: "Individual",
    plans: [
      { name: "Individual", price: 10.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 16.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  // Backwards-compatible alias (older catalog used uppercase)
  {
    id: "tidal-legacy",
    name: "TIDAL",
    category: "Music",
    cancelUrl: "https://tidal.com/",
    defaultPlanName: "Individual",
    plans: [
      { name: "Individual", price: 10.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 16.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "steam",
    name: "Steam",
    category: "Gaming",
    defaultPlanName: "Monthly budget",
    plans: [
      { name: "Monthly budget", price: 20, period: "monthly", note: "Defaults are editable. This is just a spending placeholder." },
      { name: "Monthly budget (heavy)", price: 50, period: "monthly", note: "Defaults are editable. This is just a spending placeholder." },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Productivity",
    cancelUrl: "https://github.com/settings/billing",
    defaultPlanName: "Pro",
    plans: [
      { name: "Pro", price: 4, period: "monthly", note: PRICE_NOTE },
      { name: "Team (per user)", price: 4, period: "monthly", note: PRICE_NOTE },
      { name: "Enterprise (per user)", price: 21, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "notion",
    name: "Notion",
    category: "Productivity",
    cancelUrl: "https://www.notion.so/help/billing",
    defaultPlanName: "Plus",
    plans: [
      { name: "Plus (per user)", price: 10, period: "monthly", note: PRICE_NOTE },
      { name: "Business (per user)", price: 18, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "figma",
    name: "Figma",
    category: "Productivity",
    cancelUrl: "https://www.figma.com/billing",
    defaultPlanName: "Professional",
    plans: [
      { name: "Professional (per seat)", price: 12, period: "monthly", note: PRICE_NOTE },
      { name: "Organization (per seat)", price: 45, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "adobe-cc",
    name: "Adobe CC",
    category: "Software",
    cancelUrl: "https://www.adobe.com/account/cancel.html",
    defaultPlanName: "All Apps",
    plans: [
      { name: "Photography", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "All Apps", price: 59.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  // Backwards-compatible alias
  {
    id: "adobe-creative-cloud",
    name: "Adobe Creative Cloud",
    category: "Software",
    cancelUrl: "https://www.adobe.com/account/cancel.html",
    defaultPlanName: "All Apps",
    plans: [
      { name: "Photography", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "All Apps", price: 59.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "canva",
    name: "Canva",
    category: "Productivity",
    cancelUrl: "https://www.canva.com/help/article/cancel-subscription/",
    defaultPlanName: "Pro",
    plans: [
      { name: "Pro", price: 12.99, period: "monthly", note: PRICE_NOTE },
      { name: "Teams (per person)", price: 14.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "chatgpt-plus",
    name: "ChatGPT Plus",
    category: "AI",
    defaultPlanName: "Plus",
    plans: [
      { name: "Plus", price: 20, period: "monthly", note: PRICE_NOTE },
      { name: "Team (per user)", price: 25, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "x-premium",
    name: "X Premium",
    category: "News",
    defaultPlanName: "Premium",
    plans: [
      { name: "Basic", price: 3, period: "monthly", note: PRICE_NOTE },
      { name: "Premium", price: 8, period: "monthly", note: PRICE_NOTE },
      { name: "Premium+", price: 16, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "ps-plus",
    name: "PlayStation Plus",
    category: "Gaming",
    cancelUrl: "https://www.playstation.com/support/subscriptions/",
    defaultPlanName: "Essential",
    plans: [
      { name: "Essential", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "Extra", price: 14.99, period: "monthly", note: PRICE_NOTE },
      { name: "Premium", price: 17.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "xbox-game-pass",
    name: "Xbox Game Pass",
    category: "Gaming",
    cancelUrl: "https://account.microsoft.com/services/",
    defaultPlanName: "Ultimate",
    plans: [
      { name: "Core", price: 9.99, period: "monthly", note: PRICE_NOTE },
      { name: "Ultimate", price: 16.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "linkedin-premium",
    name: "LinkedIn Premium",
    category: "Productivity",
    cancelUrl: "https://www.linkedin.com/premium",
    defaultPlanName: "Career",
    plans: [
      { name: "Career", price: 39.99, period: "monthly", note: PRICE_NOTE },
      { name: "Business", price: 59.99, period: "monthly", note: PRICE_NOTE },
      { name: "Sales Navigator", price: 99.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "duolingo",
    name: "Duolingo",
    category: "Education",
    cancelUrl: "https://support.duolingo.com/hc/en-us/articles/115002887326",
    defaultPlanName: "Super",
    plans: [
      { name: "Super", price: 12.99, period: "monthly", note: PRICE_NOTE },
      { name: "Family", price: 19.99, period: "monthly", note: PRICE_NOTE },
      CUSTOM_PLAN,
    ],
  },
  {
    id: "backblaze",
    name: "Backblaze",
    category: "Cloud",
    cancelUrl: "https://www.backblaze.com/",
    defaultPlanName: "Computer Backup",
    plans: [
      { name: "Computer Backup", price: 9, period: "monthly", note: PRICE_NOTE },
      { name: "B2 Storage (placeholder)", price: 6, period: "monthly", note: "Defaults are editable. B2 is usage-based." },
      CUSTOM_PLAN,
    ],
  },
]

