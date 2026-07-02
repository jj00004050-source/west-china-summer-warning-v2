import type { DataKind } from '../types/data'

export const SCHEMAS: Record<DataKind, Record<string, string[]>> = {
  hotels: {
    whCode: ['酒店WH编码', 'WH编码', '酒店编码', '门店编码', 'hotelId', 'whcode'],
    name: ['门店名称', '酒店名称', 'hotelName'],
    province: ['酒店省区', '省区', '省份', '区域'],
    area: ['酒店片区', '片区', '分区'],
    city: ['城市', '市'],
    businessZone: ['酒店商圈', '商圈', '商圈名称'],
    district: ['行政区域', '行政区'],
    revenueZone: ['收益管理商圈'],
    brand: ['酒店品牌', '品牌'],
    positioning: ['财务品牌定位', '中国区品牌定位', '品牌定位', '档次', '品牌档次'],
    operationType: ['经营类型'],
    managementType: ['管理类型'],
    openDate: ['开业日期'],
    rooms: ['物理房量', '房量', '房间数', '总房量'],
    isNew: ['是否新开', '新开店'],
    isRenovated: ['是否翻新店', '翻新店'],
    status: ['经营状态', '状态'],
    longitude: ['经度', 'longitude', 'lng'],
    latitude: ['纬度', 'latitude', 'lat'],
    benchmarkZone: ['对标商圈', '商圈属性'],
    benchmarkGroup: ['对标门店组'],
  },
  lastYear: {
    date: ['日期', '年月日', '入住日期'],
    mappedDate: ['同期映射日期', '映射日期'],
    whCode: ['酒店WH编码', 'WH编码', '酒店编码', '门店编码', 'hotelId'],
    availableRooms: ['可售房数', '可售房', '可售房量'],
    soldRooms: ['已售房', '已售间夜', '已售房间数', '已售过夜房数'],
    occ: ['OCC', '入住率', '出租率'],
    adr: ['ADR', '平均房价'],
    rp: ['RP', 'RevPAR', '理论RP'],
    revenue: ['综合主营收入', '综合主营业务收入', '主营收入', '营收'],
    channel: ['渠道名称', '渠道'],
    channelNights: ['渠道间夜', '渠道预订间夜'],
    channelRevenue: ['渠道收入', '渠道预订收入'],
  },
  snapshots: {
    snapshotDate: ['快照日期', '数据日期'],
    batchTime: ['跑批次数', '快照批次时间', '快照批次', '批次时间'],
    targetDate: ['年月日', '目标入住日期', '入住日期', '目标日期'],
    dayOffset: ['距离入住天数', 'D日', '提前天数'],
    whCode: ['酒店WH编码', 'WH编码', '酒店编码', '门店编码', 'hotelId'],
    availableRooms: ['可售房间数', '可售房', '可售房量'],
    bookedRooms: ['预订房间总数（已售房）', '预订房间总数(已售房)', '预订房间总数', '预订房间数', '预订间夜', '未来预订间夜'],
    pricedRooms: ['有房价的预订房间数', '有房价预订房间数', '有价间夜'],
    bookingRevenue: ['预订总价', '预订收入', '在手收入'],
    bookingRate: ['预订率'],
    onHandAdr: ['在手ADR', '预订ADR'],
    theoreticalRp: ['理论RP', 'RP', 'RevPAR'],
    channel: ['渠道名称', '渠道'],
    channelLevel1: ['一级渠道'],
    channelLevel2: ['二级渠道'],
    channelLevel3: ['三级渠道'],
    channelNights: ['渠道预订间夜', '渠道间夜'],
    channelRevenue: ['渠道预订收入', '渠道收入'],
    channelAdr: ['渠道在手ADR', '渠道ADR'],
    channelBookingRate: ['渠道预订率'],
  },
  sameLeadSnapshots: {
    name: ['酒店名称', '门店名称', 'hotelName'],
    whCode: ['酒店WH编码', 'WH编码', '酒店编码', '门店编码', 'hotelId', 'whcode'],
    date: ['年月日', '日期', '目标入住日期', '入住日期'],
    bookedRooms: ['预订房间总数（已售房）', '预订房间总数(已售房)', '预订房间总数', '预订房间数', '已售房', '已售房间数'],
    pricedRooms: ['有房价的预订房间数', '有房价预订房间数', '有价间夜'],
    bookingRevenue: ['预订总价', '预订收入', '在手收入'],
    availableRooms: ['可售房间数', '可售房数', '可售房', '可售房量'],
  },
  renovations: {
    whCode: ['酒店WH编码', 'WH编码', '酒店编码', '门店编码'],
    name: ['酒店名称', '门店名称'],
    renovationType: ['改造类型'],
  },
}

const clean = (v: string) => v.trim().replace(/\s+/g, '').toLowerCase()
export function autoMap(headers: string[], kind: DataKind, saved?: Record<string, string>) {
  const result: Record<string, string> = {}
  for (const [target, aliases] of Object.entries(SCHEMAS[kind])) {
    const remembered = saved?.[target]
    if (remembered && headers.includes(remembered)) result[target] = remembered
    else {
      const found = headers.find(h => aliases.some(a => clean(a) === clean(h)))
      if (found) result[target] = found
    }
  }
  return result
}

export const FIELD_LABELS: Record<string, string> = {
  whCode: 'WH编码', name: '门店名称', province: '省区', area: '片区', city: '城市',
  businessZone: '酒店商圈', district: '行政区域', revenueZone: '收益管理商圈', brand: '品牌', positioning: '品牌定位', openDate: '开业日期',
  rooms: '房量', isNew: '是否新开', isRenovated: '是否翻新店', status: '经营状态', operationType: '经营类型', managementType: '管理类型',
  date: '日期', mappedDate: '同期映射日期', availableRooms: '可售房', soldRooms: '已售房',
  occ: 'OCC', adr: 'ADR', rp: 'RP', revenue: '综合主营收入', snapshotDate: '快照日期',
  batchTime: '快照批次时间', targetDate: '目标入住日期', dayOffset: '距离入住天数',
  bookedRooms: '预订房间总数', pricedRooms: '有房价预订房间数', bookingRevenue: '预订总价',
  bookingRate: '预订率', onHandAdr: '在手ADR', theoreticalRp: '理论RP', channel: '渠道名称',
  channelNights: '渠道预订间夜', channelRevenue: '渠道预订收入', channelAdr: '渠道ADR',
  sameLeadSnapshots: '同期同提前期预订快照', 
  renovationType: '改造类型',
}
