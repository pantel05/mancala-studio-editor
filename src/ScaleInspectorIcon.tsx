/** Small corner-bracket glyph for uniform scale in the inspector (matches axis chip size). */
export function ScaleInspectorIcon({ className = '' }: { className?: string }) {
  return (
    <span className={`inspector-scale-icon${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 16 16" width={12} height={12} fill="none" aria-hidden="true">
        <path
          d="M5 2H2v3M11 2h3v3M5 14H2v-3M11 14h3v-3"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
