// Custom vector "3D app-icon" style badges for every game — glossy gradient
// background, a soft top highlight for depth, a drop shadow, and a bold
// hand-drawn glyph per game. Pure SVG: no image files to download, so it
// stays instant-loading and perfectly crisp at any size (important for the
// big-icon portal cards and full-screen mobile play).
import { useId } from "react";

const GRADIENTS = {
  Strategy: ["#a78bfa", "#6d28d9"],
  Puzzle: ["#22d3ee", "#0e7490"],
  Action: ["#fbbf24", "#c2410c"],
  Kids: ["#f9a8d4", "#be185d"],
};

// One flat white/light glyph per game, drawn on a 0-100 canvas. Kept to
// simple strokes + shapes (not photoreal art) so every icon reads clearly
// even small, and the whole set stays visually consistent.
const GLYPHS = {
  chess: (
    <g>
      <path d="M50 20 L58 34 L50 30 L42 34 Z" fill="#fff" />
      <circle cx="50" cy="18" r="4" fill="#fff" />
      <path d="M38 40 Q50 30 62 40 L66 66 L34 66 Z" fill="#fff" />
      <rect x="30" y="66" width="40" height="9" rx="3" fill="#fff" />
      <rect x="26" y="75" width="48" height="9" rx="3" fill="#fff" />
    </g>
  ),
  tictactoe: (
    <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round">
      <line x1="38" y1="24" x2="38" y2="76" />
      <line x1="62" y1="24" x2="62" y2="76" />
      <line x1="20" y1="42" x2="80" y2="42" />
      <line x1="20" y1="62" x2="80" y2="62" />
      <g strokeWidth="7">
        <line x1="26" y1="30" x2="34" y2="38" />
        <line x1="34" y1="30" x2="26" y2="38" />
        <circle cx="50" cy="52" r="8" />
        <line x1="68" y1="68" x2="76" y2="76" />
        <line x1="76" y1="68" x2="68" y2="76" />
      </g>
    </g>
  ),
  connect4: (
    <g>
      <rect x="24" y="22" width="52" height="58" rx="10" fill="#ffffff33" stroke="#fff" strokeWidth="5" />
      <circle cx="50" cy="36" r="9" fill="#fff" />
      <circle cx="50" cy="58" r="9" fill="#fff" fillOpacity="0.85" />
      <circle cx="35" cy="76" r="4" fill="#fff" fillOpacity="0.5" />
    </g>
  ),
  checkers: (
    <g fill="#fff">
      <circle cx="38" cy="58" r="16" />
      <circle cx="62" cy="42" r="16" />
      <circle cx="62" cy="42" r="16" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="4 4" />
    </g>
  ),
  dotsboxes: (
    <g>
      <g fill="#fff">
        {[26, 50, 74].map((x) => [26, 50, 74].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" />))}
      </g>
      <path d="M26 26 L74 26 L74 50 L50 50 L50 26" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="26" y="26" width="24" height="24" fill="#ffffff30" />
    </g>
  ),
  carrom: (
    <g>
      <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" strokeWidth="4" />
      <circle cx="50" cy="50" r="7" fill="#fff" />
      <circle cx="34" cy="34" r="5" fill="#fff" fillOpacity="0.85" />
      <circle cx="66" cy="34" r="5" fill="#fff" fillOpacity="0.85" />
      <circle cx="34" cy="66" r="5" fill="#fff" fillOpacity="0.85" />
      <circle cx="66" cy="66" r="5" fill="#fff" fillOpacity="0.85" />
    </g>
  ),
  pool: (
    <g>
      <circle cx="42" cy="52" r="20" fill="#fff" />
      <circle cx="42" cy="52" r="11" fill="#111827" />
      <text x="42" y="57" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">8</text>
      <circle cx="72" cy="28" r="8" fill="#fff" fillOpacity="0.85" />
    </g>
  ),
  snooker: (
    <g>
      <circle cx="40" cy="46" r="9" fill="#fff" />
      <circle cx="58" cy="46" r="9" fill="#fff" fillOpacity="0.85" />
      <circle cx="49" cy="62" r="9" fill="#fff" fillOpacity="0.7" />
      <line x1="70" y1="80" x2="52" y2="58" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
  memory: (
    <g>
      <rect x="24" y="30" width="34" height="46" rx="7" fill="#fff" fillOpacity="0.35" stroke="#fff" strokeWidth="4" transform="rotate(-8 41 53)" />
      <rect x="42" y="26" width="34" height="46" rx="7" fill="#fff" stroke="#fff" strokeWidth="4" />
      <path d="M52 49 L58 55 L68 41" fill="none" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  minesweeper: (
    <g fill="#fff">
      <circle cx="48" cy="56" r="18" />
      <g stroke="#fff" strokeWidth="4" strokeLinecap="round">
        <line x1="48" y1="30" x2="48" y2="22" />
        <line x1="66" y1="38" x2="72" y2="32" />
        <line x1="24" y1="56" x2="16" y2="56" />
        <line x1="30" y1="38" x2="24" y2="32" />
      </g>
      <circle cx="48" cy="22" r="4" fill="#fff" />
      <circle cx="41" cy="49" r="4" fill="#0e7490" fillOpacity="0.5" />
    </g>
  ),
  "2048": (
    <g>
      <rect x="22" y="22" width="26" height="26" rx="5" fill="#fff" fillOpacity="0.35" />
      <rect x="52" y="22" width="26" height="26" rx="5" fill="#fff" fillOpacity="0.5" />
      <rect x="22" y="52" width="26" height="26" rx="5" fill="#fff" fillOpacity="0.5" />
      <rect x="52" y="52" width="26" height="26" rx="5" fill="#fff" />
      <text x="65" y="70" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0e7490">2048</text>
    </g>
  ),
  hangman: (
    <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round">
      <line x1="24" y1="80" x2="60" y2="80" />
      <line x1="34" y1="80" x2="34" y2="22" />
      <line x1="34" y1="22" x2="62" y2="22" />
      <line x1="62" y1="22" x2="62" y2="32" />
      <circle cx="62" cy="40" r="8" fill="none" />
      <line x1="62" y1="48" x2="62" y2="64" />
      <line x1="62" y1="54" x2="54" y2="60" />
      <line x1="62" y1="54" x2="70" y2="60" />
      <line x1="62" y1="64" x2="55" y2="74" />
      <line x1="62" y1="64" x2="69" y2="74" />
    </g>
  ),
  snake: (
    <g fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round">
      <path d="M22 40 Q22 26 36 26 Q50 26 50 40 Q50 54 64 54 Q78 54 78 40" />
      <circle cx="78" cy="40" r="2" fill="#0e7490" />
    </g>
  ),
  whack: (
    <g>
      <ellipse cx="50" cy="70" rx="26" ry="9" fill="#00000030" />
      <path d="M32 68 Q32 40 50 38 Q68 40 68 68 Z" fill="#fff" />
      <ellipse cx="40" cy="34" rx="6" ry="9" fill="#fff" transform="rotate(-20 40 34)" />
      <ellipse cx="60" cy="34" rx="6" ry="9" fill="#fff" transform="rotate(20 60 34)" />
      <circle cx="42" cy="58" r="3.5" fill="#c2410c" />
      <circle cx="58" cy="58" r="3.5" fill="#c2410c" />
    </g>
  ),
  abc: (
    <g>
      <rect x="26" y="26" width="48" height="48" rx="10" fill="#fff" fillOpacity="0.25" />
      <text x="50" y="66" textAnchor="middle" fontSize="40" fontWeight="900" fill="#fff">A</text>
    </g>
  ),
  numbers: (
    <g>
      <rect x="26" y="26" width="48" height="48" rx="10" fill="#fff" fillOpacity="0.25" />
      <text x="50" y="66" textAnchor="middle" fontSize="38" fontWeight="900" fill="#fff">5</text>
    </g>
  ),
  colors: (
    <g>
      <path d="M50 22 Q76 22 76 46 Q76 58 64 58 Q58 58 58 52 Q58 48 62 48 Q66 48 66 44 Q66 34 50 34 Q30 34 30 54 Q30 72 50 76 Q30 76 24 56 Q20 34 50 22 Z" fill="#fff" fillOpacity="0.9" />
      <circle cx="38" cy="46" r="5" fill="#c2410c" />
      <circle cx="46" cy="60" r="5" fill="#0e7490" />
      <circle cx="60" cy="64" r="5" fill="#6d28d9" />
      <circle cx="46" cy="32" r="5" fill="#be185d" />
    </g>
  ),
  shapes: (
    <g fill="#fff">
      <circle cx="36" cy="38" r="12" fillOpacity="0.9" />
      <rect x="52" y="26" width="22" height="22" rx="3" fillOpacity="0.75" />
      <path d="M50 54 L66 78 L34 78 Z" fillOpacity="0.6" />
    </g>
  ),
  animals: (
    <g fill="#fff">
      <circle cx="50" cy="52" r="22" />
      <path d="M30 34 L38 22 L44 36 Z" />
      <path d="M70 34 L62 22 L56 36 Z" />
      <circle cx="42" cy="50" r="3" fill="#6d28d9" />
      <circle cx="58" cy="50" r="3" fill="#6d28d9" />
      <ellipse cx="50" cy="60" rx="5" ry="3" fill="#6d28d9" />
    </g>
  ),
  size: (
    <g fill="#fff">
      <circle cx="34" cy="56" r="22" fillOpacity="0.9" />
      <circle cx="72" cy="66" r="9" fillOpacity="0.7" />
    </g>
  ),
  puzzle: (
    <g fill="#fff">
      <path d="M28 28 H50 Q54 28 54 33 Q54 38 59 38 Q64 38 64 33 V28 H72 V50 H67 Q62 50 62 55 Q62 60 67 60 H72 V72 H28 V60 Q33 60 33 55 Q33 50 28 50 Z" fillOpacity="0.92" />
    </g>
  ),
};

export function GameIcon({ id, cat, size = 64, rounded = 24 }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [c1, c2] = GRADIENTS[cat] || GRADIENTS.Strategy;
  const glyph = GLYPHS[id];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: "block", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))", flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`hi${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`sh${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="60%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="94" height="94" rx={rounded} fill={`url(#bg${uid})`} />
      <rect x="3" y="3" width="94" height="94" rx={rounded} fill={`url(#sh${uid})`} />
      {glyph}
      <path d={`M6 ${rounded} Q50 4 94 ${rounded} L94 ${rounded + 16} Q50 ${rounded - 6} 6 ${rounded + 16} Z`} fill={`url(#hi${uid})`} />
      <rect x="3" y="3" width="94" height="94" rx={rounded} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
    </svg>
  );
}
