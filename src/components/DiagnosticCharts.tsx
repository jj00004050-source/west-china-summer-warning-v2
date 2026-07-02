import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { ComparisonRow, MetricRow, SnapshotRecord } from '../types/data'
import { aggregate } from '../utils/metrics'
import { fmtMoney, fmtPct, fmtPp, riskText } from '../utils/formatter'
import {
  boxStats,
  isDirectStore,
  metricValue,
  storeChannelShares,
  weightedZoneRates,
  type DistributionMetric,
} from '../utils/diagnostics'

export type DiagnosticDay = {
  dayOffset: string
  targetDate: string
  rows: MetricRow[]
  comparisonRows: ComparisonRow[]
}

const metricMeta: Record<DistributionMetric, { label: string; unit: string }> = {
  zoneGap: { label: '较商圈预订率差异', unit: 'pp' },
  bookingRate: { label: '门店预订率', unit: '%' },
  rpGap: { label: '门店RP缺口', unit: '元' },
  rp: { label: '门店理论RP', unit: '元' },
  adrGap: { label: '在手ADR较同期差异', unit: '元' },
  bookingRateChange: { label: '预订率较上一版变化', unit: 'pp' },
  rpChange: { label: '理论RP较上一版变化', unit: '元' },
  otaShare: { label: '门店OTA占比', unit: '%' },
  onlineShare: { label: '门店线上直销占比', unit: '%' },
}

const metricOptions = Object.entries(metricMeta) as Array<[DistributionMetric, typeof metricMeta[DistributionMetric]]>

