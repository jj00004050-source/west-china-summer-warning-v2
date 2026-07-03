export type DataKind = 'hotels' | 'lastYear' | 'snapshots' | 'sameLeadSnapshots' | 'renovations'
export type RiskLevel = 'high' | 'watch' | 'normal' | 'leading'

export interface Hotel {
  whCode: string
  name: string
  province: string
  area: string
  city: string
  businessZone: string
  district?: string
  revenueZone?: string
  brand: string
  positioning: string
  operationType?: string
  managementType?: string
  openDate?: string
  rooms: number
  isNew: boolean
  isRenovated: boolean
  status: string
  longitude?: number
  latitude?: number
  benchmarkZone?: string
  benchmarkGroup?: string
}

export interface LastYearRecord {
  date: string
  mappedDate?: string
  whCode: string
  availableRooms: number
  soldRooms: number
  occ?: number
  adr?: number
  rp?: number
  revenue?: number
  channel?: string
  channelNights?: number
  channelRevenue?: number
}

export interface SnapshotRecord {
  snapshotDate: string
  batchTime: string
  targetDate: string
  dayOffset: string
  whCode: string
  availableRooms: number
  bookedRooms: number
  pricedRooms: number
  bookingRevenue: number
  bookingRate?: number
  onHandAdr?: number
  theoreticalRp?: number
  channel: string
  channelLevel1?: string
  channelLevel2?: string
  channelLevel3?: string
  channelNights: number
  channelRevenue: number
  channelAdr?: number
  channelBookingRate?: number
  /** 管理员发布版本时生成；普通看板直接读取，避免逐店重复计算标签、价格建议与渠道结构。 */
  precomputedStoreInsight?: StorePrecomputedInsight
}

export interface StorePrecomputedInsight {
  zoneRate: number | null
  zoneGap: number | null
  mix: {
    ota: number
    online: number
    offline: number
    other: number
    ctrip: number
    meituan: number
    fliggy: number
    mainName: string
    mainShare: number
    total: number
  }
  anomaly: {
    grade: 'S' | 'A' | 'B' | 'C' | 'normal'
    businessTags: string[]
    businessReasons: string[]
    statusTags: string[]
    statusReasons: string[]
    dataTags: string[]
    dataReasons: string[]
    bookingRateChange: number | null
    adrChange: number | null
    rpChange: number | null
    bookedChange: number | null
    direct: boolean
  }
  priceAdvice: {
    label: string
    reason: string
    quantityPriceStatus: string
    threshold: number
  }
  typeProfile: {
    direct: boolean
    openMonths: number | null
    isNew: boolean
    newStage: string
    isRenovated: boolean
    renovationType: string
    typeTags: string[]
  }
  renovationTags: string[]
}

export interface SameLeadSnapshotRecord {
  name?: string
  whCode: string
  date: string
  bookedRooms: number
  pricedRooms: number
  bookingRevenue: number
  availableRooms: number
}

export interface SnapshotBatch {
  id: string
  uploadTime: string
  snapshotDate: string
  batchTime: string
  fileName: string
  rows: SnapshotRecord[]
}

export interface PreviousFinalSnapshot {
  baseDate: string
  savedAt: string
  sourceFileName: string
  rows: SnapshotRecord[]
}

export interface RenovationRecord {
  whCode: string
  name?: string
  renovationType: string
}

export interface DashboardVersionInfo {
  id: string
  versionNumber: string
  updatedAt: string
  currentBaseDate: string
  coverageStart: string
  coverageEnd: string
  batchTime: string
  sourceFileName: string
  source: '线上最新版本' | '本地统一服务'
}

export interface StoredData {
  hotels: Hotel[]
  lastYear: LastYearRecord[]
  batches: SnapshotBatch[]
  sameLeadSnapshots?: SameLeadSnapshotRecord[]
  renovations?: RenovationRecord[]
  currentBaseDate?: string
  previousFinalSnapshot?: PreviousFinalSnapshot
  mappings: Record<string, Record<string, string>>
  channelMappings: Record<string, string>
  qualityIssues?: QualityIssue[]
  version?: DashboardVersionInfo
  /** 线上公共看板使用上传阶段预聚合后的轻量数据；渠道视图不再读取原始渠道明细。 */
  publicOptimized?: boolean
  settings?: {
    countMissingBookingAsZero?: boolean
    channelAnomaly?: ChannelAnomalySettings
    priceAdvice?: PriceAdviceSettings
  }
}

export interface ChannelAnomalySettings {
  otaHighShare: number
  singleChannelHighShare: number
  onlineDirectLowShare: number
  shareSpikePp: number
  shareDropPp: number
  adrDropAmount: number
  adrBelowOverallAmount: number
  adrBelowOverallRate: number
  lowPriceVolumeAdrDrop: number
  directOnlineLowShare: number
  lowSampleRooms: number
  lowSampleShare: number
}

