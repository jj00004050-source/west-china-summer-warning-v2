import { utils, writeFile } from 'xlsx'
import { AlertTriangle, Download } from 'lucide-react'
import type { QualityIssue } from '../types/data'

export default function DataQualityPanel({ issues }: { issues: QualityIssue[] }) {
  const exportIssues = () => {
    const wb = utils.book_new(); utils.book_append_sheet(wb, utils.json_to_sheet(issues.map(i => ({ 行号: i.row, 级别: i.level, 字段: i.field, 问题: i.message, 原值: i.value }))), '异常清单'); writeFile(wb, '数据异常清单.xlsx')
  }
  return <div className="quality-panel"><div className="quality-title"><AlertTriangle size={18}/><b>数据校验</b><span>{issues.length ? `发现 ${issues.length} 项问题` : '校验通过'}</span>{issues.length > 0 && <button onClick={exportIssues}><Download size={13}/>导出异常</button>}</div>
    {issues.length > 0 && <div className="issue-list">{issues.slice(0, 12).map((i, x) => <div key={x} className={i.level}><span>第 {i.row} 行</span><b>{i.field}</b><span>{i.message}</span></div>)}</div>}
  </div>
}
