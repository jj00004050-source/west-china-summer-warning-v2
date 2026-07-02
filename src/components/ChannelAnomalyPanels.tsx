import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { utils, writeFile } from 'xlsx'
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Store } from 'lucide-react'
import type { ChannelAnomalySettings, MetricRow, SnapshotRecord } from '../types/data'
import {
  aggregateChannelAnomalies,
  analyzeStoreChannelAnomalies,
  channelNameAt,
  type ChannelAnomalyMetric,
  type ChannelLevel,
  type ChannelRisk,
} from '../utils/channelAnomalies'
import { channelColor } from '../utils/channels'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { storeTypeProfile } from '../utils/storeTypes'

const LEVEL_LABEL: Record<ChannelLevel, string> = { channelLevel1: '一级渠道', channelLevel2: '二级渠道', channelLevel3: '三级渠道' }
const RISK_LABEL: Record<ChannelRisk, string> = { high: '高风险', watch: '关注', positive: '改善', normal: '正常', sample: '样本量低' }
const RISK_ORDER: Record<ChannelRisk, number> = { high: 0, watch: 1, sample: 2, positive: 3, normal: 4 }

function ChangeQuadrant({ items, onSelect }: { items: ChannelAnomalyMetric[]; onSelect: (item: ChannelAnomalyMetric) => void }) {
  const points = items.filter(item => item.shareDelta != null && item.adrDelta != null)
  const colors: Record<string, string> = { '量价双升': '#16A34A', '量升价降': '#F59E0B', '量降价升': '#36BFFA', '量价双降': '#E5484D' }
  const category = (item: ChannelAnomalyMetric) => item.tags.find(tag => colors[tag]) || '其他'
  const option = {
    grid: { left: 58, right: 30, top: 28, bottom: 46 },
    tooltip: { formatter: (p: { data: { raw: ChannelAnomalyMetric } }) => {
      const item = p.data.raw
      return `<b>${item.name}</b><br/>${category(item)}<br/>预订间夜 ${item.rooms.toLocaleString()}<br/>占比 ${fmtPct(item.share)}（${fmtPp(item.shareDelta)}）<br/>在手ADR ${fmtMoney(item.adr)}（${fmtMoney(item.adrDelta)}）`
    } },
    xAxis: { name: '占比较上一版变化（pp）', nameLocation: 'middle', nameGap: 30, axisLabel: { formatter: '{value}pp', color: '#7A869A' }, splitLine: { lineStyle: { color: '#E9EFF6' } } },
    yAxis: { name: 'ADR较上一版变化（元）', nameGap: 38, axisLabel: { color: '#7A869A' }, splitLine: { lineStyle: { color: '#E9EFF6' } } },
    series: [{
      type: 'scatter',
      data: points.map(item => ({
        name: item.name, value: [(item.shareDelta || 0) * 100, item.adrDelta || 0],
        raw: item, symbolSize: Math.max(12, Math.min(38, 10 + Math.sqrt(item.rooms) * 1.5)),
        itemStyle: { color: colors[category(item)] || '#8B5CF6', opacity: .83, borderColor: '#fff', borderWidth: 2 },
      })),
      label: { show: points.length <= 14, formatter: '{b}', position: 'top', color: '#526277', fontSize: 9 },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: '#91A8C1', type: 'dashed' }, data: [{ xAxis: 0 }, { yAxis: 0 }] },
    }],
  }
  return <section className="light-card channel-quadrant">
    <div className="light-card-head"><div><h2>渠道量价变化四象限</h2><p>横轴看占比变化，纵轴看ADR变化；点击渠道联动异常明细与门店</p></div></div>
    {points.length ? <ReactECharts option={option} style={{ height: 420 }} onEvents={{ click: (event: { data: { raw: ChannelAnomalyMetric } }) => onSelect(event.data.raw) }}/> : <div className="channel-level-empty">暂无可比较的上一版渠道数据</div>}
    <div className="channel-quadrant-legend"><span className="rise">右上 量价双升</span><span className="volume">右下 量升价降</span><span className="price">左上 量降价升</span><span className="fall">左下 量价双降</span></div>
  </section>
}

