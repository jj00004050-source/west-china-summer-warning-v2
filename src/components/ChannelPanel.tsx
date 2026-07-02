import ReactECharts from 'echarts-for-react'
import type { SnapshotRecord } from '../types/data'
import { fmtMoney, fmtPct, fmtPp } from '../utils/formatter'
import { channelColor } from '../utils/channels'

const classify = (r: SnapshotRecord) => {
  if (r.channelLevel2 === 'OTA' || ['携程','美团','飞猪','OTA其他'].includes(r.channelLevel3 || '')) return '各OTA'
  if (r.channelLevel1 === '线上直销') return '线上直销'
  if (r.channelLevel1 === '线下直销') return '线下直销'
  if (['携程','美团','飞猪','OTA'].includes(r.channel)) return '各OTA'
  if (['官网','会员','直连分销'].includes(r.channel)) return '线上直销'
  if (['前台','商旅'].includes(r.channel)) return '线下直销'
  return '其他'
}

export default function ChannelPanel({ rows, previousRows = [], comparisonLabel = '较上一跑批', onChannel }: {
  rows: SnapshotRecord[]
  previousRows?: SnapshotRecord[]
  comparisonLabel?: string
  onChannel: (v: string) => void
}) {
  const groupRows = (source: SnapshotRecord[], key: (r: SnapshotRecord) => string) => {
    const totalRooms = source.reduce((s, r) => s + r.bookedRooms, 0)
    const available = Object.values(source.reduce<Record<string, number>>((a, r) => {
      a[`${r.whCode}|${r.targetDate}`] = Math.max(a[`${r.whCode}|${r.targetDate}`] || 0, r.availableRooms); return a
    }, {})).reduce((a, b) => a + b, 0)
    return Object.entries(source.reduce<Record<string, { rooms: number; priced: number; revenue: number }>>((a, r) => {
      const x = a[key(r)] ||= { rooms: 0, priced: 0, revenue: 0 }
      x.rooms += r.bookedRooms; x.priced += r.pricedRooms; x.revenue += r.bookingRevenue
      return a
    }, {})).map(([name, x]) => ({
      name, ...x, share: totalRooms ? x.rooms / totalRooms : 0,
      contribution: available ? x.rooms / available : 0,
      adr: x.priced ? x.revenue / x.priced : null,
    }))
  }
  const main = groupRows(rows, classify)
  const previousMain = groupRows(previousRows, classify)
  const ota = groupRows(rows, r => r.channelLevel3 || r.channel).filter(x => ['携程','美团','飞猪'].includes(x.name))
  const previousOta = groupRows(previousRows, r => r.channelLevel3 || r.channel)
  const hasPrevious = previousRows.length > 0
  const option = {
    tooltip: { trigger: 'item', formatter: '{b}<br/>预订间夜 {c}<br/>占比 {d}%' },
    title: { text: '100%', subtext: '预订间夜', left: '39%', top: '39%', textAlign: 'center', textStyle: { color: '#1F2937', fontSize: 20, fontWeight: 700 }, subtextStyle: { color: '#9CA3AF', fontSize: 10 } },
    series: [{ type: 'pie', radius: ['58%','76%'], center: ['40%','50%'], label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 }, data: main.map(x => ({ name: x.name, value: x.rooms, itemStyle: { color: channelColor(x.name) } })) }],
  }
  return <section className="light-card light-channel">
    <div className="light-card-head"><div><h2>渠道来源分布</h2><p>预订间夜占比、贡献、ADR · {comparisonLabel}</p></div></div>
    <div className="channel-top"><ReactECharts option={option} style={{height:210}}/><div className="channel-metrics">{main.map(x => {
      const prev = previousMain.find(v => v.name === x.name)
      const contributionDelta = hasPrevious ? x.contribution - (prev?.contribution || 0) : null
      const adrDelta = hasPrevious && x.adr != null && prev?.adr != null ? x.adr - prev.adr : null
      return <button key={x.name} onClick={() => onChannel(x.name)} title={hasPrevious ? `渠道贡献${comparisonLabel} ${fmtPp(contributionDelta)}；ADR${comparisonLabel} ${fmtMoney(adrDelta)}` : '暂无同目标入住日期的上一版数据'}><i style={{background:channelColor(x.name)}}/><span>{x.name}<small>间夜 {x.rooms.toLocaleString()} · 贡献 {fmtPct(x.contribution)}</small></span><b>{fmtMoney(x.adr)}<small>{comparisonLabel} 贡献 {fmtPp(contributionDelta)}</small></b></button>
    })}</div></div>
    <h3>OTA渠道详情</h3>
    <div className="ota-bars">{['携程','美团','飞猪'].map(name => {
      const x = ota.find(v => v.name === name); const prev = previousOta.find(v => v.name === name)
      const delta = hasPrevious ? (x?.share || 0) - (prev?.share || 0) : null
      return <button key={name} onClick={() => onChannel(name)}><b><i style={{background:channelColor(name)}}/>{name}</b><i><em style={{width: `${Math.min(100, (x?.share || 0) * 100)}%`,background:channelColor(name)}}/></i><span>{fmtPct(x?.share)}<small>贡献 {fmtPct(x?.contribution)} · ADR {fmtMoney(x?.adr)}</small></span><strong className={(delta || 0) < 0 ? 'negative' : 'positive'}>{fmtPp(delta)}</strong></button>
    })}</div>
  </section>
}
