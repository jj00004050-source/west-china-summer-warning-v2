import type { SnapshotRecord } from '../types/data'
import { channelMix } from '../utils/channels'
import { fmtPct } from '../utils/formatter'
import { CHANNEL_COLORS } from '../utils/channels'

export default function MiniChannelDonut({ rows, hotelIds }: { rows: SnapshotRecord[]; hotelIds: Set<string> }) {
  const mix = channelMix(rows, hotelIds)
  const a = mix.ota * 100
  const b = a + mix.online * 100
  const c = b + mix.offline * 100
  const title = `各OTA ${fmtPct(mix.ota)}｜线上直销 ${fmtPct(mix.online)}｜线下直销 ${fmtPct(mix.offline)}｜其他 ${fmtPct(mix.other)}`
  return <div className="mini-channel-wrap" title={title}>
    <i className="mini-channel-donut" style={{ background: `conic-gradient(${CHANNEL_COLORS['各OTA']} 0 ${a}%,${CHANNEL_COLORS['线上直销']} ${a}% ${b}%,${CHANNEL_COLORS['线下直销']} ${b}% ${c}%,${CHANNEL_COLORS['其他']} ${c}% 100%)` }}><em/></i>
    <span><b>{fmtPct(mix.ota)}</b><small>OTA</small></span>
  </div>
}
