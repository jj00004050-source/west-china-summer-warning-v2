import { Activity, BedDouble, CircleDollarSign, WalletCards } from 'lucide-react'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'

type Metric = {
  bookingRate: number | null
  lastOcc: number | null
  rp: number | null
  lastRp: number | null
  recovery: number | null
  adr: number | null
  lastAdr: number | null
  sameLeadBookingRate?: number | null
  sameLeadAdr?: number | null
  sameLeadRp?: number | null
}

const diff = (a: number | null, b: number | null) => a != null && b != null ? a - b : null
const trend = (value: number | null, money = false) => value == null ? '--' : money ? `${value >= 0 ? '+' : ''}${fmtMoney(value)}` : fmtPp(value)

export default function KpiGroupCards({ current, previous, hasPrevious, comparisonLabel, comparisonTooltip, fullCount, zeroCount, prevFullCount, prevZeroCount }: {
  current: Metric
  previous: Metric
  hasPrevious: boolean
  comparisonLabel: string
  comparisonTooltip: string
  fullCount: number
  zeroCount: number
  prevFullCount: number
  prevZeroCount: number
}) {
  const bookingDelta = hasPrevious ? diff(current.bookingRate, previous.bookingRate) : null
  const rpDelta = hasPrevious ? diff(current.rp, previous.rp) : null
  const adrDelta = hasPrevious ? diff(current.adr, previous.adr) : null
  const groups = [
    {
      key: 'booking', title: '预订率', icon: Activity, value: fmtPct(current.bookingRate),
      delta: trend(bookingDelta), bad: (bookingDelta ?? 0) < 0,
      sameLead: trend(diff(current.bookingRate, current.sameLeadBookingRate ?? null)),
      items: [['同期OCC', fmtPct(current.lastOcc)], ['OCC缺口', fmtPp(diff(current.bookingRate, current.lastOcc))]],
    },
    {
      key: 'rp', title: '理论RP', icon: CircleDollarSign, value: fmtMoney(current.rp),
      delta: trend(rpDelta, true), bad: (rpDelta ?? 0) < 0,
      sameLead: trend(diff(current.rp, current.sameLeadRp ?? null), true),
      items: [['同期RP', fmtMoney(current.lastRp)], ['RP缺口', fmtMoney(diff(current.rp, current.lastRp))], ['RP恢复率', fmtPct(current.recovery)]],
    },
    {
      key: 'adr', title: '在手ADR', icon: WalletCards, value: fmtMoney(current.adr),
      delta: trend(adrDelta, true), bad: (adrDelta ?? 0) < 0,
      sameLead: trend(diff(current.adr, current.sameLeadAdr ?? null), true),
      items: [['同期ADR', fmtMoney(current.lastAdr)], ['ADR差异', fmtMoney(diff(current.adr, current.lastAdr))]],
    },
  ]
  return <section className="kpi-groups">
    {groups.map(g => <article className={`kpi-group ${g.key}`} key={g.key}>
      <div className="kpi-group-top"><span className="kpi-icon"><g.icon/></span><div><small>{g.title}</small><strong>{g.value}</strong></div><div className="kpi-comparison-lines"><em title={comparisonTooltip} className={g.bad ? 'down' : 'up'}>{hasPrevious ? `环比 ${g.delta}` : '环比 --'}</em><small className={g.sameLead.startsWith('-') ? 'down' : 'up'}>同提前期 {g.sameLead}</small></div></div>
      <div className="kpi-submetrics">{g.items.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
      <svg className="kpi-spark" viewBox="0 0 220 28" preserveAspectRatio="none"><path d="M0 22 C22 24 25 9 47 16 S78 23 93 12 S119 6 133 15 S162 24 180 11 S205 13 220 5"/></svg>
    </article>)}
    <article className="kpi-group warning">
      <div className="kpi-group-top"><span className="kpi-icon"><BedDouble/></span><div><small>预警门店</small><strong>{fullCount + zeroCount}<i>家</i></strong></div><em>按门店去重统计</em></div>
      <div className="warning-metrics">
        <span><small>满房数</small><b>{fullCount}</b><em title={comparisonTooltip}>{hasPrevious ? `${comparisonLabel} ${fullCount - prevFullCount >= 0 ? '+' : ''}${fullCount - prevFullCount}` : `${comparisonLabel} --`}</em></span>
        <span><small>0预定数</small><b>{zeroCount}</b><em title={comparisonTooltip}>{hasPrevious ? `${comparisonLabel} ${zeroCount - prevZeroCount >= 0 ? '+' : ''}${zeroCount - prevZeroCount}` : `${comparisonLabel} --`}</em></span>
      </div>
    </article>
  </section>
}
