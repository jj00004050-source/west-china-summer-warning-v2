import type { MetricRow } from '../types/data'
import { aggregateBy } from '../utils/metrics'
import { fmtMoney, fmtPct } from '../utils/formatter'

export default function RankingPanel({ rows, level, onSelect }: { rows: MetricRow[]; level: 'province' | 'area' | 'city' | 'revenueZone'; onSelect: (name: string) => void }) {
  const labels = { province: '省区', area: '片区', city: '城市', revenueZone: '收益管理商圈' }
  const list = aggregateBy(rows, level).sort((a, b) => (a.recovery ?? 99) - (b.recovery ?? 99)).slice(0, 5)
  return <section className="panel ranking-panel">
    <div className="panel-title compact"><div><span className="eyebrow">RISK RANKING</span><h2>高风险{labels[level]} TOP5</h2></div></div>
    <div className="rank-list">{list.length ? list.map((r, i) => <button key={r.name} onClick={() => onSelect(r.name)}>
      <span className={`rank-no n${i + 1}`}>{String(i + 1).padStart(2, '0')}</span>
      <span className="rank-name"><b>{r.name}</b><small>{r.highCount}家高风险 · 缺口 {fmtMoney(r.revenueGap)}</small></span>
      <strong className={(r.recovery ?? 1) < .8 ? 'bad' : ''}>{fmtPct(r.recovery)}</strong>
    </button>) : <div className="empty-mini">当前范围暂无排名数据</div>}</div>
  </section>
}
