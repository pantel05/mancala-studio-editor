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

      <details className="validation-rules" open>
        <summary className="validation-rules-summary">What this preview expects</summary>
        <ul className="validation-rules-list">
          <li>
            One <strong>.json</strong> or <strong>.skel</strong> per Spine object, paired with{' '}
            <strong>stem.atlas</strong> or <strong>stem@1x.atlas</strong> / <strong>stem@2x.atlas</strong> in the same
            selection.
          </li>
          <li>
            Every atlas page line must have a matching <strong>PNG</strong>, <strong>WebP</strong>, or{' '}
            <strong>JPEG</strong> file (same filename as in the atlas).
          </li>
          <li>Drop the whole export folder when in doubt — unused files are reported as hints, not errors.</li>
          <li>
            <strong>Pairing / atlas</strong> errors (red) block that Spine object from loading. Other valid pairs still
            load.
          </li>
          <li>
            <strong>Placeholder name</strong> errors (red) still add the skeleton to the canvas in a{' '}
            <strong>frozen</strong> state (no playback, drag, or placeholder attachments) until names match{' '}
            <strong>Settings → Common placeholders</strong> or you fix the bones in Spine.
          </li>
        </ul>
      </details>

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
