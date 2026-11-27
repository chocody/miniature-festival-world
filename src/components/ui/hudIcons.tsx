import type { JSX } from "react";
import { HUD_GLYPH_COLORS } from "@/config/look.config";

/**
 * Inline SVG icons of the world HUD (MFW-74). Decorative (`aria-hidden`): the button carries the accessible name.
 * Sun, moon and krathong colours come from HUD_GLYPH_COLORS; search and flag use `currentColor`.
 */
export interface HudIconProps {
  readonly className?: string;
}

const ICON_CLASS = "h-6 w-6";

function Svg({ glyph, className, children }: { glyph: string; className?: string; children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-glyph={glyph}
      className={className ?? ICON_CLASS}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ className }: HudIconProps): JSX.Element {
  return (
    <Svg glyph="search" className={className}>
      <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M15 15l5.5 5.5" stroke="currentColor" strokeWidth="2" />
    </Svg>
  );
}

export function SunIcon({ className }: HudIconProps): JSX.Element {
  const { fill, stroke } = HUD_GLYPH_COLORS.sun;
  return (
    <Svg glyph="sun" className={className}>
      <circle cx="12" cy="12" r="5" fill={fill} stroke={stroke} strokeWidth="1.5" />
      <path
        d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
        stroke={stroke}
        strokeWidth="1.8"
      />
    </Svg>
  );
}

export function MoonIcon({ className }: HudIconProps): JSX.Element {
  const { fill, stroke } = HUD_GLYPH_COLORS.moon;
  return (
    <Svg glyph="moon" className={className}>
      <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </Svg>
  );
}

export function KrathongIcon({ className }: HudIconProps): JSX.Element {
  const { leaf, flower, flame } = HUD_GLYPH_COLORS.krathong;
  return (
    <Svg glyph="krathong" className={className}>
      <path d="M3 15h18c-1 4-4 6-9 6s-8-2-9-6z" fill={leaf} />
      <circle cx="8" cy="13.5" r="2.4" fill={flower} />
      <circle cx="16" cy="13.5" r="2.4" fill={flower} />
      <circle cx="12" cy="12.5" r="2.6" fill={flower} />
      <path d="M12 9.5C10.6 8 10.8 6.2 12 4.2c1.2 2 1.4 3.8 0 5.3z" fill={flame} />
    </Svg>
  );
}

export function FlagIcon({ className }: HudIconProps): JSX.Element {
  return (
    <Svg glyph="flag" className={className}>
      <path d="M6 21V4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 5h11l-2.5 4 2.5 4H6" stroke="currentColor" strokeWidth="2" />
    </Svg>
  );
}
