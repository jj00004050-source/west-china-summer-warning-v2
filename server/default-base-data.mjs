import XLSX from 'xlsx'
import { join } from 'node:path'

const text = value => String(value ?? '').trim()
const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const date = value => {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' || /^\d{5}$/.test(text(value))) {
    return new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000).toISOString().slice(0, 10)
  }
  const parsed = new Date(text(value))
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}
const sheetRows = file => {
  const workbook = XLSX.readFile(file, { cellDates: false })
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: true })
}

export function loadDefaultBaseData(root) {
  const defaults = join(root, 'server', 'defaults')
  const hotels = sheetRows(join(defaults, '酒店维度表.xlsx')).map(row => ({
    whCode: text(row['酒店WH编码']),
    name: text(row['酒店名称']),
    province: text(row['酒店省区']),
    area: text(row['酒店片区']),
    city: text(row['城市']),
    district: text(row['行政区域']),
    businessZone: text(row['酒店商圈']),
    revenueZone: text(row['收益管理商圈']),
    brand: text(row['酒店品牌']),
    positioning: text(row['财务品牌定位'] || row['中国区品牌定位']),
    operationType: text(row['经营类型']),
    managementType: text(row['管理类型']),
    openDate: date(row['开业日期']),
    rooms: number(row['物理房量']),
    isNew: false,
    isRenovated: false,
    status: text(row['经营状态']),
  })).filter(row => row.whCode)
  const lastYear = sheetRows(join(defaults, '去年同期暑期经营数据.xlsx')).map(row => ({
    date: date(row['年月日']),
    whCode: text(row['酒店WH编码']),
    availableRooms: number(row['可售房数']),
    soldRooms: number(row['已售房间数']),
    revenue: number(row['综合主营业务收入']),
    channel: '',
    channelNights: 0,
    channelRevenue: 0,
  })).filter(row => row.whCode && row.date)
  const renovations = sheetRows(join(defaults, '翻新店明细.xlsx')).map(row => ({
    whCode: text(row['酒店WH编码']),
    renovationType: text(row['改造类型']),
  })).filter(row => row.whCode && row.renovationType)
  return { hotels, lastYear, renovations }
}