function AnomalyTable({ items, activeFilter, onSelect }: { items: ChannelAnomalyMetric[]; activeFilter: string; onSelect: (item: ChannelAnomalyMetric) => void }) {
  const filtered = items.filter(item => activeFilter === '全部' || item.tags.includes(activeFilter) || item.risk === activeFilter)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || Math.abs(b.shareDelta || 0) - Math.abs(a.shareDelta || 0))
  return <section className="light-card channel-anomaly-table">
    <div className="light-card-head"><div><h2>渠道变化矩阵 / 异常明细</h2><p>同一真实目标入住日期、同一渠道层级与筛选范围对比上一版</p></div><span>{filtered.length} 个渠道</span></div>
    <div className="province-table"><table><thead><tr><th>层级</th><th>渠道路径</th><th>预订间夜</th><th>间夜占比</th><th>占比较上版</th><th>在手ADR</th><th>ADR较上版</th><th>理论RP贡献</th><th>贡献较上版</th><th>主要影响范围</th><th>影响门店</th><th>异常标签</th><th>风险</th></tr></thead>
      <tbody>{filtered.map(item => <tr key={item.key} onClick={() => onSelect(item)}>
        <td>{item.levelLabel}</td><td><b>{[item.level1, item.level !== 'channelLevel1' && item.level2, item.level === 'channelLevel3' && item.level3].filter(Boolean).join(' / ')}</b></td>
        <td>{item.rooms.toLocaleString()}</td><td>{fmtPct(item.share)}</td><td className={(item.shareDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(item.shareDelta)}</td>
        <td>{fmtMoney(item.adr)}</td><td className={(item.adrDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(item.adrDelta)}</td>
        <td>{fmtMoney(item.rpContribution)}</td><td className={(item.rpContributionDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(item.rpContributionDelta)}</td>
        <td>{item.impactProvince}<small>{item.impactArea}</small></td><td>{item.affectedStores}</td>
        <td><div className="channel-anomaly-tags">{(item.tags.length ? item.tags : ['正常']).map(tag => <em key={tag}>{tag}</em>)}</div></td>
        <td><span className={`channel-risk risk-${item.risk}`}>{RISK_LABEL[item.risk]}</span></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

export function ChannelAnomalyTab({ rows, previousRows, stores, settings, onChannel, onStoreFilter }: {
  rows: SnapshotRecord[]
  previousRows: SnapshotRecord[]
  stores: MetricRow[]
  settings?: Partial<ChannelAnomalySettings>
  onChannel: (item: ChannelAnomalyMetric) => void
  onStoreFilter?: (filter: string) => void
}) {
  const [level, setLevel] = useState<ChannelLevel>('channelLevel1')
  const [filter, setFilter] = useState('全部')
  const metrics = useMemo(() => aggregateChannelAnomalies(rows, previousRows, level, stores, settings), [rows, previousRows, level, stores, settings])
  const l1 = useMemo(() => aggregateChannelAnomalies(rows, previousRows, 'channelLevel1', stores, settings), [rows, previousRows, stores, settings])
  const l3 = useMemo(() => aggregateChannelAnomalies(rows, previousRows, 'channelLevel3', stores, settings), [rows, previousRows, stores, settings])
  const storeAnomalies = useMemo(() => analyzeStoreChannelAnomalies(stores, rows, previousRows, settings), [stores, rows, previousRows, settings])
  const cards: Array<[string, number, string]> = [
    ['OTA依赖门店', storeAnomalies.filter(item => item.tags.includes('OTA占比过高')).length, 'OTA占比过高'],
    ['直销偏低门店', storeAnomalies.filter(item => item.tags.includes('线上直销偏低')).length, '线上直销偏低'],
    ['单一渠道依赖', storeAnomalies.filter(item => item.tags.includes('单一渠道依赖')).length, 'store-high'],
    ['量升价降渠道', l1.filter(item => item.tags.includes('量升价降')).length, '量升价降'],
    ['量价双降渠道', l1.filter(item => item.tags.includes('量价双降')).length, '量价双降'],
    ['ADR异常低渠道', l1.filter(item => item.tags.includes('ADR异常低')).length, 'ADR异常低'],
    ['三级渠道突变', l3.filter(item => item.tags.includes('占比突增') || item.tags.includes('占比突降')).length, 'channelLevel3'],
  ]
  return <div className="channel-anomaly-stack">
    <section className="channel-anomaly-overview"><div className="store-anomaly-title"><div><b>渠道异常概览</b><span>点击卡片筛选异常矩阵；样本量低渠道只提示、不判高风险</span></div></div>
      <div className="channel-anomaly-cards">{cards.map(([label, count, value]) => <button key={label} className={filter === value ? 'active' : ''} onClick={() => {
        if (value === 'store-high') return onStoreFilter?.('单一渠道依赖')
        if (['OTA占比过高','线上直销偏低'].includes(value)) return onStoreFilter?.(value)
        if (value === 'channelLevel3') { setLevel('channelLevel3'); setFilter('全部'); return }
        setFilter(current => current === value ? '全部' : value)
      }}><span>{label}</span><b>{count}</b><small>点击联动筛选</small></button>)}</div>
    </section>
    <div className="channel-anomaly-toolbar"><div className="diagnostic-tabs">{(Object.keys(LEVEL_LABEL) as ChannelLevel[]).map(key => <button key={key} className={level === key ? 'active' : ''} onClick={() => { setLevel(key); setFilter('全部') }}>{LEVEL_LABEL[key]}</button>)}</div>
      {filter !== '全部' && <button onClick={() => setFilter('全部')}>清除异常筛选：{filter}</button>}</div>
    <ChangeQuadrant items={metrics} onSelect={onChannel}/>
    <AnomalyTable items={metrics} activeFilter={filter} onSelect={onChannel}/>
  </div>
}

export function StoreChannelAnomalyTab({ rows, previousRows, stores, settings, onStore, initialFilter = '全部' }: {
  rows: SnapshotRecord[]
  previousRows: SnapshotRecord[]
  stores: MetricRow[]
  settings?: Partial<ChannelAnomalySettings>
  onStore: (store: MetricRow) => void
  initialFilter?: string
}) {
  type StoreSortKey = 'name' | 'province' | 'area' | 'city' | 'revenueZone' | 'bookingRate' | 'adr' | 'maxShare' | 'ota' | 'online' | 'offline' | 'tags' | 'risk' | 'bookedRooms' | 'bookingRevenue' | 'availableRooms' | 'rp' | 'bookingRateChange' | 'adrChange' | 'rpChange'
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState(initialFilter)
  const [pageSize, setPageSize] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 10 : 20)
  const [sort, setSort] = useState<{ key: StoreSortKey; direction: 'desc' | 'asc' } | null>(null)
  const items = useMemo(() => analyzeStoreChannelAnomalies(stores, rows, previousRows, settings)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.maxShare - a.maxShare), [stores, rows, previousRows, settings])
  const options = ['全部','OTA占比过高','线上直销偏低','单一渠道依赖','渠道ADR偏低','直营店直销偏低','直营店OTA偏高']
  const bookingRateChange = (row: MetricRow) => row.bookingRate != null && row.previousAvailableRooms
    ? row.bookingRate - (row.previousBookedRooms || 0) / row.previousAvailableRooms : null
  const adrChange = (row: MetricRow) => row.adr != null && row.previousPricedRooms
    ? row.adr - (row.previousBookingRevenue || 0) / row.previousPricedRooms : null
  const rpChange = (row: MetricRow) => row.rp != null && row.previousAvailableRooms
    ? row.rp - (row.previousBookingRevenue || 0) / row.previousAvailableRooms : null
  const sortValue = (item: ReturnType<typeof analyzeStoreChannelAnomalies>[number], key: StoreSortKey): string | number => {
    if (key === 'ota' || key === 'online' || key === 'offline') return item.mix[key]
    if (key === 'tags') return item.tags.join('、')
    if (key === 'risk') return RISK_ORDER[item.risk]
    if (key === 'bookingRateChange') return bookingRateChange(item.row) ?? Number.NEGATIVE_INFINITY
    if (key === 'adrChange') return adrChange(item.row) ?? Number.NEGATIVE_INFINITY
    if (key === 'rpChange') return rpChange(item.row) ?? Number.NEGATIVE_INFINITY
    if (key === 'maxShare') return item.maxShare
    const value = item.row[key as keyof MetricRow]
    return typeof value === 'number' ? value : String(value ?? '')
  }
  const filtered = useMemo(() => {
    const source = filter === '全部' ? items : items.filter(item => item.tags.includes(filter))
    if (!sort) return source
    return [...source].sort((a, b) => {
      const av = sortValue(a, sort.key), bv = sortValue(b, sort.key)
      const compared = typeof av === 'string' ? av.localeCompare(String(bv), 'zh-CN') : av - Number(bv)
      return compared * (sort.direction === 'asc' ? 1 : -1)
    })
  }, [items, filter, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  useEffect(() => { setPage(1) }, [filter, pageSize, stores, rows, previousRows])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const doSort = (key: StoreSortKey) => setSort(current => {
    if (!current || current.key !== key) return { key, direction: 'desc' }
    if (current.direction === 'desc') return { key, direction: 'asc' }
    return null
  })
  const th = (key: StoreSortKey, label: string) => <th onClick={() => doSort(key)} className={sort?.key === key ? 'sorted' : ''}>{label}{sort?.key === key ? sort.direction === 'desc' ? ' ↓' : ' ↑' : ''}</th>
  const exportRows = () => {
    const exported = filtered.map(item => {
      const profile = storeTypeProfile(item.row)
      return {
        酒店WH编码: item.row.whCode, 门店名称: item.row.name, 省区: item.row.province, 片区: item.row.area, 城市: item.row.city,
        收益管理商圈: item.row.revenueZone, 预订率: item.row.bookingRate, 在手ADR: item.row.adr, 理论RP: item.row.rp,
        最大渠道: item.maxChannel, 最大渠道占比: item.maxShare, 各OTA占比: item.mix.ota, 线上直销占比: item.mix.online,
        线下直销占比: item.mix.offline, 携程占比: item.mix.ctrip, 美团占比: item.mix.meituan, 飞猪占比: item.mix.fliggy,
        渠道异常标签: item.tags.join('、'), 渠道风险等级: RISK_LABEL[item.risk], 预订房间数: item.row.bookedRooms,
        预订总价: item.row.bookingRevenue, 可售房: item.row.availableRooms, 预订率环比: bookingRateChange(item.row),
        在手ADR环比: adrChange(item.row), 理论RP环比: rpChange(item.row), 同期同提前期预订率差异: item.row.sameLeadBookingRateGap,
        同期同提前期ADR差异: item.row.sameLeadAdrGap, 同期同提前期理论RP差异: item.row.sameLeadRpGap,
        直营或加盟: profile.direct ? '直营' : '非直营', 新开店标识: profile.isNew ? '是' : '否',
        改造店标识: profile.isRenovated ? '是' : '否', 开业年限: profile.openMonths == null ? '开业日期缺失' : `${Math.floor(profile.openMonths / 12)}年`,
        数据日期: item.row.targetDate, 跑批次数: rows[0]?.batchTime || '',
      }
    })
    const wb = utils.book_new()
    utils.book_append_sheet(wb, utils.json_to_sheet(exported), '渠道异常明细')
    const target = stores[0]?.targetDate?.replaceAll('-', '') || '当前日期'
    writeFile(wb, `渠道异常明细_${target}_第${rows[0]?.batchTime || '--'}次跑批.xlsx`)
  }
  return <section className="light-card channel-store-anomaly">
    <div className="light-card-head"><div><h2>门店渠道异常TOP</h2><p>只展示有预订来源的门店；0预定门店不误判为渠道异常</p></div><div className="channel-store-tools"><select value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}>{options.map(option => <option key={option}>{option}</option>)}</select><button className="table-export" onClick={exportRows}><Download/>导出渠道异常明细</button><span><Store/> {filtered.length} 家</span></div></div>
    <div className="province-table channel-store-table"><table><thead><tr>{th('name','门店')}{th('province','省区')}{th('area','片区')}{th('city','城市')}{th('revenueZone','收益管理商圈')}{th('bookingRate','预订率')}{th('adr','在手ADR')}{th('maxShare','最大渠道')}{th('ota','各OTA')}{th('online','线上直销')}{th('offline','线下直销')}<th>携程</th><th>美团</th><th>飞猪</th><th>渠道ADR异常</th>{th('tags','异常标签')}{th('risk','风险')}{th('bookedRooms','预订房间数')}{th('bookingRevenue','预订总价')}{th('availableRooms','可售房')}{th('rp','理论RP')}{th('bookingRateChange','预订率环比')}{th('adrChange','ADR环比')}{th('rpChange','RP环比')}</tr></thead>
      <tbody>{pageRows.map(item => <tr key={item.row.whCode} onClick={() => onStore(item.row)}>
        <td><b>{item.row.name}</b><small>{item.row.whCode}</small></td><td>{item.row.province}</td><td>{item.row.area}</td><td>{item.row.city}</td><td>{item.row.revenueZone || '--'}</td>
        <td>{fmtPct(item.row.bookingRate)}</td><td>{fmtMoney(item.row.adr)}</td><td><b className="max-channel-tag">{item.maxChannel}</b><small>{fmtPct(item.maxShare)}</small></td>
        <td>{fmtPct(item.mix.ota)}</td><td>{fmtPct(item.mix.online)}</td><td>{fmtPct(item.mix.offline)}</td><td>{fmtPct(item.mix.ctrip)}</td><td>{fmtPct(item.mix.meituan)}</td><td>{fmtPct(item.mix.fliggy)}</td>
        <td className={item.channelAdrIssue === '--' ? '' : 'negative'}>{item.channelAdrIssue}</td><td><div className="channel-anomaly-tags">{item.tags.map(tag => <em key={tag}>{tag}</em>)}</div></td>
        <td><span className={`channel-risk risk-${item.risk}`}>{RISK_LABEL[item.risk]}</span></td><td>{item.row.bookedRooms.toLocaleString()}</td><td>{fmtMoney(item.row.bookingRevenue)}</td><td>{item.row.availableRooms.toLocaleString()}</td><td>{fmtMoney(item.row.rp)}</td>
        <td className={(bookingRateChange(item.row) || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(bookingRateChange(item.row))}</td><td className={(adrChange(item.row) || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(adrChange(item.row))}</td><td className={(rpChange(item.row) || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(rpChange(item.row))}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="channel-store-pagination"><label>每页显示 <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><span>第 {currentPage} / {pages} 页 · 共 {filtered.length} 家</span><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft/>上一页</button><button disabled={page >= pages} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight/></button></div>
    {!filtered.length && <div className="channel-store-empty"><AlertTriangle/>当前筛选下未识别到门店渠道异常</div>}
  </section>
}
