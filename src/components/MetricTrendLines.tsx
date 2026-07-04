import { fmtMoney, fmtPp } from '../utils/formatter'

const signedMoney = (value: number | null) => value == null ? '--' : `${value > 0 ? '+' : ''}${fmtMoney(value)}`

export default function MetricTrendLines({ kind, change, sameLeadGap, sameLeadLabel = '同期开盘' }: {
  kind: 'rate' | 'money'
  change: number | null
  sameLeadGap: number | null
  sameLeadLabel?: string
}) {
  const format = (value: number | null) => kind === 'rate' ? fmtPp(value) : signedMoney(value)
  return <div className="metric-trend-lines">
    <small className={(change || 0) < 0 ? 'negative' : 'positive'}>环比 {format(change)}</small>
    <small className={(sameLeadGap || 0) < 0 ? 'negative' : 'positive'}>{sameLeadLabel} {format(sameLeadGap)}</small>
  </div>
}
