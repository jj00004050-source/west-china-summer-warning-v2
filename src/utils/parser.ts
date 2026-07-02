import { read, utils } from 'xlsx'
import type { DataKind, Hotel, LastYearRecord, QualityIssue, RenovationRecord, SameLeadSnapshotRecord, SnapshotRecord } from '../types/data'
import { normalizeChannel } from './channelMapping'

export async function readFile(file: File) {
  const buffer = await file.arrayBuffer()
  const book = read(buffer, { type: 'array', cellDates: false })
  const sheet = book.Sheets[book.SheetNames[0]]
  return utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
}

const str = (v: unknown) => String(v ?? '').trim()
const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(/[%￥¥,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const ratio = (v: unknown) => {
  const n = num(v)
  return n > 1 ? n / 100 : n
}
const yes = (v: unknown) => ['是', '1', 'true', 'yes', '新开'].includes(str(v).toLowerCase())
const date = (v: unknown) => {
  if (v instanceof Date) {
    const year = v.getFullYear()
    const month = String(v.getMonth() + 1).padStart(2, '0')
    const day = String(v.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const s = str(v)
  if (!s) return ''
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10)
  const calendar = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\s|T|$)/)
  if (calendar) return `${calendar[1]}-${calendar[2].padStart(2, '0')}-${calendar[3].padStart(2, '0')}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s.replace(/\//g, '-') : d.toISOString().slice(0, 10)
}
const val = (row: Record<string, unknown>, map: Record<string, string>, key: string) => row[map[key]]
export const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const parsableNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value)
  const cleaned = String(value ?? '').replace(/[%￥¥,\s]/g, '')
  return cleaned !== '' && Number.isFinite(Number(cleaned))
}
const structureIssue = (field: string, message: string): QualityIssue => ({ level: 'error', row: 1, field, message })
const structureLabels: Record<string, string> = {
  whCode: '酒店WH编码',
  name: '酒店名称',
  status: '经营状态',
  province: '酒店省区',
  area: '酒店片区',
  date: '年月日',
  targetDate: '目标入住日期',
  batchTime: '跑批次数',
  availableRooms: '可售房',
  soldRooms: '已售房间数',
  bookedRooms: '预订房间总数',
  bookingRevenue: '预订总价',
  revenue: '综合主营业务收入',
}

export function validateUploadStructure(rows: Record<string, unknown>[], kind: DataKind, map: Record<string, string>): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (!rows.length) return [structureIssue('文件', '文件为空或没有可识别的数据行')]
  const requireMappings = (keys: string[]) => keys.forEach(key => {
    if (!map[key]) issues.push(structureIssue(structureLabels[key] || key, `表头缺失，无法映射${structureLabels[key] || key}`))
  })
  const values = (key: string) => map[key] ? rows.map(row => row[map[key]]) : []

  if (kind === 'hotels') {
    requireMappings(['whCode', 'name'])
    if (map.whCode && map.name && !rows.some(row => str(row[map.whCode]) && str(row[map.name]))) {
      issues.push(structureIssue('有效数据行', '没有任何同时包含酒店WH编码和酒店名称的有效行'))
    }
  }
  if (kind === 'lastYear') {
    requireMappings(['date', 'availableRooms', 'soldRooms', 'revenue'])
    if (map.date && !values('date').some(value => validDate(date(value)))) {
      issues.push(structureIssue('年月日', '年月日字段完全无法识别'))
    }
    ;(['soldRooms', 'revenue'] as const).forEach(key => {
      if (map[key] && !values(key).some(parsableNumber)) issues.push(structureIssue(structureLabels[key], `${structureLabels[key]}字段完全无法解析`))
    })
  }
  if (kind === 'snapshots') {
    requireMappings(['whCode', 'targetDate', 'batchTime', 'availableRooms', 'bookedRooms', 'bookingRevenue'])
    if (!map.channel && !map.channelLevel1 && !map.channelLevel2 && !map.channelLevel3) {
      issues.push(structureIssue('渠道', '表头缺失，无法识别一级、二级、三级渠道或渠道名称'))
    }
    if (map.targetDate && !values('targetDate').some(value => validDate(date(value)))) {
      issues.push(structureIssue('目标入住日期', '年月日字段完全无法识别'))
    }
    if (map.batchTime && !values('batchTime').some(value => str(value) !== '')) {
      issues.push(structureIssue('跑批次数', '跑批次数字段完全无法识别'))
    }
    ;(['bookedRooms', 'bookingRevenue'] as const).forEach(key => {
      if (map[key] && !values(key).some(parsableNumber)) issues.push(structureIssue(structureLabels[key], `${structureLabels[key]}字段完全无法解析`))
    })
  }
  if (kind === 'sameLeadSnapshots') {
    requireMappings(['whCode', 'date', 'bookedRooms', 'bookingRevenue', 'availableRooms'])
    if (map.date && !values('date').some(value => validDate(date(value)))) {
      issues.push(structureIssue('年月日', '年月日字段完全无法识别'))
    }
    if (map.whCode && map.date && map.bookedRooms && map.bookingRevenue && map.availableRooms && !rows.some(row =>
      str(row[map.whCode]) &&
      validDate(date(row[map.date])) &&
      parsableNumber(row[map.bookedRooms]) &&
      parsableNumber(row[map.bookingRevenue])
    )) {
      issues.push(structureIssue('有效数据行', '完全没有可识别WH编码、年月日、预订房间数及预订总价的有效数据行'))
    }
  }
  if (kind === 'renovations') requireMappings(['whCode', 'renovationType'])
  return issues
}

export function normalizeRows(rows: Record<string, unknown>[], kind: DataKind, map: Record<string, string>, channelMap: Record<string, string>) {
  if (kind === 'hotels') return rows.map(r => ({
    whCode: str(val(r, map, 'whCode')), name: str(val(r, map, 'name')), province: str(val(r, map, 'province')),
    area: str(val(r, map, 'area')), city: str(val(r, map, 'city')), businessZone: str(val(r, map, 'businessZone')),
    district: str(val(r, map, 'district')), revenueZone: str(val(r, map, 'revenueZone')),
    brand: str(val(r, map, 'brand')), positioning: str(val(r, map, 'positioning')),
    operationType: str(val(r, map, 'operationType')), managementType: str(val(r, map, 'managementType')), openDate: date(val(r, map, 'openDate')),
    rooms: num(val(r, map, 'rooms')), isNew: yes(val(r, map, 'isNew')), isRenovated: yes(val(r, map, 'isRenovated')),
    status: str(val(r, map, 'status')), longitude: num(val(r, map, 'longitude')) || undefined,
    latitude: num(val(r, map, 'latitude')) || undefined, benchmarkZone: str(val(r, map, 'benchmarkZone')),
    benchmarkGroup: str(val(r, map, 'benchmarkGroup')),
  } satisfies Hotel))
  if (kind === 'lastYear') return rows.map(r => ({
    date: date(val(r, map, 'date')), mappedDate: date(val(r, map, 'mappedDate')), whCode: str(val(r, map, 'whCode')),
    availableRooms: num(val(r, map, 'availableRooms')), soldRooms: num(val(r, map, 'soldRooms')),
    occ: map.occ ? ratio(val(r, map, 'occ')) : undefined, adr: map.adr ? num(val(r, map, 'adr')) : undefined,
    rp: map.rp ? num(val(r, map, 'rp')) : undefined, revenue: map.revenue ? num(val(r, map, 'revenue')) : undefined,
    channel: normalizeChannel(val(r, map, 'channel'), channelMap), channelNights: num(val(r, map, 'channelNights')),
    channelRevenue: num(val(r, map, 'channelRevenue')),
  } satisfies LastYearRecord))
  if (kind === 'sameLeadSnapshots') return rows.map(r => ({
    name: str(val(r, map, 'name')),
    whCode: str(val(r, map, 'whCode')),
    date: date(val(r, map, 'date')),
    bookedRooms: num(val(r, map, 'bookedRooms')),
    pricedRooms: num(val(r, map, 'pricedRooms')),
    bookingRevenue: num(val(r, map, 'bookingRevenue')),
    availableRooms: num(val(r, map, 'availableRooms')),
  } satisfies SameLeadSnapshotRecord))
  if (kind === 'renovations') return rows.map(r => ({
    whCode: str(val(r, map, 'whCode')), name: str(val(r, map, 'name')),
    renovationType: str(val(r, map, 'renovationType')),
  } satisfies RenovationRecord))
  return rows.map(r => {
    const availableRooms = num(val(r, map, 'availableRooms'))
    const bookedRooms = num(val(r, map, 'bookedRooms'))
    const pricedRooms = num(val(r, map, 'pricedRooms')) || bookedRooms
    const bookingRevenue = num(val(r, map, 'bookingRevenue'))
    const bookingRate = map.bookingRate ? ratio(val(r, map, 'bookingRate')) : (availableRooms ? bookedRooms / availableRooms : undefined)
    const onHandAdr = map.onHandAdr ? num(val(r, map, 'onHandAdr')) : (pricedRooms ? bookingRevenue / pricedRooms : undefined)
    const targetDate = date(val(r, map, 'targetDate'))
    const snapshotDate = date(val(r, map, 'snapshotDate')) || targetDate
    const level1 = str(val(r, map, 'channelLevel1')), level2 = str(val(r, map, 'channelLevel2')), level3 = str(val(r, map, 'channelLevel3'))
    const rawChannel = val(r, map, 'channel') || level3 || level2 || level1
    return {
      snapshotDate, batchTime: str(val(r, map, 'batchTime')),
      targetDate, dayOffset: str(val(r, map, 'dayOffset')).toUpperCase(),
      whCode: str(val(r, map, 'whCode')), availableRooms, bookedRooms, pricedRooms, bookingRevenue,
      bookingRate, onHandAdr, theoreticalRp: map.theoreticalRp ? num(val(r, map, 'theoreticalRp')) : (bookingRate != null && onHandAdr != null ? bookingRate * onHandAdr : undefined),
      channel: normalizeChannel(rawChannel, channelMap), channelLevel1: level1,
      channelLevel2: level2, channelLevel3: level3,
      channelNights: num(val(r, map, 'channelNights')) || bookedRooms,
      channelRevenue: num(val(r, map, 'channelRevenue')) || bookingRevenue,
      channelAdr: map.channelAdr ? num(val(r, map, 'channelAdr')) : undefined,
      channelBookingRate: map.channelBookingRate ? ratio(val(r, map, 'channelBookingRate')) : undefined,
    } satisfies SnapshotRecord
  })
}

export function validateRows(rows: Array<Hotel | LastYearRecord | SnapshotRecord | SameLeadSnapshotRecord | RenovationRecord>, kind: DataKind): QualityIssue[] {
  const issues: QualityIssue[] = []
  const seen = new Map<string, number>()
  const snapshotGroups = new Map<string, { row: number; available: number[]; booked: number }>()
  rows.forEach((r, i) => {
    if (!r.whCode) issues.push({ level: kind === 'lastYear' || kind === 'hotels' || kind === 'sameLeadSnapshots' ? 'warning' : 'error', row: i + 2, field: 'WH编码', message: 'WH编码为空' })
    if (kind === 'hotels') {
      const h = r as Hotel
      if (h.whCode && seen.has(h.whCode)) issues.push({ level: 'warning', row: i + 2, field: '酒店WH编码', message: `与第${seen.get(h.whCode)}行重复，请核对主数据` }); else if (h.whCode) seen.set(h.whCode, i + 2)
      if (!h.name) issues.push({ level: 'warning', row: i + 2, field: '酒店名称', message: '酒店名称为空' })
      if (!h.status) issues.push({ level: 'warning', row: i + 2, field: '经营状态', message: '经营状态为空，该门店不会进入当前在营门店明细' })
      if (!h.province) issues.push({ level: 'warning', row: i + 2, field: '酒店省区', message: '酒店省区为空' })
      if (!h.area) issues.push({ level: 'warning', row: i + 2, field: '酒店片区', message: '酒店片区为空' })
      if (!h.city) issues.push({ level: 'warning', row: i + 2, field: '城市', message: '城市为空' })
      if (!h.district) issues.push({ level: 'warning', row: i + 2, field: '行政区域', message: '行政区域为空' })
      if (!h.revenueZone) issues.push({ level: 'warning', row: i + 2, field: '收益管理商圈', message: ['在营', '在营业'].includes(h.status) ? '在营门店收益管理商圈为空' : `非在营门店收益管理商圈为空（${h.status || '状态未配置'}）` })
      if (!h.positioning) issues.push({ level: 'warning', row: i + 2, field: '品牌定位', message: '品牌定位为空' })
      if (h.rooms <= 0) issues.push({ level: 'warning', row: i + 2, field: '物理房量', message: ['在营', '在营业'].includes(h.status) ? '在营门店物理房量为空或为0' : `非在营门店物理房量为空或为0（${h.status || '状态未配置'}）` })
    }
    if (kind === 'lastYear') {
      const ly = r as LastYearRecord
      if (!validDate(ly.date)) issues.push({ level: 'warning', row: i + 2, field: '年月日', message: '该行年月日无法识别，不参与同期日期匹配' })
      if (ly.availableRooms <= 0) issues.push({ level: 'warning', row: i + 2, field: '可售房', message: '可售房为空或为0，计算同期OCC时不计入可售分母' })
      if (ly.soldRooms > ly.availableRooms) issues.push({ level: 'warning', row: i + 2, field: '已售房间数', message: '已售房间数大于可售房数' })
      if (ly.revenue == null) issues.push({ level: 'warning', row: i + 2, field: '综合主营业务收入', message: '综合主营业务收入为空' })
    }
    if (kind === 'snapshots') {
      const s = r as SnapshotRecord
      if ((s.bookingRate ?? 0) > 1) issues.push({ level: 'warning', row: i + 2, field: '预订率', message: '预订率大于100%', value: s.bookingRate })
      if (s.bookingRevenue < 0) issues.push({ level: 'warning', row: i + 2, field: '预订总价', message: '预订总价小于0' })
      if (!validDate(s.targetDate)) issues.push({ level: 'error', row: i + 2, field: '目标入住日期', message: '目标入住日期无法识别' })
      if (!s.batchTime) issues.push({ level: 'error', row: i + 2, field: '跑批次数', message: '跑批次数为空' })
      if (s.pricedRooms <= 0 && s.bookedRooms > 0) issues.push({ level: 'warning', row: i + 2, field: '有房价的预订房间数', message: '有预订但有房价房间数为0' })
      const key = `${s.whCode}|${s.targetDate}|${s.batchTime}`
      const snapshotGroup = snapshotGroups.get(key) || { row: i + 2, available: [], booked: 0 }
      if (s.availableRooms > 0) snapshotGroup.available.push(s.availableRooms)
      snapshotGroup.booked += Number.isFinite(s.bookedRooms) ? s.bookedRooms : 0
      snapshotGroups.set(key, snapshotGroup)
    }
    if (kind === 'sameLeadSnapshots') {
      const sameLead = r as SameLeadSnapshotRecord
      if (!validDate(sameLead.date)) issues.push({ level: 'warning', row: i + 2, field: '年月日', message: '该行年月日无法识别，保存时将跳过' })
      if (sameLead.availableRooms <= 0) issues.push({ level: 'warning', row: i + 2, field: '可售房间数', message: '可售房为空或为0，同提前期预订率和理论RP将安全显示为 --' })
      if (sameLead.pricedRooms <= 0 && sameLead.bookedRooms > 0) issues.push({ level: 'warning', row: i + 2, field: '有房价的预订房间数', message: '有房价预订房间数为空或为0，同提前期ADR将显示为 --' })
      if (sameLead.bookingRevenue < 0) issues.push({ level: 'warning', row: i + 2, field: '预订总价', message: '预订总价小于0，请核验历史快照' })
    }
    if (kind === 'renovations') {
      const renovation = r as RenovationRecord
      if (!renovation.renovationType) issues.push({ level: 'error', row: i + 2, field: '改造类型', message: '改造类型为空' })
    }
  })
  if (kind === 'snapshots') snapshotGroups.forEach(group => {
    const validAvailable = Math.max(0, ...group.available)
    if (!validAvailable) {
      issues.push({ level: 'warning', row: group.row, field: '可售房间数', message: '同门店、同日期、同跑批聚合后仍无有效可售房' })
      return
    }
    if (new Set(group.available).size > 1) {
      issues.push({ level: 'warning', row: group.row, field: '可售房间数', message: `同门店同日期同跑批的有效可售房不一致，计算时取最大值 ${validAvailable}` })
    }
    if (group.booked > validAvailable) {
      issues.push({ level: 'warning', row: group.row, field: '预订房间总数', message: '门店组聚合后的预订房间总数大于有效可售房间数' })
    }
  })
  return issues
}