export function DistributionBoxPlot({ rows, channelRows, groupKey, title, targetDate, batch, onGroup, onStore, onHover }: {
  rows: MetricRow[]
  channelRows: SnapshotRecord[]
  groupKey: 'province' | 'area' | 'revenueZone'
  title: string
  targetDate: string
  batch: string
  onGroup: (name: string, metric: DistributionMetric, priorityCodes: string[]) => void
  onStore: (row: MetricRow, metric: DistributionMetric) => void
  onHover?: (name: string) => void
}) {
  const [metric, setMetric] = useState<DistributionMetric>('bookingRate')
  const zoneRates = useMemo(() => weightedZoneRates(rows), [rows])
  const channelShares = useMemo(() => storeChannelShares(channelRows), [channelRows])
  const groups = useMemo(() => {
    const grouped = rows.reduce<Record<string, MetricRow[]>>((result, row) => {
      const name = String(row[groupKey] || '未归属')
      ;(result[name] ||= []).push(row)
      return result
    }, {})
    return Object.entries(grouped).map(([name, groupRows]) => {
      const points = groupRows.map(row => ({ row, value: metricValue(row, metric, zoneRates, channelShares) })).filter((item): item is { row: MetricRow; value: number } => item.value != null && Number.isFinite(item.value))
      const stats = boxStats(points.map(point => point.value))
      const lowOutliers = points.filter(point => point.value < stats.lowFence)
      const directRows = groupRows.filter(isDirectStore)
      return {
        name,
        rows: groupRows,
        points,
        stats,
        lowOutliers,
        zeroCount: groupRows.filter(row => row.bookedRooms === 0).length,
        lowCount: groupRows.filter(row => (row.bookingRate || 0) < .1).length,
        directCount: directRows.length,
        directRiskCount: directRows.filter(row => row.risk === 'high' || row.risk === 'watch').length,
      }
    }).filter(group => group.points.length).sort((a, b) => a.stats.median - b.stats.median)
  }, [rows, groupKey, metric, zoneRates, channelShares])
  const meta = metricMeta[metric]
  const boxData = groups.map(group => ({
    value: [group.stats.min, group.stats.q1, group.stats.median, group.stats.q3, group.stats.max],
    group,
    itemStyle: { color: group.stats.median < 0 ? '#FDECEC' : '#EAF2FF', borderColor: group.stats.median < 0 ? '#E5484D' : '#2F6BFF' },
  }))
  const pointData = groups.flatMap((group, index) => group.points.map(point => ({
    value: [index, point.value],
    row: point.row,
    group: group.name,
    itemStyle: { color: point.value < group.stats.lowFence ? '#E5484D' : point.row.bookedRooms === 0 ? '#F59E0B' : '#5B9AF3' },
    symbolSize: point.value < group.stats.lowFence ? 9 : 5,
  })))
  const meanData = groups.map((group, index) => ({ value: [index, group.stats.mean], group: group.name }))
  const option = {
    animationDuration: 450,
    grid: { left: 58, right: 22, top: 32, bottom: groups.length > 10 ? 95 : 58 },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,.98)',
      borderColor: '#c8d8e9',
      extraCssText: 'border-radius:10px;box-shadow:0 10px 28px rgba(31,45,61,.15);',
      textStyle: { color: '#29445f', fontSize: 11 },
      formatter: (params: { seriesType: string; data: typeof boxData[number] | typeof pointData[number] }) => {
        if (params.seriesType === 'scatter' && 'row' in params.data) {
          const point = params.data
          return `<b>${point.row.name}</b><br/>${meta.label}：${point.value[1].toFixed(2)}${meta.unit}<br/>预订率：${fmtPct(point.row.bookingRate)}<br/>RP缺口：${fmtMoney(point.row.rpGap)}<br/>风险：${riskText[point.row.risk]}`
        }
        const group = (params.data as typeof boxData[number]).group
        return `<b>${group.name}</b><br/>当前日期：${targetDate}　跑批：${batch}<br/>门店数：${group.rows.length}<br/>中位数：${group.stats.median.toFixed(2)}${meta.unit}<br/>P25 / P75：${group.stats.q1.toFixed(2)} / ${group.stats.q3.toFixed(2)}<br/>IQR：${group.stats.iqr.toFixed(2)}<br/>最低 / 最高：${group.stats.min.toFixed(2)} / ${group.stats.max.toFixed(2)}<br/>均值：${group.stats.mean.toFixed(2)}<br/>低值离群：${group.lowOutliers.length}家　0预定：${group.zeroCount}家<br/>低预订率：${group.lowCount}家　直营风险：${group.directRiskCount}家`
      },
    },
    xAxis: {
      type: 'category',
      data: groups.map(group => group.name),
      axisLabel: { color: '#708399', fontSize: 9, rotate: groups.length > 10 ? 35 : 0, interval: 0 },
      axisLine: { lineStyle: { color: '#d9e4ef' } },
    },
    yAxis: {
      type: 'value',
      name: `${meta.label}（${meta.unit}）`,
      nameTextStyle: { color: '#7a8da3', fontSize: 9 },
      axisLabel: { color: '#8294a7', fontSize: 9 },
      splitLine: { lineStyle: { color: '#edf2f7' } },
    },
    dataZoom: groups.length > 12 ? [{ type: 'slider', xAxisIndex: 0, bottom: 44, height: 12, start: 0, end: Math.min(100, 12 / groups.length * 100), borderColor: '#dbe6f1', fillerColor: '#dcecff', handleStyle: { color: '#3B82F6' } }, { type: 'inside', xAxisIndex: 0 }] : [],
    series: [
      { name: '分布', type: 'boxplot', data: boxData, boxWidth: [12, 30] },
      { name: '门店', type: 'scatter', data: pointData, symbolSize: (value: number[], params: { data: typeof pointData[number] }) => params.data.symbolSize, z: 4 },
      { name: '均值', type: 'scatter', data: meanData, symbol: 'diamond', symbolSize: 9, itemStyle: { color: '#16A34A' }, z: 5 },
    ],
  }
  const event = (params: { seriesType: string; data?: typeof boxData[number] | typeof pointData[number] }) => {
    if (!params.data) return
    if (params.seriesType === 'scatter' && 'row' in params.data) onStore(params.data.row, metric)
    else if ('group' in params.data && typeof params.data.group !== 'string') {
      const group = params.data.group
      onGroup(group.name, metric, [...group.lowOutliers.map(item => item.row.whCode), ...group.rows.filter(row => row.bookedRooms === 0).map(row => row.whCode)])
    }
  }
  return <section className="light-card diagnostic-card boxplot-card">
    <div className="light-card-head"><div><h2>{title}</h2><p>每个箱体代表{groupKey === 'province' ? '省区' : groupKey === 'area' ? '片区' : '收益管理商圈'}，圆点代表门店；点击箱体或离群点下钻</p></div>
      <select value={metric} onChange={event => setMetric(event.target.value as DistributionMetric)}>{metricOptions.map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>
    </div>
    <div className="diagnostic-legend"><span><i className="median"/>箱体：P25-P75 / 中位数</span><span><i className="mean"/>◆ 均值</span><span><i className="outlier"/>低值离群</span><b>{rows.length} 家在营门店</b></div>
    <ReactECharts option={option} style={{ height: 410 }} onEvents={{ click: event, mouseover: (params: { name?: string; data?: { group?: string } }) => onHover?.(params.data?.group || params.name || ''), mouseout: () => onHover?.('') }}/>
    <div className="boxplot-reading-guide">
      <b>怎么看箱形图</b>
      <span><i className="guide-box"/>箱体表示中间50%的门店，箱体越低，说明整体表现越弱；箱体越高，说明整体表现越好。</span>
      <span><i className="guide-line"/>箱体中线是中位数，上下边分别为P25和P75；箱体越长，说明门店分化越明显。</span>
      <span><i className="guide-dot"/>红色圆点是低值离群门店，表示明显落后于同组多数门店，建议优先下钻查看。</span>
      <span><i className="guide-diamond"/>绿色菱形是均值；若均值明显低于中位数，通常表示少数低值门店正在拖累整体。</span>
    </div>
  </section>
}

