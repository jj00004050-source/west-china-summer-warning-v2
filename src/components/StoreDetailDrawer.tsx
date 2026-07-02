import ReactECharts from 'echarts-for-react'
import { X } from 'lucide-react'
import type { ComparisonRow, MetricRow, PriceAdviceSettings, SnapshotRecord } from '../types/data'
import { aggregate } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { analyzeStore, buildStoreChannelMix, EMPTY_STORE_MIX, GRADE_LABEL } from '../utils/storeAnomalies'
import { CHANNEL_COLORS } from '../utils/channels'
import { storeTypeProfile } from '../utils/storeTypes'
import { buildPriceAdvice, type PriceAdviceLabel } from '../utils/priceAdvice'

const PRICE_OPPORTUNITY_LABELS: PriceAdviceLabel[] = ['强烈建议提价','建议提价','建议小幅提价','阶梯式提价','提前提价机会']
const priceAdviceTone = (label: PriceAdviceLabel) => label === '强烈建议提价' ? 'strong'
  : PRICE_OPPORTUNITY_LABELS.includes(label) ? 'mild'
    : label === '价格偏高风险' ? 'high'
      : ['高量低价风险','不建议提价','渠道补量','渠道预热','流量预警'].includes(label) ? 'watch'
        : label === '商圈未配置，无法判断' ? 'zone' : 'neutral'

