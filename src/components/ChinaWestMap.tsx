import { useEffect, useMemo, useState } from 'react'
import * as echarts from 'echarts'
import ReactECharts from 'echarts-for-react'
import { ChevronLeft, MapPinned } from 'lucide-react'
import type { ComparisonRow, MetricRow } from '../types/data'
import { aggregate } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'

type GeoFeature = { properties: { name: string; adcode: number }; geometry: unknown; type: 'Feature' }
type GeoJSON = { type: 'FeatureCollection'; features: GeoFeature[] }
type Drill = { code: number; name: string; region: string }

const WEST: Record<string, { code: number; region: string }> = {
  '广西壮族自治区': { code: 450000, region: '广西' }, '重庆市': { code: 500000, region: '重庆' },
  '四川省': { code: 510000, region: '川藏' }, '西藏自治区': { code: 540000, region: '川藏' },
  '贵州省': { code: 520000, region: '贵州' }, '云南省': { code: 530000, region: '云南' },
  '陕西省': { code: 610000, region: '陕西' }, '甘肃省': { code: 620000, region: '甘青宁' },
  '青海省': { code: 630000, region: '甘青宁' }, '宁夏回族自治区': { code: 640000, region: '甘青宁' },
  '新疆维吾尔自治区': { code: 650000, region: '新疆' },
}
const TIBET_CITIES = ['拉萨','日喀则','昌都','林芝','山南','那曲','阿里']
const QINGHAI_CITIES = ['西宁','海东','海北','海南藏族','海西','黄南','果洛','玉树']
const NINGXIA_CITIES = ['银川','石嘴山','吴忠','固原','中卫']
const INNER_MONGOLIA_CITIES = ['呼和浩特','包头','乌海','赤峰','通辽','鄂尔多斯','呼伦贝尔','巴彦淖尔','乌兰察布','兴安盟','锡林郭勒','阿拉善']
const cityIn = (city: string, names: string[]) => names.some(name => city.includes(name))
const administrativeProvince = (row: Pick<MetricRow, 'province' | 'city'> | Pick<ComparisonRow, 'province' | 'city'>) => {
  const province = row.province
  if (province.includes('川藏')) return cityIn(row.city, TIBET_CITIES) ? '西藏自治区' : '四川省'
  if (province.includes('甘青宁')) {
    if (cityIn(row.city, QINGHAI_CITIES)) return '青海省'
    if (cityIn(row.city, NINGXIA_CITIES)) return '宁夏回族自治区'
    if (cityIn(row.city, INNER_MONGOLIA_CITIES)) return '内蒙古自治区'
    return '甘肃省'
  }
  if (province.includes('广西')) return '广西壮族自治区'
  if (province.includes('重庆')) return '重庆市'
  if (province.includes('贵州')) return '贵州省'
  if (province.includes('云南')) return '云南省'
  if (province.includes('陕西')) return '陕西省'
  if (province.includes('新疆')) return '新疆维吾尔自治区'
  return province
}
const clean = (v: string) => v.replace(/酒店|省区|壮族自治区|维吾尔自治区|回族自治区|自治区|自治州|地区|省|市|区/g, '')
const bookingColor = (value: number | null) => value == null ? '#E7EEF6'
  : value < .25 ? '#F8C7C5'
  : value < .35 ? '#FAD9B5'
  : value < .45 ? '#DCEBFF'
  : value < .55 ? '#A8CDFB'
  : value < .7 ? '#69A5F5'
  : '#2F6BFF'

