export default function IssueList({ network, selection, dispatch }) {
  const aisleIssues = network.issues.filter((i) => i.type === 'aisle')
  const otherIssues = network.issues.filter((i) => i.type !== 'aisle')

  function jump(refId, type) {
    dispatch({
      type: 'SELECT',
      selection: { kind: type === 'main-drop' || type === 'velocity' ? 'segment' : 'lateral', id: refId }
    })
  }

  return (
    <div className="issue-list">
      <h3>
        检查清单
        <span className="issue-counts">
          <em className="badge badge-error">{aisleIssues.length} 穿作业道</em>
          <em className="badge badge-warn">{otherIssues.length} 水力告警</em>
        </span>
      </h3>

      <div className="issue-group">
        <h4 className="error-title">作业道穿越（红框）</h4>
        {aisleIssues.length === 0 && <p className="ok-text">✔ 所有支管均在苗床范围内，未穿越作业道。</p>}
        {aisleIssues.map((iss) => (
          <button
            key={iss.refId}
            className={`issue-item error ${selection && selection.id === iss.refId ? 'active' : ''}`}
            onClick={() => jump(iss.refId, iss.type)}
          >
            {iss.text}
          </button>
        ))}
      </div>

      <div className="issue-group">
        <h4 className="warn-title">压降 / 流速（标黄段）</h4>
        {otherIssues.length === 0 && <p className="ok-text">✔ 各段压降与流速均在允许范围内。</p>}
        {otherIssues.map((iss, i) => (
          <button
            key={`${iss.refId}-${i}`}
            className={`issue-item warn ${selection && selection.id === iss.refId ? 'active' : ''}`}
            onClick={() => jump(iss.refId, iss.type)}
          >
            {iss.text}
          </button>
        ))}
      </div>
    </div>
  )
}
