import React from "react";

interface CharacterProps {
  className?: string;
  size?: number;
}

/**
 * Friendly Garden Mole: peeking up from a soft earth mound.
 * Original inline SVG designed for dementia accessibility:
 * high contrast, friendly smiling face, clear silhouette.
 */
export function MoleSvg({ className = "", size = 72 }: CharacterProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-label="Garden mole"
      role="img"
    >
      {/* Earth mound */}
      <ellipse cx="50" cy="88" rx="44" ry="10" fill="#5C3A21" />
      <ellipse cx="50" cy="85" rx="38" ry="8" fill="#784C28" />

      {/* Little green grass sprouts */}
      <path d="M18 85C16 78 12 76 10 76C13 80 14 84 16 87Z" fill="#3D8B37" />
      <path d="M22 86C23 80 26 77 28 77C26 81 24 85 22 87Z" fill="#4CAF50" />
      <path d="M78 86C77 80 74 77 72 77C74 81 76 85 78 87Z" fill="#4CAF50" />
      <path d="M82 85C84 78 88 76 90 76C87 80 86 84 84 87Z" fill="#3D8B37" />

      {/* Mole body/head */}
      <path
        d="M26 84C24 60 28 32 50 32C72 32 76 60 74 84Z"
        fill="#8D6E63"
      />

      {/* Rounded Ears */}
      <circle cx="32" cy="36" r="8" fill="#795548" />
      <circle cx="32" cy="36" r="4.5" fill="#FFAB91" />
      <circle cx="68" cy="36" r="8" fill="#795548" />
      <circle cx="68" cy="36" r="4.5" fill="#FFAB91" />

      {/* Head highlight */}
      <ellipse cx="50" cy="46" rx="18" ry="12" fill="#A1887F" opacity="0.4" />

      {/* Snout mound */}
      <ellipse cx="50" cy="62" rx="14" ry="10" fill="#D7CCC8" />

      {/* Nose */}
      <ellipse cx="50" cy="56" rx="6" ry="4" fill="#3E2723" />
      <circle cx="48.5" cy="55" r="1.5" fill="#FFFFFF" opacity="0.8" />

      {/* Friendly smiling mouth */}
      <path
        d="M45 64C47 67 53 67 55 64"
        stroke="#3E2723"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Friendly smiling curved eyes */}
      <path
        d="M36 48C38 45 42 45 44 48"
        stroke="#2E1C14"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M56 48C58 45 62 45 64 48"
        stroke="#2E1C14"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Cheerful rosy cheeks */}
      <circle cx="34" cy="58" r="4.5" fill="#FF8A80" opacity="0.45" />
      <circle cx="66" cy="58" r="4.5" fill="#FF8A80" opacity="0.45" />

      {/* Whiskers */}
      <line x1="33" y1="62" x2="22" y2="60" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="33" y1="65" x2="23" y2="67" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="67" y1="62" x2="78" y2="60" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="67" y1="65" x2="77" y2="67" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" />

      {/* Paws on mound */}
      <ellipse cx="32" cy="80" rx="7" ry="5" fill="#D7CCC8" stroke="#8D6E63" strokeWidth="1.5" />
      <ellipse cx="68" cy="80" rx="7" ry="5" fill="#D7CCC8" stroke="#8D6E63" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Friendly Resting Butterfly: NO-GO visitor.
 * Distinct pastel blue / lavender wings with clear dark borders.
 */
