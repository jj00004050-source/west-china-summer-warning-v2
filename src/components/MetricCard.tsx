import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export default function MetricCard({ label, value, compare, diff, delta, tone = 'blue' }: { label: string; value: string; compare?: string; diff?: string; delta?: number | null; tone?: string }) {
  return <div className={`metric-card tone-${tone}`}>
    <div className="metric-label">{label}<span className="tiny-bars"/></div>
    <div className="metric-value">{value}</div>
    <div className="metric-meta"><span>同期 <b>{compare || '--'}</b></span><span>{diff || ''}</span></div>
    <div className={`metric-delta ${(delta ?? 0) >= 0 ? 'up' : 'down'}`}>
      {delta == null ? <span>暂无上一批次</span> : <>{delta >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} 较上一批次 {Math.abs(delta).toFixed(1)}</>}
    </div>
  </div>
}
