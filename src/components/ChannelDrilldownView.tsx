import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { AlertTriangle, BarChart3, ChevronRight, RotateCcw, Store } from 'lucide-react'
import type { ChannelAnomalySettings, MetricRow, SnapshotRecord } from '../types/data'
import { channelColor } from '../utils/channels'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { ChannelAnomalyTab, StoreChannelAnomalyTab } from './ChannelAnomalyPanels'
import type { ChannelAnomalyMetric } from '../utils/channelAnomalies'

type Level = 'channelLevel1' | 'channelLevel2' | 'channelLevel3'
type ChannelMetric = { name: string; rooms: number; revenue: number; priced: number; share: number; contribution: number; adr: number | null; shareDelta: number | null; contributionDelta: number | null; adrDelta: number | null }

const nameAt = (row: SnapshotRecord, level: Level) => row[level] || row.channel || '未分类'
const totalAvailable = (rows: SnapshotRecord[]) => Object.values(rows.reduce<Record<string, number>>((acc, row) => {
  const key = `${row.whCode}|${row.targetDate}`
  acc[key] = Math.max(acc[key] || 0, row.availableRooms)
  return acc
}, {})).reduce((a, b) => a + b, 0)

function aggregateLevel(rows: SnapshotRecord[], previousRows: SnapshotRecord[], level: Level, denominator: number, previousDenominator: number): ChannelMetric[] {
  const build = (source: SnapshotRecord[], available: number) => {
    const totalRooms = source.reduce((sum, row) => sum + row.bookedRooms, 0)
    return Object.entries(source.reduce<Record<string, { rooms: number; revenue: number; priced: number }>>((acc, row) => {
      const item = acc[nameAt(row, level)] ||= { rooms: 0, revenue: 0, priced: 0 }
      item.rooms += row.bookedRooms; item.revenue += row.bookingRevenue; item.priced += row.pricedRooms
      return acc
    }, {})).map(([name, item]) => ({ name, ...item, share: totalRooms ? item.rooms / totalRooms : 0, contribution: available ? item.rooms / available : 0, adr: item.priced ? item.revenue / item.priced : null }))
  }
  const current = build(rows, denominator)
  const previous = build(previousRows, previousDenominator)
  const hasPrevious = previousRows.length > 0
  return current.map(item => {
    const prior = previous.find(x => x.name === item.name)
    return {
      ...item,
      shareDelta: hasPrevious ? item.share - (prior?.share || 0) : null,
      contributionDelta: hasPrevious ? item.contribution - (prior?.contribution || 0) : null,
      adrDelta: hasPrevious && item.adr != null && prior?.adr != null ? item.adr - prior.adr : null,
    }
  }).sort((a, b) => b.rooms - a.rooms)
}