export interface PriceAdviceSettings {
  minBookingRateByDay: Record<string, number>
  strongZoneGapPp: number
  mildZoneGapPp: number
  lowZoneGapPp: number
  highAdrAmount: number
  highAdrRate: number
  lowAdrAmount: number
  lowAdrRate: number
  storeRecoveryGapPp: number
  zoneRecoveryGapPp: number
  minBookedRooms: number
  minPricedRooms: number
  minZoneStores: number
  lowRemainingRate: number
  declinePp: number
  stablePp: number
  stableAdrAmount: number
}

export interface Filters {
  batchId: string
  dayOffset: string
  province: string
  area: string
  city: string
  district: string
  businessZone: string
  revenueZone: string
  store: string
  brand: string
  positioning: string
  operationType: string
  managementType: string
  directOperation: string
  lifecycle: string
  roomGroup: string
  channel: string
  channelLevel1: string
  channelLevel2: string
  channelLevel3: string
  renovated: string
  status: string
}

export interface MetricRow {
  whCode: string
  name: string
  province: string
  area: string
  city: string
  businessZone: string
  revenueZone: string
  benchmarkZone?: string
  benchmarkGroup?: string
  brand: string
  positioning: string
  operationType: string
  managementType: string
  isNew: boolean
  openDate: string
  isRenovated: boolean
  renovationType: string
  rooms: number
  availableRooms: number
  bookedRooms: number
  pricedRooms: number
  bookingRevenue: number
  bookingRate: number | null
  adr: number | null
  rp: number | null
  lastOcc: number | null
  lastAdr: number | null
  lastRp: number | null
  lastAvailable: number | null
  lastSold: number | null
  lastRevenue: number | null
  recovery: number | null
  rpGap: number | null
  revenueGap: number | null
  bookingRateGap: number | null
  adrGap: number | null
  snapshotChange: number | null
  previousAvailableRooms: number | null
  previousBookedRooms: number | null
  previousPricedRooms: number | null
  previousBookingRevenue: number | null
  sameLeadAvailableRooms: number | null
  sameLeadBookedRooms: number | null
  sameLeadPricedRooms: number | null
  sameLeadBookingRevenue: number | null
  sameLeadBookingRate: number | null
  sameLeadAdr: number | null
  sameLeadRp: number | null
  sameLeadBookingRateGap: number | null
  sameLeadAdrGap: number | null
  sameLeadRpGap: number | null
  mainChannel: string
  risk: RiskLevel
  tags: string[]
  targetDate: string
  dayOffset: string
  precomputedStoreInsight?: StorePrecomputedInsight
}

export interface ComparisonRow {
  whCode: string
  name: string
  province: string
  area: string
  city: string
  district: string
  businessZone: string
  revenueZone: string
  brand: string
  positioning: string
  availableRooms: number
  soldRooms: number
  revenue: number
}

export interface QualityIssue {
  level: 'error' | 'warning'
  row: number
  field: string
  message: string
  value?: unknown
}

export type BroadcastLength = 'brief' | 'standard' | 'detailed'
export type BroadcastScopeLevel = 'all' | 'province' | 'area' | 'city' | 'revenueZone'

export interface BroadcastScope {
  level: BroadcastScopeLevel
  value: string
}

export interface BroadcastConfig {
  showStoreDistribution: boolean
  showDirectOperation: boolean
  showCoreZone: boolean
  showPriceAdvice: boolean
  showNewOperation: boolean
  showRenovationOperation: boolean
  showChannelAnomaly: boolean
  showStoreRisk: boolean
  nameStores: boolean
  showChannelDetail: boolean
  showTopLists: boolean
  topCount: number
  lowBookingRate: number
  directFields: Array<'operationType' | 'managementType'>
  directKeywords: string[]
  defaultLength: BroadcastLength
  copyAsWechat: boolean
}

export interface BroadcastHistoryItem {
  id: string
  createdAt: string
  targetDate: string
  batchId: string
  batchTime: string
  scope: BroadcastScope
  length: BroadcastLength
  content: string
}

export interface BroadcastState {
  config: BroadcastConfig
  history: BroadcastHistoryItem[]
}

export interface BroadcastPackage {
  brief: string
  standard: string
  detailed: string
  wechat: Record<BroadcastLength, string>
  meta: {
    targetDate: string
    comparisonDate: string
    batchId: string
    batchTime: string
    previousLabel: string
    scopeLabel: string
    currentStoreCount: number
    comparisonStoreCount: number
    missingStoreCount: number
    generatedAt: string
  }
}
