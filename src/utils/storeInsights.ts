import type {
  ComparisonRow,
  MetricRow,
  PriceAdviceSettings,
  SnapshotRecord,
  StorePrecomputedInsight,
} from '../types/data'
import { aggregate } from './metrics'
import { buildPriceAdvice } from './priceAdvice'
import { analyzeStore, buildStoreChannelMix, EMPTY_STORE_MIX } from './storeAnomalies'
import { storeTypeProfile } from './storeTypes'

const PRICE_OPPORTUNITY_LABELS = new Set([
  '强烈建议提价',
  '建议提价',
  '建议小幅提价',
  '阶梯式提价',
  '提前提价机会',
])

export function buildStoreInsights(
  rows: MetricRow[],
  comparisonRows: ComparisonRow[],
  channelRows: SnapshotRecord[],
  priceSettings?: Partial<PriceAdviceSettings>,
) {
  const zoneGroups = rows.reduce<Record<string, MetricRow[]>>((result, row) => {
    if (row.revenueZone) (result[row.revenueZone] ||= []).push(row)
    return result
  }, {})
  const comparisonByZone = comparisonRows.reduce<Record<string, ComparisonRow[]>>((result, row) => {
    if (row.revenueZone) (result[row.revenueZone] ||= []).push(row)
    return result
  }, {})
  const zoneMetrics = Object.entries(zoneGroups).reduce<Record<string, ReturnType<typeof aggregate>>>((result, [name, zoneRows]) => {
    result[name] = aggregate(zoneRows, comparisonByZone[name] || [])
    return result
  }, {})
  const bottom20Codes = new Set(Object.values(zoneGroups).flatMap(zoneRows => {
    const sorted = [...zoneRows]
      .filter(row => row.bookingRate != null)
      .sort((a, b) => (a.bookingRate || 0) - (b.bookingRate || 0))
    return sorted.slice(0, Math.ceil(sorted.length * .2)).map(row => row.whCode)
  }))
  const channelByHotel = buildStoreChannelMix(channelRows)

  return rows.reduce<Record<string, StorePrecomputedInsight>>((result, row) => {
    const zone = row.revenueZone ? zoneMetrics[row.revenueZone] : undefined
    const zoneRate = zone?.bookingRate ?? null
    const zoneGap = row.bookingRate != null && zoneRate != null ? row.bookingRate - zoneRate : null
    const mix = channelByHotel[row.whCode] || EMPTY_STORE_MIX
    const priceAdvice = buildPriceAdvice(row, {
      zoneBookingRate: zoneRate,
      zoneAdr: zone?.adr ?? null,
      zoneLastOcc: zone?.lastOcc ?? null,
      zoneLastAdr: zone?.lastAdr ?? null,
      zoneStoreCount: row.revenueZone ? (zoneGroups[row.revenueZone]?.length || 0) : 0,
      zoneBookingRateChange: zone?.bookingRateChange ?? null,
      zoneBookedChange: zone?.previousAvailableRooms ? zone.bookedRooms - zone.previousBookedRooms : null,
    }, priceSettings)
    const anomaly = analyzeStore(row, zoneRate, mix, bottom20Codes.has(row.whCode), {
      zoneAdr: zone?.adr ?? null,
      zoneBookingRateChange: zone?.bookingRateChange ?? null,
      priceAdviceLabel: priceAdvice.label,
    })
    const typeProfile = storeTypeProfile(row)
    const renovationTags = row.isRenovated ? [
      ((row.bookingRate != null && zoneRate != null && row.bookingRate < zoneRate) ||
        (row.bookingRate != null && row.lastOcc != null && row.bookingRate < row.lastOcc) ||
        (row.bookingRate || 0) < priceAdvice.threshold) ? '改造店低预订' : '',
      row.bookedRooms === 0 ? '改造店0预定' : '',
      zoneGap != null && zoneGap < 0 ? '改造店低于商圈' : '',
      PRICE_OPPORTUNITY_LABELS.has(priceAdvice.label) ? '改造店提价机会' : '',
      priceAdvice.label === '价格偏高风险' ? '改造店价格偏高风险' : '',
    ].filter(Boolean) : []
    result[row.whCode] = {
      zoneRate,
      zoneGap,
      mix,
      anomaly,
      priceAdvice: {
        label: priceAdvice.label,
        reason: priceAdvice.reason,
        quantityPriceStatus: priceAdvice.quantityPriceStatus,
        threshold: priceAdvice.threshold,
      },
      typeProfile,
      renovationTags,
    }
    return result
  }, {})
}
