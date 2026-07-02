import type { ComparisonRow, Hotel, LastYearRecord, MetricRow, RenovationRecord, SameLeadSnapshotRecord, SnapshotBatch, SnapshotRecord } from '../types/data'
import { evaluateRisk } from './riskRules'

const safe = (a: number, b: number) => b ? a / b : null
const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
const group = <T,>(rows: T[], key: (r: T) => string) => rows.reduce<Record<string, T[]>>((acc, r) => {
  (acc[key(r)] ||= []).push(r); return acc
}, {})
let hotelCacheSource: Hotel[] | null = null
let hotelCache = new Map<string, Hotel>()
let lastYearCacheSource: LastYearRecord[] | null = null
let lastYearCache: Record<string, LastYearRecord[]> = {}

function hotelSnapshot(rows: SnapshotRecord[]) {
  const availableRooms = Math.max(0, ...rows.map(r => r.availableRooms))
  const bookedRooms = sum(rows.map(r => r.bookedRooms))
  const pricedRooms = sum(rows.map(r => r.pricedRooms))
  const bookingRevenue = sum(rows.map(r => r.bookingRevenue))
  const bookingRate = safe(bookedRooms, availableRooms)
  const adr = safe(bookingRevenue, pricedRooms)
  const rp = safe(bookingRevenue, availableRooms)
  const channels = Object.entries(group(rows, r => r.channel || '其他')).map(([name, rs]) => ({
    name, nights: sum(rs.map(r => r.channelNights || r.bookedRooms)),
  })).sort((a, b) => b.nights - a.nights)
  return { availableRooms, bookedRooms, pricedRooms, bookingRevenue, bookingRate, adr, rp, mainChannel: channels[0]?.name || '--' }
}

function lastYearMetric(rows: LastYearRecord[]) {
  if (!rows.length) return { occ: null, adr: null, rp: null, revenue: null, available: null, sold: null }
  const available = Math.max(0, ...rows.map(r => r.availableRooms))
  const channelBreakdown = new Set(rows.map(r => r.channel).filter(Boolean)).size > 1
  const sold = channelBreakdown ? (sum(rows.map(r => r.channelNights || 0)) || Math.max(0, ...rows.map(r => r.soldRooms))) : Math.max(0, ...rows.map(r => r.soldRooms))
  const revenue = channelBreakdown ? (sum(rows.map(r => r.channelRevenue || 0)) || Math.max(0, ...rows.map(r => r.revenue || 0))) : Math.max(0, ...rows.map(r => r.revenue || 0))
  const occ = rows.find(r => r.occ != null)?.occ ?? safe(sold, available)
  const adr = rows.find(r => r.adr != null)?.adr ?? safe(revenue, sold)
  const rp = rows.find(r => r.rp != null)?.rp ?? safe(revenue, available)
  return { occ, adr, rp, revenue: revenue || (rp != null ? rp * available : null), available, sold }
}

function sameLeadMetric(rows: SameLeadSnapshotRecord[]) {
  if (!rows.length) return { available: null, booked: null, priced: null, revenue: null, bookingRate: null, adr: null, rp: null }
  const available = Math.max(0, ...rows.map(row => Number(row.availableRooms) || 0))
  const booked = sum(rows.map(row => row.bookedRooms || 0))
  const priced = sum(rows.map(row => row.pricedRooms || 0))
  const revenue = sum(rows.map(row => row.bookingRevenue || 0))
  return {
    available,
    booked,
    priced,
    revenue,
    bookingRate: safe(booked, available),
    adr: safe(revenue, priced),
    rp: safe(revenue, available),
  }
}

const dateMinus364 = (targetDate: string) => {
  const [year, month, day] = targetDate.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(Date.UTC(year, month - 1, day) - 364 * 86400000).toISOString().slice(0, 10)
}

export function buildComparisonRows(hotels: Hotel[], lastYear: LastYearRecord[], targetDate: string) {
  const mappedRows = lastYear.filter(r => r.mappedDate === targetDate)
  const comparisonDate = mappedRows[0]?.date || dateMinus364(targetDate)
  const source = mappedRows.length
    ? mappedRows
    : lastYear.filter(r => !r.mappedDate && r.date === comparisonDate)
  const hotelByCode = new Map(hotels.map(h => [h.whCode, h]))
  const rows: ComparisonRow[] = Object.values(group(source, r => r.whCode)).map(records => {
    const first = records[0]
    const hotel = hotelByCode.get(first.whCode)
    const metric = lastYearMetric(records)
    return {
      whCode: first.whCode,
      name: hotel?.name || `未匹配同期门店 ${first.whCode}`,
      province: hotel?.province || '',
      area: hotel?.area || '',
      city: hotel?.city || '',
      district: hotel?.district || '',
      businessZone: hotel?.businessZone || '',
      revenueZone: hotel?.revenueZone || '',
      brand: hotel?.brand || '',
      positioning: hotel?.positioning || '',
      availableRooms: metric.available || 0,
      soldRooms: metric.sold || 0,
      revenue: metric.revenue || 0,
    }
  })
  return { rows, comparisonDate, usedManualMapping: mappedRows.length > 0, missing: rows.length === 0 }
}