export function ButterflySvg({ className = "", size = 72 }: CharacterProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-label="Resting butterfly"
      role="img"
    >
      {/* Left upper wing */}
      <path
        d="M48 48C42 28 20 22 14 36C8 50 32 64 48 54Z"
        fill="#64B5F6"
        stroke="#1E88E5"
        strokeWidth="2.5"
      />
      {/* Left lower wing */}
      <path
        d="M47 54C34 60 18 64 22 78C26 88 44 76 48 60Z"
        fill="#90CAF9"
        stroke="#1E88E5"
        strokeWidth="2.5"
      />
      {/* Right upper wing */}
      <path
        d="M52 48C58 28 80 22 86 36C92 50 68 64 52 54Z"
        fill="#64B5F6"
        stroke="#1E88E5"
        strokeWidth="2.5"
      />
      {/* Right lower wing */}
      <path
        d="M53 54C66 60 82 64 78 78C74 88 56 76 52 60Z"
        fill="#90CAF9"
        stroke="#1E88E5"
        strokeWidth="2.5"
      />

      {/* Wing accents (soft yellow & violet spots) */}
      <circle cx="28" cy="38" r="5" fill="#FFF59D" />
      <circle cx="72" cy="38" r="5" fill="#FFF59D" />
      <circle cx="32" cy="72" r="3.5" fill="#CE93D8" />
      <circle cx="68" cy="72" r="3.5" fill="#CE93D8" />

      {/* Butterfly body */}
      <ellipse cx="50" cy="54" rx="3.5" ry="16" fill="#37474F" />

      {/* Head */}
      <circle cx="50" cy="35" r="4.5" fill="#263238" />

      {/* Antennas */}
      <path
        d="M48 32C44 26 38 24 36 26"
        stroke="#263238"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="36" cy="26" r="1.5" fill="#263238" />
      <path
        d="M52 32C56 26 62 24 64 26"
        stroke="#263238"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="64" cy="26" r="1.5" fill="#263238" />
    </svg>
  );
}

/**
 * Golden Marigold Flower (genda phool): NO-GO visitor for Knobs 3 & 4.
 * Layered bright golden-orange petals with green calyx and stem.
 */
export function MarigoldSvg({ className = "", size = 72 }: CharacterProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-label="Garden marigold flower"
      role="img"
    >
      {/* Stem and leaves */}
      <path d="M50 72V88" stroke="#2E7D32" strokeWidth="5" strokeLinecap="round" />
      <path d="M50 78C42 74 38 80 34 82C38 85 45 84 50 80Z" fill="#388E3C" />
      <path d="M50 82C58 78 62 84 66 86C62 89 55 88 50 84Z" fill="#2E7D32" />

      {/* Outer petal ring (deep amber-orange) */}
      <circle cx="50" cy="50" r="32" fill="#E65100" opacity="0.3" />
      <circle cx="34" cy="40" r="12" fill="#F57C00" />
      <circle cx="66" cy="40" r="12" fill="#F57C00" />
      <circle cx="34" cy="60" r="12" fill="#F57C00" />
      <circle cx="66" cy="60" r="12" fill="#F57C00" />
      <circle cx="50" cy="30" r="12" fill="#FB8C00" />
      <circle cx="50" cy="70" r="12" fill="#EF6C00" />
      <circle cx="28" cy="50" r="12" fill="#FB8C00" />
      <circle cx="72" cy="50" r="12" fill="#FB8C00" />

      {/* Middle petal ring (vibrant golden yellow) */}
      <circle cx="40" cy="43" r="10" fill="#FFA726" />
      <circle cx="60" cy="43" r="10" fill="#FFA726" />
      <circle cx="40" cy="57" r="10" fill="#FFA726" />
      <circle cx="60" cy="57" r="10" fill="#FFA726" />
      <circle cx="50" cy="38" r="10" fill="#FFB74D" />
      <circle cx="50" cy="62" r="10" fill="#FF9800" />

      {/* Inner bloom core (bright gold) */}
      <circle cx="50" cy="50" r="14" fill="#FFD54F" />
      <circle cx="47" cy="48" r="7" fill="#FFE082" />
      <circle cx="53" cy="51" r="5" fill="#FFCA28" />

      {/* Ruffled texture center */}
      <circle cx="50" cy="50" r="3" fill="#FF8F00" />
    </svg>
  );
}
