import { Database, LayoutDashboard, UploadCloud } from 'lucide-react'

interface Props {
  page: 'dashboard' | 'upload'; onPage: (p: 'dashboard' | 'upload') => void
  updatedAt?: string; batchName?: string
}
export default function DashboardHeader({ page, onPage, updatedAt, batchName }: Props) {
  return <header className="topbar">
    <div className="brand">
      <div className="brand-mark"><Database size={22}/></div>
      <div><h1>华西区域暑期预警数据看板</h1><p>未来7天预订趋势｜同期恢复｜快照环比｜门店预警｜收益管理商圈对标</p></div>
    </div>
    <div className="data-status">
      <span className="live-dot"/><div><small>数据更新时间</small><strong>{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }) : '--'}</strong></div>
      <div><small>当前快照</small><strong>{batchName || '--'}</strong></div>
    </div>
    <nav>
      <button className={page === 'dashboard' ? 'active' : ''} onClick={() => onPage('dashboard')}><LayoutDashboard size={16}/>总览驾驶舱</button>
      <button className={page === 'upload' ? 'active' : ''} onClick={() => onPage('upload')}><UploadCloud size={16}/>数据上传中心</button>
    </nav>
  </header>
}
