import type { MetricRow } from '../types/data'
import { isDirectStore } from './diagnostics'

export type StoreTypeFilter = '全部门店' | '直营店' | '新开店' | '非新开存量店'
export type RenovationFilter = '全部' | '改造店' | '非改造店' | string

const dateTime = (value: string) => {
  const time = value ? new Date(`${value}T00:00:00`).getTime() : NaN
  return Number.isFinite(time) ? time : null
}

export const monthsBetween = (from: string, to: string) => {
  const start = dateTime(from), end = dateTime(to)
  if (start == null || end == null) return null
  return Math.max(0, Math.floor((end - start) / (365.2425 / 12 * 86400000)))
}

export function storeTypeProfile(row: MetricRow) {
  const openMonths = monthsBetween(row.openDate, row.targetDate)
  const isNew = openMonths != null && openMonths <= 18
  const newStage = openMonths == null ? '开业日期缺失'
    : openMonths <= 3 ? '0-3个月'
      : openMonths <= 6 ? '3-6个月'
        : openMonths <= 12 ? '6-12个月'
          : openMonths <= 18 ? '12-18个月' : '18个月以上'
  const isRenovated = row.isRenovated
  const direct = isDirectStore(row)
  const typeTags = [
    direct ? '直营' : '',
    isNew ? `新开${openMonths}个月` : '',
    isRenovated ? '改造店' : '',
    isRenovated ? (row.renovationType || '改造类型未标记') : '',
  ].filter(Boolean)
  return { direct, openMonths, isNew, newStage, isRenovated, renovationType: row.renovationType, typeTags }
}

export function matchesRenovationFilter(row: MetricRow, filter: RenovationFilter) {
  if (filter === '改造店') return row.isRenovated
  if (filter === '非改造店') return !row.isRenovated
  if (filter !== '全部') return row.isRenovated && (row.renovationType || '改造类型未标记') === filter
  return true
}

export function matchesStoreType(row: MetricRow, filter: StoreTypeFilter) {
  const profile = storeTypeProfile(row)
  if (filter === '直营店') return profile.direct
  if (filter === '新开店') return profile.isNew
  if (filter === '非新开存量店') return !profile.isNew
  return true
}
