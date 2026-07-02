import { useState } from 'react'
import { FileSpreadsheet, RadioTower } from 'lucide-react'
import type { StoredData } from '../types/data'
import type { SaveProgress } from '../utils/api'
import UploadCenter from './UploadCenter'
import WarningBroadcastAssistant from './WarningBroadcastAssistant'

export default function AdminDashboard({ data, onData }: { data: StoredData; onData: (data: StoredData, onProgress?: (progress: SaveProgress) => void) => void | Promise<void> }) {
  const [tab, setTab] = useState<'upload' | 'broadcast'>('upload')
  return <>
    <nav className="admin-tabs">
      <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}><FileSpreadsheet/>数据上传中心</button>
      <button className={tab === 'broadcast' ? 'active' : ''} onClick={() => setTab('broadcast')}><RadioTower/>预警播报</button>
    </nav>
    {tab === 'upload' ? <UploadCenter data={data} onData={onData}/> : <WarningBroadcastAssistant data={data}/>}
  </>
}
