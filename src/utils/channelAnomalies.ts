import type { ChannelAnomalySettings, MetricRow, SnapshotRecord } from '../types/data'
import { buildStoreChannelMix, EMPTY_STORE_MIX, type StoreChannelMix } from './storeAnomalies'
import { channelGroup } from './channels'
import { isDirectStore } from './diagnostics'

export type ChannelLevel = 'channelLevel1' | 'channelLevel2' | 'channelLevel3'
export type ChannelRisk = 'high' | 'watch' | 'positive' | 'normal' | 'sample'

export const DEFAULT_CHANNEL_ANOMALY_SETTINGS: ChannelAnomalySettings = {
  otaHighShare: .7,
  singleChannelHighShare: .8,
  onlineDirectLowShare: .1,
  shareSpikePp: .05,
  shareDropPp: .05,
  adrDropAmount: 10,
  adrBelowOverallAmount: 20,
  adrBelowOverallRate: .1,
  lowPriceVolumeAdrDrop: 10,
  directOnlineLowShare: .1,
  lowSampleRooms: 10,
  lowSampleShare: .01,
}

export const channelNameAt = (row: SnapshotRecord, level: ChannelLevel) => row[level] || row.channel || '未分类'
const dedupAvailable = (rows: SnapshotRecord[]) => Object.values(rows.reduce<Record<string, number>>((result, row) => {
  const key = `${row.whCode}|${row.targetDate}`
  result[key] = Math.max(result[key] || 0, row.availableRooms || 0)
  return result
}, {})).reduce((sum, value) => sum + value, 0)

export type ChannelAnomalyMetric = {
  key: string
  level: ChannelLevel
  levelLabel: string
  name: string
  level1: string
  level2: string
  level3: string
  rooms: number
  share: number
  shareDelta: number | null
  adr: number | null
  adrDelta: number | null
  rpContribution: number
  rpContributionDelta: number | null
  affectedStores: number
  impactProvince: string
  impactArea: string
  tags: string[]
  risk: ChannelRisk
}

const hierarchyAt = (row: SnapshotRecord) => ({
  level1: channelNameAt(row, 'channelLevel1'),
  level2: channelNameAt(row, 'channelLevel2'),
  level3: channelNameAt(row, 'channelLevel3'),
})

export function aggregateChannelAnomalies(
  rows: SnapshotRecord[],
  previousRows: SnapshotRecord[],
  level: ChannelLevel,
  stores: MetricRow[],
  settings?: Partial<ChannelAnomalySettings>,
): ChannelAnomalyMetric[] {
  const config = { ...DEFAULT_CHANNEL_ANOMALY_SETTINGS, ...settings }
  const currentAvailable = dedupAvailable(rows)
  const previousAvailable = dedupAvailable(previousRows)
  const currentRooms = rows.reduce((sum, row) => sum + (row.bookedRooms || 0), 0)
  const previousRooms = previousRows.reduce((sum, row) => sum + (row.bookedRooms || 0), 0)
  const overallRevenue = rows.reduce((sum, row) => sum + (row.bookingRevenue || 0), 0)
  const overallPriced = rows.reduce((sum, row) => sum + (row.pricedRooms || 0), 0)
  const overallAdr = overallPriced ? overallRevenue / overallPriced : null
  const storeByCode = new Map(stores.map(store => [store.whCode, store]))
  const build = (source: SnapshotRecord[], totalRooms: number, available: number) => {
    const grouped = source.reduce<Record<string, { records: SnapshotRecord[]; rooms: number; revenue: number; priced: number }>>((result, row) => {
      const name = channelNameAt(row, level)
      const item = result[name] ||= { records: [], rooms: 0, revenue: 0, priced: 0 }
      item.records.push(row)
      item.rooms += row.bookedRooms || 0
      item.revenue += row.bookingRevenue || 0
      item.priced += row.pricedRooms || 0
      return result
    }, {})
    return new Map(Object.entries(grouped).map(([name, item]) => {
      const sample = item.records[0]
      const hierarchy = hierarchyAt(sample)
      return [name, {
        name, ...hierarchy, rooms: item.rooms,
        share: totalRooms ? item.rooms / totalRooms : 0,
        adr: item.priced ? item.revenue / item.priced : null,
        rpContribution: available ? item.revenue / available : 0,
        records: item.records,
      }]
    }))
  }
  const current = build(rows, currentRooms, currentAvailable)
  const previous = build(previousRows, previousRooms, previousAvailable)
  const hasPrevious = previousRows.length > 0
  return [...current.values()].map(item => {
    const prior = previous.get(item.name)
    const shareDelta = hasPrevious ? item.share - (prior?.share || 0) : null
    const adrDelta = hasPrevious && item.adr != null && prior?.adr != null ? item.adr - prior.adr : null
    const rpContributionDelta = hasPrevious ? item.rpContribution - (prior?.rpContribution || 0) : null
    const lowSample = item.rooms < config.lowSampleRooms || item.share < config.lowSampleShare
    const tags: string[] = []
    if (lowSample) tags.push('样本量低')
    if (!lowSample && shareDelta != null && adrDelta != null) {
      if (shareDelta > 0 && adrDelta > 0) tags.push('量价双升')
      else if (shareDelta > 0 && adrDelta < 0) tags.push('量升价降')
      else if (shareDelta < 0 && adrDelta > 0) tags.push('量降价升')
      else if (shareDelta < 0 && adrDelta < 0) tags.push('量价双降')
      if (shareDelta >= config.shareSpikePp) tags.push('占比突增')
      if (shareDelta <= -config.shareDropPp) tags.push('占比突降')
      if (item.adr != null && overallAdr != null && (
        overallAdr - item.adr >= config.adrBelowOverallAmount ||
        item.adr <= overallAdr * (1 - config.adrBelowOverallRate) ||
        adrDelta <= -config.adrDropAmount
      )) tags.push('ADR异常低')
      if (shareDelta > 0 && adrDelta <= -config.lowPriceVolumeAdrDrop && item.adr != null && overallAdr != null && item.adr < overallAdr) tags.push('低价拉量')
      if (rpContributionDelta != null && rpContributionDelta < 0) tags.push('渠道贡献下降')
    }
    const provinceRooms = new Map<string, number>()
    const areaRooms = new Map<string, number>()
    item.records.forEach(record => {
      const store = storeByCode.get(record.whCode)
      if (!store) return
      provinceRooms.set(store.province, (provinceRooms.get(store.province) || 0) + record.bookedRooms)
      areaRooms.set(store.area, (areaRooms.get(store.area) || 0) + record.bookedRooms)
    })
    const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '--'
    const risk: ChannelRisk = lowSample ? 'sample'
      : tags.includes('量价双降') || tags.includes('低价拉量') || tags.includes('占比突降') ? 'high'
        : tags.some(tag => ['ADR异常低','占比突增','渠道贡献下降','量升价降','量降价升'].includes(tag)) ? 'watch'
          : tags.includes('量价双升') ? 'positive' : 'normal'
    return {
      key: `${level}-${item.name}`, level, levelLabel: level === 'channelLevel1' ? '一级' : level === 'channelLevel2' ? '二级' : '三级',
      name: item.name, level1: item.level1, level2: item.level2, level3: item.level3,
      rooms: item.rooms, share: item.share, shareDelta, adr: item.adr, adrDelta,
      rpContribution: item.rpContribution, rpContributionDelta,
      affectedStores: new Set(item.records.map(record => record.whCode)).size,
      impactProvince: top(provinceRooms), impactArea: top(areaRooms), tags, risk,
    }
  }).sort((a, b) => b.rooms - a.rooms)
}

