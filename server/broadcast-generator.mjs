const DAY = 86400000
const sum = rows => rows.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0)
const ratio = (a, b) => b ? a / b : null
const group = (rows, key) => rows.reduce((result, row) => {
  const name = key(row) || '未归属'
  ;(result[name] ||= []).push(row)
  return result
}, {})
const pct = value => value == null ? '--' : `${(value * 100).toFixed(2)}%`
const pp = value => value == null ? '--' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}pp`
const money = value => value == null ? '--' : `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1)}`
const signedMoney = value => value == null ? '--' : `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1)}`
const cnDate = value => {
  const [, month, day] = String(value || '').split('-')
  return month && day ? `${Number(month)}月${Number(day)}日` : '--'
}
const isOperating = status => ['在营', '在营业', '营业'].includes(String(status || '').trim())
const isSameLeadIncluded = status => ['在营业', '已解约', '整改中'].includes(String(status || '').trim())
const comparisonDate = targetDate => new Date(new Date(`${targetDate}T00:00:00Z`).getTime() - 364 * DAY).toISOString().slice(0, 10)
const scopeField = { province: 'province', area: 'area', city: 'city', revenueZone: 'revenueZone' }
const scopeLabels = { all: '华西区域整体', province: '省区', area: '片区', city: '城市', revenueZone: '收益管理商圈' }
const broadcastTimes = { '1': '10:20', '2': '14:20', '3': '21:20' }
const directKeywords = ['直营', '自营', '直管']
const monthAge = (openDate, targetDate) => {
  if (!openDate || !targetDate) return null
  const start = new Date(`${openDate}T00:00:00Z`)
  const end = new Date(`${targetDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null
  return Math.floor((end.getTime() - start.getTime()) / (365.2425 / 12 * DAY))
}
const specialZoneType = hotel => {
  const text = `${hotel.businessZone || ''} ${hotel.revenueZone || ''} ${hotel.benchmarkZone || ''} ${hotel.benchmarkGroup || ''}`
  if (text.includes('景区')) return '景区商圈'
  if (text.includes('热门')) return '同期热门商圈'
  if (text.includes('核心')) return '核心商圈'
  return ''
}

const hotelInScope = (hotel, scope) => scope.level === 'all' || String(hotel?.[scopeField[scope.level]] || '') === scope.value

function snapshotMetric(records = []) {
  const availableRooms = records.length ? Math.max(0, ...records.map(r => Number(r.availableRooms) || 0)) : 0
  const bookedRooms = sum(records.map(r => r.bookedRooms))
  const pricedRooms = sum(records.map(r => r.pricedRooms))
  const revenue = sum(records.map(r => r.bookingRevenue))
  return {
    availableRooms,
    bookedRooms,
    pricedRooms,
    revenue,
    bookingRate: ratio(bookedRooms, availableRooms),
    adr: ratio(revenue, pricedRooms),
    rp: ratio(revenue, availableRooms),
  }
}

function sameLeadSnapshotMetric(records = []) {
  const availableRooms = sum(records.map(r => r.availableRooms))
  const bookedRooms = sum(records.map(r => r.bookedRooms))
  const pricedRooms = sum(records.map(r => r.pricedRooms))
  const revenue = sum(records.map(r => r.bookingRevenue))
  return {
    availableRooms,
    bookedRooms,
    pricedRooms,
    revenue,
    bookingRate: ratio(bookedRooms, availableRooms),
    adr: ratio(revenue, pricedRooms),
    rp: ratio(revenue, availableRooms),
  }
}

function lastYearMetric(records = []) {
  if (!records.length) return { availableRooms: 0, soldRooms: 0, revenue: 0 }
  const availableRooms = Math.max(0, ...records.map(r => Number(r.availableRooms) || 0))
  const channelBreakdown = new Set(records.map(r => r.channel).filter(Boolean)).size > 1
  const soldRooms = channelBreakdown
    ? sum(records.map(r => r.channelNights)) || Math.max(0, ...records.map(r => Number(r.soldRooms) || 0))
    : Math.max(0, ...records.map(r => Number(r.soldRooms) || 0))
  const revenue = channelBreakdown
    ? sum(records.map(r => r.channelRevenue)) || Math.max(0, ...records.map(r => Number(r.revenue) || 0))
    : Math.max(0, ...records.map(r => Number(r.revenue) || 0))
  return { availableRooms, soldRooms, revenue }
}

function aggregate(currentRows, comparisonRows = [], sameLeadComparisonRows) {
  const availableRooms = sum(currentRows.map(r => r.availableRooms))
  const bookedRooms = sum(currentRows.map(r => r.bookedRooms))
  const pricedRooms = sum(currentRows.map(r => r.pricedRooms))
  const revenue = sum(currentRows.map(r => r.revenue))
  const lastAvailable = sum(comparisonRows.map(r => r.availableRooms))
  const lastSold = sum(comparisonRows.map(r => r.soldRooms))
  const lastRevenue = sum(comparisonRows.map(r => r.revenue))
  const bookingRate = ratio(bookedRooms, availableRooms)
  const adr = ratio(revenue, pricedRooms)
  const rp = ratio(revenue, availableRooms)
  const lastOcc = comparisonRows.length ? ratio(lastSold, lastAvailable) : null
  const lastAdr = comparisonRows.length ? ratio(lastRevenue, lastSold) : null
  const lastRp = comparisonRows.length ? ratio(lastRevenue, lastAvailable) : null
  const sameLeadRows = Array.isArray(sameLeadComparisonRows)
    ? sameLeadComparisonRows
    : currentRows.filter(row => row.sameLeadMatched)
  const sameLeadAvailableRooms = sum(sameLeadRows.map(row => Array.isArray(sameLeadComparisonRows) ? row.availableRooms : row.sameLeadAvailableRooms))
  const sameLeadBookedRooms = sum(sameLeadRows.map(row => Array.isArray(sameLeadComparisonRows) ? row.bookedRooms : row.sameLeadBookedRooms))
  const sameLeadPricedRooms = sum(sameLeadRows.map(row => Array.isArray(sameLeadComparisonRows) ? row.pricedRooms : row.sameLeadPricedRooms))
  const sameLeadRevenue = sum(sameLeadRows.map(row => Array.isArray(sameLeadComparisonRows) ? row.revenue : row.sameLeadRevenue))
  const sameLeadBookingRate = sameLeadRows.length ? ratio(sameLeadBookedRooms, sameLeadAvailableRooms) : null
  const sameLeadAdr = sameLeadRows.length ? ratio(sameLeadRevenue, sameLeadPricedRooms) : null
  const sameLeadRp = sameLeadRows.length ? ratio(sameLeadRevenue, sameLeadAvailableRooms) : null
  return {
    availableRooms, bookedRooms, pricedRooms, revenue, bookingRate, adr, rp,
    lastAvailable, lastSold, lastRevenue, lastOcc, lastAdr, lastRp,
    occGap: bookingRate != null && lastOcc != null ? bookingRate - lastOcc : null,
    adrGap: adr != null && lastAdr != null ? adr - lastAdr : null,
    rpGap: rp != null && lastRp != null ? rp - lastRp : null,
    recovery: rp != null && lastRp ? rp / lastRp : null,
    sameLeadBookingRate, sameLeadAdr, sameLeadRp,
    sameLeadBookingRateGap: bookingRate != null && sameLeadBookingRate != null ? bookingRate - sameLeadBookingRate : null,
    sameLeadAdrGap: adr != null && sameLeadAdr != null ? adr - sameLeadAdr : null,
    sameLeadRpGap: rp != null && sameLeadRp != null ? rp - sameLeadRp : null,
  }
}

