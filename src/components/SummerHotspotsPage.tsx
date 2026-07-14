import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  MapPinned,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { RevenueHotspotRecord } from '../types/hotspots'
import { fetchHotspotData } from '../utils/api'
import '../styles/hotspots.css'

const ALL = '全部'
const pad = (value: number) => String(value).padStart(2, '0')
const localDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const addDays = (value: string, days: number) => {
  const time = new Date(`${value}T00:00:00`).getTime()
  return Number.isNaN(time) ? '' : localDate(new Date(time + days * 86400000))
}
const activeOn = (row: RevenueHotspotRecord, date: string) => row.startDate <= date && row.endDate >= date
const intersects = (row: RevenueHotspotRecord, start: string, end: string) => (!start || row.endDate >= start) && (!end || row.startDate <= end)
const heatRank = { 高: 4, 中: 3, 低: 2, 观察: 1 } as const
const categories = ['演唱会', '会展', '赛事', '考试', '文旅', '交通', '天气', '节庆会议', '其他']

type Props = {
  anchorDate?: string
}

const resolveInitialDate = (coverageStart: string, coverageEnd: string, referenceDate: string) => {
  if (!coverageStart) return referenceDate
  if (referenceDate < coverageStart) return coverageStart
  if (coverageEnd && referenceDate > coverageEnd) return referenceDate
  return referenceDate
}