export default function StoreDetailDrawer({ store, allRows, comparisonRows, channelRows, comparisonLabel, priceSettings, onClose }: {
  store: MetricRow | null
  allRows: MetricRow[]
  comparisonRows: ComparisonRow[]
  channelRows: SnapshotRecord[]
  comparisonLabel: string
  priceSettings?: Partial<PriceAdviceSettings>
  onClose: () => void
}) {
  if (!store) return null
  const days = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']
  const mine = days.map(day => allRows.find(row => row.whCode === store.whCode && row.dayOffset === day))
  const zoneRows = allRows.filter(row => row.revenueZone && row.revenueZone === store.revenueZone && row.dayOffset === store.dayOffset)
  const zone = aggregate(zoneRows, comparisonRows.filter(row => row.revenueZone === store.revenueZone))
  const peer = aggregate(allRows.filter(row => row.area === store.area && row.positioning === store.positioning && row.dayOffset === store.dayOffset), comparisonRows.filter(row => row.area === store.area && row.positioning === store.positioning))
  const mix = buildStoreChannelMix(channelRows)[store.whCode] || EMPTY_STORE_MIX
  const typeProfile = storeTypeProfile(store)
  const priceAdvice = buildPriceAdvice(store, {
    zoneBookingRate: zone.bookingRate, zoneAdr: zone.adr, zoneLastOcc: zone.lastOcc, zoneLastAdr: zone.lastAdr, zoneStoreCount: zoneRows.length,
    zoneBookingRateChange: zone.bookingRateChange,
    zoneBookedChange: zone.previousAvailableRooms ? zone.bookedRooms - zone.previousBookedRooms : null,
  }, priceSettings)
  const anomaly = analyzeStore(store, store.revenueZone ? zone.bookingRate : null, mix, false, {
    zoneAdr: zone.adr,
    zoneBookingRateChange: zone.bookingRateChange,
    priceAdviceLabel: priceAdvice.label,
  })
  const zoneGap = store.bookingRate != null && zone.bookingRate != null ? store.bookingRate - zone.bookingRate : null
  const renovationTags = store.isRenovated ? [
    ((store.bookingRate != null && zone.bookingRate != null && store.bookingRate < zone.bookingRate) || (store.bookingRate != null && store.lastOcc != null && store.bookingRate < store.lastOcc) || (store.bookingRate || 0) < priceAdvice.threshold) ? '改造店低预订' : '',
    store.bookedRooms === 0 ? '改造店0预定' : '',
    zoneGap != null && zoneGap < 0 ? '改造店低于商圈' : '',
    PRICE_OPPORTUNITY_LABELS.includes(priceAdvice.label) ? '改造店提价机会' : '',
    priceAdvice.label === '价格偏高风险' ? '改造店价格偏高风险' : '',
  ].filter(Boolean) : []
  const otaEnd = mix.ota * 100
  const onlineEnd = otaEnd + mix.online * 100
  const offlineEnd = onlineEnd + mix.offline * 100
  const option = {
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#bfd2e5', textStyle: { color: '#29445f' } },
    legend: { data: ['理论RP', '同期同提前期RP', '同期最终RP'], textStyle: { color: '#71859a' } },
    grid: { left: 45, right: 18, top: 40, bottom: 28 },
    xAxis: { type: 'category', data: days, axisLine: { lineStyle: { color: '#dce6f0' } }, axisLabel: { color: '#71859a' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#edf2f7' } }, axisLabel: { color: '#8294a7' } },
    series: [
      { name: '理论RP', type: 'line', smooth: true, data: mine.map(row => row?.rp), lineStyle: { color: '#2F6BFF', width: 3 }, itemStyle: { color: '#2F6BFF' } },
      { name: '同期同提前期RP', type: 'line', smooth: true, data: mine.map(row => row?.sameLeadRp), lineStyle: { color: '#36BFFA', type: 'dashed' }, itemStyle: { color: '#36BFFA' } },
      { name: '同期最终RP', type: 'line', smooth: true, data: mine.map(row => row?.lastRp), lineStyle: { color: '#9CA3AF', type: 'dashed' }, itemStyle: { color: '#9CA3AF' } },
    ],
  }
  return <div className="drawer-mask" onClick={onClose}><aside className="drawer store-anomaly-drawer" onClick={event => event.stopPropagation()}>
    <button className="drawer-close" onClick={onClose}><X/></button>
    <div className="drawer-head"><span className={`store-risk-grade grade-${anomaly.grade}`}>{GRADE_LABEL[anomaly.grade]}</span><h2>{store.name}</h2><p>{store.whCode} · {store.province} / {store.area} / {store.city} / {store.revenueZone || '未配置收益管理商圈'}</p></div>
    <div className="drawer-warning-columns">
      <section><h3>经营预警原因</h3>{anomaly.businessReasons.length ? anomaly.businessReasons.map(reason => <p className="business" key={reason}>{reason}</p>) : <p className="empty">当前未识别到经营异常</p>}</section>
      <section><h3>口径 / 数据说明</h3>{[...anomaly.statusReasons, ...anomaly.dataReasons].length ? [...anomaly.statusReasons, ...anomaly.dataReasons].map(reason => <p className="status" key={reason}>{reason}</p>) : <p className="empty">当前数据口径完整</p>}</section>
    </div>
    <h3>门店基础信息</h3>
    <div className="drawer-basic-grid"><span>品牌<b>{store.brand || '--'}</b></span><span>品牌定位<b>{store.positioning || '--'}</b></span><span>经营类型<b>{store.operationType || '--'}</b></span><span>管理类型<b>{store.managementType || '--'}</b></span><span>是否直营<b>{anomaly.direct ? '是' : '否'}</b></span><span>收益管理商圈<b>{store.revenueZone || '--'}</b></span></div>
    <h3>门店类型</h3>
    <div className="drawer-type-grid"><span>是否直营<b>{typeProfile.direct ? '是' : '否'}</b></span><span>是否新开<b>{typeProfile.isNew ? '是' : '否'}</b></span><span>开业日期<b>{store.openDate || '--'}</b></span><span>开业月龄<b>{typeProfile.openMonths == null ? '--' : `${typeProfile.openMonths}个月`}</b></span><span>新开阶段<b>{typeProfile.newStage}</b></span><span>是否改造店<b>{typeProfile.isRenovated ? '是' : '否'}</b></span><span>改造类型<b>{store.isRenovated ? store.renovationType || '改造类型未标记' : '--'}</b></span></div>
    {typeProfile.isNew && store.lastRp == null && <div className="drawer-type-note">该店为开业18个月以内门店，去年同期无可比数据，不直接参与同期RP缺口判断。</div>}
    <h3>提价建议</h3>
    <div className={`drawer-price-advice advice-${priceAdviceTone(priceAdvice.label)}`}>
      <div><b>{priceAdvice.label}</b><span>{priceAdvice.reason}</span></div>
      <section><span>当前D日期<b>{store.dayOffset}</b></span><span>目标入住日期<b>{store.targetDate}</b></span><span>最低提价门槛<b>{fmtPct(priceAdvice.threshold)}</b></span><span>量价状态<b>{priceAdvice.quantityPriceStatus}</b></span>
        <span>当前预订率<b>{fmtPct(store.bookingRate)}</b></span><span>本店同期OCC<b>{fmtPct(store.lastOcc)}</b></span><span>本店恢复差<b>{fmtPp(priceAdvice.storeOccRecovery)}</b></span><span>商圈当前预订率<b>{fmtPct(priceAdvice.zoneBookingRate)}</b></span>
        <span>商圈同期OCC<b>{fmtPct(priceAdvice.zoneLastOcc)}</b></span><span>商圈恢复差<b>{fmtPp(priceAdvice.zoneOccRecovery)}</b></span><span>较商圈预订率<b>{fmtPp(priceAdvice.zoneBookingGap)}</b></span><span>当前ADR<b>{fmtMoney(store.adr)}</b></span>
        <span>商圈当前ADR<b>{fmtMoney(priceAdvice.zoneAdr)}</b></span><span>本店同期ADR<b>{fmtMoney(store.lastAdr)}</b></span><span>商圈同期ADR<b>{fmtMoney(priceAdvice.zoneLastAdr)}</b></span><span>较商圈ADR<b>{fmtMoney(priceAdvice.zoneAdrGap)}</b></span>
        <span>较同期ADR<b>{fmtMoney(priceAdvice.lastAdrGap)}</b></span><span>剩余房量<b>{priceAdvice.remainingRooms}</b></span><span>剩余房率<b>{fmtPct(priceAdvice.remainingRate)}</b></span><span>预订率较上版<b>{fmtPp(priceAdvice.bookingRateChange)}</b></span><span>ADR较上版<b>{fmtMoney(priceAdvice.adrChange)}</b></span>
        <span>本店间夜进速<b>{priceAdvice.bookedChange == null ? '--' : `${priceAdvice.bookedChange >= 0 ? '+' : ''}${priceAdvice.bookedChange}`}</b></span><span>商圈预订率进速<b>{fmtPp(priceAdvice.zoneBookingRateChange)}</b></span><span>商圈间夜进速<b>{priceAdvice.zoneBookedChange == null ? '--' : `${priceAdvice.zoneBookedChange >= 0 ? '+' : ''}${priceAdvice.zoneBookedChange}`}</b></span><span>商圈类型<b>{priceAdvice.specialZoneType || '普通商圈'}</b></span>
      </section><small>{priceAdvice.sampleNote}</small>
    </div>
    {store.isRenovated && <><h3>改造店信息</h3><div className="drawer-renovation-panel">
      <div><span>是否改造店<b>是</b></span><span>改造类型<b>{store.renovationType || '改造类型未标记'}</b></span><span>当前预订率<b>{fmtPct(store.bookingRate)}</b></span><span>商圈预订率<b>{fmtPct(zone.bookingRate)}</b></span>
        <span>较商圈预订率<b>{fmtPp(zoneGap)}</b></span><span>本店同期OCC<b>{fmtPct(store.lastOcc)}</b></span><span>本店OCC恢复差<b>{fmtPp(priceAdvice.storeOccRecovery)}</b></span><span>当前ADR<b>{fmtMoney(store.adr)}</b></span>
        <span>商圈ADR<b>{fmtMoney(zone.adr)}</b></span><span>同期ADR<b>{fmtMoney(store.lastAdr)}</b></span><span>RP缺口<b>{fmtMoney(store.rpGap)}</b></span><span>提价建议<b>{priceAdvice.label}</b></span></div>
      <section><b>改造店专项标签</b><p>{renovationTags.length ? renovationTags.join(' · ') : '当前未识别到改造店专项关注项'}</p><b>经营异常标签</b><p>{anomaly.businessTags.length ? anomaly.businessTags.join(' · ') : '当前无经营异常标签'}</p></section>
    </div></>}
    <h3>当前数据</h3>
    <div className="drawer-kpis"><div><small>预订率 / 商圈</small><b>{fmtPct(store.bookingRate)}</b><em>{fmtPct(zone.bookingRate)} · {fmtPp(zoneGap)}</em><em>同提前期 {fmtPp(store.sameLeadBookingRateGap)}</em></div><div><small>在手ADR</small><b>{fmtMoney(store.adr)}</b><em>同提前期 {fmtMoney(store.sameLeadAdrGap)}</em></div><div><small>理论RP / 同期最终RP</small><b>{fmtMoney(store.rp)}</b><em>{fmtMoney(store.lastRp)}</em><em>同提前期 {fmtMoney(store.sameLeadRpGap)}</em></div><div><small>RP缺口</small><b className={(store.rpGap || 0) < 0 ? 'bad' : 'good'}>{fmtMoney(store.rpGap)}</b></div></div>
    <div className="drawer-current-detail"><span>预订房间<b>{store.bookedRooms}</b></span><span>可售房<b>{store.availableRooms || '--'}</b></span><span>0预定<b>{store.bookedRooms === 0 && !store.tags.includes('缺失预订数据') ? '是' : '否'}</b></span><span>满房<b>{(store.bookingRate || 0) >= 1 ? '是' : '否'}</b></span></div>
    <h3>较上一版变化</h3>
    <div className="drawer-change-grid"><span>预订率<b>{fmtPp(anomaly.bookingRateChange)}</b></span><span>在手ADR<b>{fmtMoney(anomaly.adrChange)}</b></span><span>理论RP<b>{fmtMoney(anomaly.rpChange)}</b></span><span>预订间夜<b>{anomaly.bookedChange == null ? '--' : `${anomaly.bookedChange >= 0 ? '+' : ''}${anomaly.bookedChange}`}</b></span></div>
    <div className="comparison-note">当前环比基准：{comparisonLabel} · 同一真实目标入住日期匹配</div>
    <h3>渠道结构</h3>
    <div className="drawer-channel">
      <div className={`drawer-channel-donut ${mix.total ? '' : 'empty'}`} style={mix.total ? { background: `conic-gradient(${CHANNEL_COLORS['各OTA']} 0 ${otaEnd}%,${CHANNEL_COLORS['线上直销']} ${otaEnd}% ${onlineEnd}%,${CHANNEL_COLORS['线下直销']} ${onlineEnd}% ${offlineEnd}%,${CHANNEL_COLORS['其他']} ${offlineEnd}% 100%)` } : undefined}><i/></div>
      <div>{mix.total ? <><b>{mix.mainName} {fmtPct(mix.mainShare)}</b><span>各OTA {fmtPct(mix.ota)} · 线上直销 {fmtPct(mix.online)} · 线下直销 {fmtPct(mix.offline)}</span><span>携程 {fmtPct(mix.ctrip)} · 美团 {fmtPct(mix.meituan)} · 飞猪 {fmtPct(mix.fliggy)}</span></> : <><b>无预订来源</b><span>当前门店预订房间总数为0或没有预订数据</span></>}</div>
    </div>
    <h3>未来7天 RP 趋势</h3><ReactECharts option={option} style={{ height: 230 }}/>
    <h3>收益管理商圈与同档次对标</h3><div className="benchmark-grid">
      <div><small>理论RP vs 收益管理商圈</small><b className={(store.rp != null && zone.rp != null ? store.rp - zone.rp : 0) < 0 ? 'bad' : 'good'}>{store.rp != null && zone.rp != null ? fmtMoney(store.rp - zone.rp) : '--'}</b></div>
      <div><small>预订率 vs 收益管理商圈</small><b className={(zoneGap || 0) < 0 ? 'bad' : 'good'}>{fmtPp(zoneGap)}</b></div>
      <div><small>在手ADR vs 同档次</small><b className={(store.adr != null && peer.adr != null ? store.adr - peer.adr : 0) < 0 ? 'bad' : 'good'}>{store.adr != null && peer.adr != null ? fmtMoney(store.adr - peer.adr) : '--'}</b></div>
    </div>
  </aside></div>
}
