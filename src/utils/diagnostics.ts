import type { MetricRow, SnapshotRecord } from '../types/data'
import { aggregate } from './metrics'
import { channelGroup } from './channels'

export type DistributionMetric =
  | 'zoneGap'
  | 'bookingRate'
  | 'rpGap'
  | 'rp'
  | 'adrGap'
  | 'bookingRateChange'
  | 'rpChange'
  | 'otaShare'
  | 'onlineShare'

export const isDirectStore = (row: MetricRow) =>
  ['直营', '自营', '直管'].some(keyword => `${row.operationType}${row.managementType}`.includes(keyword))

export function weightedZoneRates(rows: MetricRow[]) {
  return Object.entries(rows.reduce<Record<string, MetricRow[]>>((result, row) => {
    if (row.revenueZone) (result[row.revenueZone] ||= []).push(row)
    return result
  }, {})).reduce<Record<string, number | null>>((result, [name, zoneRows]) => {
    result[name] = aggregate(zoneRows).bookingRate
    return result
  }, {})
}

export function storeChannelShares(channelRows: SnapshotRecord[]) {
  const totals = channelRows.reduce<Record<string, { ota: number; online: number; total: number }>>((result, row) => {
    const target = result[row.whCode] ||= { ota: 0, online: 0, total: 0 }
    const rooms = row.bookedRooms || 0
    const group = channelGroup(row)
    target.total += rooms
    if (group === '各OTA') target.ota += rooms
    if (group === '线上直销') target.online += rooms
    return result
  }, {})
  return Object.entries(totals).reduce<Record<string, { ota: number; online: number }>>((result, [code, value]) => {
    result[code] = {
      ota: value.total ? value.ota / value.total : 0,
      online: value.total ? value.online / value.total : 0,
    }
    return result
  }, {})
}

export function metricValue(row: MetricRow, metric: DistributionMetric, zoneRates: Record<string, number | null>, channelShares: Record<string, { ota: number; online: number }>) {
  const previousBookingRate = row.previousAvailableRooms ? (row.previousBookedRooms || 0) / row.previousAvailableRooms : null
  const zoneRate = row.revenueZone ? zoneRates[row.revenueZone] : null
  if (metric === 'zoneGap') return row.bookingRate != null && zoneRate != null ? (row.bookingRate - zoneRate) * 100 : null
  if (metric === 'bookingRate') return row.bookingRate != null ? row.bookingRate * 100 : null
  if (metric === 'rpGap') return row.rpGap
  if (metric === 'rp') return row.rp
  if (metric === 'adrGap') return row.adrGap
  if (metric === 'bookingRateChange') return row.bookingRate != null && previousBookingRate != null ? (row.bookingRate - previousBookingRate) * 100 : null
  if (metric === 'rpChange') return row.snapshotChange
  if (metric === 'otaShare') return (channelShares[row.whCode]?.ota ?? 0) * 100
  return (channelShares[row.whCode]?.online ?? 0) * 100
}

export const quantile = (values: number[], ratio: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * ratio
  const lower = Math.floor(position)
  const rest = position - lower
  return sorted[lower + 1] == null ? sorted[lower] : sorted[lower] + rest * (sorted[lower + 1] - sorted[lower])
}

export function boxStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, .25)
  const median = quantile(sorted, .5)
  const q3 = quantile(sorted, .75)
  const iqr = q3 - q1
  const lowFence = q1 - 1.5 * iqr
  const highFence = q3 + 1.5 * iqr
  const inliers = sorted.filter(value => value >= lowFence && value <= highFence)
  return {
    min: inliers[0] ?? sorted[0] ?? 0,
    q1,
    median,
    q3,
    max: inliers.at(-1) ?? sorted.at(-1) ?? 0,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0,
    iqr,
    lowFence,
    highFence,
  }
}
