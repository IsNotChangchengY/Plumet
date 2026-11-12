import type { Mark } from '../../core/marks'

type Props = {
  marks: Mark[]
  activeIssueId?: string | null
  onIssueClick?: (issueId: string) => void
}

export function MarksView({ marks, activeIssueId, onIssueClick }: Props) {
  return (
    <pre className="marks-view">
      {marks.map((mark, index) => {
        if (mark.kind === 'equal') {
          return <span key={index}>{mark.text}</span>
        }
        if (mark.kind === 'del') {
          const classes = ['mark-del', `sev-${mark.severity ?? 'error'}`]
          if (mark.issueId && activeIssueId === mark.issueId) classes.push('active')
          return (
            <span
              key={index}
              id={mark.issueId ? `issue-${mark.issueId}` : undefined}
              className={classes.join(' ')}
              onClick={mark.issueId && onIssueClick ? () => onIssueClick(mark.issueId as string) : undefined}
              title={onIssueClick && mark.issueId ? '点击定位到问题卡片' : undefined}
            >
              {mark.text}
            </span>
          )
        }
        if (mark.kind === 'ins') {
          return (
            <span key={index} className={`mark-ins${mark.state === 'applied' ? ' applied' : ''}`}>
              {mark.text}
            </span>
          )
        }
        const classes = ['mark-warn', `sev-${mark.severity ?? 'warning'}`]
        if (mark.state === 'ignored') classes.push('ignored')
        if (mark.issueId && activeIssueId === mark.issueId) classes.push('active')
        return (
          <span
            key={index}
            id={mark.issueId ? `issue-${mark.issueId}` : undefined}
            className={classes.join(' ')}
            onClick={mark.issueId && onIssueClick ? () => onIssueClick(mark.issueId as string) : undefined}
            title={onIssueClick ? '点击定位到问题卡片' : undefined}
          >
            {mark.text}
          </span>
        )
      })}
    </pre>
  )
}
