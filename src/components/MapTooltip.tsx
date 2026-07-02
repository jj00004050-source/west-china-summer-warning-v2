import type { MetricRow } from '../types/data'
import { aggregate } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'

export default function MapTooltip({ name, rows, day, batch }: { name: string; rows: MetricRow[]; day: string; batch: string }) {
  const m = aggregate(rows)
  const rateGap = rows.length ? rows.reduce((a, r) => a + (r.bookingRateGap || 0), 0) / rows.length : null
  return <div className="map-tooltip">
    <div className="tip-title"><b>{name}</b><span>{day} · {batch}</span></div>
    <div className="tip-grid">
      <span>门店数<strong>{rows.length}家</strong></span><span>预订率<strong>{fmtPct(m.bookingRate)}</strong></span>
      <span>同期OCC<strong>{fmtPct(m.lastOcc)}</strong></span><span>OCC缺口<strong>{fmtPp(rateGap)}</strong></span>
      <span>理论RP<strong>{fmtMoney(m.rp)}</strong></span><span>同期RP<strong>{fmtMoney(m.lastRp)}</strong></span>
      <span>RP缺口<strong className={(m.rp || 0) < (m.lastRp || 0) ? 'bad' : 'good'}>{m.rp != null && m.lastRp != null ? fmtMoney(m.rp - m.lastRp) : '--'}</strong></span>
      <span>在手ADR<strong>{fmtMoney(m.adr)}</strong></span><span>同期ADR<strong>{fmtMoney(m.lastAdr)}</strong></span>
      <span>ADR差异<strong>{m.adr != null && m.lastAdr != null ? fmtMoney(m.adr - m.lastAdr) : '--'}</strong></span>
    </div>
    <div className="tip-footer">满房 <b>{rows.filter(r => (r.bookingRate || 0) >= 1).length}</b> 家 · 0预定 <b>{rows.filter(r => r.bookedRooms === 0).length}</b> 家</div>
  </div>
}
