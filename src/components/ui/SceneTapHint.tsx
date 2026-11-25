/** Bottom-centre pill telling first-time visitors the scene can be tapped. Never takes a tap itself. */
export function SceneTapHint({ text, reducedMotion }: { readonly text: string; readonly reducedMotion: boolean }) {
  return (
    <p
      data-testid="scene-tap-hint"
      data-motion={reducedMotion ? "static" : "pulse"}
      role="status"
      aria-live="polite"
      className={
        "pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-indigo-950/75 px-4 py-1.5 text-sm text-amber-50 shadow-lg" +
        (reducedMotion ? "" : " animate-pulse")
      }
    >
      {text}
    </p>
  );
}
