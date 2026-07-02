import type { SnapshotRecord } from '../types/data'

export const CHANNEL_COLORS: Record<string, string> = {
  '各OTA': '#2563EB',
  '线上直销': '#10B981',
  '线下直销': '#F59E0B',
  '其他': '#8B5CF6',
  '携程': '#2563EB',
  '美团': '#F97316',
  '飞猪': '#8B5CF6',
}
const CHANNEL_PALETTE = ['#2563EB','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4','#EC4899','#84CC16','#F97316','#6366F1']
export const channelColor = (name: string) => {
  if (CHANNEL_COLORS[name]) return CHANNEL_COLORS[name]
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return CHANNEL_PALETTE[hash % CHANNEL_PALETTE.length]
}

export const channelGroup = (r: SnapshotRecord) => {
  if (r.channelLevel2 === 'OTA' || ['携程','美团','飞猪','OTA其他'].includes(r.channelLevel3 || '') || ['携程','美团','飞猪','OTA'].includes(r.channel)) return '各OTA'
  if (r.channelLevel1 === '线上直销' || ['官网','会员','直连分销'].includes(r.channel)) return '线上直销'
  if (r.channelLevel1 === '线下直销' || ['前台','商旅'].includes(r.channel)) return '线下直销'
  return '其他'
}

export const channelMix = (rows: SnapshotRecord[], hotelIds: Set<string>) => {
  const sums = { ota: 0, online: 0, offline: 0, other: 0 }
  rows.forEach(r => {
    if (!hotelIds.has(r.whCode)) return
    const rooms = r.bookedRooms || 0
    const group = channelGroup(r)
    if (group === '各OTA') sums.ota += rooms
    else if (group === '线上直销') sums.online += rooms
    else if (group === '线下直销') sums.offline += rooms
    else sums.other += rooms
  })
  const total = sums.ota + sums.online + sums.offline + sums.other
  return total ? { ota: sums.ota / total, online: sums.online / total, offline: sums.offline / total, other: sums.other / total } : { ota: 0, online: 0, offline: 0, other: 0 }
}