function LevelChart({ title, subtitle, items, tone, onSelect }: { title: string; subtitle: string; items: ChannelMetric[]; tone: string; onSelect: (name: string) => void }) {
  const shown = items.slice(0, 12).reverse()
  const option = {
    grid: { left: 18, right: 54, top: 8, bottom: 12, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: Array<{ dataIndex: number }>) => {
      const item = shown[p[0]?.dataIndex]
      return item ? `<b>${item.name}</b><br/>预订间夜 ${item.rooms.toLocaleString()}<br/>当前层级占比 ${fmtPct(item.share)}<br/>预订率贡献 ${fmtPct(item.contribution)}<br/>在手ADR ${fmtMoney(item.adr)}` : ''
    } },
    xAxis: { type: 'value', axisLabel: { color: '#9CA3AF', fontSize: 10 }, splitLine: { lineStyle: { color: '#EDF2F7' } } },
    yAxis: { type: 'category', data: shown.map(x => x.name), axisLabel: { color: '#526277', fontSize: 10, width: 92, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', barWidth: 11, data: shown.map(x => ({ value: x.rooms, itemStyle: { color: channelColor(x.name), borderRadius: [0, 6, 6, 0] } })), label: { show: true, position: 'right', color: '#526277', fontSize: 9, formatter: (p: { dataIndex: number }) => fmtPct(shown[p.dataIndex]?.share) } }],
  }
  return <section className={`light-card channel-level-card ${tone}`}><div className="channel-level-head"><span>{tone}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div>
    {items.length ? <ReactECharts option={option} style={{ height: 330 }} onEvents={{ click: (p: { name: string }) => onSelect(p.name) }}/> : <div className="channel-level-empty">当前筛选下暂无渠道数据</div>}
  </section>
}

export default function ChannelDrilldownView({ rows, previousRows, stores, comparisonLabel, settings, onStore }: {
  rows: SnapshotRecord[]
  previousRows: SnapshotRecord[]
  stores: MetricRow[]
  comparisonLabel: string
  settings?: Partial<ChannelAnomalySettings>
  onStore: (store: MetricRow) => void
}) {
  const [tab, setTab] = useState<'structure' | 'anomaly' | 'stores'>('structure')
  const [storeAnomalyFilter, setStoreAnomalyFilter] = useState('全部')
  const [level1, setLevel1] = useState('')
  const [level2, setLevel2] = useState('')
  const [level3, setLevel3] = useState('')
  const denominator = totalAvailable(rows)
  const previousDenominator = totalAvailable(previousRows)
  const level1Options = [...new Set(rows.map(r => nameAt(r, 'channelLevel1')))]
  const level2Options = [...new Set(rows.filter(r => !level1 || nameAt(r, 'channelLevel1') === level1).map(r => nameAt(r, 'channelLevel2')))]
  const level2Rows = rows.filter(r => !level1 || nameAt(r, 'channelLevel1') === level1)
  const previousLevel2Rows = previousRows.filter(r => !level1 || nameAt(r, 'channelLevel1') === level1)
  const level3Rows = level2Rows.filter(r => !level2 || nameAt(r, 'channelLevel2') === level2)
  const previousLevel3Rows = previousLevel2Rows.filter(r => !level2 || nameAt(r, 'channelLevel2') === level2)
  const level3Options = [...new Set(level3Rows.map(r => nameAt(r, 'channelLevel3')))]
  const selectedRows = level3Rows.filter(r => !level3 || nameAt(r, 'channelLevel3') === level3)
  const selectedPreviousRows = previousLevel3Rows.filter(r => !level3 || nameAt(r, 'channelLevel3') === level3)
  const selectedStoreCodes = new Set(selectedRows.map(row => row.whCode))
  const selectedStores = stores.filter(store => selectedStoreCodes.has(store.whCode))
  const level1Metrics = useMemo(() => aggregateLevel(rows, previousRows, 'channelLevel1', denominator, previousDenominator), [rows, previousRows, denominator, previousDenominator])
  const level2Metrics = useMemo(() => aggregateLevel(level2Rows, previousLevel2Rows, 'channelLevel2', denominator, previousDenominator), [level2Rows, previousLevel2Rows, denominator, previousDenominator])
  const level3Metrics = useMemo(() => aggregateLevel(level3Rows, previousLevel3Rows, 'channelLevel3', denominator, previousDenominator), [level3Rows, previousLevel3Rows, denominator, previousDenominator])
  const deepest = level3 ? level3Metrics.filter(item => item.name === level3) : level2 ? level3Metrics : level1 ? level2Metrics : level1Metrics
  const totalRooms = rows.reduce((sum, row) => sum + row.bookedRooms, 0)
  const totalRevenue = rows.reduce((sum, row) => sum + row.bookingRevenue, 0)
  const totalPriced = rows.reduce((sum, row) => sum + row.pricedRooms, 0)
  const chooseAnomalyChannel = (item: ChannelAnomalyMetric) => {
    if (item.level === 'channelLevel1') { setLevel1(item.name); setLevel2(''); setLevel3('') }
    if (item.level === 'channelLevel2') { setLevel1(item.level1); setLevel2(item.name); setLevel3('') }
    if (item.level === 'channelLevel3') { setLevel1(item.level1); setLevel2(item.level2); setLevel3(item.name) }
  }
  return <div className="channel-drill-view">
    <section className="light-card channel-drill-filter">
      <div><small>渠道分析路径</small><strong>全部渠道</strong>{level1 && <><ChevronRight/><strong>{level1}</strong></>}{level2 && <><ChevronRight/><strong>{level2}</strong></>}{level3 && <><ChevronRight/><strong>{level3}</strong></>}</div>
      <label><span>一级渠道</span><select value={level1} onChange={e => { setLevel1(e.target.value); setLevel2(''); setLevel3('') }}><option value="">全部一级渠道</option>{level1Options.map(x => <option key={x}>{x}</option>)}</select></label>
      <label><span>二级渠道</span><select value={level2} onChange={e => { setLevel2(e.target.value); setLevel3('') }}><option value="">全部二级渠道</option>{level2Options.map(x => <option key={x}>{x}</option>)}</select></label>
      <label><span>三级渠道</span><select value={level3} onChange={e => setLevel3(e.target.value)}><option value="">全部三级渠道</option>{level3Options.map(x => <option key={x}>{x}</option>)}</select></label>
      <button onClick={() => { setLevel1(''); setLevel2(''); setLevel3('') }}><RotateCcw/>重置下钻</button>
    </section>
    <section className="channel-drill-summary">
      <article><small>去重可售房</small><b>{denominator.toLocaleString()}</b></article><article><small>预订间夜</small><b>{totalRooms.toLocaleString()}</b></article>
      <article><small>整体预订率</small><b>{fmtPct(denominator ? totalRooms / denominator : null)}</b></article><article><small>整体在手ADR</small><b>{fmtMoney(totalPriced ? totalRevenue / totalPriced : null)}</b></article>
    </section>
    <section className="channel-view-navigation">
      <div className="channel-view-navigation-copy"><small>CHANNEL ANALYSIS</small><b>渠道分析视角</b><span>渠道异常与门店异常可直接定位风险来源及受影响门店</span></div>
      <div className="diagnostic-tabs channel-view-tabs">
        <button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}><BarChart3/><span><b>渠道结构</b><small>查看层级与占比</small></span></button>
        <button className={`attention ${tab === 'anomaly' ? 'active' : ''}`} onClick={() => setTab('anomaly')}><AlertTriangle/><span><b>渠道异常</b><small>识别量价及结构异动</small></span><em>重点</em></button>
        <button className={`attention ${tab === 'stores' ? 'active' : ''}`} onClick={() => setTab('stores')}><Store/><span><b>门店异常</b><small>定位受影响门店</small></span><em>下钻</em></button>
      </div>
    </section>
    {tab === 'structure' && <><div className="channel-level-grid">
      <LevelChart title="一级渠道表现" subtitle="点击渠道，下钻查看对应二级渠道" items={level1Metrics} tone="L1" onSelect={name => { setLevel1(name); setLevel2(''); setLevel3('') }}/>
      <LevelChart title="二级渠道表现" subtitle={level1 ? `当前一级渠道：${level1}` : '当前展示全部一级渠道下的二级渠道'} items={level2Metrics} tone="L2" onSelect={name => { setLevel2(name); setLevel3('') }}/>
      <LevelChart title="三级渠道表现" subtitle={level2 ? `当前二级渠道：${level2}` : '选择二级渠道后进一步聚焦'} items={level3Metrics} tone="L3" onSelect={name => setLevel3(name)}/>
    </div>
    <section className="light-card channel-drill-table"><div className="light-card-head"><div><h2>当前渠道层级指标明细</h2><p>占比、预订率贡献、ADR及{comparisonLabel}</p></div></div>
      <div className="province-table"><table><thead><tr><th>渠道名称</th><th>预订间夜</th><th>层级内占比</th><th>预订率贡献</th><th>在手ADR</th><th>占比{comparisonLabel}</th><th>贡献{comparisonLabel}</th><th>ADR{comparisonLabel}</th></tr></thead><tbody>{deepest.map(item => <tr key={item.name}><td><b><i className="channel-table-color" style={{background:channelColor(item.name)}}/>{item.name}</b></td><td>{item.rooms.toLocaleString()}</td><td>{fmtPct(item.share)}</td><td>{fmtPct(item.contribution)}</td><td>{fmtMoney(item.adr)}</td><td className={(item.shareDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(item.shareDelta)}</td><td className={(item.contributionDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(item.contributionDelta)}</td><td className={(item.adrDelta || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(item.adrDelta)}</td></tr>)}</tbody></table></div>
    </section></>}
    {tab === 'anomaly' && <ChannelAnomalyTab rows={selectedRows} previousRows={selectedPreviousRows} stores={selectedStores} settings={settings} onChannel={chooseAnomalyChannel} onStoreFilter={filter => { setStoreAnomalyFilter(filter); setTab('stores') }}/>}
    {tab === 'stores' && <StoreChannelAnomalyTab key={storeAnomalyFilter} rows={selectedRows} previousRows={selectedPreviousRows} stores={selectedStores} settings={settings} initialFilter={storeAnomalyFilter} onStore={onStore}/>}
  </div>
}
