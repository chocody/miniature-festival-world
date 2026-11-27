import type { JSX } from "react";
import type { EventFindMyIconId } from "@/config/events/eventCopy.config";
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

/** MFW-85: a small centre with radial sparks (the sky tap launches a firework). */
export function FireworkIcon({ className }: HudIconProps): JSX.Element {
  const { burst, spark } = HUD_GLYPH_COLORS.firework;
  return (
    <Svg glyph="firework" className={className}>
      <path d="M16.3 12.0L20.0 12.0M15.0 15.0L17.7 17.7M12.0 16.3L12.0 20.0M9.0 15.0L6.3 17.7M7.7 12.0L4.0 12.0M9.0 9.0L6.3 6.3M12.0 7.7L12.0 4.0M15.0 9.0L17.7 6.3" stroke={burst} strokeWidth="2.4" />
      <circle cx="12" cy="12" r="2.4" fill={spark} stroke={burst} strokeWidth="1.4" />
      <circle cx="22.2" cy="12.0" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="19.2" cy="19.2" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="12.0" cy="22.2" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="4.8" cy="19.2" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="1.8" cy="12.0" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="4.8" cy="4.8" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="12.0" cy="1.8" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
      <circle cx="19.2" cy="4.8" r="1.3" fill={spark} stroke={burst} strokeWidth="0.9" />
    </Svg>
  );
}

/** MFW-85: a rounded paper lantern with a small flame at its base (the sky tap releases a sky lantern). */
export function SkyLanternIcon({ className }: HudIconProps): JSX.Element {
  const { body, stroke, flame } = HUD_GLYPH_COLORS.skyLantern;
  return (
    <Svg glyph="sky-lantern" className={className}>
      <path d="M12 1.5v3" stroke={stroke} strokeWidth="1.6" />
      <path d="M8.5 4.5h7c2.8 2.3 4 5.5 4 9l-2 4.5h-11l-2-4.5c0-3.5 1.2-6.7 4-9z" fill={body} stroke={stroke} strokeWidth="1.6" />
      <path d="M7.5 18.5h9v2a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z" fill={stroke} />
      <path d="M12 17c-2-1.5-2.1-3.6 0-6.2 2.1 2.6 2 4.7 0 6.2z" fill={flame} />
    </Svg>
  );
}

export function OrnamentIcon({ className }: HudIconProps): JSX.Element {
  const { body, cap, hook } = HUD_GLYPH_COLORS.ornament;
  return (
    <Svg glyph="ornament" className={className}>
      <circle cx="12" cy="3.5" r="1.6" stroke={hook} strokeWidth="1.5" />
      <rect x="9.5" y="5" width="5" height="2.6" rx="0.6" fill={cap} />
      <circle cx="12" cy="14.5" r="7" fill={body} />
    </Svg>
  );
}

/** Per-event Find My row icon (MFW-91). The exhaustive switch makes a new icon id a type error until it is drawn. */
export function FindMyIcon({ icon, className }: HudIconProps & { readonly icon: EventFindMyIconId }): JSX.Element {
  switch (icon) {
    case "krathong":
      return <KrathongIcon className={className} />;
    case "ornament":
      return <OrnamentIcon className={className} />;
    default: {
      const unreachable: never = icon;
      return unreachable;
    }
  }
}
