import { useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import type { ComparisonRow, MetricRow, PriceAdviceSettings, SnapshotRecord } from '../types/data'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { aggregate } from '../utils/metrics'
import { CHANNEL_COLORS } from '../utils/channels'
import BookingRateBar from './BookingRateBar'
import MetricTrendLines from './MetricTrendLines'
import type { DistributionMetric } from '../utils/diagnostics'
import { buildPriceAdvice, type PriceAdvice, type PriceAdviceLabel } from '../utils/priceAdvice'
import { storeTypeProfile, type RenovationFilter, type StoreTypeFilter } from '../utils/storeTypes'
import {
  analyzeStore,
  buildStoreChannelMix,
  EMPTY_STORE_MIX,
  GRADE_LABEL,
  GRADE_ORDER,
  type StoreAnomaly,
  type StoreChannelMix,
} from '../utils/storeAnomalies'

type SortKey = 'name' | 'province' | 'availableRooms' | 'bookingRate' | 'zoneGap' | 'adr' | 'rp' | 'lastRp' | 'rpGap' | 'snapshotChange' | 'otaShare' | 'onlineShare'
type PriceAdviceView = Pick<PriceAdvice, 'label' | 'reason' | 'quantityPriceStatus' | 'threshold'>
type EnrichedStore = { row: MetricRow; zoneRate: number | null; zoneGap: number | null; mix: StoreChannelMix; anomaly: StoreAnomaly; priceAdvice: PriceAdviceView; typeProfile: ReturnType<typeof storeTypeProfile>; renovationTags: string[] }

const anomalyOptions = ['全部','高风险','中风险','关注项','口径提示','0预定','低预订率','低于商圈','RP缺口大','量价双降','量升价降','价格异常','渠道异常','直营风险','无同期','新开无可比','商圈未配置','数据待核验']
const cardDefinitions = [
  ['高风险门店', (item: EnrichedStore) => item.anomaly.grade === 'S', 'business'],
  ['中风险门店', (item: EnrichedStore) => item.anomaly.grade === 'A', 'business'],
  ['0预定门店', (item: EnrichedStore) => item.anomaly.businessTags.includes('0预定'), 'business'],
  ['低于商圈门店', (item: EnrichedStore) => item.anomaly.businessTags.some(tag => tag.startsWith('低于商圈')), 'business'],
  ['RP缺口大门店', (item: EnrichedStore) => item.anomaly.businessTags.includes('RP缺口大'), 'business'],
  ['量价双降门店', (item: EnrichedStore) => item.anomaly.businessTags.includes('量价双降'), 'business'],
  ['直营风险门店', (item: EnrichedStore) => item.anomaly.businessTags.includes('直营风险'), 'business'],
  ['无同期门店', (item: EnrichedStore) => item.anomaly.statusTags.includes('无同期') || item.anomaly.statusTags.includes('新开无可比'), 'status'],
  ['数据待核验', (item: EnrichedStore) => item.anomaly.dataTags.includes('数据待核验'), 'data'],
] as const

const PRICE_ADVICE_OPTIONS: Array<'全部提价建议' | PriceAdviceLabel> = [
  '全部提价建议','强烈建议提价','建议提价','建议小幅提价','阶梯式提价','提前提价机会','保持观察',
  '渠道补量','渠道预热','不建议提价','流量预警','价格偏高风险','高量低价风险','样本不足','商圈未配置，无法判断',
]
const PRICE_OPPORTUNITY_LABELS: PriceAdviceLabel[] = ['强烈建议提价','建议提价','建议小幅提价','阶梯式提价','提前提价机会']
const priceAdviceTone = (label: PriceAdviceLabel) => label === '强烈建议提价' ? 'strong'
  : PRICE_OPPORTUNITY_LABELS.includes(label) ? 'mild'
    : label === '价格偏高风险' ? 'high'
      : ['高量低价风险','不建议提价','渠道补量','渠道预热','流量预警'].includes(label) ? 'watch'
        : label === '商圈未配置，无法判断' ? 'zone' : 'neutral'

function ChannelDonut({ mix }: { mix: StoreChannelMix }) {
  if (!mix.total) return <div className="store-channel-mini empty" data-tooltip="无预订来源"><i><em/></i><span><b>无预订</b><small>无渠道来源</small></span></div>
  const otaEnd = mix.ota * 100
  const onlineEnd = otaEnd + mix.online * 100
  const offlineEnd = onlineEnd + mix.offline * 100
  const tooltip = `渠道结构｜各OTA ${(mix.ota * 100).toFixed(1)}%｜线上直销 ${(mix.online * 100).toFixed(1)}%｜线下直销 ${(mix.offline * 100).toFixed(1)}%｜其他 ${(mix.other * 100).toFixed(1)}%｜其中：携程 ${(mix.ctrip * 100).toFixed(1)}%，美团 ${(mix.meituan * 100).toFixed(1)}%，飞猪 ${(mix.fliggy * 100).toFixed(1)}%`
  return <div className="store-channel-mini" data-tooltip={tooltip} title={tooltip}>
    <i style={{ background: `conic-gradient(${CHANNEL_COLORS['各OTA']} 0 ${otaEnd}%,${CHANNEL_COLORS['线上直销']} ${otaEnd}% ${onlineEnd}%,${CHANNEL_COLORS['线下直销']} ${onlineEnd}% ${offlineEnd}%,${CHANNEL_COLORS['其他']} ${offlineEnd}% 100%)` }}><em/></i>
    <span><b>{mix.mainName === '各OTA' ? 'OTA' : mix.mainName} {(mix.mainShare * 100).toFixed(1)}%</b><small>hover查看完整结构</small></span>
  </div>
}

export default function StoreWarningTable({ rows, benchmarkRows = rows, comparisonRows = [], channelRows, comparisonLabel = '较上一跑批', priceSettings, storeTypeFilter = '全部门店', renovationFilter = '全部', onStore, priorityCodes = [], highlightCode = '', initialDiagnosticSort = null }: {
  rows: MetricRow[]
  benchmarkRows?: MetricRow[]
  comparisonRows?: ComparisonRow[]
  channelRows: SnapshotRecord[]
  comparisonLabel?: string
  priceSettings?: Partial<PriceAdviceSettings>
  storeTypeFilter?: StoreTypeFilter
  renovationFilter?: RenovationFilter
  onStore: (row: MetricRow) => void
  priorityCodes?: string[]
  highlightCode?: string
  initialDiagnosticSort?: DistributionMetric | null
}) {
  const [query, setQuery] = useState('')
  const [anomalyFilter, setAnomalyFilter] = useState('全部')
  const [priceFilter, setPriceFilter] = useState<'全部提价建议' | PriceAdviceLabel>('全部提价建议')
  const [sort, setSort] = useState<SortKey>('rpGap')
  const [asc, setAsc] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 10 : 20)
  useEffect(() => {
    if (!initialDiagnosticSort) return
    const mapped: Partial<Record<DistributionMetric, SortKey>> = { zoneGap: 'zoneGap', bookingRate: 'bookingRate', rpGap: 'rpGap', rp: 'rp', adrGap: 'adr', bookingRateChange: 'bookingRate', rpChange: 'snapshotChange', otaShare: 'otaShare', onlineShare: 'onlineShare' }
    setSort(mapped[initialDiagnosticSort] || 'rpGap'); setAsc(true); setPage(1)
  }, [initialDiagnosticSort])

  const zoneGroups = useMemo(() => benchmarkRows.reduce<Record<string, MetricRow[]>>((result, row) => {
    if (row.revenueZone) (result[row.revenueZone] ||= []).push(row)
    return result
  }, {}), [benchmarkRows])
  const zoneRates = useMemo(() => Object.entries(zoneGroups).reduce<Record<string, number | null>>((result, [name, zoneRows]) => {
    result[name] = aggregate(zoneRows).bookingRate
    return result
  }, {}), [zoneGroups])
  const zoneMetrics = useMemo(() => Object.entries(zoneGroups).reduce<Record<string, ReturnType<typeof aggregate>>>((result, [name, zoneRows]) => {
    result[name] = aggregate(zoneRows, comparisonRows.filter(row => row.revenueZone === name))
    return result
  }, {}), [zoneGroups, comparisonRows])
  const bottom20Codes = useMemo(() => new Set(Object.values(zoneGroups).flatMap(zoneRows => {
    const sorted = [...zoneRows].filter(row => row.bookingRate != null).sort((a, b) => (a.bookingRate || 0) - (b.bookingRate || 0))
    return sorted.slice(0, Math.ceil(sorted.length * .2)).map(row => row.whCode)
  })), [zoneGroups])
  const channelByHotel = useMemo(() => buildStoreChannelMix(channelRows), [channelRows])
  const enriched = useMemo<EnrichedStore[]>(() => rows.map(row => {
    if (row.precomputedStoreInsight) {
      const insight = row.precomputedStoreInsight
      return {
        row,
        zoneRate: insight.zoneRate,
        zoneGap: insight.zoneGap,
        mix: insight.mix,
        anomaly: insight.anomaly,
        priceAdvice: {
          ...insight.priceAdvice,
          label: insight.priceAdvice.label as PriceAdviceLabel,
          quantityPriceStatus: insight.priceAdvice.quantityPriceStatus as PriceAdvice['quantityPriceStatus'],
        },
        typeProfile: insight.typeProfile,
        renovationTags: insight.renovationTags,
      }
    }
    const zoneRate = row.revenueZone ? zoneRates[row.revenueZone] ?? null : null
    const zoneGap = row.bookingRate != null && zoneRate != null ? row.bookingRate - zoneRate : null
    const mix = channelByHotel[row.whCode] || EMPTY_STORE_MIX
    const zone = row.revenueZone ? zoneMetrics[row.revenueZone] : undefined
    const priceAdvice = buildPriceAdvice(row, {
      zoneBookingRate: zone?.bookingRate ?? null, zoneAdr: zone?.adr ?? null, zoneLastOcc: zone?.lastOcc ?? null,
      zoneLastAdr: zone?.lastAdr ?? null, zoneStoreCount: row.revenueZone ? (zoneGroups[row.revenueZone]?.length || 0) : 0,
      zoneBookingRateChange: zone?.bookingRateChange ?? null,
      zoneBookedChange: zone?.previousAvailableRooms ? zone.bookedRooms - zone.previousBookedRooms : null,
    }, priceSettings)
    const renovationTags = row.isRenovated ? [
      ((row.bookingRate != null && zoneRate != null && row.bookingRate < zoneRate) || (row.bookingRate != null && row.lastOcc != null && row.bookingRate < row.lastOcc) || (row.bookingRate || 0) < priceAdvice.threshold) ? '改造店低预订' : '',
      row.bookedRooms === 0 ? '改造店0预定' : '',
      zoneGap != null && zoneGap < 0 ? '改造店低于商圈' : '',
      PRICE_OPPORTUNITY_LABELS.includes(priceAdvice.label) ? '改造店提价机会' : '',
      priceAdvice.label === '价格偏高风险' ? '改造店价格偏高风险' : '',
    ].filter(Boolean) : []
    return {
      row, zoneRate, zoneGap, mix,
      anomaly: analyzeStore(row, zoneRate, mix, bottom20Codes.has(row.whCode), {
        zoneAdr: zone?.adr ?? null,
        zoneBookingRateChange: zone?.bookingRateChange ?? null,
        priceAdviceLabel: priceAdvice.label,
      }),
      priceAdvice, typeProfile: storeTypeProfile(row), renovationTags,
    }
  }), [rows, zoneRates, zoneMetrics, zoneGroups, channelByHotel, bottom20Codes, priceSettings])
  const priority = useMemo(() => new Map(priorityCodes.map((code, index) => [code, index])), [priorityCodes])
  const matchesAnomaly = (item: EnrichedStore) => {
    if (anomalyFilter === '全部') return true
    if (anomalyFilter === '高风险') return item.anomaly.grade === 'S'
    if (anomalyFilter === '中风险') return item.anomaly.grade === 'A'
    if (anomalyFilter === '关注项') return item.anomaly.grade === 'B'
    if (anomalyFilter === '口径提示') return item.anomaly.grade === 'C'
    if (anomalyFilter === '无同期') return item.anomaly.statusTags.includes('无同期') || item.anomaly.statusTags.includes('新开无可比')
    if (anomalyFilter === '低于商圈') return item.anomaly.businessTags.some(tag => tag.startsWith('低于商圈'))
    if (anomalyFilter === '价格异常') return item.anomaly.businessTags.some(tag => ['ADR下降','量价双降','量升价降','满房低价'].includes(tag))
    if (anomalyFilter === '渠道异常') return item.anomaly.businessTags.some(tag => ['OTA偏高','直销偏低'].includes(tag))
    return item.anomaly.businessTags.includes(anomalyFilter) || item.anomaly.statusTags.includes(anomalyFilter) || item.anomaly.dataTags.includes(anomalyFilter)
  }
  const filtered = useMemo(() => enriched.filter(item =>
    (!query || `${item.row.name}${item.row.whCode}`.toLowerCase().includes(query.toLowerCase())) && matchesAnomaly(item) &&
    (priceFilter === '全部提价建议' || item.priceAdvice.label === priceFilter)
  ).sort((a, b) => {
    const ap = priority.get(a.row.whCode), bp = priority.get(b.row.whCode)
    if (ap != null || bp != null) return (ap ?? Number.MAX_SAFE_INTEGER) - (bp ?? Number.MAX_SAFE_INTEGER)
    if (storeTypeFilter === '新开店' || storeTypeFilter === '直营店' || renovationFilter !== '全部') {
      const zeroOrder = Number(b.row.bookedRooms === 0) - Number(a.row.bookedRooms === 0)
      if (zeroOrder) return zeroOrder
      const zoneOrder = (a.zoneGap ?? 0) - (b.zoneGap ?? 0)
      if (zoneOrder) return zoneOrder
    }
    const grade = GRADE_ORDER[a.anomaly.grade] - GRADE_ORDER[b.anomaly.grade]
    if (grade) return grade
    const value = (item: EnrichedStore): string | number => {
      if (sort === 'zoneGap') return item.zoneGap ?? Number.NEGATIVE_INFINITY
      if (sort === 'otaShare') return item.mix.ota
      if (sort === 'onlineShare') return item.mix.online
      const raw = item.row[sort]
      return typeof raw === 'number' ? raw : String(raw ?? '')
    }
    const av = value(a), bv = value(b)
    return (typeof av === 'string' ? av.localeCompare(String(bv), 'zh-CN') : av - Number(bv)) * (asc ? 1 : -1)
  }), [enriched, query, anomalyFilter, priceFilter, sort, asc, priority, storeTypeFilter, renovationFilter])
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => { setPage(1) }, [rows, query, anomalyFilter, priceFilter, storeTypeFilter, renovationFilter, pageSize])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const doSort = (key: SortKey) => { if (sort === key) setAsc(value => !value); else { setSort(key); setAsc(true) } }
  const chooseFilter = (value: string) => { setAnomalyFilter(value); setPage(1) }
  const exportRows = async () => {
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(filtered.map(({ row, zoneRate, zoneGap, mix, anomaly, priceAdvice, typeProfile, renovationTags }) => ({
      门店名称: row.name, WH编码: row.whCode, 省区: row.province, 片区: row.area, 城市: row.city, 收益管理商圈: row.revenueZone,
      品牌: row.brand, 品牌定位: row.positioning, 经营类型: row.operationType, 管理类型: row.managementType, 是否直营: anomaly.direct ? '是' : '否',
      当前预订率: row.bookingRate, 商圈预订率: zoneRate, 较商圈差异: zoneGap, 在手ADR: row.adr, 理论RP: row.rp, 同期RP: row.lastRp, RP缺口: row.rpGap,
      预订率较上一版变化: anomaly.bookingRateChange, ADR较上一版变化: anomaly.adrChange, 理论RP较上一版变化: anomaly.rpChange,
      同期同提前期预订率: row.sameLeadBookingRate, 同期同提前期在手ADR: row.sameLeadAdr, 同期同提前期理论RP: row.sameLeadRp,
      同提前期预订率差异: row.sameLeadBookingRateGap, 同提前期ADR差异: row.sameLeadAdrGap, 同提前期理论RP差异: row.sameLeadRpGap,
      经营风险等级: GRADE_LABEL[anomaly.grade], 经营异常标签: anomaly.businessTags.join('、'), 经营异常原因: anomaly.businessReasons.join('；'),
      状态标签: anomaly.statusTags.join('、'), 口径说明: anomaly.statusReasons.join('；'), 数据校验标签: anomaly.dataTags.join('、'), 数据校验原因: anomaly.dataReasons.join('；'),
      门店类型标签: typeProfile.typeTags.join('、'), 是否新开: typeProfile.isNew ? '是' : '否', 开业日期: row.openDate, 开业月龄: typeProfile.openMonths,
      新开阶段: typeProfile.newStage, 是否改造店: typeProfile.isRenovated ? '是' : '否', 改造类型: row.renovationType || '--', 改造店专项标签: renovationTags.join('、'),
      提价建议: priceAdvice.label, 提价建议依据: priceAdvice.reason, 量价状态: priceAdvice.quantityPriceStatus,
      各OTA占比: mix.ota, 线上直销占比: mix.online, 线下直销占比: mix.offline, 携程占比: mix.ctrip, 美团占比: mix.meituan, 飞猪占比: mix.fliggy, 最大渠道: mix.mainName, 最大渠道占比: mix.mainShare,
    })))
    const wb = utils.book_new(); utils.book_append_sheet(wb, ws, '当前在营门店预警'); writeFile(wb, '当前在营门店预警明细.xlsx')
  }
  const th = (key: SortKey, label: string) => <th onClick={() => doSort(key)}>{label}{sort === key ? asc ? ' ↑' : ' ↓' : ''}</th>
  return <>
    <section className="store-anomaly-overview">
      <div className="store-anomaly-title"><div><b>门店异常概览</b><span>经营预警与口径状态分开统计；点击卡片筛选下方门店</span></div><em>当前在营门店 {rows.length} 家</em></div>
      <div className="store-anomaly-cards">{cardDefinitions.map(([label, test, type]) => {
        const filterValue = label === '高风险门店' ? '高风险' : label === '中风险门店' ? '中风险' : label === '0预定门店' ? '0预定' : label === '低于商圈门店' ? '低于商圈' : label === 'RP缺口大门店' ? 'RP缺口大' : label === '量价双降门店' ? '量价双降' : label === '直营风险门店' ? '直营风险' : label === '无同期门店' ? '无同期' : label
        return <button key={label} className={`${type} ${anomalyFilter === filterValue ? 'active' : ''}`} onClick={() => chooseFilter(filterValue)}><span>{label}</span><b>{enriched.filter(test).length}</b><small>{type === 'business' ? '经营预警' : type === 'status' ? '口径提示' : '数据治理'}</small></button>
      })}</div>
    </section>
    <section className="panel table-panel store-warning-table">
      <div className="panel-title compact"><div><span className="eyebrow">STORE EARLY WARNING</span><h2>门店预警明细 <em>{rows.length}</em>{filtered.length !== rows.length && <small>当前筛选 {filtered.length} 家</small>}</h2></div>
        <div className="table-tools"><label className="search"><Search size={14}/><input placeholder="搜索门店 / WH编码" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }}/></label>
        <select value={anomalyFilter} onChange={event => chooseFilter(event.target.value)}>{anomalyOptions.map(value => <option key={value}>{value}</option>)}</select>
        <select className="price-advice-filter" value={priceFilter} onChange={event => { setPriceFilter(event.target.value as typeof priceFilter); setPage(1) }}>{PRICE_ADVICE_OPTIONS.map(value => <option key={value}>{value}</option>)}</select>
        <button onClick={exportRows}><Download size={14}/>导出当前结果</button></div>
      </div>
      <div className="store-table-methodology">门店明细仅展示当前维度表中经营状态为在营 / 在营业的门店；同期数据仅用于当前在营门店的对比。无同期、新开无可比、商圈未配置属于口径状态，不直接计入经营异常。</div>
      <details className="risk-definition-note">
        <summary>高风险与异常门店如何判断？</summary>
        <div>
          <p><b>异常门店：</b>至少命中一项经营异常标签，包括0预定、低预订率、低于商圈、RP缺口大、预订率或ADR下降、量价双降、OTA偏高或线上直销偏低等。</p>
          <p><b>高风险门店：</b>异常门店中触发近端严重条件的S级门店，重点包括D0-D1零预定、D0-D2低预订且进速弱、明显落后升温商圈、价格压制转化、近端量价双降，以及直营店渠道结构严重失衡。</p>
          <p><b>不直接算异常：</b>无同期、新开无可比、商圈未配置、开业日期缺失等属于口径状态；数据待核验属于数据治理提示。</p>
        </div>
      </details>
      <div className="table-scroll"><table><thead><tr>{th('name', '门店')}{th('province', '省区 / 片区 / 可售房')}{th('bookingRate', '预订率 / 商圈对标')}{th('adr', '在手ADR')}{th('rp', '理论RP')}{th('lastRp', '同期RP')}{th('rpGap', 'RP缺口')}{th('snapshotChange', `RP${comparisonLabel}`)}<th>提价建议</th>{th('otaShare', '渠道占比')}</tr></thead>
        <tbody>{pageRows.map(({ row, zoneRate, zoneGap, mix, anomaly, priceAdvice, typeProfile, renovationTags }) => <tr className={row.whCode === highlightCode ? 'diagnostic-highlight-row' : priority.has(row.whCode) ? 'diagnostic-priority-row' : ''} key={`${row.whCode}-${row.dayOffset}`} onClick={() => onStore(row)}>
          <td><div className="store-name-line"><span className={`store-risk-grade grade-${anomaly.grade}`}>{GRADE_LABEL[anomaly.grade]}</span><b>{row.name}</b></div><small>{row.whCode}</small>
            <div className="store-tag-groups type-tags">{typeProfile.typeTags.map(tag => <em className="type" key={tag}>{tag}</em>)}{!row.openDate && <em className="status">开业日期缺失</em>}</div>
            {renovationTags.length > 0 && <div className="store-tag-groups renovation-tags">{renovationTags.slice(0, 2).map(tag => <em key={tag}>{tag}</em>)}</div>}
            <div className="store-tag-groups">{anomaly.businessTags.slice(0, 3).map(tag => <em className="business" key={tag}>{tag}</em>)}{anomaly.statusTags.slice(0, 2).map(tag => <em className="status" key={tag}>{tag}</em>)}{anomaly.dataTags.slice(0, 1).map(tag => <em className="data" key={tag}>{tag}</em>)}</div></td>
          <td>{row.province}<small>{row.area}</small>{row.isRenovated && <small className="renovation-type-inline">改造类型：{row.renovationType || '未标记'}</small>}<em className="store-available-inline">可售 {row.availableRooms || (row.tags.includes('缺失预订数据') ? '--' : 0)}</em></td>
          <td><BookingRateBar value={row.bookingRate}/><MetricTrendLines kind="rate" change={anomaly.bookingRateChange} sameLeadGap={row.sameLeadBookingRateGap}/><div className="zone-rate-compare"><span>商圈 {fmtPct(zoneRate)}</span><b className={(zoneGap || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(zoneGap)}</b></div></td>
          <td>{fmtMoney(row.adr)}<MetricTrendLines kind="money" change={anomaly.adrChange} sameLeadGap={row.sameLeadAdrGap}/></td><td>{fmtMoney(row.rp)}<MetricTrendLines kind="money" change={anomaly.rpChange} sameLeadGap={row.sameLeadRpGap}/></td><td>{fmtMoney(row.lastRp)}</td>
          <td className={(row.rpGap || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(row.rpGap)}</td>
          <td className={(anomaly.rpChange || 0) < 0 ? 'negative' : 'positive'}>{anomaly.rpChange == null ? '--' : `${anomaly.rpChange >= 0 ? '↑' : '↓'}${fmtMoney(Math.abs(anomaly.rpChange))}`}</td>
          <td><div className={`price-advice-cell advice-${priceAdviceTone(priceAdvice.label)}`} title={priceAdvice.reason}><b>{priceAdvice.label}</b><small>{priceAdvice.reason}</small></div></td>
          <td><ChannelDonut mix={mix}/></td>
        </tr>)}</tbody></table>{!pageRows.length && <div className="empty-mini">当前筛选范围暂无门店数据</div>}</div>
      <div className="pagination"><label>每页显示 <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><span>第 {page}/{pages} 页 · 共 {filtered.length} 家</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>
    </section>
  </>
}
