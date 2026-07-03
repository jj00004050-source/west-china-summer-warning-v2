import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { ComparisonRow, MetricRow, SameLeadComparisonRow, SnapshotRecord } from '../types/data'
import { aggregateBy, aggregate } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import BookingRateBar from './BookingRateBar'
import MiniChannelDonut from './MiniChannelDonut'
import ChannelColorLegend from './ChannelColorLegend'
import MetricTrendLines from './MetricTrendLines'

type SortKey = 'name' | 'rows' | 'bookingRate' | 'lastOcc' | 'adr' | 'rp' | 'lastRp' | 'highCount'

export default function ProvinceOverview({ rows, comparisonRows, sameLeadRows, channelRows, countMissingAsZero, onSelect }: { rows: MetricRow[]; comparisonRows: ComparisonRow[]; sameLeadRows: SameLeadComparisonRow[]; channelRows: SnapshotRecord[]; countMissingAsZero: boolean; onSelect: (v: string) => void }) {
  const [sort, setSort] = useState<SortKey>('bookingRate')
  const [asc, setAsc] = useState(false)
  const items = useMemo(() => aggregateBy(rows, 'province', comparisonRows, sameLeadRows).sort((a, b) => {
    const av = sort === 'rows' ? a.rows.length : sort === 'highCount' ? a.rows.filter(r => (r.bookingRate || 0) >= 1).length : a[sort]
    const bv = sort === 'rows' ? b.rows.length : sort === 'highCount' ? b.rows.filter(r => (r.bookingRate || 0) >= 1).length : b[sort]
    const result = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av || 0) - Number(bv || 0)
    return asc ? result : -result
  }), [rows, comparisonRows, sameLeadRows, sort, asc])
  const total = aggregate(rows, comparisonRows, sameLeadRows)
  const doSort = (key: SortKey) => { if (key === sort) setAsc(!asc); else { setSort(key); setAsc(false) } }
  const th = (key: SortKey, label: string) => <th onClick={() => doSort(key)}>{label}{sort === key ? (asc ? ' ↑' : ' ↓') : ''}</th>
  const zeroCount = (itemRows: MetricRow[]) => itemRows.filter(r => r.bookedRooms === 0 && (countMissingAsZero || !r.tags.includes('缺失预订数据'))).length
  const line = (name: string, m: ReturnType<typeof aggregate>, itemRows: MetricRow[], totalRow = false) => <tr key={name} className={totalRow ? 'total' : ''} onClick={() => !totalRow && onSelect(name)}>
    <td><b>{name}</b></td><td>{itemRows.length}</td><td><BookingRateBar value={m.bookingRate}/><MetricTrendLines kind="rate" change={m.bookingRateChange} sameLeadGap={m.sameLeadBookingRateGap}/></td><td>{fmtPct(m.lastOcc)}</td><td className={(m.bookingRate || 0) - (m.lastOcc || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(m.bookingRate != null && m.lastOcc != null ? m.bookingRate - m.lastOcc : null)}</td><td>{fmtMoney(m.adr)}<MetricTrendLines kind="money" change={m.adrChange} sameLeadGap={m.sameLeadAdrGap}/></td><td>{fmtMoney(m.rp)}<MetricTrendLines kind="money" change={m.rpChange} sameLeadGap={m.sameLeadRpGap}/></td><td>{fmtMoney(m.lastRp)}</td><td className={(m.rp || 0) - (m.lastRp || 0) < 0 ? 'negative' : 'positive'}>{fmtMoney(m.rp != null && m.lastRp != null ? m.rp - m.lastRp : null)}</td><td>{itemRows.filter(r => (r.bookingRate || 0) >= 1).length}</td><td>{zeroCount(itemRows)}</td><td><MiniChannelDonut rows={channelRows} hotelIds={new Set(itemRows.map(r => r.whCode))}/></td>
  </tr>
  const exportRows = async () => {
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(items.map(x => ({ 酒店省区: x.name, 当前在营门店数: x.rows.length, 预订率: x.bookingRate, 预订率环比: x.bookingRateChange, 同期同提前期预订率: x.sameLeadBookingRate, 同提前期预订率差异: x.sameLeadBookingRateGap, 同期OCC: x.lastOcc, 在手ADR: x.adr, 在手ADR环比: x.adrChange, 同期同提前期在手ADR: x.sameLeadAdr, 同提前期ADR差异: x.sameLeadAdrGap, 理论RP: x.rp, 理论RP环比: x.rpChange, 同期同提前期理论RP: x.sameLeadRp, 同提前期理论RP差异: x.sameLeadRpGap, 同期RP: x.lastRp, 满房数: x.rows.filter(r => (r.bookingRate || 0) >= 1).length, 零预定数: zeroCount(x.rows) })))
    const wb = utils.book_new(); utils.book_append_sheet(wb, ws, '省区概览'); writeFile(wb, '省区数据概览.xlsx')
  }
  return <section className="light-card province-overview"><div className="light-card-head"><div><h2>省区数据概览</h2><p>当前门店数仅统计在营门店；点击列头排序、点击行下钻</p></div><div className="matrix-head-actions"><ChannelColorLegend/><button className="table-export" onClick={exportRows}><Download/>导出当前结果</button></div></div>
    <div className="province-table"><table><thead><tr>{th('name','酒店省区')}{th('rows','门店数')}{th('bookingRate','预订率')}{th('lastOcc','同期OCC')}<th>OCC缺口</th>{th('adr','在手ADR')}{th('rp','理论RP')}{th('lastRp','同期RP')}<th>RP缺口</th>{th('highCount','满房数')}<th>0预定数</th><th>渠道占比</th></tr></thead><tbody>{items.map(x => line(x.name, x, x.rows))}{line('总计', total, rows, true)}</tbody></table></div>
  </section>
}
