import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { utils, writeFile } from 'xlsx'
import type { ComparisonRow, MetricRow, SnapshotRecord } from '../types/data'
import { aggregate, aggregateBy } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import BookingRateBar from './BookingRateBar'
import MiniChannelDonut from './MiniChannelDonut'
import ChannelColorLegend from './ChannelColorLegend'
import MetricTrendLines from './MetricTrendLines'

type SortKey = 'name' | 'rows' | 'availableRooms' | 'bookingRate' | 'lastOcc' | 'adr' | 'rp' | 'lastRp' | 'highCount'

export default function ProvinceCityMatrix({ rows, comparisonRows, channelRows, onCity }: { rows: MetricRow[]; comparisonRows: ComparisonRow[]; channelRows: SnapshotRecord[]; onCity: (city: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>('bookingRate')
  const [asc, setAsc] = useState(false)
  const provinces = useMemo(() => aggregateBy(rows, 'province', comparisonRows).sort((a, b) => {
    const av = sort === 'rows' ? a.rows.length : a[sort]
    const bv = sort === 'rows' ? b.rows.length : b[sort]
    const result = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av || 0) - Number(bv || 0)
    return asc ? result : -result
  }), [rows, comparisonRows, sort, asc])
  const total = aggregate(rows, comparisonRows)
  const toggle = (name: string) => setExpanded(old => {
    const next = new Set(old)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const doSort = (key: SortKey) => { if (key === sort) setAsc(!asc); else { setSort(key); setAsc(false) } }
  const th = (key: SortKey, label: string) => <th onClick={() => doSort(key)}>{label}{sort === key ? (asc ? ' ↑' : ' ↓') : ''}</th>
  const cells = (m: ReturnType<typeof aggregate>, count: number, itemRows: MetricRow[]) => <>
    <td>{count}</td><td>{m.availableRooms.toLocaleString()}</td><td><BookingRateBar value={m.bookingRate}/><MetricTrendLines kind="rate" change={m.bookingRateChange} sameLeadGap={m.sameLeadBookingRateGap}/></td><td>{fmtPct(m.lastOcc)}</td>
    <td className={(m.bookingRate || 0) < (m.lastOcc || 0) ? 'negative' : 'positive'}>{fmtPp(m.bookingRate != null && m.lastOcc != null ? m.bookingRate - m.lastOcc : null)}</td>
    <td>{fmtMoney(m.adr)}<MetricTrendLines kind="money" change={m.adrChange} sameLeadGap={m.sameLeadAdrGap}/></td><td>{fmtMoney(m.rp)}<MetricTrendLines kind="money" change={m.rpChange} sameLeadGap={m.sameLeadRpGap}/></td><td>{fmtMoney(m.lastRp)}</td>
    <td className={(m.rp || 0) < (m.lastRp || 0) ? 'negative' : 'positive'}>{fmtMoney(m.rp != null && m.lastRp != null ? m.rp - m.lastRp : null)}</td><td>{m.highCount}</td><td><MiniChannelDonut rows={channelRows} hotelIds={new Set(itemRows.map(r => r.whCode))}/></td>
  </>
  const exportRows = () => {
    const data = provinces.flatMap(p => {
      const province = { 层级: '省区', 省区: p.name, 城市: '', 门店数: p.rows.length, 可售房: p.availableRooms, 预订房间数: p.bookedRooms, 预订率: p.bookingRate, 预订率环比: p.bookingRateChange, 同期同提前期预订率: p.sameLeadBookingRate, 同提前期预订率差异: p.sameLeadBookingRateGap, 同期OCC: p.lastOcc, 在手ADR: p.adr, 在手ADR环比: p.adrChange, 同期同提前期在手ADR: p.sameLeadAdr, 同提前期ADR差异: p.sameLeadAdrGap, 理论RP: p.rp, 理论RP环比: p.rpChange, 同期同提前期理论RP: p.sameLeadRp, 同提前期理论RP差异: p.sameLeadRpGap, 同期RP: p.lastRp, 高风险: p.highCount }
      const cities = aggregateBy(p.rows, 'city', comparisonRows.filter(r => r.province === p.name)).map(c => ({ 层级: '城市', 省区: p.name, 城市: c.name, 门店数: c.rows.length, 可售房: c.availableRooms, 预订房间数: c.bookedRooms, 预订率: c.bookingRate, 预订率环比: c.bookingRateChange, 同期同提前期预订率: c.sameLeadBookingRate, 同提前期预订率差异: c.sameLeadBookingRateGap, 同期OCC: c.lastOcc, 在手ADR: c.adr, 在手ADR环比: c.adrChange, 同期同提前期在手ADR: c.sameLeadAdr, 同提前期ADR差异: c.sameLeadAdrGap, 理论RP: c.rp, 理论RP环比: c.rpChange, 同期同提前期理论RP: c.sameLeadRp, 同提前期理论RP差异: c.sameLeadRpGap, 同期RP: c.lastRp, 高风险: c.highCount }))
      return [province, ...cities]
    })
    const wb = utils.book_new(); utils.book_append_sheet(wb, utils.json_to_sheet(data), '省区城市矩阵'); writeFile(wb, '省区城市经营矩阵.xlsx')
  }
  return <section className="light-card province-city-matrix">
    <div className="light-card-head"><div><h2>省区 / 城市经营矩阵</h2><p>点击省区展开城市 · 点击城市联动全局筛选 · 点击表头排序</p></div><div className="matrix-head-actions"><ChannelColorLegend/><button className="table-export" onClick={exportRows}><Download/>导出矩阵</button></div></div>
    <div className="province-table matrix-scroll"><table><thead><tr>{th('name','省区 / 城市')}{th('rows','门店数')}{th('availableRooms','可售房')}{th('bookingRate','预订率')}{th('lastOcc','同期OCC')}<th>OCC缺口</th>{th('adr','在手ADR')}{th('rp','理论RP')}{th('lastRp','同期RP')}<th>RP缺口</th>{th('highCount','高风险')}<th>渠道占比</th></tr></thead>
      <tbody>{provinces.flatMap(p => {
        const open = expanded.has(p.name)
        const provinceRow = <tr className="matrix-province" key={`p-${p.name}`} onClick={() => toggle(p.name)}><td><button className="matrix-toggle">{open ? <ChevronDown/> : <ChevronRight/>}<b>{p.name}</b><em>{aggregateBy(p.rows, 'city').length}个城市</em></button></td>{cells(p, p.rows.length, p.rows)}</tr>
        if (!open) return [provinceRow]
        const cities = aggregateBy(p.rows, 'city', comparisonRows.filter(r => r.province === p.name)).sort((a, b) => (b.bookingRate || 0) - (a.bookingRate || 0))
        return [provinceRow, ...cities.map(c => <tr className="matrix-city" key={`c-${p.name}-${c.name}`} onClick={() => onCity(c.name)}><td><span><i/> {c.name}</span></td>{cells(c, c.rows.length, c.rows)}</tr>)]
      })}<tr className="total"><td><b>华西合计</b></td>{cells(total, rows.length, rows)}</tr></tbody></table></div>
  </section>
}
