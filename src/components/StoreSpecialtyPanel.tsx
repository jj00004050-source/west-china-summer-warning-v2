import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { ComparisonRow, MetricRow, PriceAdviceSettings, SnapshotRecord } from '../types/data'
import { aggregate } from '../utils/metrics'
import { analyzeStore, buildStoreChannelMix, EMPTY_STORE_MIX } from '../utils/storeAnomalies'
import { matchesRenovationFilter, matchesStoreType, storeTypeProfile, type RenovationFilter, type StoreTypeFilter } from '../utils/storeTypes'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { buildPriceAdvice } from '../utils/priceAdvice'

const FILTERS: StoreTypeFilter[] = ['全部门店','直营店','新开店','非新开存量店']
const MISSING_OPENING_DATE = '开业日期缺失'

const numericAge = (value: string) => {
  const parsed = Number(value.replace('年', ''))
  return Number.isFinite(parsed) ? parsed : null
}

const openingAgeSummary = (selected: string[]) => {
  if (!selected.length) return '全部'
  if (selected.length === 1) return selected[0]
  const hasMissing = selected.includes(MISSING_OPENING_DATE)
  const numbers = selected.map(numericAge).filter((value): value is number => value != null).sort((a, b) => a - b)
  if (!hasMissing && numbers.length === selected.length && numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1)) {
    return `${numbers[0]}-${numbers.at(-1)}年`
  }
  if (selected.length <= 4) return [...selected].sort((a, b) => {
    if (a === MISSING_OPENING_DATE) return -1
    if (b === MISSING_OPENING_DATE) return 1
    return (numericAge(a) || 0) - (numericAge(b) || 0)
  }).join('、')
  return `已选${selected.length}项`
}

