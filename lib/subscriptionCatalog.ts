export type Period = "monthly" | "yearly"

export type Plan = {
  name: string
  period: Period
  priceCents: number
  currency: "USD"
  note?: string
}

export type ServiceCatalogItem = {
  name: string
  category: string
  plans: Plan[] // non-empty
  cancelUrl?: string
  logoKey?: string
  defaultPlanName?: string
}

const CUSTOM_PLAN: Plan = {
  name: "Custom",
  period: "monthly",
  priceCents: 0,
  currency: "USD",
  note: "Set your own price",
}

// Prices are placeholders; many services vary by region/plan.
export const subscriptionCatalog: ServiceCatalogItem[] = [
  // Streaming
  { name: "Netflix", category: "Streaming", logoKey: "netflix", cancelUrl: "https://help.netflix.com/en/node/407", defaultPlanName: "Standard", plans: [
    { name: "Standard", period: "monthly", priceCents: 1549, currency: "USD", note: "Price varies by region" },
    { name: "Premium", period: "monthly", priceCents: 2299, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Disney+", category: "Streaming", logoKey: "disney-plus", cancelUrl: "https://help.disneyplus.com/article/cancel-subscription", plans: [
    { name: "Standard", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Hulu", category: "Streaming", logoKey: "hulu", cancelUrl: "https://help.hulu.com/s/article/cancel-subscription", plans: [
    { name: "With Ads", period: "monthly", priceCents: 799, currency: "USD", note: "Price varies by region" },
    { name: "No Ads", period: "monthly", priceCents: 1799, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Max", category: "Streaming", logoKey: "max", cancelUrl: "https://help.max.com/contact-us", plans: [
    { name: "With Ads", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" },
    { name: "Ad-Free", period: "monthly", priceCents: 1599, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Amazon Prime", category: "Streaming", logoKey: "amazon-prime", cancelUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GXH8F8BZJZQXZQJZ", plans: [
    { name: "Monthly", period: "monthly", priceCents: 1499, currency: "USD", note: "Price varies by region" },
    { name: "Annual", period: "yearly", priceCents: 13900, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Prime Video", category: "Streaming", logoKey: "prime-video", plans: [{ name: "Standard", period: "monthly", priceCents: 899, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Apple TV+", category: "Streaming", logoKey: "apple-tv", plans: [{ name: "Standard", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "YouTube Premium", category: "Streaming", logoKey: "youtube-premium", cancelUrl: "https://www.youtube.com/paid_memberships", defaultPlanName: "Individual", plans: [
    { name: "Individual", period: "monthly", priceCents: 1399, currency: "USD", note: "Price varies by region" },
    { name: "Family", period: "monthly", priceCents: 2299, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Paramount+", category: "Streaming", logoKey: "paramount-plus", plans: [{ name: "Standard", period: "monthly", priceCents: 799, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Peacock", category: "Streaming", logoKey: "peacock", plans: [{ name: "Premium", period: "monthly", priceCents: 799, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Crunchyroll", category: "Streaming", logoKey: "crunchyroll", plans: [{ name: "Fan", period: "monthly", priceCents: 799, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Audible", category: "Streaming", logoKey: "audible", plans: [{ name: "Standard", period: "monthly", priceCents: 1495, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "CuriosityStream", category: "Streaming", logoKey: "curiositystream", plans: [{ name: "Standard", period: "monthly", priceCents: 499, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Plex Pass", category: "Streaming", logoKey: "plex", plans: [{ name: "Monthly", period: "monthly", priceCents: 499, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // Music
  { name: "Spotify", category: "Music", logoKey: "spotify", cancelUrl: "https://www.spotify.com/us/account/subscription/", defaultPlanName: "Individual", plans: [
    { name: "Individual", period: "monthly", priceCents: 1099, currency: "USD", note: "Price varies by region" },
    { name: "Duo", period: "monthly", priceCents: 1499, currency: "USD", note: "Price varies by region" },
    { name: "Family", period: "monthly", priceCents: 1699, currency: "USD", note: "Price varies by region" },
    { name: "Student", period: "monthly", priceCents: 599, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Apple Music", category: "Music", logoKey: "apple-music", plans: [{ name: "Individual", period: "monthly", priceCents: 1099, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Amazon Music Unlimited", category: "Music", logoKey: "amazon-music", plans: [{ name: "Individual", period: "monthly", priceCents: 1099, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "TIDAL", category: "Music", logoKey: "tidal", plans: [{ name: "Standard", period: "monthly", priceCents: 1099, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Deezer", category: "Music", logoKey: "deezer", plans: [{ name: "Premium", period: "monthly", priceCents: 1199, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "SoundCloud Go+", category: "Music", logoKey: "soundcloud", plans: [{ name: "Go+", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // Cloud
  { name: "Apple iCloud", category: "Cloud", logoKey: "icloud", cancelUrl: "https://support.apple.com/en-us/HT201238", defaultPlanName: "200GB", plans: [
    { name: "50GB", period: "monthly", priceCents: 99, currency: "USD", note: "Price varies by region" },
    { name: "200GB", period: "monthly", priceCents: 299, currency: "USD", note: "Price varies by region" },
    { name: "2TB", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Google One", category: "Cloud", logoKey: "google-one", plans: [{ name: "Basic", period: "monthly", priceCents: 199, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "OneDrive", category: "Cloud", logoKey: "onedrive", plans: [{ name: "100GB", period: "monthly", priceCents: 199, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Dropbox", category: "Cloud", logoKey: "dropbox", plans: [{ name: "Plus", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Backblaze", category: "Cloud", logoKey: "backblaze", plans: [{ name: "Computer Backup", period: "monthly", priceCents: 900, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "MEGA", category: "Cloud", logoKey: "mega", plans: [{ name: "Pro", period: "monthly", priceCents: 1199, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "pCloud", category: "Cloud", logoKey: "pcloud", plans: [{ name: "Premium", period: "monthly", priceCents: 499, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Cloudflare", category: "Cloud", logoKey: "cloudflare", plans: [CUSTOM_PLAN] },

  // Software / Productivity / AI / Education
  { name: "Notion", category: "Productivity", logoKey: "notion", cancelUrl: "https://www.notion.so/help/billing", plans: [{ name: "Plus", period: "monthly", priceCents: 800, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Figma", category: "Productivity", logoKey: "figma", cancelUrl: "https://help.figma.com/hc/en-us/articles/360041003114", plans: [{ name: "Professional", period: "monthly", priceCents: 1200, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Canva", category: "Productivity", logoKey: "canva", cancelUrl: "https://www.canva.com/help/article/cancel-subscription", plans: [{ name: "Pro", period: "monthly", priceCents: 1299, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "ChatGPT Plus", category: "AI", logoKey: "chatgpt", cancelUrl: "https://chat.openai.com/account/billing", plans: [{ name: "Plus", period: "monthly", priceCents: 2000, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "GitHub Copilot", category: "AI", logoKey: "github-copilot", plans: [{ name: "Individual", period: "monthly", priceCents: 1000, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Grammarly", category: "Productivity", logoKey: "grammarly", plans: [{ name: "Premium", period: "monthly", priceCents: 1200, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Microsoft 365", category: "Productivity", logoKey: "microsoft-365", cancelUrl: "https://account.microsoft.com/services/", defaultPlanName: "Personal", plans: [
    { name: "Personal", period: "monthly", priceCents: 699, currency: "USD", note: "Price varies by region" },
    { name: "Personal", period: "yearly", priceCents: 6999, currency: "USD", note: "Price varies by region" },
    { name: "Family", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" },
    { name: "Family", period: "yearly", priceCents: 9999, currency: "USD", note: "Price varies by region" },
    CUSTOM_PLAN,
  ]},
  { name: "Google Workspace", category: "Productivity", logoKey: "google-workspace", plans: [{ name: "Starter", period: "monthly", priceCents: 600, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Slack", category: "Productivity", logoKey: "slack", plans: [{ name: "Pro", period: "monthly", priceCents: 875, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Zoom", category: "Productivity", logoKey: "zoom", plans: [{ name: "Pro", period: "monthly", priceCents: 1499, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Todoist", category: "Productivity", logoKey: "todoist", plans: [{ name: "Pro", period: "monthly", priceCents: 500, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Evernote", category: "Productivity", logoKey: "evernote", plans: [{ name: "Personal", period: "monthly", priceCents: 1499, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "DocuSign", category: "Productivity", logoKey: "docusign", plans: [{ name: "Personal", period: "monthly", priceCents: 1200, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "JetBrains All Products Pack", category: "Software", logoKey: "jetbrains", plans: [{ name: "Individual", period: "monthly", priceCents: 2899, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Duolingo", category: "Education", logoKey: "duolingo", plans: [{ name: "Super", period: "monthly", priceCents: 1299, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Skillshare", category: "Education", logoKey: "skillshare", plans: [{ name: "Standard", period: "monthly", priceCents: 1399, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Coursera Plus", category: "Education", logoKey: "coursera-plus", plans: [{ name: "Plus", period: "monthly", priceCents: 5900, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Loom", category: "Productivity", logoKey: "loom", plans: [{ name: "Business", period: "monthly", priceCents: 1200, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Adobe Creative Cloud", category: "Software", logoKey: "adobe-cc", cancelUrl: "https://www.adobe.com/account/cancel.html", plans: [{ name: "All Apps", period: "monthly", priceCents: 5999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Procreate", category: "Software", logoKey: "procreate", plans: [CUSTOM_PLAN] },
  { name: "Fastmail", category: "Productivity", logoKey: "fastmail", plans: [{ name: "Standard", period: "monthly", priceCents: 500, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // Gaming
  { name: "PlayStation Plus", category: "Gaming", logoKey: "ps-plus", cancelUrl: "https://www.playstation.com/en-us/support/subscriptions/manage-cancel/", plans: [{ name: "Essential", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Xbox Game Pass", category: "Gaming", logoKey: "xbox-game-pass", cancelUrl: "https://account.microsoft.com/services/", plans: [{ name: "Ultimate", period: "monthly", priceCents: 1699, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Nintendo Switch Online", category: "Gaming", logoKey: "nintendo-switch-online", plans: [{ name: "Individual", period: "yearly", priceCents: 1999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "EA Play", category: "Gaming", logoKey: "ea-play", plans: [{ name: "Standard", period: "monthly", priceCents: 599, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Ubisoft+", category: "Gaming", logoKey: "ubisoft-plus", plans: [{ name: "Standard", period: "monthly", priceCents: 1799, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Apple Arcade", category: "Gaming", logoKey: "apple-arcade", plans: [{ name: "Standard", period: "monthly", priceCents: 699, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // VPN
  { name: "NordVPN", category: "VPN", logoKey: "nordvpn", plans: [{ name: "Standard", period: "monthly", priceCents: 1299, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "ExpressVPN", category: "VPN", logoKey: "expressvpn", plans: [{ name: "Standard", period: "monthly", priceCents: 1295, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Surfshark", category: "VPN", logoKey: "surfshark", plans: [{ name: "Standard", period: "monthly", priceCents: 1295, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Proton VPN", category: "VPN", logoKey: "protonvpn", plans: [{ name: "Plus", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Mullvad VPN", category: "VPN", logoKey: "mullvad", plans: [{ name: "Standard", period: "monthly", priceCents: 500, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // News
  { name: "The New York Times", category: "News", logoKey: "nyt", plans: [{ name: "Digital", period: "monthly", priceCents: 1700, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "The Wall Street Journal", category: "News", logoKey: "wsj", plans: [{ name: "Digital", period: "monthly", priceCents: 1999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "The Washington Post", category: "News", logoKey: "washpost", plans: [{ name: "Digital", period: "monthly", priceCents: 1200, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "The Economist", category: "News", logoKey: "economist", plans: [{ name: "Digital", period: "monthly", priceCents: 1899, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Financial Times", category: "News", logoKey: "ft", plans: [{ name: "Digital", period: "monthly", priceCents: 3900, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "The Athletic", category: "News", logoKey: "the-athletic", plans: [{ name: "Standard", period: "monthly", priceCents: 799, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Medium", category: "News", logoKey: "medium", plans: [{ name: "Member", period: "monthly", priceCents: 500, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Substack", category: "News", logoKey: "substack", plans: [CUSTOM_PLAN] },
  { name: "Patreon", category: "News", logoKey: "patreon", plans: [CUSTOM_PLAN] },
  { name: "PressReader", category: "News", logoKey: "pressreader", plans: [{ name: "Premium", period: "monthly", priceCents: 2999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // Fitness
  { name: "Fitbit Premium", category: "Fitness", logoKey: "fitbit", plans: [{ name: "Premium", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Strava", category: "Fitness", logoKey: "strava", plans: [{ name: "Subscription", period: "monthly", priceCents: 1199, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Peloton", category: "Fitness", logoKey: "peloton", plans: [{ name: "App", period: "monthly", priceCents: 1299, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Apple Fitness+", category: "Fitness", logoKey: "apple-fitness-plus", plans: [{ name: "Standard", period: "monthly", priceCents: 999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "MyFitnessPal Premium", category: "Fitness", logoKey: "myfitnesspal", plans: [{ name: "Premium", period: "monthly", priceCents: 1999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Headspace", category: "Fitness", logoKey: "headspace", plans: [{ name: "Premium", period: "monthly", priceCents: 1299, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Calm", category: "Fitness", logoKey: "calm", plans: [{ name: "Premium", period: "yearly", priceCents: 6999, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // Security
  { name: "1Password", category: "Security", logoKey: "1password", plans: [{ name: "Individual", period: "monthly", priceCents: 399, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Dashlane", category: "Security", logoKey: "dashlane", plans: [{ name: "Premium", period: "monthly", priceCents: 499, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Bitwarden Premium", category: "Security", logoKey: "bitwarden", plans: [{ name: "Premium", period: "yearly", priceCents: 1000, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
  { name: "Malwarebytes", category: "Security", logoKey: "malwarebytes", plans: [{ name: "Standard", period: "monthly", priceCents: 399, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },

  // Lifestyle
  { name: "Tinder", category: "Lifestyle", logoKey: "tinder", cancelUrl: "https://www.help.tinder.com/hc/en-us/articles/360029546932", plans: [{ name: "Plus", period: "monthly", priceCents: 799, currency: "USD", note: "Price varies by region" }, CUSTOM_PLAN] },
]

