import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { utils, writeFile } from 'xlsx'
import type { ComparisonRow, MetricRow } from '../types/data'
import { aggregate, aggregateBy } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import BookingRateBar from './BookingRateBar'
import MetricTrendLines from './MetricTrendLines'

type SortKey = 'name' | 'rows' | 'availableRooms' | 'bookingRate' | 'lastOcc' | 'adr' | 'rp' | 'lastRp' | 'highCount'

export default function AreaRevenueZoneMatrix({ rows, comparisonRows, onRevenueZone }: { rows: MetricRow[]; comparisonRows: ComparisonRow[]; onRevenueZone: (name: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>('bookingRate')
  const [asc, setAsc] = useState(false)
  const areas = useMemo(() => aggregateBy(rows, 'area', comparisonRows).sort((a, b) => {
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
  const cells = (m: ReturnType<typeof aggregate>, count: number) => <>
    <td>{count}</td><td>{m.availableRooms.toLocaleString()}</td><td>{m.bookedRooms.toLocaleString()}</td><td><BookingRateBar value={m.bookingRate}/><MetricTrendLines kind="rate" change={m.bookingRateChange} sameLeadGap={m.sameLeadBookingRateGap}/></td><td>{fmtPct(m.lastOcc)}</td>
    <td className={(m.bookingRate || 0) < (m.lastOcc || 0) ? 'negative' : 'positive'}>{fmtPp(m.bookingRate != null && m.lastOcc != null ? m.bookingRate - m.lastOcc : null)}</td>
    <td>{fmtMoney(m.adr)}<MetricTrendLines kind="money" change={m.adrChange} sameLeadGap={m.sameLeadAdrGap}/></td><td>{fmtMoney(m.rp)}<MetricTrendLines kind="money" change={m.rpChange} sameLeadGap={m.sameLeadRpGap}/></td><td>{fmtMoney(m.lastRp)}</td>
    <td className={(m.rp || 0) < (m.lastRp || 0) ? 'negative' : 'positive'}>{fmtMoney(m.rp != null && m.lastRp != null ? m.rp - m.lastRp : null)}</td><td>{m.highCount}</td>
  </>
  const exportRows = () => {
    const data = areas.flatMap(area => {
      const parent = { 层级: '片区', 片区: area.name, 收益管理商圈: '', 门店数: area.rows.length, 可售房: area.availableRooms, 预订房间数: area.bookedRooms, 预订率: area.bookingRate, 预订率环比: area.bookingRateChange, 同期同提前期预订率: area.sameLeadBookingRate, 同提前期预订率差异: area.sameLeadBookingRateGap, 同期OCC: area.lastOcc, 在手ADR: area.adr, 在手ADR环比: area.adrChange, 同期同提前期在手ADR: area.sameLeadAdr, 同提前期ADR差异: area.sameLeadAdrGap, 理论RP: area.rp, 理论RP环比: area.rpChange, 同期同提前期理论RP: area.sameLeadRp, 同提前期理论RP差异: area.sameLeadRpGap, 同期RP: area.lastRp, 高风险: area.highCount }
      const zones = aggregateBy(area.rows, 'revenueZone', comparisonRows.filter(r => r.area === area.name)).map(zone => ({ 层级: '收益管理商圈', 片区: area.name, 收益管理商圈: zone.name, 门店数: zone.rows.length, 可售房: zone.availableRooms, 预订房间数: zone.bookedRooms, 预订率: zone.bookingRate, 预订率环比: zone.bookingRateChange, 同期同提前期预订率: zone.sameLeadBookingRate, 同提前期预订率差异: zone.sameLeadBookingRateGap, 同期OCC: zone.lastOcc, 在手ADR: zone.adr, 在手ADR环比: zone.adrChange, 同期同提前期在手ADR: zone.sameLeadAdr, 同提前期ADR差异: zone.sameLeadAdrGap, 理论RP: zone.rp, 理论RP环比: zone.rpChange, 同期同提前期理论RP: zone.sameLeadRp, 同提前期理论RP差异: zone.sameLeadRpGap, 同期RP: zone.lastRp, 高风险: zone.highCount }))
      return [parent, ...zones]
    })
    const wb = utils.book_new(); utils.book_append_sheet(wb, utils.json_to_sheet(data), '片区商圈矩阵'); writeFile(wb, '片区收益管理商圈矩阵.xlsx')
  }
  return <section className="light-card province-city-matrix">
    <div className="light-card-head"><div><h2>片区 / 收益管理商圈经营矩阵</h2><p>点击片区展开收益管理商圈 · 点击商圈联动门店 · 点击表头排序</p></div><button className="table-export" onClick={exportRows}><Download/>导出矩阵</button></div>
    <div className="province-table matrix-scroll"><table><thead><tr>{th('name','片区 / 收益管理商圈')}{th('rows','门店数')}{th('availableRooms','可售房')}<th>预订房间数</th>{th('bookingRate','预订率')}{th('lastOcc','同期OCC')}<th>OCC缺口</th>{th('adr','在手ADR')}{th('rp','理论RP')}{th('lastRp','同期RP')}<th>RP缺口</th>{th('highCount','高风险')}</tr></thead>
      <tbody>{areas.flatMap(area => {
        const open = expanded.has(area.name)
        const zones = aggregateBy(area.rows, 'revenueZone', comparisonRows.filter(r => r.area === area.name))
        const parentRow = <tr className="matrix-province" key={`a-${area.name}`} onClick={() => toggle(area.name)}><td><button className="matrix-toggle">{open ? <ChevronDown/> : <ChevronRight/>}<b>{area.name}</b><em>{zones.length}个收益管理商圈</em></button></td>{cells(area, area.rows.length)}</tr>
        if (!open) return [parentRow]
        return [parentRow, ...zones.sort((a, b) => (b.bookingRate || 0) - (a.bookingRate || 0)).map(zone => <tr className="matrix-city" key={`z-${area.name}-${zone.name}`} onClick={() => onRevenueZone(zone.name)}><td><span><i/> {zone.name}</span></td>{cells(zone, zone.rows.length)}</tr>)]
      })}<tr className="total"><td><b>华西合计</b></td>{cells(total, rows.length)}</tr></tbody></table></div>
  </section>
}
