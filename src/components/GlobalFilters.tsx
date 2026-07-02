import { RotateCcw } from 'lucide-react'
import type { Filters, Hotel, SnapshotBatch } from '../types/data'

interface Props { filters: Filters; setFilters: (v: Filters) => void; hotels: Hotel[]; batches: SnapshotBatch[]; channels: string[] }
const ALL = '全部'
export default function GlobalFilters({ filters, setFilters, hotels, batches, channels }: Props) {
  const scoped = (field: keyof Hotel) => [...new Set(hotels.filter(h =>
    (filters.province === ALL || h.province === filters.province) &&
    (filters.area === ALL || h.area === filters.area) &&
    (filters.city === ALL || h.city === filters.city)
  ).map(h => String(h[field] || '')).filter(Boolean))]
  const options: Array<[keyof Filters, string, string[]]> = [
    ['province', '省区', [...new Set(hotels.map(h => h.province).filter(Boolean))]],
    ['area', '片区', scoped('area')], ['city', '城市', scoped('city')], ['revenueZone', '收益管理商圈', scoped('revenueZone')],
    ['brand', '品牌', scoped('brand')], ['positioning', '品牌定位', scoped('positioning')],
    ['lifecycle', '新开/存量', ['新开', '存量']], ['roomGroup', '房量分组', ['≤80间', '81-120间', '121-180间', '>180间']],
    ['channel', '渠道', channels], ['renovated', '是否翻新', ['翻新店', '非翻新店']],
  ]
  const change = (key: keyof Filters, value: string) => {
    const next = { ...filters, [key]: value }
    if (key === 'province') Object.assign(next, { area: ALL, city: ALL, revenueZone: ALL })
    if (key === 'area') Object.assign(next, { city: ALL, revenueZone: ALL })
    if (key === 'city') next.revenueZone = ALL
    setFilters(next)
  }
  return <div className="filter-bar">
    <label><span>快照批次</span><select value={filters.batchId} onChange={e => change('batchId', e.target.value)}>
      {batches.map(b => <option key={b.id} value={b.id}>{b.snapshotDate} {b.batchTime}</option>)}
    </select></label>
    {options.map(([key, label, values]) => <label key={key}><span>{label}</span>
      <select value={filters[key]} onChange={e => change(key, e.target.value)}><option>{ALL}</option>{values.map(v => <option key={v}>{v}</option>)}</select>
    </label>)}
    <button className="icon-button" title="重置筛选" onClick={() => setFilters({ ...filters, province: ALL, area: ALL, city: ALL, businessZone: ALL, revenueZone: ALL, brand: ALL, positioning: ALL, lifecycle: ALL, roomGroup: ALL, channel: ALL, renovated: ALL })}><RotateCcw size={16}/></button>
  </div>
}
