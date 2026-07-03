import { useEffect, useState } from 'react'
import { utils, writeFile } from 'xlsx'
import { AlertTriangle, CalendarDays, CircleHelp, Clock3, Database, FileClock, Hotel, Layers3, RefreshCw } from 'lucide-react'
import type { ComparisonRow, Filters, Hotel as HotelRecord, MetricRow, SnapshotBatch, StoredData } from './types/data'
import { EMPTY_DATA } from './utils/storage'
import { fetchData, fetchFullData, saveServerData, type SaveProgress } from './utils/api'
import { aggregate, buildComparisonRows, buildMetricRows, missingBookingMetricRow } from './utils/metrics'
import LightSidebar, { type DashboardView } from './components/LightSidebar'
import ChinaWestMap from './components/ChinaWestMap'
import ChannelPanel from './components/ChannelPanel'
import ProvinceOverview from './components/ProvinceOverview'
import UploadCenter from './components/UploadCenter'
import StoreWarningTable from './components/StoreWarningTable'
import StoreDetailDrawer from './components/StoreDetailDrawer'
import KpiGroupCards from './components/KpiGroupCards'
import RankingChart from './components/RankingChart'
import StoreChannelComposition from './components/StoreChannelComposition'
import StoreSpecialtyPanel from './components/StoreSpecialtyPanel'
import ProvinceCityMatrix from './components/ProvinceCityMatrix'
import AreaRevenueZoneMatrix from './components/AreaRevenueZoneMatrix'
import { mergePreviousByTargetDate, previousFinalAsBatch } from './utils/snapshotVersions'
import ChannelDrilldownView from './components/ChannelDrilldownView'
import AdminDashboard from './components/AdminDashboard'
import {
  DistributionBoxPlot,
  RevenueZoneRelativeScatter,
  RiskHeatmap,
  type DiagnosticDay,
} from './components/DiagnosticCharts'
import { matchesRenovationFilter, matchesStoreType, type RenovationFilter, type StoreTypeFilter } from './utils/storeTypes'

