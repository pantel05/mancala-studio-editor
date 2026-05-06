import type { CSSProperties } from 'react'

/** Shared grid behind timeline clips (must match `.scenario-lane-track` in scenario.css). */
const SCENARIO_LANE_TRACK_GRID_BG =
  'repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.02) 1px, transparent 1px, transparent 36px)'

/** Row 1 (front / top track) — same blue in every project. */
const ROW1: CSSProperties = {
  borderColor: 'rgba(91, 140, 255, 0.9)',
  background: 'linear-gradient(180deg, rgba(75, 130, 235, 0.96) 0%, rgba(28, 52, 118, 0.99) 100%)',
}

/** Distinct colors for other rows (cycle). Row index 0 uses {@link ROW1} only. */
const OTHER_ROW_STYLES: CSSProperties[] = [
  {
    borderColor: 'rgba(210, 155, 105, 0.85)',
    background: 'linear-gradient(180deg, rgba(130, 95, 65, 0.96) 0%, rgba(70, 48, 32, 0.99) 100%)',
  },
  {
    borderColor: 'rgba(95, 205, 175, 0.8)',
    background: 'linear-gradient(180deg, rgba(45, 125, 105, 0.96) 0%, rgba(22, 72, 58, 0.99) 100%)',
  },
  {
    borderColor: 'rgba(200, 140, 230, 0.85)',
    background: 'linear-gradient(180deg, rgba(115, 70, 145, 0.96) 0%, rgba(62, 38, 88, 0.99) 100%)',
  },
  {
    borderColor: 'rgba(235, 200, 95, 0.88)',
    background: 'linear-gradient(180deg, rgba(145, 118, 45, 0.96) 0%, rgba(78, 62, 22, 0.99) 100%)',
  },
  {
    borderColor: 'rgba(245, 120, 130, 0.82)',
    background: 'linear-gradient(180deg, rgba(165, 65, 72, 0.96) 0%, rgba(88, 35, 40, 0.99) 100%)',
  },
  {
    borderColor: 'rgba(120, 195, 245, 0.82)',
    background: 'linear-gradient(180deg, rgba(55, 110, 155, 0.96) 0%, rgba(28, 58, 88, 0.99) 100%)',
  },
  {
    borderColor: 'rgba(185, 185, 200, 0.75)',
    background: 'linear-gradient(180deg, rgba(95, 95, 110, 0.96) 0%, rgba(48, 48, 58, 0.99) 100%)',
  },
]

/** Muted left-gutter + text colors per row (same hue family as clip blocks, lighter / flatter). */
const LABEL_ROW0: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(55, 95, 165, 0.38) 0%, rgba(22, 38, 78, 0.52) 100%)',
  borderRight: '1px solid rgba(91, 140, 255, 0.35)',
  color: 'rgba(232, 240, 255, 0.95)',
}

const OTHER_LABEL_STYLES: CSSProperties[] = [
  {
    background: 'linear-gradient(180deg, rgba(110, 78, 52, 0.4) 0%, rgba(52, 36, 24, 0.52) 100%)',
    borderRight: '1px solid rgba(210, 155, 105, 0.38)',
    color: 'rgba(255, 240, 228, 0.95)',
  },
  {
    background: 'linear-gradient(180deg, rgba(38, 98, 82, 0.4) 0%, rgba(20, 52, 44, 0.52) 100%)',
    borderRight: '1px solid rgba(95, 205, 175, 0.35)',
    color: 'rgba(230, 255, 248, 0.95)',
  },
  {
    background: 'linear-gradient(180deg, rgba(88, 55, 108, 0.4) 0%, rgba(44, 28, 54, 0.52) 100%)',
    borderRight: '1px solid rgba(200, 140, 230, 0.35)',
    color: 'rgba(248, 235, 255, 0.95)',
  },
  {
    background: 'linear-gradient(180deg, rgba(118, 96, 38, 0.4) 0%, rgba(58, 46, 18, 0.52) 100%)',
    borderRight: '1px solid rgba(235, 200, 95, 0.38)',
    color: 'rgba(255, 248, 220, 0.95)',
  },
  {
    background: 'linear-gradient(180deg, rgba(130, 52, 58, 0.4) 0%, rgba(58, 24, 28, 0.52) 100%)',
    borderRight: '1px solid rgba(245, 120, 130, 0.35)',
    color: 'rgba(255, 235, 236, 0.95)',
  },
  {
    background: 'linear-gradient(180deg, rgba(42, 88, 125, 0.4) 0%, rgba(22, 46, 68, 0.52) 100%)',
    borderRight: '1px solid rgba(120, 195, 245, 0.35)',
    color: 'rgba(235, 248, 255, 0.95)',
  },
  {
    background: 'linear-gradient(180deg, rgba(72, 72, 82, 0.42) 0%, rgba(38, 38, 46, 0.52) 100%)',
    borderRight: '1px solid rgba(185, 185, 200, 0.32)',
    color: 'rgba(240, 240, 245, 0.95)',
  },
]

/** Very light vertical wash on the track area so the row reads as one band with the label + clips. */
const TRACK_TINT_ROW0 = 'linear-gradient(180deg, rgba(75, 130, 235, 0.09) 0%, rgba(28, 52, 118, 0.06) 100%)'
const TRACK_TINTS: string[] = [
  TRACK_TINT_ROW0,
  'linear-gradient(180deg, rgba(130, 95, 65, 0.1) 0%, rgba(70, 48, 32, 0.07) 100%)',
  'linear-gradient(180deg, rgba(45, 125, 105, 0.1) 0%, rgba(22, 72, 58, 0.07) 100%)',
  'linear-gradient(180deg, rgba(115, 70, 145, 0.1) 0%, rgba(62, 38, 88, 0.07) 100%)',
  'linear-gradient(180deg, rgba(145, 118, 45, 0.1) 0%, rgba(78, 62, 22, 0.07) 100%)',
  'linear-gradient(180deg, rgba(165, 65, 72, 0.1) 0%, rgba(88, 35, 40, 0.07) 100%)',
  'linear-gradient(180deg, rgba(55, 110, 155, 0.1) 0%, rgba(28, 58, 88, 0.07) 100%)',
  'linear-gradient(180deg, rgba(95, 95, 110, 0.1) 0%, rgba(48, 48, 58, 0.07) 100%)',
]

function trackTintIndex(trackRowIndex: number): number {
  if (trackRowIndex === 0) return 0
  return 1 + ((trackRowIndex - 1) % (OTHER_ROW_STYLES.length))
}

/**
 * `trackRowIndex` is 0-based order in the scenario list (0 = front / top row, same as hierarchy front).
 */
export function getScenarioClipBlockStyle(trackRowIndex: number): CSSProperties {
  if (trackRowIndex === 0) return ROW1
  return OTHER_ROW_STYLES[(trackRowIndex - 1) % OTHER_ROW_STYLES.length]!
}

/** Left column (name + lane controls): same hue as clips, softer so row is easy to scan. */
export function getScenarioLaneLabelStyle(trackRowIndex: number): CSSProperties {
  if (trackRowIndex === 0) return { ...LABEL_ROW0 }
  return { ...OTHER_LABEL_STYLES[(trackRowIndex - 1) % OTHER_LABEL_STYLES.length]! }
}

/** Timeline grid area behind clips — same family tint layered under the ruler grid. */
export function getScenarioLaneTrackStyle(trackRowIndex: number): CSSProperties {
  const tint = TRACK_TINTS[trackTintIndex(trackRowIndex)]!
  return {
    background: `${SCENARIO_LANE_TRACK_GRID_BG}, ${tint}`,
  }
}
