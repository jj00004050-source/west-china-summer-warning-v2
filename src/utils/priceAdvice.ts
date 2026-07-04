import type { MetricRow, PriceAdviceSettings } from '../types/data'
import { fmtMoney, fmtPct, fmtPp } from './formatter'

export type PriceAdviceLabel =
  | '强烈建议提价'
  | '建议提价'
  | '建议小幅提价'
  | '阶梯式提价'
  | '提前提价机会'
  | '保持观察'
  | '渠道补量'
  | '渠道预热'
  | '不建议提价'
  | '流量预警'
  | '价格偏高风险'
  | '高量低价风险'
  | '样本不足'
  | '商圈未配置，无法判断'

export const DEFAULT_PRICE_ADVICE_SETTINGS: PriceAdviceSettings = {
  minBookingRateByDay: { D0: .7, D1: .6, D2: .5, D3: .42, D4: .35, D5: .3, D6: .25 },
  strongZoneGapPp: .1,
  mildZoneGapPp: .05,
  lowZoneGapPp: -.1,
  highAdrAmount: 20,
  highAdrRate: .1,
  lowAdrAmount: 20,
  lowAdrRate: .1,
  storeRecoveryGapPp: -.1,
  zoneRecoveryGapPp: -.1,
  minBookedRooms: 5,
  minPricedRooms: 5,
  minZoneStores: 3,
  lowRemainingRate: .2,
  declinePp: .02,
  stablePp: .005,
  stableAdrAmount: 5,
}

export type PriceAdviceContext = {
  zoneBookingRate: number | null
  zoneAdr: number | null
  zoneLastOcc: number | null
  zoneLastAdr: number | null
  zoneStoreCount: number
  zoneBookingRateChange?: number | null
  zoneBookedChange?: number | null
}

export type PriceAdvice = {
  label: PriceAdviceLabel
  reason: string
  quantityPriceStatus: '量价双升' | '量升价降' | '量降价升' | '量价双降' | '基本稳定' | '无可比'
  threshold: number
  zoneBookingRate: number | null
  zoneAdr: number | null
  zoneLastOcc: number | null
  zoneLastAdr: number | null
  storeOccRecovery: number | null
  zoneOccRecovery: number | null
  zoneBookingGap: number | null
  zoneAdrGap: number | null
  lastAdrGap: number | null
  remainingRooms: number
  remainingRate: number | null
  bookingRateChange: number | null
  bookedChange: number | null
  adrChange: number | null
  zoneBookingRateChange: number | null
  zoneBookedChange: number | null
  specialZoneType: string
  sampleNote: string
}

const specialZoneType = (row: MetricRow) => {
  const text = `${row.businessZone || ''} ${row.revenueZone || ''} ${row.benchmarkZone || ''} ${row.benchmarkGroup || ''}`
  if (text.includes('景区')) return '景区商圈'
  if (text.includes('热门')) return '同期热门商圈'
  if (text.includes('核心')) return '核心商圈'
  return ''
}

const dayThresholds = (dayOffset: string) => {
  if (dayOffset === 'D0') return [.7, .5, .3, .2] as const
  if (dayOffset === 'D1') return [.6, .45, .28, .18] as const
  if (dayOffset === 'D2') return [.5, .38, .25, .15] as const
  if (dayOffset === 'D3') return [.42, .32, .22, .12] as const
  if (dayOffset === 'D4') return [.35, .28, .18, .1] as const
  if (dayOffset === 'D5') return [.3, .24, .15, .08] as const
  return [.25, .2, .12, .06] as const
}

export const highBookingOpportunityFloor = (dayOffset: string) => dayThresholds(dayOffset)[1]

export const isHighBookingPriority = (row: MetricRow) =>
  row.bookingRate != null &&
  row.bookingRate >= highBookingOpportunityFloor(row.dayOffset) &&
  row.availableRooms > 0 &&
  row.bookedRooms > 0 &&
  row.pricedRooms > 0 &&
  row.adr != null &&
  row.adr > 0

const actionByDay = (dayOffset: string, rate: number): PriceAdviceLabel => {
  const [strong, raise, stair, observe] = dayThresholds(dayOffset)
  if (rate >= strong) return '强烈建议提价'
  if (rate >= raise) return '建议提价'
  if (rate >= stair) return '阶梯式提价'
  if (rate >= observe) return '保持观察'
  return '渠道补量'
}

