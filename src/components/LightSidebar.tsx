import { BarChart3, Building2, ChevronDown, Download, Home, Map, RotateCcw, Search, Store, Users } from 'lucide-react'
import type { Filters, Hotel, SnapshotBatch } from '../types/data'

const ALL = '全部'
export type DashboardView = 'overview' | 'province' | 'area' | 'store' | 'channel'
export default function LightSidebar({ filters, hotels, batches, channels, onChange, onExport, view, onView }: {
  filters: Filters; hotels: Hotel[]; batches: SnapshotBatch[]; channels: string[]
  onChange: (f: Filters) => void; onExport: () => void; view: DashboardView; onView: (view: DashboardView) => void
}) {
  const operatingHotels = hotels.filter(h => ['在营', '在营业'].includes(String(h.status || '').trim()))
  const scoped = operatingHotels.filter(h => (filters.province === ALL || h.province === filters.province) && (filters.area === ALL || h.area === filters.area) && (filters.city === ALL || h.city === filters.city) && (filters.district === ALL || h.district === filters.district) && (filters.revenueZone === ALL || h.revenueZone === filters.revenueZone))
  const opts = (key: keyof Hotel) => [...new Set(scoped.map(h => String(h[key] || '')).filter(Boolean))]
  const change = (key: keyof Filters, value: string) => {
    const next = { ...filters, [key]: value }
    const cascade: Array<keyof Filters> = ['province', 'area', 'city', 'district', 'revenueZone', 'store']
    const i = cascade.indexOf(key)
    if (i >= 0) cascade.slice(i + 1).forEach(k => { next[k] = ALL })
    onChange(next)
  }
  const resetFilters = () => {
    onChange({ ...filters, province: ALL, area: ALL, city: ALL, district: ALL, businessZone: ALL, revenueZone: ALL, store: ALL, brand: ALL, positioning: ALL, operationType: ALL, managementType: ALL, directOperation: ALL, lifecycle: ALL, roomGroup: ALL, channel: ALL, channelLevel1: ALL, channelLevel2: ALL, channelLevel3: ALL, renovated: ALL, status: ALL })
    onView('overview')
  }
  const select = (key: keyof Filters, label: string, values: string[]) => <label><span>{label}</span><div><select value={filters[key]} onChange={e => change(key, e.target.value)}><option>{ALL}</option>{[...new Set(values)].map((v, i) => <option key={`${v}-${i}`}>{v}</option>)}</select><ChevronDown/></div></label>
  return <aside className="light-sidebar">
    <div className="side-brand"><span>HX</span><div><b>华西暑期预警</b><small>SUMMER WATCH</small></div></div>
    <nav><b>页面导航</b>
      <button className={view === 'overview' ? 'active' : ''} onClick={() => onView('overview')}><Home/>总览驾驶舱</button>
      <button className={view === 'province' ? 'active' : ''} onClick={() => onView('province')}><Map/>省区视图</button>
      <button className={view === 'area' ? 'active' : ''} onClick={() => onView('area')}><Users/>片区视图</button>
      <button className={view === 'store' ? 'active' : ''} onClick={() => onView('store')}><Store/>门店视图</button>
      <button className={view === 'channel' ? 'active' : ''} onClick={() => onView('channel')}><BarChart3/>渠道视图</button>
    </nav>
    <div className="scope-card"><div className="scope-card-head"><small>当前层级</small><button onClick={resetFilters} title="清空全部筛选并返回华西总览"><RotateCcw/>重置筛选</button></div><b>{filters.store !== ALL ? filters.store : filters.revenueZone !== ALL ? filters.revenueZone : filters.district !== ALL ? filters.district : filters.city !== ALL ? filters.city : filters.area !== ALL ? filters.area : filters.province !== ALL ? filters.province : '华西大区'}</b><span>商圈口径：收益管理商圈</span></div>
    <section><h3>层级筛选</h3>
      {select('province', '酒店省区', [...new Set(operatingHotels.map(h => h.province).filter(Boolean))])}
      {select('area', '酒店片区', opts('area'))}{select('city', '城市', opts('city'))}{select('district', '行政区域', opts('district'))}
      {select('revenueZone', '收益管理商圈', opts('revenueZone'))}
      {select('store', '门店', scoped.map(h => h.name))}
    </section>
    <section className="advanced"><h3>高级筛选</h3>
      {select('batchId', '跑批次数', batches.map(b => b.id))}
      {select('channel', '一级渠道', channels)}
      {select('brand', '品牌', opts('brand'))}{select('positioning', '品牌定位', opts('positioning'))}
      {select('operationType', '经营类型', opts('operationType'))}{select('managementType', '管理类型', opts('managementType'))}
      <label><span>是否直营</span><div><select value={filters.directOperation} onChange={event => change('directOperation', event.target.value)}><option>{ALL}</option><option>直营店</option><option>非直营店</option></select><ChevronDown/></div></label>
    </section>
    <div className="side-actions"><button className="primary" onClick={() => onChange({ ...filters })}><Search/>查询</button><button onClick={resetFilters}><RotateCcw/>重置</button><button className="wide" onClick={onExport}><Download/>导出当前视图</button><button className="wide ghost" onClick={() => { change('province', ALL); onView('overview') }}><Building2/>返回华西总览</button></div>
  </aside>
}
