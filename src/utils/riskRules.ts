import type { RiskLevel } from '../types/data'

export function evaluateRisk(input: {
  recovery: number | null; bookingRateGap: number | null; adr: number | null; lastAdr: number | null
  rpGap: number | null; revenueGap: number | null; snapshotChange: number | null
  bookingRate?: number | null; bookingRateChange?: number | null; bookedRooms?: number; dayOffset?: string
}): { risk: RiskLevel; tags: string[] } {
  const { bookingRateGap, adr, lastAdr, rpGap, snapshotChange, bookingRate, bookingRateChange, bookedRooms = 0, dayOffset = '' } = input
  const tags: string[] = []
  const near = dayOffset === 'D0' || dayOffset === 'D1'
  const nearOrD2 = near || dayOffset === 'D2'
  const nearLowThreshold = dayOffset === 'D0' ? .2 : .15
  const nearLow = nearOrD2 && bookingRate != null && bookingRate < nearLowThreshold
  if (bookingRateGap != null && bookingRateGap < -.1) tags.push('预订率落后')
  if (adr != null && lastAdr != null && adr < lastAdr * .9) tags.push('ADR偏低')
  if (rpGap != null && rpGap < -30) tags.push('RP蓄水差距')
  if (snapshotChange != null && snapshotChange <= 0) tags.push('快照无增长')
  if ((bookingRateGap ?? 0) < -.05 && (adr ?? Infinity) < (lastAdr ?? 0)) tags.push('量价双低')
  if (near && bookedRooms === 0) return { risk: 'high', tags: [...tags, '近端0预定'] }
  if (nearLow && bookingRateChange != null && bookingRateChange <= 0) return { risk: 'high', tags: [...tags, '近端低预订且进速弱'] }
  if (nearOrD2 && nearLow) return { risk: 'watch', tags: [...tags, '近端低预订'] }
  if ((bookingRateGap ?? 0) < -.05 || ((adr ?? Infinity) < (lastAdr ?? 0) && snapshotChange != null && snapshotChange <= 0)) return { risk: 'watch', tags }
  if ((bookingRateGap ?? 0) > 0) return { risk: 'leading', tags: tags.length ? tags : ['预订进度领先'] }
  return { risk: 'normal', tags: tags.length ? tags : ['经营正常'] }
}