const ALL = '全部'
const MISSING_OPENING_DATE = '开业日期缺失'
const openingAgeOption = (openDate: string, targetDate: string) => {
  if (!openDate || !targetDate) return MISSING_OPENING_DATE
  const start = new Date(`${openDate}T00:00:00Z`)
  const end = new Date(`${targetDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return MISSING_OPENING_DATE
  return `${Math.floor((end.getTime() - start.getTime()) / (365.2425 * 86400000))}年`
}
const defaults = (batchId = ''): Filters => ({ batchId, dayOffset: 'D0', province: ALL, area: ALL, city: ALL, district: ALL, businessZone: ALL, revenueZone: ALL, store: ALL, brand: ALL, positioning: ALL, operationType: ALL, managementType: ALL, directOperation: ALL, lifecycle: ALL, roomGroup: ALL, channel: ALL, channelLevel1: ALL, channelLevel2: ALL, channelLevel3: ALL, renovated: ALL, status: ALL })
export default function App() {
  const isAdminPath = location.pathname.startsWith('/admin')
  const [data, setData] = useState<StoredData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState<Filters>(defaults())
  const [view, setView] = useState<DashboardView>('overview')
  const [selectedStore, setSelectedStore] = useState<MetricRow | null>(null)
  const [focusedStoreCode, setFocusedStoreCode] = useState('')
  const [storeTypeFilter, setStoreTypeFilter] = useState<StoreTypeFilter>('全部门店')
  const [renovationFilter, setRenovationFilter] = useState<RenovationFilter>('全部')
  const [openingAgeFilter, setOpeningAgeFilter] = useState<string[]>([])
  const [showMethodology, setShowMethodology] = useState(false)
  const [fullChannelLoading, setFullChannelLoading] = useState(false)
  const reload = async () => {
    try { const d = await fetchData(); setData(d); setFilters(f => ({ ...f, batchId: d.batches.at(-1)?.id || '' })); setLoadError('') }
    catch (e) { setLoadError(e instanceof Error ? e.message : '数据服务不可用') } finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])
  useEffect(() => {
    if (view !== 'channel' || !data.publicOptimized || fullChannelLoading) return
    setFullChannelLoading(true)
    fetchFullData().then(full => setData(full)).catch(error => setLoadError(error instanceof Error ? error.message : '完整渠道数据读取失败')).finally(() => setFullChannelLoading(false))
  }, [view, data.publicOptimized, fullChannelLoading])
  const updateData = async (next: StoredData, onProgress?: (progress: SaveProgress) => void) => {
    const saved = await saveServerData(next, onProgress)
    setData(saved)
    setFilters(f => ({ ...f, batchId: saved.batches.at(-1)?.id || '' }))
  }

  if (isAdminPath) {
    return <div className="admin-shell"><header className="admin-top"><div><b>华西区域暑期预警 · 管理后台</b><span>{data.version?.source || '统一数据源'} · 后台已开放直接访问</span></div><nav><a href="/dashboard">打开只读看板</a></nav></header><AdminDashboard data={data} onData={updateData}/></div>
  }
  if (loading) return <div className="page-loading"><RefreshCw/>正在读取最新经营数据…</div>
  if (loadError) return <div className="page-loading error"><AlertTriangle/><b>{loadError}</b><span>请确认统一数据服务已启动。</span><button onClick={reload}>重新连接</button></div>

  const selected = data.batches.find(b => b.id === filters.batchId) || data.batches.at(-1)
  const selectedWindowDates = [...new Set((selected?.rows || []).map(row => row.targetDate).filter(Boolean))].sort()
  const selectedDayTabs = selectedWindowDates.slice(0, 7).map((targetDate, dayIndex) => ({ dayOffset: `D${dayIndex}`, targetDate }))
  const versionDates = [...new Set(data.batches.flatMap(batch => batch.rows.map(row => row.targetDate)).filter(Boolean))].sort()
  const versionInfo = data.version
  const versionUpdatedAt = versionInfo?.updatedAt || selected?.uploadTime || ''
  const coverageStart = versionInfo?.coverageStart || versionDates[0] || ''
  const coverageEnd = versionInfo?.coverageEnd || versionDates.at(-1) || ''
  const index = selected ? data.batches.findIndex(b => b.id === selected.id) : -1
  const currentVersionPrevious = index > 0 ? data.batches[index - 1] : undefined
  const archivedPrevious = previousFinalAsBatch(data.previousFinalSnapshot)
  const previous = mergePreviousByTargetDate(currentVersionPrevious, archivedPrevious)
  const filterBatch = (b?: SnapshotBatch) => {
    if (!b || filters.channel === ALL) return b
    const matches = (r: SnapshotBatch['rows'][number]) => filters.channel === '各OTA' ? r.channelLevel2 === 'OTA' : r.channel === filters.channel || r.channelLevel1 === filters.channel || r.channelLevel2 === filters.channel || r.channelLevel3 === filters.channel
    const selectedRows = b.rows.filter(matches)
    const selectedKeys = new Set(selectedRows.map(r => `${r.whCode}|${r.targetDate}`))
    const base = new Map<string, SnapshotBatch['rows'][number]>()
    b.rows.forEach(r => { const k = `${r.whCode}|${r.targetDate}`; if (!base.has(k)) base.set(k, r) })
    const zeros = [...base.entries()].filter(([k]) => !selectedKeys.has(k)).map(([, r]) => ({ ...r, bookedRooms: 0, pricedRooms: 0, bookingRevenue: 0, channelNights: 0, channelRevenue: 0, channel: filters.channel }))
    return { ...b, rows: [...selectedRows, ...zeros] }
  }
  const hotelByCode = new Map(data.hotels.map(h => [h.whCode, h]))
  const isOperating = (status: string) => ['在营', '在营业'].includes(String(status || '').trim())
  const hotelMatches = (h: HotelRecord, requireOperating: boolean) =>
    (!requireOperating || isOperating(h.status)) &&
    (filters.province === ALL || h.province === filters.province) &&
    (filters.area === ALL || h.area === filters.area) &&
    (filters.city === ALL || h.city === filters.city) &&
    (filters.district === ALL || h.district === filters.district) &&
    (filters.businessZone === ALL || h.businessZone === filters.businessZone) &&
    (filters.revenueZone === ALL || h.revenueZone === filters.revenueZone) &&
    (filters.store === ALL || h.name === filters.store) &&
    (filters.brand === ALL || h.brand === filters.brand) &&
    (filters.positioning === ALL || h.positioning === filters.positioning) &&
    (filters.operationType === ALL || h.operationType === filters.operationType) &&
    (filters.managementType === ALL || h.managementType === filters.managementType) &&
    (filters.directOperation === ALL || (filters.directOperation === '直营店') === ['直营','自营','直管'].some(keyword => `${h.operationType || ''}${h.managementType || ''}`.includes(keyword)))
  const metricRows = buildMetricRows(data.hotels, filterBatch(selected), filterBatch(previous), data.lastYear, data.renovations || [], data.sameLeadSnapshots || [])
  const scopeRows = (source: MetricRow[]) => source.filter(r => {
    const h = hotelByCode.get(r.whCode)
    return !!h && hotelMatches(h, true)
  })
  const scoped = scopeRows(metricRows)
  const targetDate = selectedDayTabs.find(item => item.dayOffset === filters.dayOffset)?.targetDate || selectedWindowDates[0] || ''
  const activeScopedHotels = data.hotels.filter(h => hotelMatches(h, true))
  const currentRowsForTarget = scoped.filter(r => r.targetDate === targetDate)
  const currentCodes = new Set(currentRowsForTarget.map(r => r.whCode))
  const missingCurrentHotels = activeScopedHotels.filter(h => !currentCodes.has(h.whCode))
  const countMissingAsZero = data.settings?.countMissingBookingAsZero !== false
  const unfilteredRows = [...currentRowsForTarget, ...missingCurrentHotels.map(h => missingBookingMetricRow(h, targetDate, filters.dayOffset, data.renovations || []))]
  const rows = openingAgeFilter.length
    ? unfilteredRows.filter(row => openingAgeFilter.includes(openingAgeOption(row.openDate, targetDate)))
    : unfilteredRows
  const comparison = buildComparisonRows(data.hotels, data.lastYear, targetDate)
  const scopeComparisonRows = (source: ComparisonRow[]) => source.filter(r => {
    const h = hotelByCode.get(r.whCode)
    if (h) return hotelMatches(h, false)
    return filters.province === ALL && filters.area === ALL && filters.city === ALL && filters.district === ALL &&
      filters.businessZone === ALL && filters.revenueZone === ALL && filters.store === ALL && filters.brand === ALL && filters.positioning === ALL &&
      filters.operationType === ALL && filters.managementType === ALL && filters.directOperation === ALL
  })
  const comparisonRows = scopeComparisonRows(comparison.rows)
  const diagnosticDays: DiagnosticDay[] = selectedDayTabs.flatMap(({ dayOffset, targetDate: dayTarget }) => {
    const dayHotels = openingAgeFilter.length ? activeScopedHotels.filter(hotel => openingAgeFilter.includes(openingAgeOption(hotel.openDate || '', dayTarget))) : activeScopedHotels
    const dayHotelCodes = new Set(dayHotels.map(hotel => hotel.whCode))
    const dayRows = scoped.filter(row => row.targetDate === dayTarget && dayHotelCodes.has(row.whCode))
    const dayCodes = new Set(dayRows.map(row => row.whCode))
    const completeRows = [...dayRows, ...dayHotels.filter(hotel => !dayCodes.has(hotel.whCode)).map(hotel => missingBookingMetricRow(hotel, dayTarget, dayOffset, data.renovations || []))]
    const dayComparison = scopeComparisonRows(buildComparisonRows(data.hotels, data.lastYear, dayTarget).rows).filter(row => !openingAgeFilter.length || dayHotelCodes.has(row.whCode))
    return [{ dayOffset, targetDate: dayTarget, rows: completeRows, comparisonRows: dayComparison }]
  })
  const m = aggregate(rows, comparisonRows)
  const rawPrevRows = scopeRows(buildMetricRows(data.hotels, filterBatch(previous), undefined, data.lastYear, data.renovations || [])).filter(r => r.targetDate === targetDate)
  const previousCodes = new Set(rawPrevRows.map(r => r.whCode))
  const missingPreviousHotels = activeScopedHotels.filter(h => !previousCodes.has(h.whCode))
  const prevRows = [...rawPrevRows, ...missingPreviousHotels.map(h => missingBookingMetricRow(h, targetDate, filters.dayOffset, data.renovations || []))]
  const pm = aggregate(prevRows)
  const currentPriorHasTarget = !!currentVersionPrevious?.rows.some(r => r.targetDate === targetDate)
  const archiveHasTarget = !!archivedPrevious?.rows.some(r => r.targetDate === targetDate)
  const comparisonLabel = rawPrevRows.length ? (currentPriorHasTarget ? '较上一跑批' : archiveHasTarget ? '较上一版末次' : '暂无上一版') : '暂无上一版'
  const comparisonTooltip = rawPrevRows.length && currentPriorHasTarget
    ? `当前目标入住日期${targetDate}，当前跑批${selected?.batchTime || '--'}，对比当前版本跑批${currentVersionPrevious?.batchTime || '--'}`
    : rawPrevRows.length && archiveHasTarget
      ? `当前目标入住日期${targetDate}，对比上一版同目标入住日期的末次跑批（上一版基准日${data.previousFinalSnapshot?.baseDate || '--'}）`
      : `目标入住日期${targetDate || '--'}暂无上一版数据`
  const channels = [...new Set(['各OTA','线上直销','线下直销', ...data.batches.flatMap(b => b.rows.flatMap(r => [r.channelLevel1, r.channelLevel2, r.channelLevel3, r.channel]).filter(Boolean) as string[])])]
  const currentHotelIds = new Set(scoped.map(r => r.whCode))
  const channelRows = (selected?.rows || []).filter(r => r.targetDate === targetDate && currentHotelIds.has(r.whCode))
  const previousChannelRows = (previous?.rows || []).filter(r => r.targetDate === targetDate && currentHotelIds.has(r.whCode))
  const focusedStore = rows.find(r => r.whCode === focusedStoreCode) || (filters.store !== ALL ? rows[0] : null)
  const storeChannelRows = focusedStore ? (selected?.rows || []).filter(r => r.targetDate === targetDate && r.whCode === focusedStore.whCode) : []
  const previousStoreChannelRows = focusedStore ? (previous?.rows || []).filter(r => r.targetDate === targetDate && r.whCode === focusedStore.whCode) : []
  const fullCount = rows.filter(r => r.bookingRate != null && r.bookingRate >= 1).length
  const zeroCount = rows.filter(r => r.bookedRooms === 0 && (countMissingAsZero || !r.tags.includes('缺失预订数据'))).length
  const prevFullCount = prevRows.filter(r => r.bookingRate != null && r.bookingRate >= 1).length
  const prevZeroCount = prevRows.filter(r => r.bookedRooms === 0 && (countMissingAsZero || !r.tags.includes('缺失预订数据'))).length
  const setChannel = (channel: string) => setFilters(f => ({ ...f, channel }))
  const drillProvince = (province: string, dayOffset = filters.dayOffset) => {
    setFilters(current => ({ ...current, dayOffset, province, area: ALL, city: ALL, district: ALL, businessZone: ALL, revenueZone: ALL, store: ALL }))
    setView('province')
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
  const drillArea = (area: string, province: string, dayOffset = filters.dayOffset) => {
    setFilters(current => ({ ...current, dayOffset, province, area, city: ALL, district: ALL, businessZone: ALL, revenueZone: ALL, store: ALL }))
    setView('area')
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
  const drillZone = (revenueZone: string, dayOffset = filters.dayOffset) => {
    setFilters(current => ({ ...current, dayOffset, revenueZone, store: ALL }))
    setView('store')
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
  const drillOutlierStore = (store: MetricRow) => drillArea(store.area, store.province, store.dayOffset)
  const openingAgeOptions = [...new Set(unfilteredRows.map(row => openingAgeOption(row.openDate, targetDate)))]
    .sort((a, b) => a === MISSING_OPENING_DATE ? -1 : b === MISSING_OPENING_DATE ? 1 : Number(a.replace('年', '')) - Number(b.replace('年', '')))
  const openingAgeFilteredStoreRows = rows
  const typeFilteredStoreRows = openingAgeFilteredStoreRows.filter(row => matchesStoreType(row, storeTypeFilter) && matchesRenovationFilter(row, renovationFilter))
  const typeFilteredCodes = new Set(typeFilteredStoreRows.map(row => row.whCode))
  const typeFilteredChannelRows = channelRows.filter(row => typeFilteredCodes.has(row.whCode))
  const typeFilteredPreviousChannelRows = previousChannelRows.filter(row => typeFilteredCodes.has(row.whCode))
  const typedFocusedStore = focusedStore && typeFilteredCodes.has(focusedStore.whCode) ? focusedStore : null
  const storeScopedView = view === 'store'
  const kpiRows = storeScopedView ? typeFilteredStoreRows : rows
  const kpiComparisonRows = storeScopedView ? comparisonRows.filter(row => typeFilteredCodes.has(row.whCode)) : comparisonRows
  const kpiPreviousRows = storeScopedView ? prevRows.filter(row => typeFilteredCodes.has(row.whCode)) : prevRows
  const kpiCurrent = storeScopedView ? aggregate(kpiRows, kpiComparisonRows) : m
  const kpiPrevious = storeScopedView ? aggregate(kpiPreviousRows) : pm
  const kpiFullCount = storeScopedView ? kpiRows.filter(row => row.bookingRate != null && row.bookingRate >= 1).length : fullCount
  const kpiZeroCount = storeScopedView ? kpiRows.filter(row => row.bookedRooms === 0 && (countMissingAsZero || !row.tags.includes('缺失预订数据'))).length : zeroCount
  const kpiPrevFullCount = storeScopedView ? kpiPreviousRows.filter(row => row.bookingRate != null && row.bookingRate >= 1).length : prevFullCount
  const kpiPrevZeroCount = storeScopedView ? kpiPreviousRows.filter(row => row.bookedRooms === 0 && (countMissingAsZero || !row.tags.includes('缺失预订数据'))).length : prevZeroCount
  const kpiHasPrevious = storeScopedView ? rawPrevRows.some(row => typeFilteredCodes.has(row.whCode)) : rawPrevRows.length > 0
  const exportView = () => {
    const exportRows = view === 'store' ? typeFilteredStoreRows : rows
    const wb = utils.book_new(); utils.book_append_sheet(wb, utils.json_to_sheet(exportRows), '当前视图'); writeFile(wb, `华西预警_${filters.dayOffset}_${selected?.batchTime || ''}.xlsx`)
  }
  const channel = <ChannelPanel rows={channelRows} previousRows={previousChannelRows} comparisonLabel={comparisonLabel} onChannel={setChannel}/>
  const map = <ChinaWestMap rows={rows} comparisonRows={comparisonRows} countMissingAsZero={countMissingAsZero} selected={filters.province} onSelect={province => setFilters(f => ({ ...f, province, area: ALL, city: ALL, district: ALL, businessZone: ALL, revenueZone: ALL, store: ALL }))} onCity={city => setFilters(f => ({ ...f, city, district: ALL, businessZone: ALL, revenueZone: ALL, store: ALL }))} onRevenueZone={revenueZone => drillZone(revenueZone)} day={filters.dayOffset} batch={selected?.batchTime || '--'} comparisonLabel={comparisonLabel}/>
  const areaBreadcrumb = filters.area !== ALL && <div className="diagnostic-breadcrumb"><button onClick={() => { setFilters(current => ({ ...current, province: ALL, area: ALL, city: ALL, district: ALL, revenueZone: ALL, store: ALL })); setView('overview') }}>华西大区</button><span>›</span><button onClick={() => { setFilters(current => ({ ...current, area: ALL, city: ALL, district: ALL, revenueZone: ALL, store: ALL })); setView('province') }}>{filters.province}</button><span>›</span><b>{filters.area}</b>{filters.revenueZone !== ALL && <><span>›</span><strong>{filters.revenueZone}</strong></>}</div>
  const viewContent = view === 'overview' ? <><div className="light-middle">{map}{channel}</div><RiskHeatmap days={diagnosticDays} level="province" title="省区 D0-D6 变化监控热力图" batch={selected?.batchTime || '--'} comparisonLabel={comparisonLabel} onSelect={(province, dayOffset) => drillProvince(province, dayOffset)}/><DistributionBoxPlot rows={rows} channelRows={channelRows} groupKey="province" title="省区门店分布箱形图" targetDate={targetDate} batch={selected?.batchTime || '--'} onGroup={province => drillProvince(province)} onStore={store => drillProvince(store.province)}/><ProvinceOverview rows={rows} comparisonRows={comparisonRows} channelRows={channelRows} countMissingAsZero={countMissingAsZero} onSelect={province => drillProvince(province)}/></>
    : view === 'province' ? <div className="view-stack"><div className="province-diagnostic-grid">{map}<DistributionBoxPlot rows={rows} channelRows={channelRows} groupKey="area" title="片区门店分布箱形图" targetDate={targetDate} batch={selected?.batchTime || '--'} onGroup={area => drillArea(area, rows.find(row => row.area === area)?.province || filters.province)} onStore={drillOutlierStore}/></div><RiskHeatmap days={diagnosticDays} level="area" title="片区 D0-D6 变化监控热力图" batch={selected?.batchTime || '--'} comparisonLabel={comparisonLabel} onSelect={(area, dayOffset) => drillArea(area, rows.find(row => row.area === area)?.province || filters.province, dayOffset)}/><RankingChart rows={rows} level="city" title="城市预订率树状图" variant="treemap" onSelect={city => setFilters(f => ({ ...f, city }))}/><ProvinceCityMatrix rows={rows} comparisonRows={comparisonRows} channelRows={channelRows} onCity={city => setFilters(f => ({ ...f, city, district: ALL, revenueZone: ALL, store: ALL }))}/></div>
    : view === 'area' ? <div className="view-stack">{areaBreadcrumb}<RiskHeatmap days={diagnosticDays} level="revenueZone" title="商圈 D0-D6 变化监控热力图" batch={selected?.batchTime || '--'} comparisonLabel={comparisonLabel} onSelect={(zone, dayOffset) => drillZone(zone, dayOffset)}/><AreaRevenueZoneMatrix rows={rows} comparisonRows={comparisonRows} channelRows={channelRows} onRevenueZone={revenueZone => drillZone(revenueZone)}/></div>
    : view === 'store' ? <div className="view-stack">{areaBreadcrumb}<StoreSpecialtyPanel rows={openingAgeFilteredStoreRows} comparisonRows={comparisonRows} channelRows={channelRows} value={storeTypeFilter} renovationFilter={renovationFilter} openingAgeOptions={openingAgeOptions} openingAgeFilter={openingAgeFilter} priceSettings={data.settings?.priceAdvice} onChange={next => { setStoreTypeFilter(next); setRenovationFilter('全部') }} onRenovationChange={next => { setRenovationFilter(next); setStoreTypeFilter('全部门店') }} onOpeningAgeChange={setOpeningAgeFilter}/>{filters.revenueZone !== ALL && <RevenueZoneRelativeScatter rows={typeFilteredStoreRows} zoneName={filters.revenueZone} onStore={setSelectedStore}/>}<StoreChannelComposition stores={typeFilteredStoreRows} store={typedFocusedStore} rows={typedFocusedStore ? typeFilteredChannelRows.filter(row => row.whCode === typedFocusedStore.whCode) : []} previousRows={typedFocusedStore ? typeFilteredPreviousChannelRows.filter(row => row.whCode === typedFocusedStore.whCode) : []} comparisonLabel={comparisonLabel} onDetail={setSelectedStore}/><StoreWarningTable rows={typeFilteredStoreRows} benchmarkRows={rows} comparisonRows={comparisonRows} channelRows={typeFilteredChannelRows} comparisonLabel={comparisonLabel} priceSettings={data.settings?.priceAdvice} storeTypeFilter={storeTypeFilter} renovationFilter={renovationFilter} onStore={store => { setFocusedStoreCode(store.whCode); setSelectedStore(store) }}/></div>
    : <div className="view-stack">{fullChannelLoading && <div className="view-data-loading"><RefreshCw/>正在按需读取完整渠道层级数据…</div>}<StoreSpecialtyPanel rows={openingAgeFilteredStoreRows} comparisonRows={comparisonRows} channelRows={channelRows} value={storeTypeFilter} renovationFilter={renovationFilter} openingAgeOptions={openingAgeOptions} openingAgeFilter={openingAgeFilter} priceSettings={data.settings?.priceAdvice} onChange={next => { setStoreTypeFilter(next); setRenovationFilter('全部') }} onRenovationChange={next => { setRenovationFilter(next); setStoreTypeFilter('全部门店') }} onOpeningAgeChange={setOpeningAgeFilter}/><ChannelDrilldownView rows={typeFilteredChannelRows} previousRows={typeFilteredPreviousChannelRows} comparisonLabel={comparisonLabel}/></div>
  return <div className="light-app">
    <LightSidebar filters={filters} hotels={data.hotels} batches={data.batches} channels={channels} onChange={setFilters} onExport={exportView} view={view} onView={next => {
      setView(next)
      if (next === 'area') setFilters(f => ({ ...f, area: ALL, city: ALL, district: ALL, revenueZone: ALL, store: ALL }))
      if (next === 'store' || next === 'channel') setFilters(f => ({ ...f, channel: ALL }))
    }}/>
    <main className="light-main">
      <header className="light-header"><div><h1>华西区域暑期预警数据看板</h1><p>轻量驾驶舱 · 未来7天预订 · 周对周同期 · 渠道结构</p></div><div className="header-meta"><em className={versionInfo?.source === '线上最新版本' ? 'online' : ''}><Database/>{versionInfo?.source || '统一数据源'}</em><button onClick={() => setShowMethodology(v => !v)} title="查看本页实际使用的日期、门店范围与环比基准"><CircleHelp/>数据口径</button></div></header>
      <div className="data-version-bar">
        <span><Clock3/><small>数据更新时间</small><b>{versionUpdatedAt ? new Date(versionUpdatedAt).toLocaleString('zh-CN', { hour12: false }) : '--'}</b></span>
        <span><Layers3/><small>当前版本号</small><b>{versionInfo?.versionNumber || '--'}</b></span>
        <span><RefreshCw/><small>当前跑批次数</small><b>{selected?.batchTime || versionInfo?.batchTime || '--'}</b></span>
        <span><CalendarDays/><small>覆盖日期</small><b>{coverageStart && coverageEnd ? `${coverageStart} 至 ${coverageEnd}` : '--'}</b></span>
        <span className="source"><FileClock/><small>数据来源</small><b>{versionInfo?.source || '统一数据源'}</b></span>
      </div>
      <div className="context-bar"><span><Hotel/>当前范围：<b>{filters.province === ALL ? '华西大区' : filters.province}</b></span><div className="day-tabs">{selectedDayTabs.map(item => <button key={item.dayOffset} className={filters.dayOffset === item.dayOffset ? 'active' : ''} onClick={() => setFilters(f => ({ ...f, dayOffset: item.dayOffset }))}><b>{item.dayOffset}</b><small>{item.targetDate.slice(5)}</small></button>)}</div><span><CalendarDays/>同期口径：<b>周对周（-364天）</b></span></div>
      {showMethodology && <section className="methodology-panel">
        <div><small>当前目标日期</small><b>{targetDate || '--'}</b></div>
        <div><small>实际同期日期</small><b>{comparison.comparisonDate || '--'}</b><em>{comparison.usedManualMapping ? '日期映射表' : '目标日期 -364天'}</em></div>
        <div><small>当前期门店口径</small><b>当前在营门店</b><em>{activeScopedHotels.length} 家</em></div>
        <div><small>同期门店口径</small><b>去年同期全量门店</b><em>{comparisonRows.length} 家</em></div>
        <div><small>当前跑批</small><b>{selected?.batchTime || '--'}</b><em>{comparisonLabel}</em></div>
        <div><small>环比基准</small><b>{rawPrevRows.length ? comparisonTooltip : '暂无上一版数据'}</b></div>
        <div className={missingCurrentHotels.length ? 'methodology-warning' : ''}><small>缺失预订数据</small><b>{missingCurrentHotels.length} 家</b><em>{countMissingAsZero ? '默认计入0预定数' : '当前未计入0预定数'}</em></div>
        <div className={comparison.missing ? 'methodology-warning' : ''}><small>同期数据状态</small><b>{comparison.missing ? '未找到，指标显示 --' : '已匹配'}</b><em>{comparison.missing ? '请检查异常清单' : '未使用当前门店范围过滤'}</em></div>
      </section>}
      {!selected ? <div className="light-empty"><AlertTriangle/><h2>暂无预订率数据</h2><p>请联系管理员在 /admin 上传最新文件。</p></div> : <>
        <KpiGroupCards current={kpiCurrent} previous={kpiPrevious} hasPrevious={kpiHasPrevious} comparisonLabel={comparisonLabel} comparisonTooltip={comparisonTooltip} fullCount={kpiFullCount} zeroCount={kpiZeroCount} prevFullCount={kpiPrevFullCount} prevZeroCount={kpiPrevZeroCount}/>
        {viewContent}
      </>}
      <footer>当前门店数口径：当前在营门店 · 同期对比口径：去年同期全量门店经营数据 · 同期口径：周对周，默认目标日期 -364天</footer>
    </main>
    <StoreDetailDrawer store={selectedStore} allRows={scoped} comparisonRows={comparisonRows} channelRows={channelRows} comparisonLabel={comparisonLabel} priceSettings={data.settings?.priceAdvice} onClose={() => setSelectedStore(null)}/>
  </div>
}