export function buildPriceAdvice(row: MetricRow, context: PriceAdviceContext, settings?: Partial<PriceAdviceSettings>): PriceAdvice {
  const config = { ...DEFAULT_PRICE_ADVICE_SETTINGS, ...settings, minBookingRateByDay: { ...DEFAULT_PRICE_ADVICE_SETTINGS.minBookingRateByDay, ...settings?.minBookingRateByDay } }
  const threshold = config.minBookingRateByDay[row.dayOffset] ?? .25
  const previousRate = row.previousAvailableRooms ? (row.previousBookedRooms || 0) / row.previousAvailableRooms : null
  const previousAdr = row.previousPricedRooms ? (row.previousBookingRevenue || 0) / row.previousPricedRooms : null
  const bookingRateChange = row.bookingRate != null && previousRate != null ? row.bookingRate - previousRate : null
  const bookedChange = row.previousBookedRooms != null ? row.bookedRooms - row.previousBookedRooms : null
  const adrChange = row.adr != null && previousAdr != null ? row.adr - previousAdr : null
  const zoneBookingRateChange = context.zoneBookingRateChange ?? null
  const zoneBookedChange = context.zoneBookedChange ?? null
  const rateRising = bookingRateChange != null && bookingRateChange > config.stablePp && (bookedChange == null || bookedChange > 0)
  const adrFalling = adrChange != null && adrChange < -config.stableAdrAmount
  const quantityPriceStatus = bookingRateChange == null || adrChange == null ? '无可比'
    : Math.abs(bookingRateChange) <= config.stablePp && Math.abs(adrChange) <= config.stableAdrAmount ? '基本稳定'
      : bookingRateChange >= 0 && adrChange >= 0 ? '量价双升'
        : bookingRateChange > 0 && adrChange < 0 ? '量升价降'
          : bookingRateChange < 0 && adrChange > 0 ? '量降价升' : '量价双降'
  const zoneBookingGap = row.bookingRate != null && context.zoneBookingRate != null ? row.bookingRate - context.zoneBookingRate : null
  const zoneAdrGap = row.adr != null && context.zoneAdr != null ? row.adr - context.zoneAdr : null
  const lastAdrGap = row.adr != null && row.lastAdr != null ? row.adr - row.lastAdr : null
  const storeOccRecovery = row.bookingRate != null && row.lastOcc != null ? row.bookingRate - row.lastOcc : null
  const zoneOccRecovery = context.zoneBookingRate != null && context.zoneLastOcc != null ? context.zoneBookingRate - context.zoneLastOcc : null
  const remainingRooms = Math.max(0, row.availableRooms - row.bookedRooms)
  const remainingRate = row.availableRooms ? remainingRooms / row.availableRooms : null
  const zoneType = specialZoneType(row)
  const zoneSampleNote = !row.revenueZone || context.zoneBookingRate == null || context.zoneAdr == null
    ? '，商圈对标暂不可用'
    : context.zoneStoreCount < config.minZoneStores
      ? `，商圈样本不足（${context.zoneStoreCount}家）`
      : `，商圈可比门店${context.zoneStoreCount}家`
  const sampleNote = `预订间夜${row.bookedRooms}，有价间夜${row.pricedRooms}${zoneSampleNote}${zoneType ? `，${zoneType}` : ''}`
  const result = (label: PriceAdviceLabel, reason: string): PriceAdvice => ({
    label, reason, quantityPriceStatus, threshold, zoneBookingRate: context.zoneBookingRate, zoneAdr: context.zoneAdr,
    zoneLastOcc: context.zoneLastOcc, zoneLastAdr: context.zoneLastAdr, storeOccRecovery, zoneOccRecovery, zoneBookingGap,
    zoneAdrGap, lastAdrGap, remainingRooms, remainingRate, bookingRateChange, bookedChange, adrChange,
    zoneBookingRateChange, zoneBookedChange, specialZoneType: zoneType, sampleNote,
  })

  const hasValidOtb = row.availableRooms > 0 && row.bookingRate != null && Number.isFinite(row.bookingRate)
  if (!hasValidOtb) return result('样本不足', '当前无有效可售房或OTB无法计算，暂不生成价格动作建议')

  const highBookingPriority = isHighBookingPriority(row)
  const highVsZone = zoneAdrGap != null && context.zoneAdr != null && row.adr != null &&
    (zoneAdrGap >= config.highAdrAmount || row.adr >= context.zoneAdr * (1 + config.highAdrRate))
  const highVsLast = lastAdrGap != null && row.lastAdr != null && row.adr != null &&
    (lastAdrGap >= config.highAdrAmount || row.adr >= row.lastAdr * (1 + config.highAdrRate))
  const weakSpeed = bookingRateChange != null && bookingRateChange <= config.stablePp && (bookedChange == null || bookedChange <= 0)
  const clearlyBelowZone = zoneBookingGap != null && zoneBookingGap <= -.05
  if (!highBookingPriority && (highVsZone || highVsLast) && clearlyBelowZone && weakSpeed) {
    return result('价格偏高风险', 'ADR高于商圈且预订表现偏弱，谨慎继续提价')
  }
  const lowVsZone = zoneAdrGap != null && zoneAdrGap < 0
  const lowVsLast = lastAdrGap != null && lastAdrGap < 0
  if (!highBookingPriority && rateRising && adrFalling && (lowVsZone || lowVsLast)) {
    return result('高量低价风险', `OTB${rateRising ? '提升' : '有基础'}但ADR偏低，关注收益质量`)
  }

  const action = actionByDay(row.dayOffset, row.bookingRate as number)

  if (action === '强烈建议提价') {
    return result(action, row.dayOffset === 'D0'
      ? '检查是否存在异常控房；如为真实预订，尽早核实到店并精准控量，关闭低价房型，提升剩余库存价格'
      : `OTB ${fmtPct(row.bookingRate)}，处于${row.dayOffset}高位，核实库存后提价并控制OTA低价房`)
  }
  if (action === '建议提价') {
    return result(action, row.dayOffset === 'D0'
      ? '检查是否存在异常控房；如为真实预订，结合实际库存和竞对价库确定提价幅度，争取跑赢竞对'
      : `OTB ${fmtPct(row.bookingRate)}，已有提价基础，结合库存和竞对价库阶梯提价`)
  }
  if (action === '阶梯式提价') {
    return result(action, row.dayOffset === 'D0'
      ? '检查是否存在异常控房；如为真实预订，结合实际库存阶梯式提价，并随流量增速持续上调'
      : `OTB ${fmtPct(row.bookingRate)}，关注订单进速，结合库存灵活阶梯式提价`)
  }
  if (action === '保持观察') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，关注订单进速和商圈热度，结合竞对价格、渠道展示和库存结构小幅试探或补量`)
  }
  return result('渠道补量', '了解城市和商圈流量热度，检查渠道展示、价格竞争力和产品触达，可报名活动引流并铺排协议、团队客源')
}