const matchedRenovation = (records: RenovationRecord[] = []) => records[0]

export function missingBookingMetricRow(hotel: Hotel, targetDate: string, dayOffset: string, renovations: RenovationRecord[] = []): MetricRow {
  const renovation = matchedRenovation(renovations.filter(record => record.whCode === hotel.whCode))
  return {
    whCode: hotel.whCode,
    name: hotel.name,
    province: hotel.province,
    area: hotel.area,
    city: hotel.city,
    businessZone: hotel.businessZone,
    revenueZone: hotel.revenueZone || '',
    benchmarkZone: hotel.benchmarkZone || '',
    benchmarkGroup: hotel.benchmarkGroup || '',
    brand: hotel.brand,
    positioning: hotel.positioning,
    operationType: hotel.operationType || '',
    managementType: hotel.managementType || '',
    isNew: hotel.isNew,
    openDate: hotel.openDate || '',
    isRenovated: !!renovation,
    renovationType: renovation?.renovationType || '',
    rooms: hotel.rooms,
    availableRooms: 0,
    bookedRooms: 0,
    pricedRooms: 0,
    bookingRevenue: 0,
    bookingRate: null,
    adr: null,
    rp: null,
    lastOcc: null,
    lastAdr: null,
    lastRp: null,
    lastAvailable: null,
    lastSold: null,
    lastRevenue: null,
    recovery: null,
    rpGap: null,
    revenueGap: null,
    bookingRateGap: null,
    adrGap: null,
    snapshotChange: null,
    previousAvailableRooms: null,
    previousBookedRooms: null,
    previousPricedRooms: null,
    previousBookingRevenue: null,
    sameLeadAvailableRooms: null,
    sameLeadBookedRooms: null,
    sameLeadPricedRooms: null,
    sameLeadBookingRevenue: null,
    sameLeadBookingRate: null,
    sameLeadAdr: null,
    sameLeadRp: null,
    sameLeadBookingRateGap: null,
    sameLeadAdrGap: null,
    sameLeadRpGap: null,
    mainChannel: '--',
    risk: 'normal',
    tags: ['缺失预订数据', ...(hotel.rooms <= 0 ? ['物理房量缺失'] : [])],
    targetDate,
    dayOffset,
  }
}