export function RiskHeatmap({ days, level, title, batch, comparisonLabel, onSelect }: {
  days: DiagnosticDay[]
  level: 'province' | 'area' | 'revenueZone'
  title: string
  batch: string
  comparisonLabel: string
  onSelect: (name: string, dayOffset: string) => void
}) {
  const names = [...new Set(days.flatMap(day => day.rows.map(row => String(row[level] || '未归属'))))]
  const data = days.flatMap((day, x) => names.map((name, y) => {
    const rows = day.rows.filter(row => String(row[level] || '未归属') === name)
    const comparison = day.comparisonRows.filter(row => String(row[level] || '未归属') === name)
    const m = aggregate(rows, comparison)
    const hasPrevious = rows.some(row => row.previousAvailableRooms != null)
    const bookingChange = hasPrevious ? m.bookingRateChange : null
    const adrChange = hasPrevious ? m.adrChange : null
    const rpChange = hasPrevious ? m.rpChange : null
    const bookedChange = hasPrevious ? m.bookedRooms - m.previousBookedRooms : null
    const zeroCount = rows.filter(row => row.bookedRooms === 0).length
    const previousZeroCount = hasPrevious ? rows.filter(row => row.previousAvailableRooms != null && (row.previousBookedRooms || 0) === 0).length : null
    const zeroChange = previousZeroCount == null ? null : zeroCount - previousZeroCount
    const quantityDirection = (bookingChange || 0) > 0 ? '升' : (bookingChange || 0) < 0 ? '降' : '平'
    const priceDirection = (adrChange || 0) > 0 ? '升' : (adrChange || 0) < 0 ? '降' : '平'
    const movementTag = quantityDirection === '平' && priceDirection === '平' ? '量价平稳' : `量${quantityDirection}价${priceDirection}`
    return {
      value: [x, y, (bookingChange || 0) * 100],
      name,
      dayOffset: day.dayOffset,
      targetDate: day.targetDate,
      rows: rows.length,
      bookingRate: m.bookingRate,
      previousBookingRate: m.previousBookingRate,
      bookingChange,
      adr: m.adr,
      previousAdr: m.previousAdr,
      adrChange,
      rp: m.rp,
      previousRp: m.previousRp,
      rpChange,
      bookedRooms: m.bookedRooms,
      previousBookedRooms: hasPrevious ? m.previousBookedRooms : null,
      bookedChange,
      zeroCount,
      previousZeroCount,
      zeroChange,
      movementTag,
      hasPrevious,
    }
  }))
  const values = data.map(item => item.value[2] as number)
  const maxAbs = Math.max(1, ...values.map(Math.abs))
  const changeText = (value: number | null, unit: 'pp' | 'money') => value == null ? '--' : unit === 'pp' ? fmtPp(value) : `${value >= 0 ? '+' : ''}${fmtMoney(value)}`
  const option = {
    grid: { left: 130, right: 38, top: 20, bottom: 55 },
    tooltip: {
      backgroundColor: 'rgba(255,255,255,.98)', borderColor: '#c8d8e9', extraCssText: 'border-radius:10px;box-shadow:0 10px 28px rgba(31,45,61,.15);',
      textStyle: { color: '#29445f', fontSize: 11 },
      formatter: (params: { data: typeof data[number] }) => {
        const item = params.data
        return `<div style="min-width:310px"><b style="font-size:13px">${item.name}</b><span style="float:right;color:#71859a">${item.movementTag}</span><br/>
          <span style="color:#7a8da3">${item.dayOffset} · 目标入住日期 ${item.targetDate} · 当前跑批 ${batch}</span><br/><br/>
          当前预订率：<b>${fmtPct(item.bookingRate)}</b>　上一版：${fmtPct(item.previousBookingRate)}<br/>
          预订率${comparisonLabel}：<b>${changeText(item.bookingChange, 'pp')}</b><br/>
          当前在手ADR：<b>${fmtMoney(item.adr)}</b>　上一版：${fmtMoney(item.previousAdr)}<br/>
          在手ADR${comparisonLabel}：<b>${changeText(item.adrChange, 'money')}</b><br/>
          当前理论RP：<b>${fmtMoney(item.rp)}</b>　上一版：${fmtMoney(item.previousRp)}<br/>
          理论RP${comparisonLabel}：<b>${changeText(item.rpChange, 'money')}</b><br/>
          当前预订房间：<b>${item.bookedRooms.toLocaleString()}</b>　上一版：${item.previousBookedRooms == null ? '--' : item.previousBookedRooms.toLocaleString()}　变化：${item.bookedChange == null ? '--' : `${item.bookedChange >= 0 ? '+' : ''}${item.bookedChange}`}<br/>
          当前0预定门店：<b>${item.zeroCount}</b>　上一版：${item.previousZeroCount ?? '--'}　变化：${item.zeroChange == null ? '--' : `${item.zeroChange >= 0 ? '+' : ''}${item.zeroChange}`}<br/>
          当前在营门店：${item.rows}家<br/><span style="color:#71859a">环比基准：${comparisonLabel}；按同一真实目标入住日期匹配</span></div>`
      },
    },
    xAxis: { type: 'category', data: days.map(day => `${day.dayOffset}\n${day.targetDate.slice(5)}`), axisLabel: { color: '#71859a', fontSize: 9 }, axisLine: { lineStyle: { color: '#dce6f0' } } },
    yAxis: { type: 'category', data: names, axisLabel: { color: '#526b84', fontSize: 9, width: 110, overflow: 'truncate' }, axisLine: { show: false } },
    visualMap: {
      min: -maxAbs,
      max: maxAbs,
      orient: 'horizontal', left: 'center', bottom: 3, itemWidth: 12, itemHeight: 110,
      textStyle: { color: '#7a8da3', fontSize: 8 },
      text: ['预订率提升', '预订率下降'],
      inRange: { color: ['#F2A7AB','#FFD6AD','#F2F4F7','#DCEBFF','#93D8BC'] },
    },
    dataZoom: names.length > 6 ? [{ type: 'slider', yAxisIndex: 0, right: 4, width: 10, start: Math.max(0, 100 - 6 / names.length * 100), end: 100, borderColor: '#dbe6f1', fillerColor: '#dcecff', handleStyle: { color: '#3B82F6' } }, { type: 'inside', yAxisIndex: 0 }] : [],
    series: [{
      type: 'heatmap',
      data,
      label: {
        show: true,
        formatter: (params: { data: typeof data[number] }) => {
          const item = params.data
          const bookingToken = item.bookingChange == null ? 'flat' : item.bookingChange >= 0 ? 'up' : 'down'
          const adrToken = item.adrChange == null ? 'flat' : item.adrChange >= 0 ? 'up' : 'down'
          return `{rate|${fmtPct(item.bookingRate)}}\n{${bookingToken}|${comparisonLabel.replace('较', '')} ${changeText(item.bookingChange, 'pp')}}\n{adr|ADR ${fmtMoney(item.adr)}}\n{${adrToken}|${comparisonLabel.replace('较', '')} ${changeText(item.adrChange, 'money')}}`
        },
        rich: {
          rate: { color: '#1f3b5b', fontSize: 13, fontWeight: 700, lineHeight: 19 },
          adr: { color: '#405b75', fontSize: 9, fontWeight: 600, lineHeight: 15 },
          up: { color: '#087f5b', fontSize: 8, lineHeight: 14 },
          down: { color: '#c2413b', fontSize: 8, lineHeight: 14 },
          flat: { color: '#718096', fontSize: 8, lineHeight: 14 },
        },
      },
      itemStyle: { borderColor: '#fff', borderWidth: 4, borderRadius: 7 },
      emphasis: { itemStyle: { borderColor: '#2563EB', borderWidth: 2, shadowBlur: 8, shadowColor: '#2563EB55' } },
    }],
  }
  return <section className="light-card diagnostic-card heatmap-card">
    <div className="light-card-head"><div><h2>{title}</h2><p>背景色表示预订率较上一版变化；单元格同时展示当前预订率、ADR及各自变化，点击后下钻</p></div><div className="heatmap-change-legend"><span className="down">下降</span><span className="flat">持平</span><span className="up">提升</span></div></div>
    <ReactECharts option={option} style={{ height: 520 }} onEvents={{ click: (params: { data?: typeof data[number] }) => params.data && onSelect(params.data.name, params.data.dayOffset) }}/>
  </section>
}

