import type { SpineValidationReport } from './spine/validateSpineSelection'

type Props = {
  report: SpineValidationReport | null
  validating: boolean
}

export function ValidationPanel({ report, validating }: Props) {
  const errCount = report?.issues.filter((i) => i.severity === 'error').length ?? 0
  const warnCount = report?.issues.filter((i) => i.severity === 'warn').length ?? 0
  const infoCount = report?.issues.filter((i) => i.severity === 'info').length ?? 0

  return (
    <section className="validation-panel" aria-label="Bundle validation">
      <div className="validation-panel-head">
        <h2 className="validation-panel-title">Bundle validation</h2>
        {validating && <span className="validation-status">Checking…</span>}
      </div>

      {report && (
        <div className="validation-results" role="region" aria-label="Validation results">
          <p className="validation-stats">
            Checked <strong>{report.stats.totalFiles}</strong> file
            {report.stats.totalFiles === 1 ? '' : 's'} · <strong>{report.stats.skeletonFiles}</strong> skeleton
            {report.stats.skeletonFiles === 1 ? '' : 's'} · <strong>{report.stats.pairedGroups}</strong> pair
            {report.stats.pairedGroups === 1 ? '' : 's'} to load
            {report.stats.atlasFiles > 0 && (
              <>
                {' '}
                · <strong>{report.stats.atlasFiles}</strong> atlas
                {report.stats.atlasFiles === 1 ? '' : 'es'}
              </>
            )}
            {report.stats.rasterFiles > 0 && (
              <>
                {' '}
                · <strong>{report.stats.rasterFiles}</strong> image
                {report.stats.rasterFiles === 1 ? '' : 's'}
              </>
            )}
          </p>

          {report.issues.length === 0 ? (
            <p className="validation-ok">No pairing or atlas issues detected for this selection.</p>
          ) : (
            <>
              {(errCount > 0 || warnCount > 0 || infoCount > 0) && (
                <p className="validation-counts">
                  {errCount > 0 && (
                    <span className="validation-count validation-count-err">{errCount} error(s)</span>
                  )}
                  {warnCount > 0 && (
                    <span className="validation-count validation-count-warn">{warnCount} warning(s)</span>
                  )}
                  {infoCount > 0 && (
                    <span className="validation-count validation-count-info">{infoCount} note(s)</span>
                  )}
                </p>
              )}
              <ul className="validation-issue-list">
                {report.issues.map((issue, i) => (
                  <li
                    key={`${issue.severity}-${i}-${issue.message.slice(0, 48)}`}
                    className={`validation-issue validation-issue-${issue.severity}`}
                  >
                    {issue.context && (
                      <span className="validation-issue-context">{issue.context}: </span>
                    )}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
