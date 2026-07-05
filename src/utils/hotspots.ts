import type {
  HotspotHeat,
  RevenueHotspotData,
  RevenueHotspotRecord,
  RevenueHotspotSummary,
  RevenueHotspotVersion,
} from '../types/hotspots'

type SourceRow = Record<string, unknown>

const aliases = {
  province: ['省份', '省区', '酒店省区'],
  city: ['城市', '地市'],
  category: ['类别', '类型', '热点类型'],
  heat: ['热度', '热度等级', '等级'],
  name: ['项目名称', '热点名称', '事件名称', '名称'],
  venue: ['地址/场馆', '地址', '场馆', '地点'],
  startDate: ['开始日期', '日期', '起始日期'],
  endDate: ['截止日期', '结束日期', '终止日期'],
  status: ['状态', '进展'],
  scale: ['规模', '预计人数', '影响规模'],
  revenueImpact: ['收益影响判断', '收益影响', '影响判断'],
  broadcastText: ['播报口径', '播报内容', '播报文案'],
  source: ['信息来源', '来源'],
} satisfies Record<string, string[]>

const cleanHeader = (value: string) => value.replace(/\s+/g, '').replace(/[（）()]/g, '')
const headerMap = (headers: string[]) => {
  const result: Record<string, string> = {}
  Object.entries(aliases).forEach(([field, names]) => {
    const match = headers.find(header => names.some(name => cleanHeader(header) === cleanHeader(name)))
      || headers.find(header => names.some(name => cleanHeader(header).includes(cleanHeader(name))))
    if (match) result[field] = match
  })
  return result
}

const pad = (value: number) => String(value).padStart(2, '0')
const excelEpoch = Date.UTC(1899, 11, 30)
export const hotspotDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(excelEpoch + Math.round(value) * 86400000)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  const text = String(value ?? '').trim()
  if (!text) return ''
  const chinese = text.match(/^(\d{4})[年/.\\-](\d{1,2})[月/.\\-](\d{1,2})/)
  if (chinese) return `${chinese[1]}-${pad(Number(chinese[2]))}-${pad(Number(chinese[3]))}`
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`
}

export const hotspotCategoryGroup = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (/演唱|演艺|音乐/.test(text)) return '演唱会'
  if (/会展|博览|展会/.test(text)) return '会展'
  if (/赛事|体育|比赛/.test(text)) return '赛事'
  if (/考试|招录|考务/.test(text)) return '考试'
  if (/文旅|景区|旅游|OTA|酒店市场/.test(text)) return '文旅'
  if (/交通|航线|高铁|机场/.test(text)) return '交通'
  if (/天气|自然|气象/.test(text)) return '天气'
  if (/节假日|会议|节庆/.test(text)) return '节庆会议'
  return '其他'
}

const normalizeHeat = (value: unknown): HotspotHeat => {
  const text = String(value ?? '').trim()
  if (/高|强|核心/.test(text)) return '高'
  if (/中/.test(text)) return '中'
  if (/低/.test(text)) return '低'
  return '观察'
}

const hashText = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const addDays = (date: string, count: number) => {
  const time = new Date(`${date}T00:00:00Z`).getTime()
  return Number.isNaN(time) ? '' : new Date(time + count * 86400000).toISOString().slice(0, 10)
}

export function normalizeHotspotRows(rows: SourceRow[]) {
  const headers = Object.keys(rows[0] || {})
  const mapping = headerMap(headers)
  const required = ['province', 'city', 'category', 'heat', 'name', 'startDate']
  const missing = required.filter(field => !mapping[field])
  if (missing.length) throw new Error(`热点明细表头无法识别：${missing.join('、')}`)
  const warnings: string[] = []
  const normalized: RevenueHotspotRecord[] = []
  rows.forEach((row, rowIndex) => {
    const get = (field: keyof typeof aliases) => mapping[field] ? row[mapping[field]] : ''
    const startDate = hotspotDate(get('startDate'))
    const endDate = hotspotDate(get('endDate')) || startDate
    const name = String(get('name') ?? '').trim()
    if (!startDate || !name) {
      warnings.push(`第${rowIndex + 2}行缺少有效日期或热点名称，已跳过`)
      return
    }
    const province = String(get('province') ?? '').trim() || '未配置省区'
    const city = String(get('city') ?? '').trim() || '未配置城市'
    const category = String(get('category') ?? '').trim() || '其他'
    const key = `${province}|${city}|${name}|${startDate}|${endDate}`
    normalized.push({
      id: `${startDate}-${hashText(key)}`,
      province,
      city,
      category,
      categoryGroup: hotspotCategoryGroup(category),
      heat: normalizeHeat(get('heat')),
      name,
      venue: String(get('venue') ?? '').trim() || '--',
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      status: String(get('status') ?? '').trim() || '--',
      scale: String(get('scale') ?? '').trim() || '--',
      revenueImpact: String(get('revenueImpact') ?? '').trim() || '--',
      broadcastText: String(get('broadcastText') ?? '').trim() || '--',
      source: String(get('source') ?? '').trim() || '--',
    })
  })
  if (!normalized.length) throw new Error('热点Excel没有可保存的有效明细')
  return { rows: normalized, warnings, mapping }
}

const counter = (values: string[]) => [...values.reduce<Map<string, number>>((map, value) => {
  map.set(value, (map.get(value) || 0) + 1)
  return map
}, new Map())].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))

export function summarizeHotspots(rows: RevenueHotspotRecord[]): RevenueHotspotSummary {
  const coverageStart = rows.map(row => row.startDate).sort()[0]
  const coverageEnd = rows.map(row => row.endDate).sort().at(-1) || coverageStart
  const dailyCounts: RevenueHotspotSummary['dailyCounts'] = []
  if (coverageStart && coverageEnd) {
    for (let date = coverageStart, guard = 0; date <= coverageEnd && guard < 120; date = addDays(date, 1), guard += 1) {
      const active = rows.filter(row => row.startDate <= date && row.endDate >= date)
      dailyCounts.push({ date, count: active.length, highCount: active.filter(row => row.heat === '高').length })
    }
  }
  const highCities = new Set(rows.filter(row => row.heat === '高').flatMap(row => row.city.split(/[、,，/]/).map(value => value.trim()).filter(Boolean)))
  const heatCounts = counter(rows.map(row => row.heat)).map(item => ({ ...item, name: item.name as HotspotHeat }))
  return {
    total: rows.length,
    provinceCount: new Set(rows.map(row => row.province)).size,
    highHeatCityCount: highCities.size,
    provinceCounts: counter(rows.map(row => row.province)),
    categoryCounts: counter(rows.map(row => row.categoryGroup)),
    heatCounts,
    dailyCounts,
  }
}

export function createHotspotVersion(fileName: string, rows: RevenueHotspotRecord[]): RevenueHotspotVersion {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return {
    id: `hotspot-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    versionNumber: `HOT-${stamp}`,
    updatedAt: now.toISOString(),
    sourceFileName: fileName,
    coverageStart: rows.map(row => row.startDate).sort()[0] || '',
    coverageEnd: rows.map(row => row.endDate).sort().at(-1) || '',
  }
}

export function buildHotspotData(fileName: string, rows: RevenueHotspotRecord[]): RevenueHotspotData {
  return { version: createHotspotVersion(fileName, rows), summary: summarizeHotspots(rows), rows }
}
