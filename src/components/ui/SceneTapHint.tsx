/** Pill telling first-time visitors the scene can be tapped; positioned by the `hint` overlay slot (MFW-54). Never takes a tap itself. */
export function SceneTapHint({ text, reducedMotion }: { readonly text: string; readonly reducedMotion: boolean }) {
  return (
    <p
      data-testid="scene-tap-hint"
      data-motion={reducedMotion ? "static" : "pulse"}
      role="status"
      aria-live="polite"
      className={
        "pointer-events-none whitespace-nowrap rounded-full bg-ink-veil px-4 py-2 text-caption font-medium text-paper shadow-float" +
        (reducedMotion ? "" : " animate-pulse")
      }
    >
      {text}
    </p>
  );
}
