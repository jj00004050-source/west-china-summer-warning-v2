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
  minBookingRateByDay: { D0: .7, D1: .55, D2: .45, D3: .35, D4: .3, D5: .25, D6: .25 },
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

const actionByDay = (dayOffset: string, rate: number, topThreshold: number): PriceAdviceLabel => {
  if (dayOffset === 'D0') {
    if (rate >= topThreshold) return '强烈建议提价'
    if (rate >= .5) return '建议提价'
    if (rate >= .3) return '阶梯式提价'
    if (rate >= .2) return '保持观察'
    return '不建议提价'
  }
  if (dayOffset === 'D1') {
    if (rate >= topThreshold) return '强烈建议提价'
    if (rate >= .4) return '建议提价'
    if (rate >= .25) return '建议小幅提价'
    if (rate >= .15) return '渠道补量'
    return '不建议提价'
  }
  if (dayOffset === 'D2') {
    if (rate >= topThreshold) return '强烈建议提价'
    if (rate >= .35) return '建议小幅提价'
    if (rate >= .25) return '保持观察'
    if (rate >= .15) return '渠道补量'
    return '不建议提价'
  }
  if (dayOffset === 'D3') {
    if (rate >= topThreshold) return '阶梯式提价'
    if (rate >= .25) return '建议小幅提价'
    if (rate >= .15) return '保持观察'
    return '不建议提价'
  }
  if (dayOffset === 'D4') {
    if (rate >= topThreshold) return '建议小幅提价'
    if (rate >= .2) return '保持观察'
    if (rate >= .1) return '渠道补量'
    return '不建议提价'
  }
  if (rate >= topThreshold) return '提前提价机会'
  if (rate >= .15) return '保持观察'
  if (rate >= .08) return '渠道预热'
  return '流量预警'
}

const activationFloor = (dayOffset: string) => dayOffset === 'D0' ? .2
  : dayOffset === 'D1' || dayOffset === 'D2' || dayOffset === 'D3' ? .15
    : dayOffset === 'D4' ? .1 : .08

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
  const rateFalling = bookingRateChange != null && bookingRateChange < -config.stablePp
  const adrRising = adrChange != null && adrChange > config.stableAdrAmount
  const adrFalling = adrChange != null && adrChange < -config.stableAdrAmount
  const zoneWarming = zoneBookingRateChange != null && zoneBookingRateChange > config.stablePp && (zoneBookedChange == null || zoneBookedChange > 0)
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
  const sampleNote = `预订间夜${row.bookedRooms}，有价间夜${row.pricedRooms}，商圈可比门店${context.zoneStoreCount}家${zoneType ? `，${zoneType}` : ''}`
  const result = (label: PriceAdviceLabel, reason: string): PriceAdvice => ({
    label, reason, quantityPriceStatus, threshold, zoneBookingRate: context.zoneBookingRate, zoneAdr: context.zoneAdr,
    zoneLastOcc: context.zoneLastOcc, zoneLastAdr: context.zoneLastAdr, storeOccRecovery, zoneOccRecovery, zoneBookingGap,
    zoneAdrGap, lastAdrGap, remainingRooms, remainingRate, bookingRateChange, bookedChange, adrChange,
    zoneBookingRateChange, zoneBookedChange, specialZoneType: zoneType, sampleNote,
  })

  if (!row.revenueZone || context.zoneBookingRate == null || context.zoneAdr == null) {
    return result('商圈未配置，无法判断', '缺少有效收益管理商圈，无法判断商圈量价对标')
  }
  const lowCurrentSample = row.bookedRooms < config.minBookedRooms || row.pricedRooms < config.minPricedRooms
  if (row.bookingRate == null || row.adr == null || lowCurrentSample || context.zoneStoreCount < config.minZoneStores) {
    return result('样本不足', '预订样本不足，暂不生成强动作建议')
  }

  const highVsZone = zoneAdrGap != null && (zoneAdrGap >= config.highAdrAmount || row.adr >= context.zoneAdr * (1 + config.highAdrRate))
  const highVsLast = lastAdrGap != null && row.lastAdr != null && (lastAdrGap >= config.highAdrAmount || row.adr >= row.lastAdr * (1 + config.highAdrRate))
  if (highVsZone || highVsLast || (adrRising && rateFalling) || ((zoneBookingGap || 0) < 0 && (zoneAdrGap || 0) > 0)) {
    return result('价格偏高风险', 'ADR高于商圈且预订表现偏弱，谨慎继续提价')
  }
  const lowVsZone = zoneAdrGap != null && zoneAdrGap < 0
  const lowVsLast = lastAdrGap != null && lastAdrGap < 0
  if ((rateRising && adrFalling) || lowVsZone || lowVsLast) {
    return result('高量低价风险', `OTB${rateRising ? '提升' : '有基础'}但ADR偏低，关注收益质量`)
  }

  const adrSpace = !highVsZone && !highVsLast
  const historicalSpace = (storeOccRecovery != null && storeOccRecovery < 0) || (zoneOccRecovery != null && zoneOccRecovery < 0)
  let action = actionByDay(row.dayOffset, row.bookingRate, threshold)
  const canActivate = row.bookingRate >= activationFloor(row.dayOffset) && rateRising && zoneWarming && adrSpace
  if (canActivate && (historicalSpace || zoneType)) {
    if (row.dayOffset === 'D5' || row.dayOffset === 'D6') action = '提前提价机会'
    else if (action === '保持观察' || action === '渠道补量' || action === '不建议提价') action = '阶梯式提价'
  } else if (rateRising && zoneWarming && action === '渠道补量') {
    action = '保持观察'
  } else if (rateRising && action === '不建议提价' && row.bookingRate >= activationFloor(row.dayOffset)) {
    action = '保持观察'
  }

  if (action === '强烈建议提价') {
    return result(action, row.dayOffset === 'D0'
      ? `OTB ${fmtPct(row.bookingRate)}，剩余${remainingRooms}间，核实真实预订后精准控量`
      : `OTB ${fmtPct(row.bookingRate)}，提价窗口明确，结合剩余库存精准控量`)
  }
  if (action === '建议提价') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，${(zoneBookingGap || 0) >= 0 ? `高于商圈${fmtPp(zoneBookingGap)}` : '订单基础较好'}，结合竞对价库提价`)
  }
  if (action === '建议小幅提价') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，${rateRising ? `较上版${fmtPp(bookingRateChange)}` : '具备价格空间'}，小幅试探提价`)
  }
  if (action === '阶梯式提价') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，${rateRising ? `较上版${fmtPp(bookingRateChange)}` : '预订基础改善'}，进速加快可阶梯提价`)
  }
  if (action === '提前提价机会') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，远端已有需求基础，提前观察提价机会`)
  }
  if (action === '渠道补量') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，预订基础偏弱，优先补充渠道流量`)
  }
  if (action === '渠道预热') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，远端需求尚在形成，提前做好渠道预热`)
  }
  if (action === '流量预警') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，远端基数偏低，关注渠道曝光与转化`)
  }
  if (action === '不建议提价') {
    return result(action, `OTB ${fmtPct(row.bookingRate)}，预订基础不足，优先修复渠道流量`)
  }
  return result('保持观察', `OTB ${fmtPct(row.bookingRate)}，${zoneWarming ? '商圈同步升温' : rateRising ? '进速有所改善' : '当前变化有限'}，观察下一跑批`)
}
