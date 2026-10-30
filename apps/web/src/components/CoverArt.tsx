/**
 * Carátula generada (sin imágenes externas): degradado y vinilo derivados del
 * id de la canción, con sus iniciales. Con acceso a Deezer/iTunes se puede
 * sustituir por la carátula real.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function CoverArt({ id, title, size = 180 }: { id: string; title: string; size?: number }) {
  const h = hash(id);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 9) % 120)) % 360;
  const initials = title
    .replace(/[([].*?[)\]]/g, '')
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w))
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase())
    .join('');
  return (
    <svg className="cover" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`cv-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue1} 80% 58%)`} />
          <stop offset="1" stopColor={`hsl(${hue2} 75% 38%)`} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="10" fill={`url(#cv-${id})`} />
      <circle cx="72" cy="72" r="38" fill="#0b0819" opacity="0.85" />
      {[32, 26, 20].map((r) => (
        <circle key={r} cx="72" cy="72" r={r} fill="none" stroke="#fff" strokeOpacity="0.08" />
      ))}
      <circle cx="72" cy="72" r="11" fill={`hsl(${hue2} 80% 62%)`} />
      <text x="10" y="36" fontSize="26" fontWeight="800" fill="#fff" fillOpacity="0.92" fontFamily="Bricolage Grotesque Variable, sans-serif">
        {initials || '♪'}
      </text>
    </svg>
  );
}