export default function SummerHotspotsPage({ anchorDate = '' }: Props) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchHotspotData>>>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [province, setProvince] = useState(ALL)
  const [city, setCity] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [heat, setHeat] = useState(ALL)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [selectedDate, setSelectedDate] = useState(localDate())
  const [calendarMonth, setCalendarMonth] = useState(() => localDate().slice(0, 7))
  const [topWindow, setTopWindow] = useState<7 | 30>(7)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const referenceDate = anchorDate || localDate()

  const load = async () => {
    try {
      setLoading(true)
      const next = await fetchHotspotData()
      setData(next)
      setError('')
      if (next) {
        const initial = resolveInitialDate(next.version.coverageStart, next.version.coverageEnd, referenceDate)
        setSelectedDate(initial)
        setCalendarMonth(initial.slice(0, 7))
        setDateStart(referenceDate)
        setDateEnd('')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '热点数据读取失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!data) return
    const initial = resolveInitialDate(data.version.coverageStart, data.version.coverageEnd, referenceDate)
    setSelectedDate(initial)
    setCalendarMonth(initial.slice(0, 7))
    setDateStart(referenceDate)
    setDateEnd('')
    setPage(1)
  }, [referenceDate])

  const rows = data?.rows || []
  const provinces = useMemo(() => [...new Set(rows.map(row => row.province))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [rows])
  const cities = useMemo(() => [...new Set(rows.filter(row => province === ALL || row.province === province).map(row => row.city))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [rows, province])
  const filtered = useMemo(() => rows.filter(row =>
    (province === ALL || row.province === province) &&
    (city === ALL || row.city === city) &&
    (category === ALL || row.categoryGroup === category) &&
    (heat === ALL || row.heat === heat) &&
    intersects(row, dateStart, dateEnd)
  ), [rows, province, city, category, heat, dateStart, dateEnd])

  useEffect(() => { setPage(1) }, [province, city, category, heat, dateStart, dateEnd, pageSize])
  const today = referenceDate
  const todayCount = rows.filter(row => activeOn(row, today)).length
  const next7End = addDays(today, 6)
  const next7Count = rows.filter(row => intersects(row, today, next7End)).length
  const selectedDayRows = useMemo(() => filtered.filter(row => activeOn(row, selectedDate)).sort((a, b) => heatRank[b.heat] - heatRank[a.heat]), [filtered, selectedDate])

  const monthDays = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const first = new Date(year, month - 1, 1)
    const offset = (first.getDay() + 6) % 7
    const gridStart = new Date(year, month - 1, 1 - offset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      const value = localDate(date)
      return { value, day: date.getDate(), currentMonth: date.getMonth() === month - 1 }
    })
  }, [calendarMonth])

  const topRows = useMemo(() => {
    const end = addDays(today, topWindow - 1)
    return rows.filter(row => row.startDate >= today && row.startDate <= end)
      .sort((a, b) => heatRank[b.heat] - heatRank[a.heat] || a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 12)
  }, [rows, today, topWindow])

  const provinceCounts = useMemo(() => [...rows.reduce<Map<string, number>>((map, row) => {
    map.set(row.province, (map.get(row.province) || 0) + 1)
    return map
  }, new Map())].sort((a, b) => b[1] - a[1]), [rows])
  const maxProvince = Math.max(1, ...provinceCounts.map(([, count]) => count))
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const setProvinceFilter = (value: string) => {
    setProvince(current => current === value ? ALL : value)
    setCity(ALL)
  }
  const clearFilters = () => {
    setProvince(ALL); setCity(ALL); setCategory(ALL); setHeat(ALL); setDateStart(''); setDateEnd('')
  }
  const shiftMonth = (offset: number) => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const date = new Date(year, month - 1 + offset, 1)
    setCalendarMonth(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`)
  }
  const exportRows = async () => {
    const XLSX = await import('xlsx')
    const output = filtered.map(row => ({
      日期: row.startDate === row.endDate ? row.startDate : `${row.startDate} 至 ${row.endDate}`,
      省区: row.province,
      城市: row.city,
      热点名称: row.name,
      类型: row.category,
      分类: row.categoryGroup,
      地点: row.venue,
      规模: row.scale,
      热度等级: row.heat,
      状态: row.status,
      收益影响判断: row.revenueImpact,
      播报口径: row.broadcastText,
      信息来源: row.source,
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(output), '当前筛选热点')
    XLSX.writeFile(workbook, `华西暑期收益热点_${localDate()}.xlsx`)
  }

  if (loading) return <div className="hotspot-state"><RefreshCw className="spinning"/><b>正在按需加载暑期收益热点…</b><span>该数据不会随总览首页一起加载</span></div>
  if (error) return <div className="hotspot-state error"><AlertTriangle/><b>{error}</b><button onClick={load}>重新读取</button></div>
  if (!data) return <div className="hotspot-state"><Flame/><b>尚未发布暑期收益热点</b><span>请管理员在 /admin 数据上传中心上传热点Excel。</span></div>

  return <div className="hotspot-page">
    <section className="hotspot-page-head">
      <div><span className="eyebrow">SUMMER REVENUE HOTSPOTS</span><h2>暑期收益热点</h2><p>未来需求事件日历 · 省区热度定位 · 核心热点跟踪</p></div>
      <div className="hotspot-version"><small>热点数据版本</small><b>{data.version.versionNumber}</b><span>{new Date(data.version.updatedAt).toLocaleString('zh-CN', { hour12: false })} 更新</span><em>观察基准日：{today || '--'}</em></div>
    </section>

    <div className="hotspot-kpis">
      <article><span className="hotspot-kpi-icon blue"><Flame/></span><div><small>热点总数</small><b>{data.summary.total}</b><em>条</em></div></article>
      <article><span className="hotspot-kpi-icon cyan"><MapPinned/></span><div><small>覆盖省区数</small><b>{data.summary.provinceCount}</b><em>个</em></div></article>
      <article><span className="hotspot-kpi-icon orange"><CalendarDays/></span><div><small>基准日 / 近7天</small><b>{todayCount}<i>/</i>{next7Count}</b><em>条</em></div></article>
      <article><span className="hotspot-kpi-icon purple"><Sparkles/></span><div><small>高热度城市数</small><b>{data.summary.highHeatCityCount}</b><em>个</em></div></article>
    </div>

    <section className="hotspot-filter-card">
      <label><span>省区</span><select value={province} onChange={event => { setProvince(event.target.value); setCity(ALL) }}><option>{ALL}</option>{provinces.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>城市</span><select value={city} onChange={event => setCity(event.target.value)}><option>{ALL}</option>{cities.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>热点类型</span><select value={category} onChange={event => setCategory(event.target.value)}><option>{ALL}</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>热度等级</span><select value={heat} onChange={event => setHeat(event.target.value)}><option>{ALL}</option>{['高','中','低','观察'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>开始日期</span><input type="date" value={dateStart} onChange={event => setDateStart(event.target.value)}/></label>
      <label><span>结束日期</span><input type="date" value={dateEnd} onChange={event => setDateEnd(event.target.value)}/></label>
      <button onClick={clearFilters}>清空筛选</button>
    </section>

    <div className="hotspot-primary-grid">
      <section className="hotspot-card hotspot-calendar-card">
        <header><div><h3>收益热点日历</h3><p>点击日期查看当天有效热点</p></div><div className="calendar-switch"><button onClick={() => shiftMonth(-1)}><ChevronLeft/></button><b>{calendarMonth.replace('-', '年')}月</b><button onClick={() => shiftMonth(1)}><ChevronRight/></button></div></header>
        <div className="calendar-week">{['一','二','三','四','五','六','日'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{monthDays.map(item => {
          const active = filtered.filter(row => activeOn(row, item.value))
          const groups = [...new Set(active.map(row => row.categoryGroup))].slice(0, 4)
          return <button key={item.value} className={`${item.currentMonth ? '' : 'muted'} ${selectedDate === item.value ? 'selected' : ''} ${item.value === today ? 'today' : ''}`} onClick={() => setSelectedDate(item.value)}>
            <span>{item.day}</span>{active.length > 0 && <b>{active.length}</b>}<div>{groups.map(group => <i key={group} className={`cat-${group}`} title={group}/>)}</div>
          </button>
        })}</div>
        <div className="hotspot-legend">{categories.slice(0, 8).map(group => <span key={group}><i className={`cat-${group}`}/>{group}</span>)}</div>
      </section>
      <section className="hotspot-card day-hotspot-list">
        <header><div><h3>{selectedDate} 热点</h3><p>共 {selectedDayRows.length} 条</p></div></header>
        <div>{selectedDayRows.length ? selectedDayRows.map(row => <article key={row.id}>
          <span className={`heat heat-${row.heat}`}>{row.heat}</span><div><b>{row.name}</b><small>{row.province} · {row.city} · {row.categoryGroup}</small><em>{row.venue}</em></div>
        </article>) : <div className="hotspot-empty">当日暂无匹配热点</div>}</div>
      </section>
    </div>

    <div className="hotspot-secondary-grid">
      <section className="hotspot-card province-hotspot-summary">
        <header><div><h3>省区热点汇总</h3><p>点击省区联动城市与明细筛选</p></div></header>
        <div>{provinceCounts.map(([name, count]) => <button key={name} className={province === name ? 'active' : ''} onClick={() => setProvinceFilter(name)}>
          <span><b>{name}</b><small>{count} 条热点</small></span><i><em style={{ width: `${count / maxProvince * 100}%` }}/></i><strong>{count}</strong>
        </button>)}</div>
      </section>
      <section className="hotspot-card top-hotspot-list">
        <header><div><h3>核心热点Top榜</h3><p>按当前D0之后新发生热点展示，持续中热点请看日历与明细</p></div><div><button className={topWindow === 7 ? 'active' : ''} onClick={() => setTopWindow(7)}>未来7天</button><button className={topWindow === 30 ? 'active' : ''} onClick={() => setTopWindow(30)}>未来30天</button></div></header>
        <div className="hotspot-mini-table"><table><thead><tr><th>日期</th><th>城市 / 省区</th><th>热点名称</th><th>类型</th><th>地点</th><th>规模</th><th>热度</th></tr></thead><tbody>{topRows.map(row => <tr key={row.id}><td>{row.startDate.slice(5)}</td><td><b>{row.city}</b><small>{row.province}</small></td><td>{row.name}</td><td>{row.categoryGroup}</td><td>{row.venue}</td><td>{row.scale}</td><td><span className={`heat heat-${row.heat}`}>{row.heat}</span></td></tr>)}</tbody></table></div>
      </section>
    </div>

    <section className="hotspot-card hotspot-detail-card">
      <header><div><h3>收益热点明细</h3><p>当前筛选 {filtered.length} 条，只渲染当前分页</p></div><button className="hotspot-export" onClick={exportRows}><Download/>导出当前筛选结果</button></header>
      <div className="hotspot-detail-table"><table><thead><tr><th>日期</th><th>城市 / 省区</th><th>热点名称</th><th>类型</th><th>地点</th><th>规模</th><th>热度等级</th><th>状态</th><th>收益影响判断</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.id}>
        <td>{row.startDate === row.endDate ? row.startDate : <>{row.startDate}<small>至 {row.endDate}</small></>}</td>
        <td><b>{row.city}</b><small>{row.province}</small></td><td><b>{row.name}</b></td><td><span className={`category-tag cat-bg-${row.categoryGroup}`}>{row.categoryGroup}</span></td>
        <td>{row.venue}</td><td>{row.scale}</td><td><span className={`heat heat-${row.heat}`}>{row.heat}</span></td><td>{row.status}</td><td>{row.revenueImpact}</td>
      </tr>)}</tbody></table></div>
      <footer className="hotspot-pagination"><span>第 {page}/{totalPages} 页 · 共 {filtered.length} 条</span><label>每页<select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10,20,50].map(size => <option key={size}>{size}</option>)}</select>条</label><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</button></footer>
    </section>
  </div>
}