function batchNumber(value) {
  const number = Number(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : Number.NEGATIVE_INFINITY
}

function previousRowsForTarget(data, selected, targetDate) {
  const index = data.batches.findIndex(batch => batch.id === selected.id)
  const primary = index > 0 ? data.batches[index - 1] : undefined
  const archiveRows = data.previousFinalSnapshot?.rows || []
  const primaryRows = (primary?.rows || []).filter(row => row.targetDate === targetDate)
  const primaryCodes = new Set(primaryRows.map(row => row.whCode))
  const fallbackRows = archiveRows.filter(row => row.targetDate === targetDate && !primaryCodes.has(row.whCode))
  return {
    rows: [...primaryRows, ...fallbackRows],
    label: primaryRows.length ? '较上一跑批' : fallbackRows.length ? '较上一版跑批' : '暂无上一版',
    batchTime: primaryRows.length ? primary?.batchTime : fallbackRows.length ? '上一版跑批' : '',
  }
}

const channelGroup = row => {
  if (row.channelLevel2 === 'OTA' || ['携程', '美团', '飞猪', 'OTA其他'].includes(row.channelLevel3 || '') || ['携程', '美团', '飞猪', 'OTA'].includes(row.channel)) return '各OTA'
  if (row.channelLevel1 === '线上直销' || ['官网', '会员', '直连分销'].includes(row.channel)) return '线上直销'
  if (row.channelLevel1 === '线下直销' || ['前台', '商旅'].includes(row.channel)) return '线下直销'
  return '其他'
}

function channelMetrics(rows, denominator, previousRows = []) {
  const build = (source, key) => {
    const total = sum(source.map(row => row.bookedRooms))
    return Object.entries(group(source, key)).map(([name, records]) => {
      const rooms = sum(records.map(r => r.bookedRooms))
      const priced = sum(records.map(r => r.pricedRooms))
      const revenue = sum(records.map(r => r.bookingRevenue))
      return { name, rooms, revenue, share: ratio(rooms, total) || 0, contribution: ratio(rooms, denominator) || 0, adr: ratio(revenue, priced), rpContribution: ratio(revenue, denominator) || 0 }
    })
  }
  const main = build(rows, channelGroup)
  const previousMain = build(previousRows, channelGroup)
  const ota = build(rows, row => row.channelLevel3 || row.channel).filter(item => ['携程', '美团', '飞猪'].includes(item.name))
  const previousOta = build(previousRows, row => row.channelLevel3 || row.channel)
  const attach = items => items.map(item => {
    const previous = (items === main ? previousMain : previousOta).find(value => value.name === item.name)
    return {
      ...item,
      shareChange: previous ? item.share - previous.share : null,
      contributionChange: previous ? item.contribution - previous.contribution : null,
      adrChange: previous && item.adr != null && previous.adr != null ? item.adr - previous.adr : null,
      rpContributionChange: previous ? item.rpContribution - previous.rpContribution : null,
    }
  })
  return { main: attach(main), ota: attach(ota) }
}

const list = (items, value, count, ascending = false) => [...items]
  .filter(item => value(item) != null && Number.isFinite(Number(value(item))))
  .sort((a, b) => (Number(value(a)) - Number(value(b))) * (ascending ? 1 : -1))
  .slice(0, count)

const names = (items, value, formatter, count, ascending = false) =>
  list(items, value, count, ascending).map(item => `${item.name}${formatter(value(item))}`).join('、') || '暂无'

function toWechat(text) {
  return text.split('\n').filter(Boolean).map(line => {
    const match = line.match(/^\d+\.\s*(.+)$/)
    return match ? `【${match[1]}】` : line.replace(/^[-•]\s*/, '• ')
  }).join('\n')
}

export const DEFAULT_BROADCAST_CONFIG = {
  showStoreDistribution: true,
  showDirectOperation: true,
  showCoreZone: true,
  showPriceAdvice: true,
  showNewOperation: true,
  showRenovationOperation: true,
  showChannelAnomaly: true,
  showStoreRisk: true,
  nameStores: true,
  showChannelDetail: true,
  showTopLists: true,
  topCount: 5,
  lowBookingRate: 0.1,
  directFields: ['operationType', 'managementType'],
  directKeywords: ['直营', '自营', '直管'],
  defaultLength: 'standard',
  copyAsWechat: false,
}

export function generateBroadcastPackage(data, request = {}) {
  const config = { ...DEFAULT_BROADCAST_CONFIG, ...(request.config || {}) }
  const scope = request.scope?.level ? request.scope : { level: 'all', value: '' }
  const selected = data.batches.find(batch => batch.id === request.batchId) || data.batches.at(-1)
  if (!selected) throw new Error('暂无可用于播报的预订率数据')
  const selectedDates = [...new Set(selected.rows.map(row => row.targetDate).filter(Boolean))].sort()
  const dayIndex = Math.max(0, Number(String(request.dayOffset || 'D0').replace(/\D/g, '')) || 0)
  const dayOffset = `D${dayIndex}`
  const targetDate = selectedDates[dayIndex] || ''
  if (!targetDate) throw new Error(`当前跑批中未找到 ${request.dayOffset || '目标日期'} 数据`)

  const hotelByCode = new Map(data.hotels.map(hotel => [hotel.whCode, hotel]))
  const activeHotels = data.hotels.filter(hotel => isOperating(hotel.status) && hotelInScope(hotel, scope))
  const activeHotelCodes = new Set(activeHotels.map(hotel => hotel.whCode))
  const currentSource = selected.rows.filter(row => row.targetDate === targetDate && activeHotelCodes.has(row.whCode))
  const currentGroups = group(currentSource, row => row.whCode)
  const previous = previousRowsForTarget(data, selected, targetDate)
  const previousSource = previous.rows.filter(row => {
    const hotel = hotelByCode.get(row.whCode)
    return hotel && isOperating(hotel.status) && hotelInScope(hotel, scope)
  })
  const previousGroups = group(previousSource, row => row.whCode)
  const mappedLastYear = data.lastYear.filter(row => row.mappedDate === targetDate)
  const lastDate = mappedLastYear[0]?.date || comparisonDate(targetDate)
  const sameLeadDate = comparisonDate(targetDate)
  const lastSource = (mappedLastYear.length ? mappedLastYear : data.lastYear.filter(row => !row.mappedDate && row.date === lastDate))
    .filter(row => {
      const hotel = hotelByCode.get(row.whCode)
      return hotel ? hotelInScope(hotel, scope) : scope.level === 'all'
    })
  const comparisonRows = Object.entries(group(lastSource, row => row.whCode)).map(([whCode, records]) => {
    const hotel = hotelByCode.get(whCode) || {}
    return { whCode, ...hotel, ...lastYearMetric(records) }
  })
  const comparisonByCode = new Map(comparisonRows.map(row => [row.whCode, row]))
  const sameLeadSource = (data.sameLeadSnapshots || []).filter(row => {
    if (row.date !== sameLeadDate) return false
    const hotel = hotelByCode.get(row.whCode)
    return !!hotel && isSameLeadIncluded(hotel.status) && hotelInScope(hotel, scope)
  })
  const sameLeadByCode = group(sameLeadSource, row => row.whCode)
  const sameLeadComparisonRows = Object.entries(sameLeadByCode).map(([whCode, records]) => {
    const hotel = hotelByCode.get(whCode)
    return { ...hotel, ...sameLeadSnapshotMetric(records) }
  })
  const countMissing = data.settings?.countMissingBookingAsZero !== false
  const renovationByCode = new Map((data.renovations || []).map(record => [record.whCode, record]))

  const storeRows = activeHotels.map(hotel => {
    const currentRecords = currentGroups[hotel.whCode] || []
    const previousRecords = previousGroups[hotel.whCode] || []
    const current = snapshotMetric(currentRecords)
    const prior = snapshotMetric(previousRecords)
    const last = comparisonByCode.get(hotel.whCode)
    const lastOcc = last ? ratio(last.soldRooms, last.availableRooms) : null
    const lastAdr = last ? ratio(last.revenue, last.soldRooms) : null
    const lastRp = last ? ratio(last.revenue, last.availableRooms) : null
    const sameLeadRecords = isSameLeadIncluded(hotel.status) ? sameLeadByCode[hotel.whCode] || [] : []
    const sameLead = sameLeadSnapshotMetric(sameLeadRecords)
    return {
      ...hotel,
      ...current,
      missing: !currentRecords.length,
      hasPrevious: previousRecords.length > 0,
      last,
      lastOcc,
      lastAdr,
      lastRp,
      sameLeadMatched: sameLeadRecords.length > 0,
      sameLeadAvailableRooms: sameLead.availableRooms,
      sameLeadBookedRooms: sameLead.bookedRooms,
      sameLeadPricedRooms: sameLead.pricedRooms,
      sameLeadRevenue: sameLead.revenue,
      sameLeadBookingRate: sameLeadRecords.length ? sameLead.bookingRate : null,
      sameLeadAdr: sameLeadRecords.length ? sameLead.adr : null,
      sameLeadRp: sameLeadRecords.length ? sameLead.rp : null,
      occGap: current.bookingRate != null && lastOcc != null ? current.bookingRate - lastOcc : null,
      adrGap: current.adr != null && lastAdr != null ? current.adr - lastAdr : null,
      rpGap: current.rp != null && lastRp != null ? current.rp - lastRp : null,
      recovery: current.rp != null && lastRp ? current.rp / lastRp : null,
      previousBookingRate: prior.bookingRate,
      bookingRateChange: current.bookingRate != null && prior.bookingRate != null ? current.bookingRate - prior.bookingRate : null,
      previousAdr: prior.adr,
      adrChange: current.adr != null && prior.adr != null ? current.adr - prior.adr : null,
      previousBookedRooms: prior.bookedRooms,
      bookedChange: previousRecords.length ? current.bookedRooms - prior.bookedRooms : null,
      isDirect: config.directFields.some(field => config.directKeywords.some(keyword => String(hotel[field] || '').includes(keyword))),
      openMonths: monthAge(hotel.openDate, targetDate),
      isRenovated: renovationByCode.has(hotel.whCode),
      renovationType: renovationByCode.get(hotel.whCode)?.renovationType || '',
      specialZoneType: specialZoneType(hotel),
      dayOffset,
      riskClass: 'normal',
      risk: 'normal',
    }
  })
  const previousStoreRows = activeHotels.map(hotel => ({ ...hotel, ...snapshotMetric(previousGroups[hotel.whCode] || []) }))
  const overall = aggregate(storeRows, comparisonRows, sameLeadComparisonRows)
  const previousOverall = aggregate(previousStoreRows)
  const overallChange = overall.bookingRate != null && previousOverall.bookingRate != null ? overall.bookingRate - previousOverall.bookingRate : null
  const missingStoreCount = storeRows.filter(row => row.missing).length

  const groupedMetrics = key => Object.entries(group(storeRows, row => row[key] || '未归属')).map(([name, rows]) => {
    const compare = comparisonRows.filter(row => String(row[key] || '未归属') === name)
    const sameLead = sameLeadComparisonRows.filter(row => String(row[key] || '未归属') === name)
    const prior = previousStoreRows.filter(row => String(row[key] || '未归属') === name)
    const metric = aggregate(rows, compare, sameLead)
    const priorMetric = aggregate(prior)
    return {
      name,
      rows,
      ...metric,
      bookingRateChange: metric.bookingRate != null && priorMetric.bookingRate != null ? metric.bookingRate - priorMetric.bookingRate : null,
      adrChange: metric.adr != null && priorMetric.adr != null ? metric.adr - priorMetric.adr : null,
      zeroCount: rows.filter(row => row.bookedRooms === 0 && !row.missing).length,
      fullCount: rows.filter(row => row.bookingRate != null && row.bookingRate >= 1).length,
      highCount: rows.filter(row => row.riskClass === 'high').length,
      mediumCount: rows.filter(row => row.riskClass === 'medium').length,
      attentionCount: rows.filter(row => row.riskClass === 'attention').length,
      abnormalCount: rows.filter(row => row.riskClass === 'high' || row.riskClass === 'medium').length,
    }
  })
  const baseZones = groupedMetrics('revenueZone')
  const zoneByName = new Map(baseZones.map(zone => [zone.name, zone]))
  const priceConfig = {
    highAdrAmount: data.settings?.priceAdvice?.highAdrAmount ?? 20,
    highAdrRate: data.settings?.priceAdvice?.highAdrRate ?? .1,
    lowAdrAmount: data.settings?.priceAdvice?.lowAdrAmount ?? 20,
    lowAdrRate: data.settings?.priceAdvice?.lowAdrRate ?? .1,
  }
  const basePriceAction = row => {
    const value = row.bookingRate
    if (value == null) return '样本不足'
    const thresholds = row.dayOffset === 'D0' ? [.7, .5, .3, .2]
      : row.dayOffset === 'D1' ? [.6, .45, .28, .18]
        : row.dayOffset === 'D2' ? [.5, .38, .25, .15]
          : row.dayOffset === 'D3' ? [.42, .32, .22, .12]
            : row.dayOffset === 'D4' ? [.35, .28, .18, .1]
              : row.dayOffset === 'D5' ? [.3, .24, .15, .08] : [.25, .2, .12, .06]
    return value >= thresholds[0] ? '强烈建议提价'
      : value >= thresholds[1] ? '建议提价'
        : value >= thresholds[2] ? '阶梯式提价'
          : value >= thresholds[3] ? '保持观察' : '渠道补量'
  }
  const priceAdvice = row => {
    const zone = row.revenueZone ? zoneByName.get(row.revenueZone) : null
    if (row.availableRooms <= 0 || row.bookingRate == null || !Number.isFinite(row.bookingRate)) return '样本不足'
    const action = basePriceAction(row)
    if (!zone || zone.bookingRate == null || zone.adr == null || row.adr == null) return action
    const highBookingFloor = row.dayOffset === 'D0' ? .5 : row.dayOffset === 'D1' ? .45 : row.dayOffset === 'D2' ? .38 : row.dayOffset === 'D3' ? .32 : row.dayOffset === 'D4' ? .28 : row.dayOffset === 'D5' ? .24 : .2
    const highBookingPriority = row.bookingRate != null && row.bookingRate >= highBookingFloor && row.availableRooms > 0 && row.bookedRooms > 0 && row.pricedRooms > 0 && row.adr != null && row.adr > 0
    const zoneRateGap = row.bookingRate - zone.bookingRate
    const zoneAdrGap = row.adr - zone.adr
    const highPrice = zoneAdrGap >= priceConfig.highAdrAmount || row.adr >= zone.adr * (1 + priceConfig.highAdrRate)
    const lowPrice = zoneAdrGap <= -priceConfig.lowAdrAmount || row.adr <= zone.adr * (1 - priceConfig.lowAdrRate)
    const weakSpeed = row.bookingRateChange != null && row.bookingRateChange <= 0 && (row.bookedChange == null || row.bookedChange <= 0)
    if (!highBookingPriority && highPrice && zoneRateGap <= -.05 && weakSpeed) return '价格偏高风险'
    if (!highBookingPriority && (row.bookingRateChange || 0) > 0 && (row.adrChange || 0) < -10 && lowPrice) return '高量低价风险'
    return action
  }
  storeRows.forEach(row => {
    const zone = row.revenueZone ? zoneByName.get(row.revenueZone) : null
    row.zoneBookingRate = zone?.bookingRate ?? null
    row.zoneAdr = zone?.adr ?? null
    row.zoneBookingRateChange = zone?.bookingRateChange ?? null
    row.zoneGap = row.bookingRate != null && row.zoneBookingRate != null ? row.bookingRate - row.zoneBookingRate : null
    row.quantityPrice = row.bookingRateChange == null || row.adrChange == null ? '无可比'
      : row.bookingRateChange > 0 && row.adrChange > 0 ? '量价双升'
        : row.bookingRateChange > 0 && row.adrChange < 0 ? '量升价降'
          : row.bookingRateChange < 0 && row.adrChange > 0 ? '量降价升'
            : row.bookingRateChange < 0 && row.adrChange < 0 ? '量价双降' : '基本持平'
    row.priceAdvice = priceAdvice(row)
  })

  const currentHotelCodes = new Set(activeHotels.map(hotel => hotel.whCode))
  const channelRows = selected.rows.filter(row => row.targetDate === targetDate && currentHotelCodes.has(row.whCode))
  const previousChannelRows = previous.rows.filter(row => row.targetDate === targetDate && currentHotelCodes.has(row.whCode))
  const channels = channelMetrics(channelRows, overall.availableRooms, previousChannelRows)
  const mainChannel = name => channels.main.find(item => item.name === name)
  const storeChannelMix = source => Object.entries(group(source, row => row.whCode)).map(([whCode, records]) => {
    const total = sum(records.map(row => row.bookedRooms))
    const values = Object.entries(group(records, channelGroup))
      .map(([name, items]) => ({ name, rooms: sum(items.map(row => row.bookedRooms)) }))
      .sort((a, b) => b.rooms - a.rooms)
    const share = name => ratio(values.find(item => item.name === name)?.rooms || 0, total) || 0
    return { whCode, total, ota: share('各OTA'), online: share('线上直销'), offline: share('线下直销'), main: values[0]?.name || '无预订', mainShare: ratio(values[0]?.rooms || 0, total) || 0 }
  })
  const storeMixByCode = new Map(storeChannelMix(channelRows).map(item => [item.whCode, item]))
  const anomalyConfig = {
    otaHighShare: data.settings?.channelAnomaly?.otaHighShare ?? .7,
    singleChannelHighShare: data.settings?.channelAnomaly?.singleChannelHighShare ?? .8,
    onlineDirectLowShare: data.settings?.channelAnomaly?.onlineDirectLowShare ?? .1,
    shareSpikePp: data.settings?.channelAnomaly?.shareSpikePp ?? .05,
    shareDropPp: data.settings?.channelAnomaly?.shareDropPp ?? .05,
    adrDropAmount: data.settings?.channelAnomaly?.adrDropAmount ?? 10,
    adrBelowOverallAmount: data.settings?.channelAnomaly?.adrBelowOverallAmount ?? 20,
    lowSampleRooms: data.settings?.channelAnomaly?.lowSampleRooms ?? 10,
    lowSampleShare: data.settings?.channelAnomaly?.lowSampleShare ?? .01,
  }
  const channelAnomalies = channels.main.map(item => {
    const lowSample = item.rooms < anomalyConfig.lowSampleRooms || item.share < anomalyConfig.lowSampleShare
    const tags = []
    if (lowSample) tags.push('样本量低')
    if (!lowSample) {
      if ((item.shareChange || 0) > 0 && (item.adrChange || 0) < 0) tags.push('量升价降')
      if ((item.shareChange || 0) < 0 && (item.adrChange || 0) < 0) tags.push('量价双降')
      if ((item.shareChange || 0) >= anomalyConfig.shareSpikePp) tags.push('占比突增')
      if ((item.shareChange || 0) <= -anomalyConfig.shareDropPp) tags.push('占比突降')
      if (item.adr != null && overall.adr != null && (overall.adr - item.adr >= anomalyConfig.adrBelowOverallAmount || (item.adrChange || 0) <= -anomalyConfig.adrDropAmount)) tags.push('ADR异常低')
      if ((item.rpContributionChange || 0) < 0) tags.push('渠道贡献下降')
    }
    return { ...item, tags }
  })
  const storeChannelRisks = storeRows.flatMap(row => {
    const mix = storeMixByCode.get(row.whCode)
    if (!mix?.total) return []
    const tags = []
    if (mix.ota > anomalyConfig.otaHighShare) tags.push('OTA占比偏高')
    if (mix.online < anomalyConfig.onlineDirectLowShare) tags.push('线上直销偏低')
    if (mix.mainShare > anomalyConfig.singleChannelHighShare) tags.push('单一渠道依赖')
    if (mix.offline >= .999) tags.push('线下直销100%')
    return tags.length ? [{ row, mix, tags }] : []
  })

  storeRows.forEach(row => {
    const mix = storeMixByCode.get(row.whCode) || { total: 0, ota: 0, online: 0, offline: 0, mainShare: 0 }
    const near = row.dayOffset === 'D0' || row.dayOffset === 'D1'
    const nearOrD2 = near || row.dayOffset === 'D2'
    const lowThreshold = row.dayOffset === 'D0' ? .2 : .15
    const nearLow = row.bookingRate != null && row.bookingRate < lowThreshold
    const weakSpeed = row.hasPrevious && (row.bookingRateChange || 0) <= 0 && (row.bookedChange || 0) <= 0
    const zoneWarming = (row.zoneBookingRateChange || 0) > 0
    const zoneNotWeak = row.zoneBookingRate != null && row.zoneBookingRate >= (near ? .2 : .15)
    const newWithoutComparison = row.openMonths != null && row.openMonths <= 18 && !row.last
    const highBookingFloor = row.dayOffset === 'D0' ? .5 : row.dayOffset === 'D1' ? .45 : row.dayOffset === 'D2' ? .38 : row.dayOffset === 'D3' ? .32 : row.dayOffset === 'D4' ? .28 : row.dayOffset === 'D5' ? .24 : .2
    const highBookingPriority = row.bookingRate != null && row.bookingRate >= highBookingFloor && row.availableRooms > 0 && row.bookedRooms > 0 && row.pricedRooms > 0 && row.adr != null && row.adr > 0
    const zeroNear = near && !row.missing && row.bookedRooms === 0 && !newWithoutComparison
    const lowZoneWeak = near && nearLow && row.zoneGap != null && row.zoneGap < 0 && weakSpeed
    const laggingHotZone = nearOrD2 && row.zoneGap != null && row.zoneGap <= -.1 && (zoneNotWeak || zoneWarming)
    const priceSuppressing = nearOrD2 && row.zoneAdr != null && row.adr != null && row.adr - row.zoneAdr >= 20 && row.zoneGap != null && row.zoneGap <= -.05
    const priceUpVolumeDown = nearOrD2 && (row.adrChange || 0) > 5 && (row.bookingRateChange || 0) < 0 && ((row.zoneGap || 0) < 0 || weakSpeed)
    const doubleDeclineNear = nearOrD2 && nearLow && row.quantityPrice === '量价双降'
    const directChannelRisk = nearLow && row.isDirect && mix.total > 0 && mix.ota >= .7 && mix.online < .1
    const offlineOnlyRisk = near && nearLow && mix.total > 0 && mix.offline >= .999
    const high = !highBookingPriority && !row.missing && (zeroNear || lowZoneWeak || laggingHotZone || priceSuppressing || priceUpVolumeDown || doubleDeclineNear || directChannelRisk || offlineOnlyRisk)
    const medium = !high && !highBookingPriority && !row.missing && (
      (nearOrD2 && nearLow) ||
      (nearOrD2 && (row.bookingRateChange || 0) < 0 && (row.zoneGap || 0) < 0) ||
      (row.dayOffset === 'D2' && row.bookedRooms === 0) ||
      (row.quantityPrice === '量价双降' && nearOrD2)
    )
    const attention = !high && !medium && !row.missing && (
      (row.bookingRate != null && row.bookingRate < .1) ||
      (row.zoneGap != null && row.zoneGap < 0) ||
      (!highBookingPriority && ['价格偏高风险', '高量低价风险'].includes(row.priceAdvice)) ||
      storeChannelRisks.some(item => item.row.whCode === row.whCode) ||
      !!row.specialZoneType
    )
    const methodology = !high && !medium && !attention && (
      row.missing || !row.last || !row.revenueZone || !row.openDate || !row.province || !row.area || !row.city
    )
    row.riskClass = high ? 'high' : medium ? 'medium' : attention ? 'attention' : methodology ? 'methodology' : 'normal'
    row.risk = high ? 'high' : medium ? 'watch' : row.bookingRate != null && row.bookingRate >= .8 ? 'leading' : 'normal'
  })

  const provinces = groupedMetrics('province')
  const areas = groupedMetrics('area').filter(item => item.name !== '未归属')
  const zones = groupedMetrics('revenueZone').filter(item => item.name !== '未归属')
  const zeroStores = storeRows.filter(row => !row.missing && row.bookedRooms === 0)
  const highBookingStores = storeRows.filter(row => row.bookingRate != null && row.bookingRate > .8)
  const riskBuckets = {
    high: storeRows.filter(row => row.riskClass === 'high').length,
    medium: storeRows.filter(row => row.riskClass === 'medium').length,
    attention: storeRows.filter(row => row.riskClass === 'attention').length,
    methodology: storeRows.filter(row => row.riskClass === 'methodology').length,
  }
  const belowOverallStores = storeRows.filter(row => row.bookingRate != null && overall.bookingRate != null && row.bookingRate < overall.bookingRate)
  const belowZoneStores = storeRows.filter(row => row.zoneGap != null && row.zoneGap < 0)
  const offlineOnlyStores = storeRows.filter(row => {
    const mix = storeMixByCode.get(row.whCode)
    return !!mix?.total && mix.offline >= .999
  })
  const highPriceStores = storeRows.filter(row => row.priceAdvice === '价格偏高风险')
  const lowPriceVolumeStores = storeRows.filter(row => row.priceAdvice === '高量低价风险')
  const strongPriceStores = storeRows.filter(row => row.priceAdvice === '强烈建议提价')
  const stairPriceStores = storeRows.filter(row => ['阶梯式提价', '建议小幅提价', '建议提价'].includes(row.priceAdvice))
  const controlCheckStores = storeRows.filter(row => row.bookingRate != null && row.bookingRate >= .8)
  const priceOpportunityStores = storeRows.filter(row => ['强烈建议提价', '建议提价', '建议小幅提价', '阶梯式提价', '提前提价机会'].includes(row.priceAdvice))

  const typeMetric = rows => {
    const codes = new Set(rows.map(row => row.whCode))
    return aggregate(rows, comparisonRows.filter(row => codes.has(row.whCode)))
  }
  const directRows = storeRows.filter(row => row.isDirect)
  const newRows = storeRows.filter(row => row.openMonths != null && row.openMonths <= 18)
  const renovatedRows = storeRows.filter(row => row.isRenovated)
  const typeCounts = rows => ({
    zero: rows.filter(row => !row.missing && row.bookedRooms === 0).length,
    belowZone: rows.filter(row => row.zoneGap != null && row.zoneGap < 0).length,
    high: rows.filter(row => row.riskClass === 'high').length,
    priceOpportunity: rows.filter(row => ['强烈建议提价', '建议提价', '建议小幅提价', '阶梯式提价', '提前提价机会'].includes(row.priceAdvice)).length,
    highPrice: rows.filter(row => row.priceAdvice === '价格偏高风险').length,
  })
  const directMetric = typeMetric(directRows)
  const newMetric = typeMetric(newRows)
  const renovatedMetric = typeMetric(renovatedRows)
  const directCounts = typeCounts(directRows)
  const newCounts = typeCounts(newRows)
  const renovatedCounts = typeCounts(renovatedRows)
  const lightRenovationCount = renovatedRows.filter(row => row.renovationType === '轻改').length
  const mediumRenovationCount = renovatedRows.filter(row => row.renovationType === '中改').length
  const renovationLow = renovatedRows.filter(row => row.bookedRooms === 0 || (row.zoneGap != null && row.zoneGap < 0)).length

  const runNo = Math.max(1, batchNumber(selected.batchTime))
  const scheduleTime = broadcastTimes[String(runNo)] || ''
  const phase = runNo === 1 ? '早盘' : runNo === 2 ? '午盘' : runNo === 3 ? '晚间' : '当前'
  const scopeLabel = scope.level === 'all' ? '华西区域' : scope.value
  const ringText = value => value == null ? '环比暂无可比数据' : `环比${value >= 0 ? '提升' : '下降'}${(Math.abs(value) * 100).toFixed(2)}pp`
  const itemText = (items, formatter, fallback = '暂无可比数据') => items.length ? items.map(formatter).join('、') : fallback
  const topPositive = (items, field, count = 3) => [...items].filter(item => item[field] != null && item[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, count)
  const topNegative = (items, field, count = 3) => [...items].filter(item => item[field] != null && item[field] < 0).sort((a, b) => a[field] - b[field]).slice(0, count)
  const bestProvince = list(provinces, item => item.bookingRate, 1)[0]
  const lowProvinces = list(provinces.filter(item => item.name !== bestProvince?.name), item => item.bookingRate, 2, true)

  const overallJudgments = [
    overallChange != null && overallChange >= 0
      ? '今日预订环比修复，高预订门店需关注真实预订和库存兑现，低预订门店仍需关注渠道展示、价格竞争力和流量承接。'
      : overallChange != null
        ? '今日预订环比回落，需重点关注低预订片区、下滑商圈和渠道承接异常门店。'
        : '今日暂无可比跑批，优先结合当前预订水平排查低预订、渠道展示和库存状态。',
    zeroStores.length >= Math.max(5, Math.ceil(storeRows.length * .1)) ? '0预定门店需优先排查渠道展示、库存状态、价格竞争力和是否异常关房。' : '',
    highBookingStores.length >= Math.max(5, Math.ceil(storeRows.length * .05)) ? '高预订门店需核实真实预订和控房情况，优先做好库存兑现和满房质量。' : '',
  ].filter(Boolean).join('')
  const sameLeadParts = [
    overall.sameLeadBookingRateGap == null ? '' : `预订率${overall.sameLeadBookingRateGap >= 0 ? '提升' : '下降'}${(Math.abs(overall.sameLeadBookingRateGap) * 100).toFixed(2)}pp`,
    overall.sameLeadAdrGap == null ? '' : `ADR${overall.sameLeadAdrGap >= 0 ? '高' : '低'}${money(Math.abs(overall.sameLeadAdrGap))}元`,
    overall.sameLeadRpGap == null ? '' : `理论RP${overall.sameLeadRpGap >= 0 ? '高' : '低'}${money(Math.abs(overall.sameLeadRpGap))}`,
  ].filter(Boolean)
  const sameLeadText = runNo === 1 && sameLeadParts.length ? `，较同期开盘${sameLeadParts.join('、')}` : ''
  const overallText = `${scheduleTime ? `${scheduleTime}预警，` : ''}本次重点播报今日入住日${cnDate(targetDate)}${phase}表现，同时覆盖未来7天预警。\n${scopeLabel}今日预订率${pct(overall.bookingRate)}，${ringText(overallChange)}${sameLeadText}；在手ADR${money(overall.adr)}元，理论RP${money(overall.rp)}。\n当前预订率为0门店${zeroStores.length}家，预订率大于80%门店${highBookingStores.length}家。\n${overallJudgments}`

  const provinceText = `省区表现方面，${bestProvince ? `${bestProvince.name}预订率最高，达到${pct(bestProvince.bookingRate)}` : '暂无可比省区'}；低位省区为${itemText(lowProvinces, item => `${item.name}${pct(item.bookingRate)}`)}。\n高预订省区重点关注高预订门店价格兑现和满房质量；低预订省区重点关注低预订、渠道展示和商圈承接不足门店。`

  const areaRpSmall = list(areas, item => item.rpGap, 3)
  const areaRpLarge = list(areas, item => item.rpGap, 3, true)
  const areaAbnormal = [...areas].sort((a, b) => b.abnormalCount - a.abnormalCount).slice(0, 3)
  const areaZero = [...areas].sort((a, b) => b.zeroCount - a.zeroCount).slice(0, 3)
  const areaAdrFall = topNegative(areas, 'adrChange')
  const areaRateRise = topPositive(areas, 'bookingRateChange')
  const areaRateFall = topNegative(areas, 'bookingRateChange')
  const areaText = `片区表现按今日RP缺口看，RP缺口较小的三个片区为：${itemText(areaRpSmall, item => `${item.name}（RP缺口${signedMoney(item.rpGap)}）`)}；RP缺口较大的三个片区为：${itemText(areaRpLarge, item => `${item.name}（RP缺口${signedMoney(item.rpGap)}）`)}。\n异常门店数最多的片区为：${itemText(areaAbnormal, item => `${item.name}（异常门店${item.abnormalCount}家）`)}。\n0预定门店最多的片区为：${itemText(areaZero, item => `${item.name}（0预定${item.zeroCount}家）`)}。\nADR环比下滑最多的三个片区为：${itemText(areaAdrFall, item => `${item.name}（ADR环比${signedMoney(item.adrChange)}元）`, '暂无明显下滑')}。\n预订率环比提升最多的三个片区为：${itemText(areaRateRise, item => `${item.name}（环比${pp(item.bookingRateChange)}）`, '暂无明显提升')}；预订率环比下滑最多的三个片区为：${itemText(areaRateFall, item => `${item.name}（环比${pp(item.bookingRateChange)}）`, '暂无明显下滑')}。\n片区跟进上，预订承接偏弱片区需优先排查低预订和渠道承接；ADR环比下滑片区需关注量升价降、高量低价、活动价放大或房型价差失衡；预订率环比提升片区可关注房型结构优化和阶梯式提价机会。`

  const zoneChanges = [...zones].filter(item => item.bookingRateChange != null).sort((a, b) => Math.abs(b.bookingRateChange) - Math.abs(a.bookingRateChange)).slice(0, 3)
  const zoneFalls = topNegative(zones, 'bookingRateChange')
  const zoneAbnormal = [...zones].sort((a, b) => b.abnormalCount - a.abnormalCount).slice(0, 3)
  const specialZoneRows = storeRows.filter(row => row.specialZoneType)
  const coreLowRows = specialZoneRows.filter(row => row.specialZoneType === '核心商圈' && (row.bookedRooms === 0 || (row.zoneGap != null && row.zoneGap < 0)))
  const scenicLowPriceRows = specialZoneRows.filter(row => row.specialZoneType === '景区商圈' && row.priceAdvice === '高量低价风险')
  const corePriceRows = specialZoneRows.filter(row => row.specialZoneType === '核心商圈' && priceOpportunityStores.some(item => item.whCode === row.whCode))
  const specialSummary = [
    coreLowRows.length ? `核心商圈低预订${coreLowRows.length}家，优先排查渠道展示和价格竞争力` : '',
    scenicLowPriceRows.length ? `景区高量低价关注${scenicLowPriceRows.length}家，需检查渠道价格与房型价差` : '',
    corePriceRows.length ? `核心商圈提价机会${corePriceRows.length}家，结合库存和竞对价库及时调整` : '',
  ].filter(Boolean).join('；')
  const zoneText = `核心商圈方面，表现变化最大的收益管理商圈为：${itemText(zoneChanges, item => `${item.name}（预订率环比${pp(item.bookingRateChange)}）`)}。\n环比下降明显的收益管理商圈前三为：${itemText(zoneFalls, item => `${item.name}（预订率环比${pp(item.bookingRateChange)}）`, '暂无明显下滑')}。\n异常门店集中的收益管理商圈前三为：${itemText(zoneAbnormal, item => `${item.name}（异常门店${item.abnormalCount}家）`)}。\n${specialSummary || '当前核心商圈暂无明显异常。'}`

  const storeRiskJudgment = [
    zeroStores.length ? '0预定门店需排查库存、渠道展示和价格竞争力。' : '',
    belowZoneStores.length ? '低于商圈均值门店需判断是市场整体偏弱还是门店自身承接不足。' : '',
    highBookingStores.length ? '预订率大于80%门店需核实真实预订和控房情况，保障满房质量。' : '',
    offlineOnlyStores.length ? '线下直销100%门店需排查渠道是否未打开、OTA/官网是否无展示或库存未同步。' : '',
  ].filter(Boolean).join('')
  const storeRiskText = `门店层面，低于区域均值预订率的门店${belowOverallStores.length}家，低于商圈均值预订率的门店${belowZoneStores.length}家。\n当前0预定门店${zeroStores.length}家，预订率大于80%门店${highBookingStores.length}家。\n${offlineOnlyStores.length ? `渠道仍为线下直销100%的门店${offlineOnlyStores.length}家。\n` : ''}按当前经营口径，高风险门店${riskBuckets.high}家、中风险门店${riskBuckets.medium}家。\n${storeRiskJudgment || '当前门店层面暂无明显异常。'}`

  const priceActionByRun = runNo === 1
    ? '早盘阶段以发现问题和启动补量为主。高预订门店可提前核实库存和竞对价库，具备空间的门店可小幅上探；低预订门店优先修复渠道展示和价格竞争力，不宜盲目提价。'
    : runNo === 2
      ? '午盘阶段是价格动作分化的关键时点。高预订且ADR仍有空间的门店，可结合竞对价库和剩余库存做阶梯式提价；预订率低且进速慢的门店，优先通过渠道补量和价格展示修复转化。'
      : '因已进入晚间跑批，直接大幅提价不一定现实。高预订门店应优先核实真实预订和控房情况，以满房和库存兑现为主；可通过优化房型结构、关闭低价房型、调整房型价差来达成提价目的。对于明日及后续高需求日期，可提前做价格上探和房型结构调整。'
  const priceText = `价格动作建议方面，强烈建议提价门店${strongPriceStores.length}家，阶梯式提价门店${stairPriceStores.length}家，检查控房门店${controlCheckStores.length}家。\n价格偏高风险门店${highPriceStores.length}家，高量低价关注门店${lowPriceVolumeStores.length}家。\n${priceActionByRun}`

  const anomalyTypes = channelAnomalies.flatMap(item => item.tags.filter(tag => tag !== '样本量低'))
  const storeChannelTags = storeChannelRisks.flatMap(item => item.tags)
  const anomalyCounts = [...anomalyTypes, ...storeChannelTags].reduce((result, tag) => {
    result[tag] = (result[tag] || 0) + 1
    return result
  }, {})
  const mainAnomalyTypes = Object.entries(anomalyCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag)
  const channelSupplement = [
    anomalyCounts['OTA占比偏高'] ? 'OTA占比偏高需关注渠道价格与渠道依赖。' : '',
    anomalyCounts['线上直销偏低'] ? '线上直销偏低需关注官网、小程序、会员和直销承接。' : '',
    anomalyCounts['线下直销100%'] ? '线下直销100%门店需排查渠道展示和库存同步。' : '',
    anomalyCounts['量升价降'] ? '量升价降渠道需关注收益质量。' : '',
    anomalyCounts['量价双降'] ? '量价双降渠道需关注渠道承接和价格竞争力双弱。' : '',
  ].filter(Boolean).join('')
  const channelText = `渠道结构方面，OTA / 线上直销 / 线下直销占比分别为${pct(mainChannel('各OTA')?.share)} / ${pct(mainChannel('线上直销')?.share)} / ${pct(mainChannel('线下直销')?.share)}。\n当前渠道异常主要集中在${mainAnomalyTypes.join('、') || '暂无明显渠道异常'}，涉及门店${storeChannelRisks.length}家。\n${channelSupplement || '当前主渠道量价表现基本稳定，继续观察后续环比变化。'}`

  const directFocus = directCounts.zero ? `0预定${directCounts.zero}家，并关注价格兑现、线上直销承接和OTA依赖` : directCounts.high ? `高风险${directCounts.high}家，并关注价格兑现和满房质量` : '价格兑现、线上直销承接、OTA依赖和满房质量'
  const newFocus = newCounts.belowZone ? `低于商圈${newCounts.belowZone}家，重点提升商圈承接能力和渠道曝光` : '商圈承接能力、低预订和渠道曝光'
  const renovationFocus = renovatedCounts.highPrice ? `价格偏高风险${renovatedCounts.highPrice}家，并关注价格上探节奏` : '改造后承接不足、价格上探机会和高量低价'
  const operationLines = [
    directRows.length ? `直营店${directRows.length}家，今日预订率${pct(directMetric.bookingRate)}，0预定${directCounts.zero}家，重点关注${directFocus}。` : '直营店暂无明显异常。',
    newRows.length ? `新开店${newRows.length}家，今日预订率${pct(newMetric.bookingRate)}，低于商圈${newCounts.belowZone}家，重点关注${newFocus}。` : '新开店暂无明显异常。',
    renovatedRows.length ? `改造店${renovatedRows.length}家，其中轻改${lightRenovationCount}家、中改${mediumRenovationCount}家，低预订${renovationLow}家、提价机会${renovatedCounts.priceOpportunity}家，重点关注${renovationFocus}。` : '改造店暂无明显异常。',
  ]
  const operationText = operationLines.join('\n')

  const areaPriority = [...areas].sort((a, b) =>
    (b.highCount * 4 + b.mediumCount * 2 + b.zeroCount + Math.max(0, -(b.bookingRateChange || 0) * 100)) -
    (a.highCount * 4 + a.mediumCount * 2 + a.zeroCount + Math.max(0, -(a.bookingRateChange || 0) * 100)))
  const zonePriority = [...zones].sort((a, b) =>
    (b.highCount * 4 + b.mediumCount * 2 + b.zeroCount + Math.max(0, -(b.bookingRateChange || 0) * 100)) -
    (a.highCount * 4 + a.mediumCount * 2 + a.zeroCount + Math.max(0, -(a.bookingRateChange || 0) * 100)))
  const focusAreas = areaPriority.slice(0, 3)
  const focusZones = zonePriority.slice(0, 3)
  const runAction = runNo === 1
    ? '第1次跑批重点看低预订、0预定、渠道展示和库存状态，优先完成早盘排查和补量动作。'
    : runNo === 2
      ? '第2次跑批重点看环比修复、片区商圈变化和价格动作分化，区分提价、观察和补量门店。'
      : '第3次跑批重点不是简单继续拉高价格，而是围绕满房兑现、房型结构优化、低价房型控制和明日前置调价开展跟进。'
  const focusText = `今日重点关注：\n\n重点片区：\n${focusAreas.map((item, index) => `${index + 1}. ${item.name}：高风险${item.highCount}家、0预定${item.zeroCount}家，预订率${pct(item.bookingRate)}、环比${pp(item.bookingRateChange)}`).join('\n') || '暂无可比片区'}\n\n重点商圈：\n${focusZones.map((item, index) => `${index + 1}. ${item.name}：异常门店${item.abnormalCount}家、0预定${item.zeroCount}家，预订率${pct(item.bookingRate)}、环比${pp(item.bookingRateChange)}`).join('\n') || '暂无可比商圈'}\n\n今日动作方向：\n${runAction}`

  const broadcastTitle = `【华西暑期预警｜${cnDate(targetDate)}｜第${runNo}次跑批】`
  const standardSections = [
    ['整体情况', overallText],
    ['省区表现', provinceText],
    ['片区关注', areaText],
    ['核心商圈关注', zoneText],
    ['门店风险', storeRiskText],
    ['提价建议', priceText],
    ['渠道变化', channelText],
    ['直营店 / 新开店 / 改造店专项', operationText],
    ['今日重点关注', focusText],
  ]
  const render = sections => `${broadcastTitle}\n${sections.map(([title, text], index) => `${index + 1}. ${title}\n${text}`).join('\n')}`
  const standard = render(standardSections)
  const brief = render([
    ['整体情况', `${scopeLabel}今日预订率${pct(overall.bookingRate)}，${ringText(overallChange)}；在手ADR${money(overall.adr)}元、理论RP${money(overall.rp)}，0预定${zeroStores.length}家、高风险${riskBuckets.high}家。`],
    ['省区表现', `${bestProvince ? `${bestProvince.name}${pct(bestProvince.bookingRate)}居前` : '暂无高位省区'}；低位为${itemText(lowProvinces, item => `${item.name}${pct(item.bookingRate)}`)}。`],
    ['片区关注', `${itemText(areaPriority.slice(0, 3), item => `${item.name}（高风险${item.highCount}家、0预定${item.zeroCount}家）`)}。`],
    ['核心商圈关注', `${itemText(zonePriority.slice(0, 3), item => `${item.name}（异常${item.abnormalCount}家、环比${pp(item.bookingRateChange)}）`)}。`],
    ['门店风险', `低于区域均值${belowOverallStores.length}家、低于商圈${belowZoneStores.length}家、0预定${zeroStores.length}家、预订率大于80%门店${highBookingStores.length}家。`],
    ['提价建议', `强烈建议提价${strongPriceStores.length}家、阶梯式提价${stairPriceStores.length}家、检查控房${controlCheckStores.length}家；价格偏高${highPriceStores.length}家、高量低价关注${lowPriceVolumeStores.length}家。`],
    ['渠道变化', `OTA / 线上直销 / 线下直销占比${pct(mainChannel('各OTA')?.share)} / ${pct(mainChannel('线上直销')?.share)} / ${pct(mainChannel('线下直销')?.share)}，渠道异常影响${storeChannelRisks.length}家门店。`],
    ['直营店 / 新开店 / 改造店专项', `直营${directRows.length}家、0预定${directCounts.zero}家；新开${newRows.length}家、低于商圈${newCounts.belowZone}家；改造${renovatedRows.length}家、低预订${renovationLow}家。`],
    ['今日重点关注', `重点片区：${focusAreas.map(item => item.name).join('、') || '暂无'}；重点商圈：${focusZones.map(item => item.name).join('、') || '暂无'}。${runAction}`],
  ])
  const detailed = standard

  return {
    brief,
    standard,
    detailed,
    wechat: { brief: toWechat(brief), standard: toWechat(standard), detailed: toWechat(detailed) },
    meta: {
      targetDate,
      comparisonDate: lastDate,
      sameLeadComparisonDate: sameLeadDate,
      batchId: selected.id,
      batchTime: selected.batchTime,
      previousLabel: previous.label,
      scopeLabel,
      currentStoreCount: activeHotels.length,
      comparisonStoreCount: comparisonRows.length,
      missingStoreCount,
      highRiskCount: riskBuckets.high,
      mediumRiskCount: riskBuckets.medium,
      generatedAt: new Date().toISOString(),
    },
  }
}
