import { useEffect } from 'react'
import PaperCanvas from './components/PaperCanvas'
import ControlPanel from './components/ControlPanel'
import IssueList from './components/IssueList'
import SelectionInspector from './components/SelectionInspector'
import { useNetwork } from './state/useNetwork.js'

export default function App() {
  const { state, network, dispatch } = useNetwork()

  // 测试/调试句柄（生产环境无副作用）
  useEffect(() => {
    window.__irrigation = { network, selection: state.selection }
  })

  return (
    <div className="app">
      <header className="app-header">
        <h1>温室灌溉管网分段接出工具</h1>
        <span className="subtitle">
          首部枢纽 → 主管分段 → 支管接出 → 滴头 / 喷头排布 · React + Paper.js
        </span>
      </header>
      <div className="layout">
        <aside className="sidebar sidebar-left">
          <ControlPanel state={state} network={network} dispatch={dispatch} />
        </aside>
        <main className="stage">
          <PaperCanvas network={network} selection={state.selection} dispatch={dispatch} />
        </main>
        <aside className="sidebar sidebar-right">
          <IssueList network={network} selection={state.selection} dispatch={dispatch} />
          <SelectionInspector network={network} selection={state.selection} dispatch={dispatch} />
        </aside>
      </div>
    </div>
  )
}