export function RevenueZoneRelativeScatter({ rows, zoneName, onStore }: { rows: MetricRow[]; zoneName: string; onStore: (row: MetricRow) => void }) {
  const zoneRate = aggregate(rows).bookingRate
  const points = rows.map(row => ({
    value: [
      row.bookingRate != null && zoneRate != null ? (row.bookingRate - zoneRate) * 100 : 0,
      row.rpGap ?? 0,
      Math.max(8, Math.sqrt(row.availableRooms || 1) * 2.2),
    ],
    row,
    itemStyle: { color: row.risk === 'high' ? '#E5484D' : row.risk === 'watch' ? '#F59E0B' : row.risk === 'leading' ? '#16A34A' : '#3B82F6' },
  }))
  const option = {
    grid: { left: 60, right: 30, top: 35, bottom: 50 },
    tooltip: { backgroundColor: 'rgba(255,255,255,.98)', borderColor: '#c8d8e9', textStyle: { color: '#29445f', fontSize: 10 }, formatter: (params: { data: typeof points[number] }) => `<b>${params.data.row.name}</b><br/>较商圈预订率：${fmtPp(params.data.value[0] / 100)}<br/>RP缺口：${fmtMoney(params.data.row.rpGap)}<br/>可售房：${params.data.row.availableRooms}<br/>风险：${riskText[params.data.row.risk]}` },
    xAxis: { type: 'value', name: '本店预订率 - 商圈预订率（pp）', nameLocation: 'middle', nameGap: 32, axisLabel: { formatter: '{value}pp', color: '#7a8da3' }, splitLine: { lineStyle: { color: '#edf2f7' } } },
    yAxis: { type: 'value', name: '理论RP - 同期RP', axisLabel: { color: '#7a8da3' }, splitLine: { lineStyle: { color: '#edf2f7' } } },
    series: [{ type: 'scatter', data: points, symbolSize: (value: number[]) => value[2], itemStyle: { opacity: .82, borderColor: '#fff', borderWidth: 1.5 }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#91a9c1', type: 'dashed' }, data: [{ xAxis: 0 }, { yAxis: 0 }] } }],
  }
  return <section className="light-card diagnostic-card relative-scatter-card"><div className="light-card-head"><div><h2>{zoneName} · 门店相对表现</h2><p>仅在同一收益管理商圈内比较相对预订表现与RP缺口，点击门店查看单店诊断</p></div></div><ReactECharts option={option} style={{ height: 390 }} onEvents={{ click: (params: { data?: typeof points[number] }) => params.data && onStore(params.data.row) }}/></section>
}
