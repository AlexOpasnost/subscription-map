function normalizeServiceName(service: string): string {
  return service.trim().toLowerCase()
}

const DEFAULT_REGIONS = ["Latin America", "South Asia", "Southeast Asia"] as const

const CHEAPER_REGIONS_BY_SERVICE: Record<string, string[]> = {
  "netflix": ["Latin America", "Turkey", "South Asia"],
  "spotify": ["South Asia", "Southeast Asia", "Latin America"],
  "youtube premium": ["South Asia", "Latin America", "Turkey"],
  "amazon prime": ["South Asia", "Southeast Asia", "Latin America"],
  "disney+": ["Latin America", "Southeast Asia", "South Asia"],
  "hulu": ["Latin America", "Southeast Asia", "South Asia"],
  "hbo max/max": ["Latin America", "Southeast Asia", "South Asia"],
  "chatgpt plus": ["Latin America", "South Asia", "Southeast Asia"],
  "canva": ["Southeast Asia", "South Asia", "Latin America"],
  "figma": ["Southeast Asia", "South Asia", "Latin America"],
  "adobe cc": ["Latin America", "South Asia", "Southeast Asia"],
  "microsoft 365": ["Latin America", "South Asia", "Southeast Asia"],
}

export function getCheaperRegions(serviceName: string): string[] {
  const key = normalizeServiceName(serviceName)
  const regions = CHEAPER_REGIONS_BY_SERVICE[key] ?? [...DEFAULT_REGIONS]
  // de-dupe + sanitize
  return Array.from(new Set(regions.map((r) => r.trim()).filter(Boolean))).slice(0, 4)
}