export type StoreChannelAnomaly = {
  row: MetricRow
  mix: StoreChannelMix
  tags: string[]
  risk: ChannelRisk
  maxChannel: string
  maxShare: number
  channelAdrIssue: string
}

export function analyzeStoreChannelAnomalies(
  stores: MetricRow[],
  rows: SnapshotRecord[],
  previousRows: SnapshotRecord[],
  settings?: Partial<ChannelAnomalySettings>,
): StoreChannelAnomaly[] {
  const config = { ...DEFAULT_CHANNEL_ANOMALY_SETTINGS, ...settings }
  const mixByStore = buildStoreChannelMix(rows)
  const previousMixByStore = buildStoreChannelMix(previousRows)
  const recordsByStore = rows.reduce<Record<string, SnapshotRecord[]>>((result, row) => {
    ;(result[row.whCode] ||= []).push(row)
    return result
  }, {})
  return stores.flatMap(row => {
    const mix = mixByStore[row.whCode] || EMPTY_STORE_MIX
    if (!mix.total) return []
    const previousMix = previousMixByStore[row.whCode] || EMPTY_STORE_MIX
    const tags: string[] = []
    if (mix.ota > config.otaHighShare) tags.push('OTA占比过高')
    if (mix.online < config.onlineDirectLowShare) tags.push('线上直销偏低')
    if (mix.mainShare > config.singleChannelHighShare) tags.push('单一渠道依赖')
    if (mix.offline > config.singleChannelHighShare) tags.push('线下直销异常')
    if (mix.offline >= .999) tags.push('线下直销100%')
    if (isDirectStore(row) && mix.online < config.directOnlineLowShare) tags.push('直营店直销偏低')
    if (isDirectStore(row) && mix.ota > config.otaHighShare) tags.push('直营店OTA偏高')
    const storeRecords = recordsByStore[row.whCode] || []
    const channelAdrIssues = Object.entries(storeRecords.reduce<Record<string, { revenue: number; priced: number }>>((result, record) => {
      const group = channelGroup(record)
      const item = result[group] ||= { revenue: 0, priced: 0 }
      item.revenue += record.bookingRevenue || 0
      item.priced += record.pricedRooms || 0
      return result
    }, {})).flatMap(([name, item]) => {
      const adr = item.priced ? item.revenue / item.priced : null
      return adr != null && row.adr != null && row.adr - adr >= config.adrBelowOverallAmount ? [`${name}低${Math.round(row.adr - adr)}元`] : []
    })
    if (channelAdrIssues.length) tags.push('渠道ADR偏低')
    if (previousMix.total) {
      if (mix.ota > previousMix.ota && (row.adr || 0) < ((row.previousPricedRooms ? (row.previousBookingRevenue || 0) / row.previousPricedRooms : null) || 0)) tags.push('渠道增量但ADR下降')
      const previousRate = row.previousAvailableRooms ? (row.previousBookedRooms || 0) / row.previousAvailableRooms : null
      if (mix.mainShare < previousMix.mainShare && previousRate != null && row.bookingRate != null && row.bookingRate < previousRate) tags.push('渠道占比与预订率同降')
    }
    if (!tags.length) return []
    const risk: ChannelRisk = tags.some(tag => ['单一渠道依赖','直营店OTA偏高','渠道增量但ADR下降'].includes(tag)) ? 'high' : 'watch'
    return [{ row, mix, tags, risk, maxChannel: mix.mainName, maxShare: mix.mainShare, channelAdrIssue: channelAdrIssues.join('、') || '--' }]
  })
}