export function buildMetricRows(
  hotels: Hotel[],
  batch: SnapshotBatch | undefined,
  previous: SnapshotBatch | undefined,
  lastYear: LastYearRecord[],
  renovations: RenovationRecord[] = [],
  sameLeadSnapshots: SameLeadSnapshotRecord[] = [],
): MetricRow[] {
  if (!batch) return []
  if (hotelCacheSource !== hotels) { hotelCacheSource = hotels; hotelCache = new Map(hotels.map(h => [h.whCode, h])) }
  const currentByKey = group(batch.rows, r => `${r.whCode}|${r.targetDate}`)
  const prevByKey = group(previous?.rows || [], r => `${r.whCode}|${r.targetDate}`)
  if (lastYearCacheSource !== lastYear) { lastYearCacheSource = lastYear; lastYearCache = group(lastYear, r => r.whCode) }
  const renovationsByHotel = group(renovations, record => record.whCode)
  const sameLeadByKey = group(sameLeadSnapshots, record => `${record.whCode}|${record.date}`)
  return Object.values(currentByKey).map(rows => {
    const first = rows[0]
    const hotel = hotelCache.get(first.whCode)
    const cur = hotelSnapshot(rows)
    const prevRows = prevByKey[`${first.whCode}|${first.targetDate}`]
    const prev = prevRows?.length ? hotelSnapshot(prevRows) : null
    const targetTime = new Date(`${first.targetDate}T00:00:00`).getTime()
    const lastDateString = new Date(targetTime - 364 * 86400000).toISOString().slice(0, 10)
    const mappedComparisonDate = lastYear.find(record => record.mappedDate === first.targetDate)?.date || lastDateString
    const lyRows = (lastYearCache[first.whCode] || []).filter(r => r.mappedDate === first.targetDate || (!r.mappedDate && r.date === lastDateString))
    const ly = lastYearMetric(lyRows)
    const sameLead = sameLeadMetric(sameLeadByKey[`${first.whCode}|${mappedComparisonDate}`] || [])
    const renovation = matchedRenovation(renovationsByHotel[first.whCode] || [])
    const recovery = cur.rp != null && ly.rp ? cur.rp / ly.rp : null
    const rpGap = cur.rp != null && ly.rp != null ? cur.rp - ly.rp : null
    const revenueGap = cur.rp != null && ly.revenue != null ? cur.rp * cur.availableRooms - ly.revenue : null
    const bookingRateGap = cur.bookingRate != null && ly.occ != null ? cur.bookingRate - ly.occ : null
    const adrGap = cur.adr != null && ly.adr != null ? cur.adr - ly.adr : null
    const snapshotChange = cur.rp != null && prev?.rp != null ? cur.rp - prev.rp : null
    const bookingRateChange = cur.bookingRate != null && prev?.bookingRate != null ? cur.bookingRate - prev.bookingRate : null
    const judged = evaluateRisk({
      recovery, bookingRateGap, adr: cur.adr, lastAdr: ly.adr, rpGap, revenueGap, snapshotChange,
      bookingRate: cur.bookingRate, bookingRateChange, bookedRooms: cur.bookedRooms, dayOffset: first.dayOffset,
    })
    return {
      whCode: first.whCode, name: hotel?.name || `未匹配门店 ${first.whCode}`,
      province: hotel?.province || '', area: hotel?.area || '', city: hotel?.city || '',
      businessZone: hotel?.businessZone || '', revenueZone: hotel?.revenueZone || '',
      benchmarkZone: hotel?.benchmarkZone || '', benchmarkGroup: hotel?.benchmarkGroup || '',
      brand: hotel?.brand || '', positioning: hotel?.positioning || '',
      operationType: hotel?.operationType || '', managementType: hotel?.managementType || '', isNew: hotel?.isNew || false,
      openDate: hotel?.openDate || '', isRenovated: !!renovation, renovationType: renovation?.renovationType || '',
      rooms: hotel?.rooms || cur.availableRooms,
      availableRooms: cur.availableRooms, bookedRooms: cur.bookedRooms, pricedRooms: cur.pricedRooms, bookingRevenue: cur.bookingRevenue,
      bookingRate: cur.bookingRate, adr: cur.adr, rp: cur.rp, lastOcc: ly.occ, lastAdr: ly.adr, lastRp: ly.rp,
      lastAvailable: ly.available, lastSold: ly.sold, lastRevenue: ly.revenue, recovery, rpGap, revenueGap, bookingRateGap, adrGap, snapshotChange,
      previousAvailableRooms: prev?.availableRooms ?? null, previousBookedRooms: prev?.bookedRooms ?? null,
      previousPricedRooms: prev?.pricedRooms ?? null, previousBookingRevenue: prev?.bookingRevenue ?? null,
      sameLeadAvailableRooms: sameLead.available, sameLeadBookedRooms: sameLead.booked,
      sameLeadPricedRooms: sameLead.priced, sameLeadBookingRevenue: sameLead.revenue,
      sameLeadBookingRate: sameLead.bookingRate, sameLeadAdr: sameLead.adr, sameLeadRp: sameLead.rp,
      sameLeadBookingRateGap: cur.bookingRate != null && sameLead.bookingRate != null ? cur.bookingRate - sameLead.bookingRate : null,
      sameLeadAdrGap: cur.adr != null && sameLead.adr != null ? cur.adr - sameLead.adr : null,
      sameLeadRpGap: cur.rp != null && sameLead.rp != null ? cur.rp - sameLead.rp : null,
      mainChannel: cur.mainChannel, risk: judged.risk,
      tags: [...judged.tags, ...(hotel && hotel.rooms <= 0 ? ['物理房量缺失'] : [])],
      targetDate: first.targetDate, dayOffset: first.dayOffset,
    }
  })
}

