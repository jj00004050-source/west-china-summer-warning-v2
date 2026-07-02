import type { DataKind } from '../types/data'
import { FIELD_LABELS, SCHEMAS } from '../utils/fieldMapping'

const REQUIRED_FIELDS: Record<DataKind, string[]> = {
  hotels: ['whCode', 'name'],
  lastYear: ['date', 'availableRooms', 'soldRooms', 'revenue'],
  sameLeadSnapshots: ['whCode', 'date', 'bookedRooms', 'bookingRevenue', 'availableRooms'],
  snapshots: ['whCode', 'targetDate', 'batchTime', 'availableRooms', 'bookedRooms', 'bookingRevenue'],
  renovations: ['whCode', 'renovationType'],
}

export default function FieldMapper({ kind, headers, mapping, onChange }: { kind: DataKind; headers: string[]; mapping: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  return <div className="field-mapper">{Object.keys(SCHEMAS[kind]).map(key => <label key={key}><span>{FIELD_LABELS[key] || key}{REQUIRED_FIELDS[kind].includes(key) && <em>*</em>}</span>
    <select value={mapping[key] || ''} onChange={e => onChange({ ...mapping, [key]: e.target.value })}><option value="">不映射</option>{headers.map(h => <option key={h}>{h}</option>)}</select>
  </label>)}</div>
}
