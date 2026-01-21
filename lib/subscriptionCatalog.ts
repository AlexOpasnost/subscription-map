export type Period = "monthly" | "yearly"

/**
 * Curated service catalog for the “Add subscription” UX.
 *
 * Note: Default prices are **approximate** and can vary by region and plan.
 * The UI always allows editing.
 */
export type SubscriptionCatalogItem = {
  name: string
  category: string
  defaultPeriod: Period
  defaultPriceCents: number
  logoKey?: string
  cancelUrl?: string
}

export const subscriptionCatalog: SubscriptionCatalogItem[] = [
  // Streaming
  { name: "Netflix", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 1549, logoKey: "netflix", cancelUrl: "https://help.netflix.com/en/node/407" },
  { name: "Disney+", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "disney-plus", cancelUrl: "https://help.disneyplus.com/article/cancel-subscription" },
  { name: "Hulu", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "hulu", cancelUrl: "https://help.hulu.com/s/article/cancel-subscription" },
  { name: "Max", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "max", cancelUrl: "https://help.max.com/contact-us" },
  { name: "Amazon Prime", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 1499, logoKey: "amazon-prime", cancelUrl: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GXH8F8BZJZQXZQJZ" },
  { name: "Prime Video", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 899, logoKey: "prime-video" },
  { name: "Apple TV+", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "apple-tv" },
  { name: "YouTube Premium", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 1399, logoKey: "youtube-premium", cancelUrl: "https://www.youtube.com/paid_memberships" },
  { name: "Paramount+", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "paramount-plus" },
  { name: "Peacock", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "peacock" },
  { name: "Crunchyroll", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "crunchyroll" },
  { name: "Audible", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 1495, logoKey: "audible" },
  { name: "CuriosityStream", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 499, logoKey: "curiositystream" },
  { name: "Plex Pass", category: "Streaming", defaultPeriod: "monthly", defaultPriceCents: 499, logoKey: "plex" },

  // Music
  { name: "Spotify", category: "Music", defaultPeriod: "monthly", defaultPriceCents: 1099, logoKey: "spotify", cancelUrl: "https://www.spotify.com/us/account/subscription/" },
  { name: "Apple Music", category: "Music", defaultPeriod: "monthly", defaultPriceCents: 1099, logoKey: "apple-music" },
  { name: "Amazon Music Unlimited", category: "Music", defaultPeriod: "monthly", defaultPriceCents: 1099, logoKey: "amazon-music" },
  { name: "TIDAL", category: "Music", defaultPeriod: "monthly", defaultPriceCents: 1099, logoKey: "tidal" },
  { name: "Deezer", category: "Music", defaultPeriod: "monthly", defaultPriceCents: 1199, logoKey: "deezer" },
  { name: "SoundCloud Go+", category: "Music", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "soundcloud" },

  // Cloud / storage
  { name: "iCloud+", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 99, logoKey: "icloud", cancelUrl: "https://support.apple.com/en-us/HT201238" },
  { name: "Google One", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 199, logoKey: "google-one" },
  { name: "OneDrive", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 199, logoKey: "onedrive" },
  { name: "Dropbox", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "dropbox" },
  { name: "Backblaze", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 900, logoKey: "backblaze" },
  { name: "MEGA", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 1199, logoKey: "mega" },
  { name: "pCloud", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 499, logoKey: "pcloud" },
  { name: "Cloudflare", category: "Cloud", defaultPeriod: "monthly", defaultPriceCents: 0, logoKey: "cloudflare" },

  // Games
  { name: "PlayStation Plus", category: "Games", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "ps-plus", cancelUrl: "https://www.playstation.com/en-us/support/subscriptions/manage-cancel/" },
  { name: "Xbox Game Pass", category: "Games", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "xbox-game-pass", cancelUrl: "https://account.microsoft.com/services/" },
  { name: "Nintendo Switch Online", category: "Games", defaultPeriod: "yearly", defaultPriceCents: 1999, logoKey: "nintendo-switch-online" },
  { name: "EA Play", category: "Games", defaultPeriod: "monthly", defaultPriceCents: 599, logoKey: "ea-play" },
  { name: "Ubisoft+", category: "Games", defaultPeriod: "monthly", defaultPriceCents: 1799, logoKey: "ubisoft-plus" },
  { name: "Apple Arcade", category: "Games", defaultPeriod: "monthly", defaultPriceCents: 699, logoKey: "apple-arcade" },

  // Productivity
  { name: "Notion", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 800, logoKey: "notion", cancelUrl: "https://www.notion.so/help/billing" },
  { name: "Figma", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1200, logoKey: "figma", cancelUrl: "https://help.figma.com/hc/en-us/articles/360041003114" },
  { name: "Canva", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1299, logoKey: "canva", cancelUrl: "https://www.canva.com/help/article/cancel-subscription" },
  { name: "ChatGPT Plus", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 2000, logoKey: "chatgpt", cancelUrl: "https://chat.openai.com/account/billing" },
  { name: "Grammarly", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1200, logoKey: "grammarly" },
  { name: "Microsoft 365", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 699, logoKey: "microsoft-365", cancelUrl: "https://account.microsoft.com/services/" },
  { name: "Google Workspace", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 600, logoKey: "google-workspace" },
  { name: "Slack", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 875, logoKey: "slack" },
  { name: "Zoom", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1499, logoKey: "zoom" },
  { name: "Todoist", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 500, logoKey: "todoist" },
  { name: "Evernote", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1499, logoKey: "evernote" },
  { name: "DocuSign", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1200, logoKey: "docusign" },
  { name: "GitHub Copilot", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1000, logoKey: "github-copilot" },
  { name: "JetBrains All Products Pack", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 2899, logoKey: "jetbrains" },
  { name: "Duolingo", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1299, logoKey: "duolingo" },
  { name: "Skillshare", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1399, logoKey: "skillshare" },
  { name: "Coursera Plus", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 5900, logoKey: "coursera-plus" },
  { name: "Loom", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 1200, logoKey: "loom" },
  { name: "Adobe Creative Cloud", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 5999, logoKey: "adobe-cc", cancelUrl: "https://www.adobe.com/account/cancel.html" },
  { name: "Procreate", category: "Productivity", defaultPeriod: "yearly", defaultPriceCents: 999, logoKey: "procreate" },
  { name: "Fastmail", category: "Productivity", defaultPeriod: "monthly", defaultPriceCents: 500, logoKey: "fastmail" },

  // VPN
  { name: "NordVPN", category: "VPN", defaultPeriod: "monthly", defaultPriceCents: 1299, logoKey: "nordvpn" },
  { name: "ExpressVPN", category: "VPN", defaultPeriod: "monthly", defaultPriceCents: 1295, logoKey: "expressvpn" },
  { name: "Surfshark", category: "VPN", defaultPeriod: "monthly", defaultPriceCents: 1295, logoKey: "surfshark" },
  { name: "Proton VPN", category: "VPN", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "protonvpn" },
  { name: "Mullvad VPN", category: "VPN", defaultPeriod: "monthly", defaultPriceCents: 500, logoKey: "mullvad" },

  // News
  { name: "The New York Times", category: "News", defaultPeriod: "monthly", defaultPriceCents: 1700, logoKey: "nyt" },
  { name: "The Wall Street Journal", category: "News", defaultPeriod: "monthly", defaultPriceCents: 1999, logoKey: "wsj" },
  { name: "The Washington Post", category: "News", defaultPeriod: "monthly", defaultPriceCents: 1200, logoKey: "washpost" },
  { name: "The Economist", category: "News", defaultPeriod: "monthly", defaultPriceCents: 1899, logoKey: "economist" },
  { name: "Financial Times", category: "News", defaultPeriod: "monthly", defaultPriceCents: 3900, logoKey: "ft" },
  { name: "The Athletic", category: "News", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "the-athletic" },
  { name: "Medium", category: "News", defaultPeriod: "monthly", defaultPriceCents: 500, logoKey: "medium" },
  { name: "Substack", category: "News", defaultPeriod: "monthly", defaultPriceCents: 500, logoKey: "substack" },
  { name: "Patreon", category: "News", defaultPeriod: "monthly", defaultPriceCents: 500, logoKey: "patreon" },
  { name: "PressReader", category: "News", defaultPeriod: "monthly", defaultPriceCents: 2999, logoKey: "pressreader" },

  // Fitness
  { name: "Fitbit Premium", category: "Fitness", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "fitbit" },
  { name: "Strava", category: "Fitness", defaultPeriod: "monthly", defaultPriceCents: 1199, logoKey: "strava" },
  { name: "Peloton", category: "Fitness", defaultPeriod: "monthly", defaultPriceCents: 1299, logoKey: "peloton" },
  { name: "Apple Fitness+", category: "Fitness", defaultPeriod: "monthly", defaultPriceCents: 999, logoKey: "apple-fitness-plus" },
  { name: "MyFitnessPal Premium", category: "Fitness", defaultPeriod: "monthly", defaultPriceCents: 1999, logoKey: "myfitnesspal" },
  { name: "Headspace", category: "Fitness", defaultPeriod: "monthly", defaultPriceCents: 1299, logoKey: "headspace" },
  { name: "Calm", category: "Fitness", defaultPeriod: "yearly", defaultPriceCents: 6999, logoKey: "calm" },

  // Security
  { name: "1Password", category: "Security", defaultPeriod: "monthly", defaultPriceCents: 399, logoKey: "1password" },
  { name: "Dashlane", category: "Security", defaultPeriod: "monthly", defaultPriceCents: 499, logoKey: "dashlane" },
  { name: "Bitwarden Premium", category: "Security", defaultPeriod: "yearly", defaultPriceCents: 1000, logoKey: "bitwarden" },
  { name: "Malwarebytes", category: "Security", defaultPeriod: "monthly", defaultPriceCents: 399, logoKey: "malwarebytes" },

  // Lifestyle / other
  { name: "Tinder", category: "Lifestyle", defaultPeriod: "monthly", defaultPriceCents: 799, logoKey: "tinder", cancelUrl: "https://www.help.tinder.com/hc/en-us/articles/360029546932" },
]

