import ReactECharts from 'echarts-for-react'
import type { MetricRow } from '../types/data'
import { aggregate } from '../utils/metrics'

export default function TrendPanel({ rows, selectedDay, onDay }: { rows: MetricRow[]; selectedDay: string; onDay: (v: string) => void }) {
  const days = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']
  const data = days.map(d => aggregate(rows.filter(r => r.dayOffset === d)))
  const option = {
    backgroundColor: 'transparent', grid: { left: 48, right: 44, top: 42, bottom: 34 },
    legend: { data: ['理论RP', '同期RP', '预订率'], textStyle: { color: '#94abc8' }, top: 4 },
    tooltip: { trigger: 'axis', backgroundColor: '#091c33ee', borderColor: '#2b6fae', textStyle: { color: '#eaf6ff' } },
    xAxis: { type: 'category', data: days, axisLine: { lineStyle: { color: '#24415f' } }, axisLabel: { color: '#9bb0ca' } },
    yAxis: [
      { type: 'value', axisLabel: { color: '#6f89a8' }, splitLine: { lineStyle: { color: '#142d49' } } },
      { type: 'value', axisLabel: { color: '#6f89a8', formatter: (v: number) => `${v}%` }, splitLine: { show: false } },
    ],
    series: [
      { name: '理论RP', type: 'line', smooth: true, symbolSize: 8, data: data.map(m => m.rp?.toFixed(1)), lineStyle: { width: 3, color: '#39b9ff' }, itemStyle: { color: '#39b9ff' }, areaStyle: { color: 'rgba(57,185,255,.09)' } },
      { name: '同期RP', type: 'line', smooth: true, data: data.map(m => m.lastRp?.toFixed(1)), lineStyle: { type: 'dashed', color: '#8a9cb3' }, itemStyle: { color: '#8a9cb3' } },
      { name: '预订率', type: 'bar', yAxisIndex: 1, barWidth: 14, data: data.map(m => m.bookingRate == null ? null : +(m.bookingRate * 100).toFixed(1)), itemStyle: { color: '#315e96', borderRadius: [4, 4, 0, 0] } },
    ],
  }
  return <section className="panel chart-panel"><div className="panel-title compact"><div><span className="eyebrow">7-DAY FORWARD VIEW</span><h2>未来7天经营趋势</h2></div><span className="panel-note">点击图表切换目标日期</span></div>
    <ReactECharts option={option} style={{ height: 280 }} onEvents={{ click: (p: { name: string }) => p.name && onDay(p.name) }}/>
    <div className="day-mini">{days.map(d => <button className={d === selectedDay ? 'active' : ''} onClick={() => onDay(d)} key={d}>{d}</button>)}</div>
  </section>
}
