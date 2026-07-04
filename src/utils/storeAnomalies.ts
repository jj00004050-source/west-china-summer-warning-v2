import type { MetricRow, SnapshotRecord } from '../types/data'
import { channelGroup } from './channels'
import { isDirectStore } from './diagnostics'
import { fmtMoney, fmtPct, fmtPp } from './formatter'
import { isHighBookingPriority } from './priceAdvice'
import { storeTypeProfile } from './storeTypes'

export type StoreRiskGrade = 'S' | 'A' | 'B' | 'C' | 'normal'
export type StoreChannelMix = {
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

export type StoreAnomaly = {
  grade: StoreRiskGrade
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

export const EMPTY_STORE_MIX: StoreChannelMix = { ota: 0, online: 0, offline: 0, other: 0, ctrip: 0, meituan: 0, fliggy: 0, mainName: '无预订', mainShare: 0, total: 0 }
export const GRADE_ORDER: Record<StoreRiskGrade, number> = { S: 0, A: 1, B: 2, C: 3, normal: 4 }
export const GRADE_LABEL: Record<StoreRiskGrade, string> = { S: '高风险', A: '中风险', B: '关注项', C: '口径提示', normal: '正常' }

export type StoreRiskContext = {
  zoneAdr?: number | null
  zoneBookingRateChange?: number | null
  priceAdviceLabel?: string
}

export function buildStoreChannelMix(channelRows: SnapshotRecord[]) {
  const grouped = channelRows.reduce<Record<string, SnapshotRecord[]>>((result, row) => {
    ;(result[row.whCode] ||= []).push(row)
    return result
  }, {})
  return Object.entries(grouped).reduce<Record<string, StoreChannelMix>>((result, [whCode, records]) => {
    const counts = { ota: 0, online: 0, offline: 0, other: 0, ctrip: 0, meituan: 0, fliggy: 0 }
    records.forEach(row => {
      const rooms = row.bookedRooms || 0
      const main = channelGroup(row)
      if (main === '各OTA') counts.ota += rooms
      else if (main === '线上直销') counts.online += rooms
      else if (main === '线下直销') counts.offline += rooms
      else counts.other += rooms
      const otaName = row.channelLevel3 || row.channel
      if (otaName === '携程') counts.ctrip += rooms
      if (otaName === '美团') counts.meituan += rooms
      if (otaName === '飞猪') counts.fliggy += rooms
    })
    const total = counts.ota + counts.online + counts.offline + counts.other
    if (!total) { result[whCode] = EMPTY_STORE_MIX; return result }
    const shares = {
      ota: counts.ota / total,
      online: counts.online / total,
      offline: counts.offline / total,
      other: counts.other / total,
      ctrip: counts.ctrip / total,
      meituan: counts.meituan / total,
      fliggy: counts.fliggy / total,
    }
    const main = Object.entries({ 各OTA: shares.ota, 线上直销: shares.online, 线下直销: shares.offline, 其他: shares.other }).sort((a, b) => b[1] - a[1])[0]
    result[whCode] = { ...shares, mainName: main[0], mainShare: main[1], total }
    return result
  }, {})
}

const unique = (values: string[]) => [...new Set(values)]

export function analyzeStore(row: MetricRow, zoneRate: number | null, mix: StoreChannelMix, bottom20 = false, context: StoreRiskContext = {}): StoreAnomaly {
  const businessTags: string[] = []
  const businessReasons: string[] = []
  const statusTags: string[] = []
  const statusReasons: string[] = []
  const dataTags: string[] = []
  const dataReasons: string[] = []
  const currentMissing = row.tags.includes('缺失预订数据')
  const hasComparison = row.lastOcc != null || row.lastAdr != null || row.lastRp != null
  const previousBookingRate = row.previousAvailableRooms ? (row.previousBookedRooms || 0) / row.previousAvailableRooms : null
  const previousAdr = row.previousPricedRooms ? (row.previousBookingRevenue || 0) / row.previousPricedRooms : null
  const previousRp = row.previousAvailableRooms ? (row.previousBookingRevenue || 0) / row.previousAvailableRooms : null
  const bookingRateChange = row.bookingRate != null && previousBookingRate != null ? row.bookingRate - previousBookingRate : null
  const adrChange = row.adr != null && previousAdr != null ? row.adr - previousAdr : null
  const rpChange = row.rp != null && previousRp != null ? row.rp - previousRp : null
  const bookedChange = row.previousBookedRooms != null ? row.bookedRooms - row.previousBookedRooms : null
  const zoneGap = row.bookingRate != null && zoneRate != null ? row.bookingRate - zoneRate : null
  const zoneAdrGap = row.adr != null && context.zoneAdr != null ? row.adr - context.zoneAdr : null
  const direct = isDirectStore(row)
  const typeProfile = storeTypeProfile(row)
  const near = row.dayOffset === 'D0' || row.dayOffset === 'D1'
  const nearOrD2 = near || row.dayOffset === 'D2'
  const nearLowThreshold = row.dayOffset === 'D0' ? .2 : row.dayOffset === 'D1' || row.dayOffset === 'D2' ? .15 : .1
  const nearLow = row.bookingRate != null && row.bookingRate < nearLowThreshold
  const weakSpeed = bookingRateChange != null && bookingRateChange <= 0 && (bookedChange == null || bookedChange <= 0)
  const zoneWarming = context.zoneBookingRateChange != null && context.zoneBookingRateChange > 0
  const zoneNotWeak = zoneRate != null && zoneRate >= (near ? .2 : .15)
  const newWithoutComparison = typeProfile.isNew && !hasComparison
  const highBookingPriority = isHighBookingPriority(row)

  if (currentMissing) {
    statusTags.push('无预订数据')
    statusReasons.push('当前在营门店在本次预订文件中没有匹配记录。')
    dataTags.push('数据待核验')
    dataReasons.push('请确认当前文件是否应覆盖全部在营门店。')
  }
  if (!hasComparison) {
    statusTags.push(typeProfile.isNew ? '新开无可比' : '无同期')
    statusReasons.push(typeProfile.isNew ? '该店为开业18个月以内的新开门店，去年同期无可比经营数据，不直接参与同期RP缺口判断。' : '去年周对周同期日期未匹配到该门店经营数据。')
  }
  if (!row.openDate) statusTags.push('开业日期缺失')
  if (!row.revenueZone) {
    statusTags.push('商圈未配置')
    statusReasons.push('维度表未配置收益管理商圈，无法计算较商圈差异。')
  }
  if (!row.province || !row.area || !row.city || !row.brand) {
    statusTags.push('维度待完善')
    statusReasons.push('省区、片区、城市或品牌维度存在缺失。')
  }
  if (row.tags.includes('物理房量缺失')) {
    dataTags.push('数据待核验')
    dataReasons.push('维度表物理房量为空或为0；当前预订指标仍优先使用快照表去重可售房计算。')
  }
  if (!currentMissing && row.availableRooms === 0 && row.bookedRooms > 0) {
    dataTags.push('数据待核验')
    dataReasons.push('当前可售房为0但存在预订房间。')
  }
  if (row.availableRooms > 0 && row.bookedRooms > row.availableRooms) {
    dataTags.push('数据待核验')
    dataReasons.push('当前预订房间数大于去重后的可售房间数。')
  }
  if (row.pricedRooms === 0 && row.bookingRevenue > 0) {
    dataTags.push('数据待核验')
    dataReasons.push('有房价预订房间数为0，但预订总价不为0。')
  }
  if (row.bookedRooms > 0 && row.bookingRevenue === 0) {
    dataTags.push('数据待核验')
    dataReasons.push('存在预订房间，但预订总价为0。')
  }

  if (!currentMissing) {
    if (row.bookedRooms === 0) {
      businessTags.push('0预定')
      businessReasons.push('当前预订房间数为0。')
    }
    if (row.bookingRate != null && row.bookingRate < .1) {
      businessTags.push('低预订率')
      businessReasons.push(`当前预订率${fmtPct(row.bookingRate)}，低于10%关注阈值。`)
    }
    if (zoneGap != null && zoneGap < 0) {
      businessTags.push(zoneGap <= -.1 ? '低于商圈10pp+' : '低于商圈')
      businessReasons.push(`本店预订率低于所属收益管理商圈${fmtPp(Math.abs(zoneGap))}。`)
    }
    if (row.rpGap != null && row.rpGap < -50) {
      businessTags.push('RP缺口大')
      businessReasons.push(`当前理论RP低于同期RP ${fmtMoney(Math.abs(row.rpGap))}元。`)
    }
    if (bookingRateChange != null && bookingRateChange < 0) {
      businessTags.push('预订率下降')
      businessReasons.push(`预订率较上一版下降${fmtPp(Math.abs(bookingRateChange))}。`)
    }
    if (adrChange != null && adrChange < 0) {
      businessTags.push('ADR下降')
      businessReasons.push(`在手ADR较上一版下降${fmtMoney(Math.abs(adrChange))}元。`)
    }
    if ((bookingRateChange || 0) < 0 && (adrChange || 0) < 0) businessTags.push('量价双降')
    if ((bookingRateChange || 0) > 0 && (adrChange || 0) < 0) businessTags.push('量升价降')
    if (mix.total && mix.ota >= .6) {
      businessTags.push('OTA偏高')
      businessReasons.push(`各OTA预订间夜占比${fmtPct(mix.ota)}，渠道依赖偏高。`)
    }
    if (mix.total && mix.online < .1) {
      businessTags.push('直销偏低')
      businessReasons.push(`线上直销预订间夜占比${fmtPct(mix.online)}，贡献偏低。`)
    }
    if ((row.bookingRate || 0) >= 1 && row.lastAdr != null && row.adr != null && row.adr < row.lastAdr) {
      businessTags.push('满房低价')
      businessReasons.push('门店已满房，但当前在手ADR低于同期ADR。')
    }
    if (bottom20) businessTags.push('商圈后20%')
    if (direct && (row.bookedRooms === 0 || (zoneGap != null && zoneGap < -.1))) businessTags.push('直营风险')
  }

  const zeroNear = near && !currentMissing && row.bookedRooms === 0 && !newWithoutComparison
  const lowZoneWeakSpeed = near && nearLow && zoneGap != null && zoneGap < 0 && weakSpeed
  const laggingHotZone = nearOrD2 && zoneGap != null && zoneGap <= -.1 && (zoneNotWeak || zoneWarming)
  const priceSuppressing = nearOrD2 && zoneAdrGap != null && zoneAdrGap >= 20 && zoneGap != null && zoneGap <= -.05
  const priceUpVolumeDown = nearOrD2 && (adrChange || 0) > 5 && (bookingRateChange || 0) < 0 && ((zoneGap || 0) < 0 || weakSpeed)
  const doubleDeclineNear = nearOrD2 && nearLow && (bookingRateChange || 0) < 0 && (adrChange || 0) < 0
  const directChannelRisk = direct && nearLow && mix.total > 0 && mix.ota >= .7 && mix.online < .1
  const offlineOnlyRisk = near && nearLow && mix.total > 0 && mix.offline >= .999
  const inventoryOrDisplayRisk = near && nearLow && (currentMissing || dataTags.includes('数据待核验'))
  const high = !highBookingPriority && (zeroNear || lowZoneWeakSpeed || laggingHotZone || priceSuppressing || priceUpVolumeDown || doubleDeclineNear || directChannelRisk || offlineOnlyRisk || inventoryOrDisplayRisk)
  if (zeroNear) businessTags.push('近端0预定')
  if (priceSuppressing || priceUpVolumeDown) businessTags.push('价格压制转化')
  if (offlineOnlyRisk) businessTags.push('线下直销100%')

  const medium = !high && !highBookingPriority && (
    (nearOrD2 && nearLow) ||
    (nearOrD2 && (bookingRateChange || 0) < 0 && (zoneGap || 0) < 0) ||
    (row.dayOffset === 'D2' && row.bookedRooms === 0) ||
    (businessTags.includes('量价双降') && nearOrD2) ||
    (direct && nearLow && (mix.ota >= .6 || (mix.total > 0 && mix.online < .1)))
  )
  const riskNeutralTags = new Set(['RP缺口大'])
  const highBookingProtectedTags = new Set(['低于商圈', '低于商圈10pp+', '预订率下降', 'ADR下降', '量价双降', '量升价降', '满房低价'])
  const hasActionableAttention = businessTags.some(tag =>
    !riskNeutralTags.has(tag) && (!highBookingPriority || !highBookingProtectedTags.has(tag))) ||
    (!highBookingPriority && ['价格偏高风险', '高量低价风险'].includes(context.priceAdviceLabel || ''))
  const attention = !high && !medium && hasActionableAttention
  const methodology = !high && !medium && !attention && (statusTags.length > 0 || dataTags.length > 0)
  const grade: StoreRiskGrade = high ? 'S' : medium ? 'A' : attention ? 'B' : methodology ? 'C' : 'normal'
  return {
    grade,
    businessTags: unique(businessTags),
    businessReasons: unique(businessReasons),
    statusTags: unique(statusTags),
    statusReasons: unique(statusReasons),
    dataTags: unique(dataTags),
    dataReasons: unique(dataReasons),
    bookingRateChange,
    adrChange,
    rpChange,
    bookedChange,
    direct,
  }
}
