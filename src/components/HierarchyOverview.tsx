import { useMemo, useState } from 'react'
import { utils, writeFile } from 'xlsx'
import { Download } from 'lucide-react'
import type { MetricRow } from '../types/data'
import { aggregate, aggregateBy } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import BookingRateBar from './BookingRateBar'

type SortKey = 'name' | 'rows' | 'availableRooms' | 'bookingRate' | 'lastOcc' | 'adr' | 'rp' | 'lastRp' | 'highCount'

export default function HierarchyOverview({ rows, level, title, onSelect }: {
  rows: MetricRow[]
  level: 'area' | 'city' | 'revenueZone'
  title: string
  onSelect: (name: string) => void
}) {
  const [sort, setSort] = useState<SortKey>('bookingRate')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const items = useMemo(() => aggregateBy(rows, level).sort((a, b) => {
    const av = sort === 'rows' ? a.rows.length : a[sort]
    const bv = sort === 'rows' ? b.rows.length : b[sort]
    const result = typeof av === 'string' ? av.localeCompare(String(bv)) : (Number(av || 0) - Number(bv || 0))
    return asc ? result : -result
  }), [rows, level, sort, asc])
  const perPage = 10
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const shown = items.slice((page - 1) * perPage, page * perPage)
  const total = aggregate(rows)
  const doSort = (key: SortKey) => { if (key === sort) setAsc(!asc); else { setSort(key); setAsc(false) }; setPage(1) }
  const th = (key: SortKey, label: string) => <th onClick={() => doSort(key)}>{label}{sort === key ? (asc ? ' ↑' : ' ↓') : ''}</th>
  const row = (name: string, m: ReturnType<typeof aggregate>, count: number, totalRow = false) => <tr key={name} className={totalRow ? 'total' : ''} onClick={() => !totalRow && onSelect(name)}>
    <td><b>{name}</b></td><td>{count}</td><td>{m.availableRooms}</td><td><BookingRateBar value={m.bookingRate}/></td><td>{fmtPct(m.lastOcc)}</td>
    <td className={(m.bookingRate || 0) < (m.lastOcc || 0) ? 'negative' : 'positive'}>{fmtPp(m.bookingRate != null && m.lastOcc != null ? m.bookingRate - m.lastOcc : null)}</td>
    <td>{fmtMoney(m.adr)}</td><td>{fmtMoney(m.rp)}</td><td>{fmtMoney(m.lastRp)}</td>
    <td className={(m.rp || 0) < (m.lastRp || 0) ? 'negative' : 'positive'}>{fmtMoney(m.rp != null && m.lastRp != null ? m.rp - m.lastRp : null)}</td>
    <td>{m.highCount}</td>
  </tr>
  const exportRows = () => {
    const ws = utils.json_to_sheet(items.map(x => ({ 层级名称: x.name, 当前在营门店数: x.rows.length, 可售房: x.availableRooms, 预订率: x.bookingRate, 同期OCC: x.lastOcc, 在手ADR: x.adr, 理论RP: x.rp, 同期RP: x.lastRp, 高风险: x.highCount })))
    const wb = utils.book_new(); utils.book_append_sheet(wb, ws, '当前筛选结果'); writeFile(wb, `${title}.xlsx`)
  }
  return <section className="light-card hierarchy-view">
    <div className="light-card-head"><div><h2>{title}</h2><p>点击表头升降序 · 点击行下钻并联动筛选</p></div><button className="table-export" onClick={exportRows}><Download/>导出当前结果</button></div>
    <div className="province-table"><table><thead><tr>{th('name','层级名称')}{th('rows','门店数')}{th('availableRooms','可售房')}{th('bookingRate','预订率')}{th('lastOcc','同期OCC')}<th>OCC缺口</th>{th('adr','在手ADR')}{th('rp','理论RP')}{th('lastRp','同期RP')}<th>RP缺口</th>{th('highCount','高风险')}</tr></thead>
      <tbody>{shown.map(x => row(x.name, x, x.rows.length))}{page === pages && row('总计', total, rows.length, true)}</tbody></table></div>
    <div className="pagination"><span>第 {page}/{pages} 页 · 共 {items.length} 条</span><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>
  </section>
}
