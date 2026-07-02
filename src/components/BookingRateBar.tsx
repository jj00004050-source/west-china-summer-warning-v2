import { fmtPct } from '../utils/formatter'

export default function BookingRateBar({ value }: { value: number | null | undefined }) {
  const width = Math.max(0, Math.min(100, (value || 0) * 100))
  const tone = width < 20 ? 'low' : width < 40 ? 'watch' : width < 70 ? 'normal' : 'high'
  return <div className="booking-rate-bar"><span>{fmtPct(value)}</span><i><em className={tone} style={{ width: `${width}%` }}/></i></div>
}