export default function StoreSpecialtyPanel({ rows, comparisonRows, channelRows, value, renovationFilter, openingAgeOptions, openingAgeFilter, priceSettings, onChange, onRenovationChange, onOpeningAgeChange }: {
  rows: MetricRow[]
  comparisonRows: ComparisonRow[]
  channelRows: SnapshotRecord[]
  value: StoreTypeFilter
  renovationFilter: RenovationFilter
  openingAgeOptions: string[]
  openingAgeFilter: string[]
  priceSettings?: Partial<PriceAdviceSettings>
  onChange: (value: StoreTypeFilter) => void
  onRenovationChange: (value: RenovationFilter) => void
  onOpeningAgeChange: (value: string[]) => void
}) {
  const [ageOpen, setAgeOpen] = useState(false)
  const [draftOpeningAges, setDraftOpeningAges] = useState(openingAgeFilter)
  const ageFilterRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ageOpen) setDraftOpeningAges(openingAgeFilter)
  }, [openingAgeFilter, ageOpen])
  useEffect(() => {
    if (!ageOpen) return
    const close = (event: MouseEvent) => {
      if (!ageFilterRef.current?.contains(event.target as Node)) setAgeOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ageOpen])
  const numericOptions = useMemo(() => openingAgeOptions.filter(option => numericAge(option) != null), [openingAgeOptions])
  const selected = rows.filter(row => matchesStoreType(row, value) && matchesRenovationFilter(row, renovationFilter))
  const metric = aggregate(selected)
  const needsRuntimeInsight = rows.some(row => !row.precomputedStoreInsight)
  const mixByHotel = needsRuntimeInsight ? buildStoreChannelMix(channelRows) : {}
  const selectedMix = selected.reduce((result, row) => {
    const mix = row.precomputedStoreInsight?.mix || mixByHotel[row.whCode]
    if (!mix) return result
    result.ota += mix.ota * mix.total; result.online += mix.online * mix.total; result.offline += mix.offline * mix.total; result.total += mix.total
    return result
  }, { ota: 0, online: 0, offline: 0, total: 0 })
  const zoneGroups = rows.reduce<Record<string, MetricRow[]>>((result, row) => {
    if (row.revenueZone) (result[row.revenueZone] ||= []).push(row)
    return result
  }, {})
  const zoneMetrics = Object.entries(zoneGroups).reduce<Record<string, ReturnType<typeof aggregate>>>((result, [name, zoneRows]) => {
    result[name] = aggregate(zoneRows, comparisonRows.filter(row => row.revenueZone === name))
    return result
  }, {})
  const belowZone = selected.filter(row => {
    const zone = row.revenueZone ? aggregate(zoneGroups[row.revenueZone] || []).bookingRate : null
    return row.bookingRate != null && zone != null && row.bookingRate < zone
  }).length
  const zero = selected.filter(row => row.bookedRooms === 0 && !row.tags.includes('缺失预订数据')).length
  const profiles = selected.map(storeTypeProfile)
  const specialtyLabel = renovationFilter !== '全部' ? renovationFilter : value
  const selectedAdvice = selected.map(row => {
    if (row.precomputedStoreInsight) {
      return {
        row,
        zone: row.revenueZone ? zoneMetrics[row.revenueZone] : undefined,
        advice: row.precomputedStoreInsight.priceAdvice,
      }
    }
    const zone = row.revenueZone ? zoneMetrics[row.revenueZone] : undefined
    const advice = buildPriceAdvice(row, {
      zoneBookingRate: zone?.bookingRate ?? null, zoneAdr: zone?.adr ?? null, zoneLastOcc: zone?.lastOcc ?? null,
      zoneLastAdr: zone?.lastAdr ?? null, zoneStoreCount: row.revenueZone ? zoneGroups[row.revenueZone]?.length || 0 : 0,
      zoneBookingRateChange: zone?.bookingRateChange ?? null,
      zoneBookedChange: zone?.previousAvailableRooms ? zone.bookedRooms - zone.previousBookedRooms : null,
    }, priceSettings)
    return { row, zone, advice }
  })
  const priceLabels = selectedAdvice.map(item => item.advice.label)
  const highRisk = selectedAdvice.filter(({ row, zone, advice }) => (
    row.precomputedStoreInsight?.anomaly || analyzeStore(
      row,
      zone?.bookingRate ?? null,
      mixByHotel[row.whCode] || EMPTY_STORE_MIX,
      false,
      { zoneAdr: zone?.adr ?? null, zoneBookingRateChange: zone?.bookingRateChange ?? null, priceAdviceLabel: advice.label },
    )
  ).grade === 'S').length
  const renovationTypes = [...new Set(rows.filter(row => row.isRenovated).map(row => row.renovationType || '改造类型未标记'))].sort((a,b) => a.localeCompare(b, 'zh-CN'))
  const renovationPerspective = renovationFilter === '改造店' || renovationTypes.includes(renovationFilter)
  const averageOpenMonths = profiles.map(item => item.openMonths).filter((value): value is number => value != null)
  const cards = value === '全部门店' && renovationFilter === '全部'
    ? [
        ['直营店数量', rows.filter(row => storeTypeProfile(row).direct).length, '家'],
        ['新开店数量', rows.filter(row => storeTypeProfile(row).isNew).length, '家'],
        ['改造店数量', rows.filter(row => storeTypeProfile(row).isRenovated).length, '家'],
        ['新开0预定', rows.filter(row => storeTypeProfile(row).isNew && row.bookedRooms === 0).length, '家'],
        ['改造0预定', rows.filter(row => storeTypeProfile(row).isRenovated && row.bookedRooms === 0).length, '家'],
        ['直营风险门店', rows.filter(row => {
          if (!storeTypeProfile(row).direct) return false
          const grade = row.precomputedStoreInsight?.anomaly.grade
          return grade ? grade === 'S' || grade === 'A' : row.risk === 'high' || row.risk === 'watch'
        }).length, '家'],
      ]
    : [
        [`${specialtyLabel}数量`, selected.length, '家'],
        ...(value === '新开店' ? [['平均开业月龄', averageOpenMonths.length ? Math.round(averageOpenMonths.reduce((a,b) => a + b, 0) / averageOpenMonths.length) : '--', '个月']] : []),
        ...(renovationFilter === '改造店' ? renovationTypes.map(type => [`${type}门店`, rows.filter(row => matchesStoreType(row, value) && row.isRenovated && (row.renovationType || '改造类型未标记') === type).length, '家']) : []),
        ['预订率', fmtPct(metric.bookingRate), ''],
        ['在手ADR', fmtMoney(metric.adr), ''],
        ['理论RP', fmtMoney(metric.rp), ''],
        ['同期RP', fmtMoney(metric.lastRp), ''],
        ['RP缺口', metric.rp != null && metric.lastRp != null ? fmtMoney(metric.rp - metric.lastRp) : '--', ''],
        ['较上版预订率', fmtPp(metric.bookingRateChange), ''],
        ['0预定门店', zero, '家'],
        ['低于商圈', belowZone, '家'],
        ['高风险门店', highRisk, '家'],
        ...(renovationPerspective ? [
          ['建议提价门店', priceLabels.filter(label => ['强烈建议提价','建议提价','建议小幅提价','阶梯式提价','提前提价机会'].includes(label)).length, '家'],
          ['价格偏高风险', priceLabels.filter(label => label === '价格偏高风险').length, '家'],
        ] : []),
      ]
  const toggleOpeningAge = (option: string) => setDraftOpeningAges(current =>
    current.includes(option) ? current.filter(value => value !== option) : [...current, option],
  )
  const selectQuickAge = (range: 'all' | '0-1' | '2-5' | '5+' | '10+' | 'custom') => {
    if (range === 'custom') return
    if (range === 'all') return setDraftOpeningAges([])
    const selected = numericOptions.filter(option => {
      const year = numericAge(option)
      if (year == null) return false
      if (range === '0-1') return year <= 1
      if (range === '2-5') return year >= 2 && year <= 5
      if (range === '5+') return year >= 5
      return year >= 10
    })
    setDraftOpeningAges(selected)
  }
  return <section className="store-specialty-panel">
    <div className="store-specialty-head"><div><b>门店类型专项视角</b><span>类型标签不等于经营异常；仅作用于当前在营门店</span></div>
      <div className="store-type-actions"><div className="store-type-filter">{FILTERS.map(filter => <button className={value === filter ? 'active' : ''} key={filter} onClick={() => onChange(filter)}>{filter}</button>)}</div>
        <label><span>改造店筛选</span><select value={renovationFilter} onChange={event => onRenovationChange(event.target.value)}><option>全部</option><option>改造店</option><option>非改造店</option>{renovationTypes.map(type => <option key={type}>{type}</option>)}</select></label></div>
    </div>
    <div className="opening-age-filter" ref={ageFilterRef}>
      <button className={`opening-age-trigger ${ageOpen ? 'open' : ''}`} onClick={() => setAgeOpen(value => !value)}>
        <span><small>开业年限</small><b>{openingAgeSummary(openingAgeFilter)}</b></span><ChevronDown/>
      </button>
      {ageOpen && <div className="opening-age-popover">
        <div className="opening-age-quick"><span>快捷选择</span><div>
          <button onClick={() => selectQuickAge('all')}>全部</button><button onClick={() => selectQuickAge('0-1')}>0-1年</button>
          <button onClick={() => selectQuickAge('2-5')}>2-5年</button><button onClick={() => selectQuickAge('5+')}>5年以上</button>
          <button onClick={() => selectQuickAge('10+')}>10年以上</button><button onClick={() => selectQuickAge('custom')}>自定义</button>
        </div></div>
        <div className="opening-age-selection"><span>年限多选</span><small>当前：{openingAgeSummary(draftOpeningAges)}</small></div>
        <div className="opening-age-options">{openingAgeOptions.map(option => <label className={draftOpeningAges.includes(option) ? 'active' : ''} key={option}>
          <input type="checkbox" checked={draftOpeningAges.includes(option)} onChange={() => toggleOpeningAge(option)}/><i>{draftOpeningAges.includes(option) && <Check/>}</i><span>{option}</span>
        </label>)}</div>
        <div className="opening-age-footer"><button className="clear" onClick={() => { setDraftOpeningAges([]); onOpeningAgeChange([]); setAgeOpen(false) }}>清空</button>
          <button className="confirm" onClick={() => { onOpeningAgeChange(draftOpeningAges); setAgeOpen(false) }}>确定</button></div>
      </div>}
    </div>
    <div className="store-specialty-cards">{cards.map(([label, number, unit]) => <article key={String(label)}><small>{label}</small><b>{number}<em>{unit}</em></b></article>)}</div>
    {(value !== '全部门店' || renovationFilter !== '全部') && <div className="store-specialty-channel"><span>渠道结构</span><b>各OTA {fmtPct(selectedMix.total ? selectedMix.ota / selectedMix.total : 0)}</b><b>线上直销 {fmtPct(selectedMix.total ? selectedMix.online / selectedMix.total : 0)}</b><b>线下直销 {fmtPct(selectedMix.total ? selectedMix.offline / selectedMix.total : 0)}</b></div>}
    {renovationPerspective && <div className="renovation-type-compare"><div><b>改造类型对比</b><span>均按当前在营门店加权汇总</span></div>{renovationTypes.map(type => {
      const typeRows = rows.filter(row => matchesStoreType(row, value) && row.isRenovated && (row.renovationType || '改造类型未标记') === type)
      const typeMetric = aggregate(typeRows)
      return <article key={type}><strong>{type}</strong><span>{typeRows.length} 家</span><span>预订率 {fmtPct(typeMetric.bookingRate)}</span><span>ADR {fmtMoney(typeMetric.adr)}</span><span>理论RP {fmtMoney(typeMetric.rp)}</span><span>0预定 {typeRows.filter(row => row.bookedRooms === 0).length} 家</span></article>
    })}</div>}
  </section>
}
