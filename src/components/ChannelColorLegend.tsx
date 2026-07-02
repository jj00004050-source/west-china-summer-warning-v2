import { CHANNEL_COLORS } from '../utils/channels'

export default function ChannelColorLegend() {
  return <div className="channel-color-legend">
    {['各OTA','线上直销','线下直销','其他'].map(name => <span key={name}><i style={{ background: CHANNEL_COLORS[name] }}/>{name}</span>)}
  </div>
}
