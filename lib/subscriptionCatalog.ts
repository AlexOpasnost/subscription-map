export type Period = "monthly" | "yearly"

/**
 * Curated service catalog for the “Add subscription” UX.
 *
 * Note: Default prices are **approximate** and can vary by region and plan.
 * The UI always allows editing.
 */
export type PlanOption = {
  name: string
  period: Period
  priceCents: number
}

export type ServiceCatalogItem = {
  name: string
  category?: string
  cancelUrl?: string
  plans?: PlanOption[]
  defaultPlanName?: string
  logoKey?: string
}

export const subscriptionCatalog: ServiceCatalogItem[] = [
  // Streaming
  {
    name: "Netflix",
    category: "Streaming",
    logoKey: "netflix",
    cancelUrl: "https://help.netflix.com/en/node/407",
    // Price varies by region and plan; defaults are approximate.
    plans: [
      { name: "Standard", period: "monthly", priceCents: 1549 },
      { name: "Premium", period: "monthly", priceCents: 2299 },
    ],
    defaultPlanName: "Standard",
  },
  { name: "Disney+", category: "Streaming", logoKey: "disney-plus", cancelUrl: "https://help.disneyplus.com/article/cancel-subscription" },
  { name: "Hulu", category: "Streaming", logoKey: "hulu", cancelUrl: "https://help.hulu.com/s/article/cancel-subscription" },
  { name: "Max", category: "Streaming", logoKey: "max", cancelUrl: "https://help.max.com/contact-us" },
  { name: "Amazon Prime", category: "Streaming", logoKey: "amazon-prime", cancelUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GXH8F8BZJZQXZQJZ" },
  { name: "Prime Video", category: "Streaming", logoKey: "prime-video" },
  { name: "Apple TV+", category: "Streaming", logoKey: "apple-tv" },
  {
    name: "YouTube Premium",
    category: "Streaming",
    logoKey: "youtube-premium",
    cancelUrl: "https://www.youtube.com/paid_memberships",
    plans: [
      { name: "Individual", period: "monthly", priceCents: 1399 },
      { name: "Family", period: "monthly", priceCents: 2299 },
    ],
    defaultPlanName: "Individual",
  },
  { name: "Paramount+", category: "Streaming", logoKey: "paramount-plus" },
  { name: "Peacock", category: "Streaming", logoKey: "peacock" },
  { name: "Crunchyroll", category: "Streaming", logoKey: "crunchyroll" },
  { name: "Audible", category: "Streaming", logoKey: "audible" },
  { name: "CuriosityStream", category: "Streaming", logoKey: "curiositystream" },
  { name: "Plex Pass", category: "Streaming", logoKey: "plex" },

  // Music
  {
    name: "Spotify",
    category: "Music",
    logoKey: "spotify",
    cancelUrl: "https://www.spotify.com/us/account/subscription/",
    plans: [
      { name: "Individual", period: "monthly", priceCents: 1099 },
      { name: "Duo", period: "monthly", priceCents: 1499 },
      { name: "Family", period: "monthly", priceCents: 1699 },
      { name: "Student", period: "monthly", priceCents: 599 },
    ],
    defaultPlanName: "Individual",
  },
  { name: "Apple Music", category: "Music", logoKey: "apple-music" },
  { name: "Amazon Music Unlimited", category: "Music", logoKey: "amazon-music" },
  { name: "TIDAL", category: "Music", logoKey: "tidal" },
  { name: "Deezer", category: "Music", logoKey: "deezer" },
  { name: "SoundCloud Go+", category: "Music", logoKey: "soundcloud" },

  // Cloud / storage
  {
    name: "Apple iCloud",
    category: "Cloud",
    logoKey: "icloud",
    cancelUrl: "https://support.apple.com/en-us/HT201238",
    plans: [
      { name: "50GB", period: "monthly", priceCents: 99 },
      { name: "200GB", period: "monthly", priceCents: 299 },
      { name: "2TB", period: "monthly", priceCents: 999 },
    ],
    defaultPlanName: "200GB",
  },
  { name: "Google One", category: "Cloud", logoKey: "google-one" },
  { name: "OneDrive", category: "Cloud", logoKey: "onedrive" },
  { name: "Dropbox", category: "Cloud", logoKey: "dropbox" },
  { name: "Backblaze", category: "Cloud", logoKey: "backblaze" },
  { name: "MEGA", category: "Cloud", logoKey: "mega" },
  { name: "pCloud", category: "Cloud", logoKey: "pcloud" },
  { name: "Cloudflare", category: "Cloud", logoKey: "cloudflare" },

  // Games
  { name: "PlayStation Plus", category: "Games", logoKey: "ps-plus", cancelUrl: "https://www.playstation.com/en-us/support/subscriptions/manage-cancel/" },
  { name: "Xbox Game Pass", category: "Games", logoKey: "xbox-game-pass", cancelUrl: "https://account.microsoft.com/services/" },
  { name: "Nintendo Switch Online", category: "Games", logoKey: "nintendo-switch-online" },
  { name: "EA Play", category: "Games", logoKey: "ea-play" },
  { name: "Ubisoft+", category: "Games", logoKey: "ubisoft-plus" },
  { name: "Apple Arcade", category: "Games", logoKey: "apple-arcade" },

  // Productivity
  { name: "Notion", category: "Productivity", logoKey: "notion", cancelUrl: "https://www.notion.so/help/billing" },
  { name: "Figma", category: "Productivity", logoKey: "figma", cancelUrl: "https://help.figma.com/hc/en-us/articles/360041003114" },
  { name: "Canva", category: "Productivity", logoKey: "canva", cancelUrl: "https://www.canva.com/help/article/cancel-subscription" },
  { name: "ChatGPT Plus", category: "Productivity", logoKey: "chatgpt", cancelUrl: "https://chat.openai.com/account/billing" },
  { name: "Grammarly", category: "Productivity", logoKey: "grammarly" },
  {
    name: "Microsoft 365",
    category: "Productivity",
    logoKey: "microsoft-365",
    cancelUrl: "https://account.microsoft.com/services/",
    plans: [
      { name: "Personal", period: "monthly", priceCents: 699 },
      { name: "Personal", period: "yearly", priceCents: 6999 },
      { name: "Family", period: "monthly", priceCents: 999 },
      { name: "Family", period: "yearly", priceCents: 9999 },
    ],
    defaultPlanName: "Personal",
  },
  { name: "Google Workspace", category: "Productivity", logoKey: "google-workspace" },
  { name: "Slack", category: "Productivity", logoKey: "slack" },
  { name: "Zoom", category: "Productivity", logoKey: "zoom" },
  { name: "Todoist", category: "Productivity", logoKey: "todoist" },
  { name: "Evernote", category: "Productivity", logoKey: "evernote" },
  { name: "DocuSign", category: "Productivity", logoKey: "docusign" },
  { name: "GitHub Copilot", category: "Productivity", logoKey: "github-copilot" },
  { name: "JetBrains All Products Pack", category: "Productivity", logoKey: "jetbrains" },
  { name: "Duolingo", category: "Productivity", logoKey: "duolingo" },
  { name: "Skillshare", category: "Productivity", logoKey: "skillshare" },
  { name: "Coursera Plus", category: "Productivity", logoKey: "coursera-plus" },
  { name: "Loom", category: "Productivity", logoKey: "loom" },
  { name: "Adobe Creative Cloud", category: "Productivity", logoKey: "adobe-cc", cancelUrl: "https://www.adobe.com/account/cancel.html" },
  { name: "Procreate", category: "Productivity", logoKey: "procreate" },
  { name: "Fastmail", category: "Productivity", logoKey: "fastmail" },

  // VPN
  { name: "NordVPN", category: "VPN", logoKey: "nordvpn" },
  { name: "ExpressVPN", category: "VPN", logoKey: "expressvpn" },
  { name: "Surfshark", category: "VPN", logoKey: "surfshark" },
  { name: "Proton VPN", category: "VPN", logoKey: "protonvpn" },
  { name: "Mullvad VPN", category: "VPN", logoKey: "mullvad" },

  // News
  { name: "The New York Times", category: "News", logoKey: "nyt" },
  { name: "The Wall Street Journal", category: "News", logoKey: "wsj" },
  { name: "The Washington Post", category: "News", logoKey: "washpost" },
  { name: "The Economist", category: "News", logoKey: "economist" },
  { name: "Financial Times", category: "News", logoKey: "ft" },
  { name: "The Athletic", category: "News", logoKey: "the-athletic" },
  { name: "Medium", category: "News", logoKey: "medium" },
  { name: "Substack", category: "News", logoKey: "substack" },
  { name: "Patreon", category: "News", logoKey: "patreon" },
  { name: "PressReader", category: "News", logoKey: "pressreader" },

  // Fitness
  { name: "Fitbit Premium", category: "Fitness", logoKey: "fitbit" },
  { name: "Strava", category: "Fitness", logoKey: "strava" },
  { name: "Peloton", category: "Fitness", logoKey: "peloton" },
  { name: "Apple Fitness+", category: "Fitness", logoKey: "apple-fitness-plus" },
  { name: "MyFitnessPal Premium", category: "Fitness", logoKey: "myfitnesspal" },
  { name: "Headspace", category: "Fitness", logoKey: "headspace" },
  { name: "Calm", category: "Fitness", logoKey: "calm" },

  // Security
  { name: "1Password", category: "Security", logoKey: "1password" },
  { name: "Dashlane", category: "Security", logoKey: "dashlane" },
  { name: "Bitwarden Premium", category: "Security", logoKey: "bitwarden" },
  { name: "Malwarebytes", category: "Security", logoKey: "malwarebytes" },

  // Lifestyle / other
  { name: "Tinder", category: "Lifestyle", logoKey: "tinder", cancelUrl: "https://www.help.tinder.com/hc/en-us/articles/360029546932" },
]