export default function ChinaWestMap({ rows, comparisonRows, countMissingAsZero, selected, onSelect, onCity, onRevenueZone, day, batch, comparisonLabel }: {
  rows: MetricRow[]; comparisonRows: ComparisonRow[]; countMissingAsZero: boolean; selected: string; onSelect: (province: string) => void; onCity: (city: string) => void; onRevenueZone?: (zone: string) => void; day: string; batch: string; comparisonLabel: string
}) {
  const [drill, setDrill] = useState<Drill | null>(null)
  const [cityDrill, setCityDrill] = useState('')
  const [geo, setGeo] = useState<GeoJSON | null>(null)
  const [geoError, setGeoError] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (selected === '全部' && drill) { setDrill(null); setCityDrill('') }
  }, [selected])
  useEffect(() => {
    let active = true
    setLoading(true); setGeoError(false)
    const code = drill?.code || 100000
    fetch(`/geo/${code}_full.json`).then(r => r.json()).then((json: GeoJSON) => {
      if (!active) return
      const next = drill ? json : { ...json, features: json.features.filter(f => WEST[f.properties.name]) }
      const mapName = drill ? `province-${code}` : 'west-china-real'
      echarts.registerMap(mapName, next as never)
      setGeo(next); setLoading(false)
    }).catch(() => { if (active) { setGeo(null); setGeoError(true); setLoading(false) } })
    return () => { active = false }
  }, [drill?.code])
  const mapName = drill ? `province-${drill.code}` : 'west-china-real'
  const mapData = useMemo(() => {
    const raw = (geo?.features || []).map(feature => {
    const name = feature.properties.name
    const sourceMatched = drill
      ? rows.filter(r => clean(r.city) === clean(name))
      : rows.filter(r => administrativeProvince(r) === name)
    const comparisonMatched = drill
      ? comparisonRows.filter(r => clean(r.city) === clean(name))
      : comparisonRows.filter(r => administrativeProvince(r) === name)
    const matched = [...new Map(sourceMatched.map(r => [r.whCode, r])).values()]
    const matchedComparison = [...new Map(comparisonMatched.map(r => [r.whCode, r])).values()]
    const m = aggregate(matched, matchedComparison)
    const occGap = m.bookingRate != null && m.lastOcc != null ? m.bookingRate - m.lastOcc : null
    const rpGap = m.rp != null && m.lastRp != null ? m.rp - m.lastRp : null
    const value = (m.bookingRate ?? 0) * 100
    return {
      name, value, rows: matched.length, bookingRate: m.bookingRate, lastOcc: m.lastOcc, occGap, rp: m.rp, lastRp: m.lastRp, rpGap,
      adr: m.adr, lastAdr: m.lastAdr, fullCount: matched.filter(r => (r.bookingRate || 0) >= 1).length,
      zeroCount: matched.filter(r => r.bookedRooms === 0 && (countMissingAsZero || !r.tags.includes('缺失预订数据'))).length, bookingRateChange: m.bookingRateChange,
      itemStyle: { areaColor: matched.length ? bookingColor(m.bookingRate) : '#e7eef6', borderColor: clean(selected).includes(WEST[name]?.region || '__') ? '#176fdb' : '#8fb2d5', borderWidth: clean(selected).includes(WEST[name]?.region || '__') ? 2.5 : 1.2 },
    }
    })
    const rates = raw.filter(d => d.rows && d.bookingRate != null).map(d => d.bookingRate as number)
    const min = Math.min(...rates), max = Math.max(...rates)
    const palette = ['#F8C7C5','#FAD9B5','#DCEBFF','#A8CDFB','#69A5F5','#2F6BFF']
    return raw.map(d => {
      if (!d.rows || d.bookingRate == null || !Number.isFinite(min) || !Number.isFinite(max)) return d
      const ratio = max === min ? .5 : (d.bookingRate - min) / (max - min)
      const color = palette[Math.min(palette.length - 1, Math.floor(ratio * palette.length))]
      return { ...d, itemStyle: { ...d.itemStyle, areaColor: color } }
    })
  }, [geo, rows, comparisonRows, countMissingAsZero, selected, drill])
  const option = {
    animationDurationUpdate: 450,
    tooltip: {
      trigger: 'item', backgroundColor: 'rgba(255,255,255,.98)', borderColor: '#b8cce2', padding: 0,
      extraCssText: 'border-radius:12px;box-shadow:0 12px 32px rgba(31,45,61,.18);overflow:hidden;',
      textStyle: { color: '#29445f', fontSize: 11 },
      formatter: (p: { data?: typeof mapData[number]; name: string }) => {
        const d = p.data
        if (!d?.rows) return `<div style="padding:14px 16px"><b>${p.name}</b><div style="margin-top:8px;color:#94a3b8">当前范围暂无门店数据</div></div>`
        const cell = 'padding:7px 10px;border-top:1px solid #edf1f6;white-space:nowrap'
        const label = `${cell};color:#718096;background:#f8fafc`
        const value = `${cell};color:#1f3b5b;font-weight:700;text-align:right`
        return `<div style="width:340px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:#f3f7ff;border-bottom:1px solid #dfe8f3">
            <b style="font-size:14px;color:#1f3652">${p.name}</b><span style="color:#7a8da3">${day} · 跑批${batch}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr><td style="${label}">当前在营门店</td><td style="${value}" colspan="3">${d.rows} 家</td></tr>
            <tr><td style="${label}">预订率</td><td style="${value}">${fmtPct(d.bookingRate)}</td><td style="${label}">${comparisonLabel}</td><td style="${value}">${fmtPp(d.bookingRateChange)}</td></tr>
            <tr><td style="${label}">在手ADR</td><td style="${value}">${fmtMoney(d.adr)}</td><td style="${label}">同期ADR</td><td style="${value}">${fmtMoney(d.lastAdr)}</td></tr>
            <tr><td style="${label}">同期OCC</td><td style="${value}">${fmtPct(d.lastOcc)}</td><td style="${label}">OCC缺口</td><td style="${value}">${fmtPp(d.occGap)}</td></tr>
            <tr><td style="${label}">理论RP</td><td style="${value}">${fmtMoney(d.rp)}</td><td style="${label}">同期RP</td><td style="${value}">${fmtMoney(d.lastRp)}</td></tr>
            <tr><td style="${label}">RP缺口</td><td style="${value}">${fmtMoney(d.rpGap)}</td><td style="${label}">预警门店</td><td style="${value}">满房 ${d.fullCount} · 0预定 ${d.zeroCount}</td></tr>
          </table>
        </div>`
      },
    },
    series: [{
      type: 'map', map: mapName, roam: true, scaleLimit: { min: .8, max: 4 }, zoom: drill ? 1.05 : 1.12,
      data: mapData, selectedMode: false,
      label: { show: true, color: '#29445f', fontWeight: 650, fontSize: 10, textBorderColor: '#fff', textBorderWidth: 3, formatter: (p: { name: string }) => p.name },
      emphasis: { label: { color: '#123b67' }, itemStyle: { areaColor: '#d8ebff', borderColor: '#1476df', borderWidth: 2, shadowBlur: 12, shadowColor: '#4f96d866' } },
    }],
  }
  const fallbackLevel = cityDrill ? 'revenueZone' : 'city'
  const fallbackGroups = Object.entries(rows.reduce<Record<string, MetricRow[]>>((a, r) => {
    const name = fallbackLevel === 'city' ? r.city : r.revenueZone
    ;(a[name || (fallbackLevel === 'city' ? '未归属城市' : '未归属收益管理商圈')] ||= []).push(r)
    return a
  }, {})).sort((a, b) => (aggregate(b[1]).bookingRate || 0) - (aggregate(a[1]).bookingRate || 0))
  const fallback = <div className="map-fallback"><h3>{cityDrill ? `${cityDrill} · 收益管理商圈经营分布` : `${drill?.name || '华西'} · 城市经营分布`}</h3>{fallbackGroups.map(([name, rs]) => {
    const comparison = comparisonRows.filter(r => (fallbackLevel === 'city' ? r.city : r.revenueZone) === name)
    const x = aggregate(rs, comparison)
    return <button key={name} onClick={() => fallbackLevel === 'city' ? (onCity(name), setCityDrill(name)) : onRevenueZone?.(name)}><span><b>{name}</b><small>{rs.length} 家在营门店</small></span><i><em style={{ width: `${Math.min(100, (x.bookingRate || 0) * 100)}%` }}/></i><strong>{fmtPct(x.bookingRate)}<small>ADR {fmtMoney(x.adr)}</small></strong></button>
  })}</div>
  const click = (p: { name: string }) => {
    if (!drill) {
      const config = WEST[p.name]; if (!config) return
      const actual = rows.find(r => clean(r.province).includes(config.region))?.province || `${config.region}省区`
      onSelect(actual); setDrill({ code: config.code, name: p.name, region: config.region })
    } else {
      const actualCity = rows.find(r => clean(r.city) === clean(p.name))?.city
      if (actualCity) { onCity(actualCity); setCityDrill(actualCity) }
    }
  }
  return <section className="panel map-panel real-map-panel">
    <div className="panel-title"><div><span className="eyebrow">REAL ADMINISTRATIVE MAP</span><h2>{drill ? `${drill.name} · 城市经营分布` : '华西区域真实经营地图'}</h2></div><span className="map-color-basis">地图颜色：预订率</span></div>
    <div className="real-map-breadcrumb">{drill && <button onClick={() => { if (cityDrill) { setCityDrill(''); onCity('全部') } else { setDrill(null); onSelect('全部') } }}><ChevronLeft/>返回{cityDrill ? `${drill.name}城市层` : '华西总览'}</button>}<span><MapPinned/>{cityDrill ? '该层级采用收益管理商圈图表 + 明细' : drill ? '点击城市进入收益管理商圈 / 门店层' : '点击省份进入真实城市边界'}</span></div>
    <div className="real-map-chart">{cityDrill || geoError || (!loading && drill && !mapData.some(d => d.rows)) ? fallback : loading ? <div className="map-loading">正在加载真实行政区边界…</div> : <ReactECharts option={option} style={{ height: '100%', width: '100%' }} onEvents={{ click }}/>}</div>
    <div className="real-map-legend"><b>预订率色阶</b><span><i className="low"/>低</span><span><i className="mid"/>中</span><span><i className="high-booking"/>高</span></div>
  </section>
}
