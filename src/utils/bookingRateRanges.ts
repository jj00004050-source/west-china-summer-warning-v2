export type BookingRateRange =
  | '0%'
  | '0%-20%'
  | '20%-30%'
  | '30%-50%'
  | '50%-70%'
  | '70%-80%'
  | '80%-100%'
  | '=100%'
  | '≥100%'

export const BOOKING_RATE_RANGE_OPTIONS: BookingRateRange[] = [
  '0%',
  '0%-20%',
  '20%-30%',
  '30%-50%',
  '50%-70%',
  '70%-80%',
  '80%-100%',
  '=100%',
  '≥100%',
]

export const matchesBookingRateRange = (rate: number | null, selected: BookingRateRange[]) => {
  if (!selected.length) return true
  if (rate == null || !Number.isFinite(rate)) return false
  return selected.some(range => {
    if (range === '0%') return rate === 0
    if (range === '0%-20%') return rate > 0 && rate < .2
    if (range === '20%-30%') return rate >= .2 && rate < .3
    if (range === '30%-50%') return rate >= .3 && rate < .5
    if (range === '50%-70%') return rate >= .5 && rate < .7
    if (range === '70%-80%') return rate >= .7 && rate < .8
    if (range === '80%-100%') return rate >= .8 && rate < 1
    if (range === '=100%') return rate === 1
    // 与“=100%”互斥：此项用于超订门店。
    return rate > 1
  })
}