export function aggregate(rows: MetricRow[], comparisonRows?: ComparisonRow[]) {
  const availableRooms = sum(rows.map(r => r.availableRooms))
  const bookedRooms = sum(rows.map(r => r.bookedRooms))
  const pricedRooms = sum(rows.map(r => r.pricedRooms))
  const revenue = sum(rows.map(r => r.bookingRevenue))
  const bookingRate = safe(bookedRooms, availableRooms)
  const adr = safe(revenue, pricedRooms)
  const rp = safe(revenue, availableRooms)
  const hasComparison = comparisonRows ? comparisonRows.length > 0 : rows.some(r => r.lastAvailable != null || r.lastRevenue != null || r.lastSold != null)
  const lastRevenue = comparisonRows ? sum(comparisonRows.map(r => r.revenue)) : sum(rows.map(r => r.lastRevenue || 0))
  const lastAvailable = comparisonRows ? sum(comparisonRows.map(r => r.availableRooms)) : sum(rows.map(r => r.lastAvailable || 0))
  const lastSold = comparisonRows ? sum(comparisonRows.map(r => r.soldRooms)) : sum(rows.map(r => r.lastSold || 0))
  const lastOcc = hasComparison ? safe(lastSold, lastAvailable) : null
  const lastAdr = hasComparison ? safe(lastRevenue, lastSold) : null
  const lastRp = hasComparison ? safe(lastRevenue, lastAvailable) : null
  const recovery = rp != null && lastRp ? rp / lastRp : null
  const revenueGap = rp != null && hasComparison ? revenue - lastRevenue : null
  const snapshotChangeValues = rows.map(r => r.snapshotChange).filter((v): v is number => v != null)
  const previousAvailableRooms = sum(rows.map(r => r.previousAvailableRooms || 0))
  const previousBookedRooms = sum(rows.map(r => r.previousBookedRooms || 0))
  const previousPricedRooms = sum(rows.map(r => r.previousPricedRooms || 0))
  const previousBookingRevenue = sum(rows.map(r => r.previousBookingRevenue || 0))
  const previousBookingRate = previousAvailableRooms ? previousBookedRooms / previousAvailableRooms : null
  const previousAdr = previousPricedRooms ? previousBookingRevenue / previousPricedRooms : null
  const previousRp = previousAvailableRooms ? previousBookingRevenue / previousAvailableRooms : null
  const bookingRateChange = bookingRate != null && previousBookingRate != null ? bookingRate - previousBookingRate : null
  const adrChange = adr != null && previousAdr != null ? adr - previousAdr : null
  const rpChange = rp != null && previousRp != null ? rp - previousRp : null
  const sameLeadMatched = rows.some(row => row.sameLeadAvailableRooms != null || row.sameLeadBookedRooms != null || row.sameLeadBookingRevenue != null)
  const sameLeadAvailableRooms = sum(rows.map(row => row.sameLeadAvailableRooms || 0))
  const sameLeadBookedRooms = sum(rows.map(row => row.sameLeadBookedRooms || 0))
  const sameLeadPricedRooms = sum(rows.map(row => row.sameLeadPricedRooms || 0))
  const sameLeadBookingRevenue = sum(rows.map(row => row.sameLeadBookingRevenue || 0))
  const sameLeadBookingRate = sameLeadMatched ? safe(sameLeadBookedRooms, sameLeadAvailableRooms) : null
  const sameLeadAdr = sameLeadMatched ? safe(sameLeadBookingRevenue, sameLeadPricedRooms) : null
  const sameLeadRp = sameLeadMatched ? safe(sameLeadBookingRevenue, sameLeadAvailableRooms) : null
  return {
    availableRooms, bookedRooms, pricedRooms, bookingRevenue: revenue, bookingRate, adr, rp,
    lastAvailable, lastSold, lastRevenue, lastOcc, lastAdr, lastRp, recovery, revenueGap,
    snapshotChange: snapshotChangeValues.length ? sum(snapshotChangeValues) / snapshotChangeValues.length : null,
    previousAvailableRooms, previousBookedRooms, previousPricedRooms, previousBookingRevenue,
    previousBookingRate, previousAdr, previousRp, bookingRateChange, adrChange, rpChange,
    sameLeadAvailableRooms, sameLeadBookedRooms, sameLeadPricedRooms, sameLeadBookingRevenue,
    sameLeadBookingRate, sameLeadAdr, sameLeadRp,
    sameLeadBookingRateGap: bookingRate != null && sameLeadBookingRate != null ? bookingRate - sameLeadBookingRate : null,
    sameLeadAdrGap: adr != null && sameLeadAdr != null ? adr - sameLeadAdr : null,
    sameLeadRpGap: rp != null && sameLeadRp != null ? rp - sameLeadRp : null,
    warningCount: rows.filter(r => r.risk === 'high' || r.risk === 'watch').length,
    highCount: rows.filter(r => r.risk === 'high').length,
  }
}

export function aggregateBy(rows: MetricRow[], key: keyof MetricRow, comparisonRows?: ComparisonRow[]) {
  const comparisonGroups = comparisonRows ? group(comparisonRows, r => String(r[key as keyof ComparisonRow] || '未归属')) : {}
  return Object.entries(group(rows, r => String(r[key] || '未归属'))).map(([name, items]) => ({
    name,
    rows: items,
    ...aggregate(items, comparisonRows ? comparisonGroups[name] || [] : undefined),
  }))
}
