import { BarChart3, BedDouble, Building2, ExternalLink, MousePointerClick } from 'lucide-react'
import type { MetricRow, SnapshotRecord } from '../types/data'
import { fmtMoney, fmtPct } from '../utils/formatter'
import ChannelPanel from './ChannelPanel'

export default function StoreChannelComposition({ stores, store, rows, previousRows, comparisonLabel, onDetail }: {
  stores: MetricRow[]
  store: MetricRow | null
  rows: SnapshotRecord[]
  previousRows: SnapshotRecord[]
  comparisonLabel: string
  onDetail: (store: MetricRow) => void
}) {
  if (!store) return <section className="light-card store-channel-empty" id="store-channel-analysis">
    <span><Building2/></span>
    <h2>请选择一家门店查看渠道来源</h2>
    <p>请在下方 {stores.length} 家门店中搜索并点击一行，也可以使用左侧“门店”筛选。</p>
    <small><MousePointerClick/>选择后将展示：总预订率 → 渠道预订率贡献 → 预订间夜占比 → 渠道ADR</small>
  </section>

  return <div className="store-channel-composition" id="store-channel-analysis">
    <section className="light-card store-focus-head">
      <div className="store-focus-title"><span><Building2/></span><div><small>当前分析门店</small><h2>{store.name}</h2><p>{store.whCode} · {store.province} / {store.area} / {store.city} / {store.revenueZone || '未归属收益管理商圈'}</p></div></div>
      <div className="store-switch-note"><MousePointerClick/>更换门店：使用下方搜索或左侧筛选</div>
      <button onClick={() => onDetail(store)}><ExternalLink/>门店完整分析</button>
    </section>
    <section className="store-booking-summary">
      <article className="primary"><span><BarChart3/></span><div><small>门店总预订率</small><strong>{fmtPct(store.bookingRate)}</strong><p>全部渠道预订间夜 ÷ 门店去重可售房</p></div></article>
      <article><span><BedDouble/></span><div><small>预订间夜</small><strong>{store.bookedRooms.toLocaleString()}</strong><p>渠道明细合计</p></div></article>
      <article><div><small>去重可售房</small><strong>{store.availableRooms.toLocaleString()}</strong><p>门店当日仅取一次</p></div></article>
      <article><div><small>在手ADR</small><strong>{fmtMoney(store.adr)}</strong><p>总价 ÷ 有房价间夜</p></div></article>
    </section>
    <div className="store-channel-explain"><b>预订率来源拆解</b><span>各渠道贡献相加 = 门店总预订率；渠道贡献 = 该渠道预订间夜 ÷ 门店去重可售房。</span></div>
    <ChannelPanel rows={rows} previousRows={previousRows} comparisonLabel={comparisonLabel} onChannel={() => {}}/>
  </div>
}
