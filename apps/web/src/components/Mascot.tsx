export type Mood = 'idle' | 'thinking' | 'excited' | 'happy' | 'sad' | 'smug';

/**
 * El detective musical: un vinilo con sombrero que piensa, se emociona y
 * celebra. Diseño original en SVG; las animaciones son CSS (ver styles.css)
 * y se desactivan con prefers-reduced-motion.
 */
export function Mascot({ mood = 'idle', size = 160 }: { mood?: Mood; size?: number }) {
  const happy = mood === 'happy';
  return (
    <svg className={`mascot mascot--${mood}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="El detective musical">
      <defs>
        <radialGradient id="m-label" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#f0abfc" />
          <stop offset="0.45" stopColor="#c026d3" />
          <stop offset="1" stopColor="#6d28d9" />
        </radialGradient>
        <linearGradient id="m-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse className="mascot__shadow" cx="100" cy="190" rx="54" ry="7" />
      <g className="mascot__body">
        <g className="mascot__disc">
          <circle cx="100" cy="112" r="76" fill="#14102b" />
          {[68, 60, 52, 44].map((r) => (
            <circle key={r} cx="100" cy="112" r={r} fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="1.4" />
          ))}
          <path d="M44 84 A 70 70 0 0 1 96 42" fill="none" stroke="url(#m-shine)" strokeWidth="9" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="112" r="31" fill="url(#m-label)" />
        <circle cx="100" cy="112" r="3" fill="#14102b" opacity="0.5" />
        {/* Ojos */}
        <g className="mascot__eyes">
          {happy ? (
            <>
              <path d="M81 108 q7 -8 14 0" className="mascot__arc" />
              <path d="M105 108 q7 -8 14 0" className="mascot__arc" />
            </>
          ) : (
            <>
              <ellipse cx="88" cy="107" rx="7.5" ry={mood === 'excited' ? 9 : 8} fill="#fff" />
              <ellipse cx="112" cy="107" rx="7.5" ry={mood === 'excited' ? 9 : 8} fill="#fff" />
              <g className="mascot__pupils">
                <circle cx="89" cy="108" r="3.6" fill="#14102b" />
                <circle cx="113" cy="108" r="3.6" fill="#14102b" />
                <circle cx="90.3" cy="106.6" r="1.1" fill="#fff" />
                <circle cx="114.3" cy="106.6" r="1.1" fill="#fff" />
              </g>
            </>
          )}
        </g>
        {/* Cejas */}
        <g className="mascot__brows">
          <path className="mascot__brow mascot__brow--l" d="M80 95 q8 -4 15 0" />
          <path className="mascot__brow mascot__brow--r" d="M105 95 q7 -4 15 0" />
        </g>
        {/* Boca */}
        <path
          className="mascot__mouth"
          d={
            mood === 'sad'
              ? 'M92 128 q8 -6 16 0'
              : mood === 'excited' || happy
                ? 'M90 124 q10 12 20 0 z'
                : mood === 'smug'
                  ? 'M92 125 q10 6 17 -3'
                  : mood === 'thinking'
                    ? 'M95 127 h10'
                    : 'M92 124 q8 6 16 0'
          }
        />
        {/* Sombrero de detective */}
        <g className="mascot__hat">
          <path d="M58 58 C60 26 140 26 142 58 Z" fill="#1d1740" />
          <path d="M70 40 C 90 32 110 32 130 40" fill="none" stroke="#2b2360" strokeWidth="3" strokeLinecap="round" />
          <rect x="58" y="49" width="84" height="10" rx="3" fill="#22d3ee" />
          <ellipse cx="100" cy="60" rx="64" ry="9" fill="#1d1740" />
          <ellipse cx="100" cy="58" rx="58" ry="5" fill="#2b2360" opacity="0.6" />
        </g>
        {/* Notas que flotan al celebrar */}
        <g className="mascot__notes" aria-hidden="true">
          <text x="150" y="70" fontSize="22">♪</text>
          <text x="34" y="80" fontSize="18">♫</text>
          <text x="160" y="120" fontSize="16">♪</text>
        </g>
      </g>
    </svg>
  );
}
