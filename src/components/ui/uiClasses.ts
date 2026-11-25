/**
 * Class recipes built only from the design tokens in src/app/globals.css (MFW-55; documented in docs/design/ui.md).
 * No recipe animates: components add `transition-colors` themselves where reduced motion is honoured.
 * `min-h-11 min-w-11` = 44 px = MIN_TOUCH_TARGET_PX (src/config/customizer.config.ts).
 */
export const UI_CLASSES = Object.freeze({
  /** Floating HUD surface over the scene: translucent veil (the scene shows through). */
  floating: "rounded-card bg-veil text-ink shadow-float",
  /** Reading / form card on solid paper: wish dialog, inspect popup. */
  card: "rounded-card bg-paper text-ink shadow-float",
  primaryButton:
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-clay px-6 text-body font-semibold text-clay-ink hover:bg-clay-strong disabled:cursor-not-allowed disabled:opacity-50",
  secondaryButton:
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-line bg-paper px-4 text-body font-medium text-ink hover:bg-clay-soft disabled:cursor-not-allowed disabled:opacity-50",
  ghostButton:
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-body font-medium text-ink underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50",
  iconButton:
    "inline-grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full border border-line bg-paper text-title text-ink hover:bg-clay-soft disabled:cursor-not-allowed disabled:opacity-50",
  chip: "flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-full border px-3 text-body",
  chipOn: "border-clay bg-clay-soft font-semibold text-ink",
  chipOff: "border-line bg-paper text-ink hover:bg-clay-soft",
  listRow:
    "min-h-11 min-w-11 w-full rounded-field border border-line bg-paper px-3 py-2 text-left text-body text-ink break-words hover:bg-clay-soft",
  field:
    "min-h-11 min-w-11 w-full rounded-field border border-line bg-white px-3 py-2.5 text-input text-ink placeholder:text-ink-muted",
  label: "text-body font-medium text-ink",
  title: "text-title font-semibold text-ink",
  subheading: "text-body font-semibold text-ink",
  body: "text-body text-ink",
  caption: "text-caption text-ink-muted",
  alert: "rounded-field border border-danger/30 bg-danger-soft p-3 text-body text-danger",
  notice: "rounded-field bg-notice-soft px-4 py-3 text-caption text-notice",
  inset: "rounded-field border border-line p-3",
  swatch: "shrink-0 rounded-full border border-ink/20",
});

/** Marks the one primary action of a step (AC3). Spread onto the button: <button {...PRIMARY_ACTION_PROPS}>. */
export const PRIMARY_ACTION_PROPS = Object.freeze({ "data-ui-emphasis": "primary" } as const);

/** Icon glyphs; always wrapped in <span aria-hidden="true"> with the copy as the button's aria-label. */
export const UI_GLYPHS = Object.freeze({ close: "×", previous: "‹", next: "›" });
