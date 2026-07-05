export type HotspotHeat = '高' | '中' | '低' | '观察'

export interface RevenueHotspotRecord {
  id: string
  province: string
  city: string
  category: string
  categoryGroup: string
  heat: HotspotHeat
  name: string
  venue: string
  startDate: string
  endDate: string
  status: string
  scale: string
  revenueImpact: string
  broadcastText: string
  source: string
}

export interface RevenueHotspotSummary {
  total: number
  provinceCount: number
  highHeatCityCount: number
  provinceCounts: Array<{ name: string; count: number }>
  categoryCounts: Array<{ name: string; count: number }>
  heatCounts: Array<{ name: HotspotHeat; count: number }>
  dailyCounts: Array<{ date: string; count: number; highCount: number }>
}

export interface RevenueHotspotVersion {
  id: string
  versionNumber: string
  updatedAt: string
  sourceFileName: string
  coverageStart: string
  coverageEnd: string
}

export interface RevenueHotspotData {
  version: RevenueHotspotVersion
  summary: RevenueHotspotSummary
  rows: RevenueHotspotRecord[]
}

export interface RevenueHotspotManifest {
  schemaVersion: 1
  version: RevenueHotspotVersion
  arrays: {
    summary: string[]
    rows: string[]
  }
}
