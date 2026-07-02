export default function MapPulseLayer({ x, y, high }: { x: number; y: number; high: boolean }) {
  return high ? <><circle className="pulse-ring" cx={x} cy={y} r="8"/><circle className="pulse-core" cx={x} cy={y} r="3"/></> : null
}
