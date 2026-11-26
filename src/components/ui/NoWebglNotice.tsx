import { NO_WEBGL_COPY } from "@/config/noWebgl.config";
import { UI_CLASSES } from "./uiClasses";

/** Browsers break Thai at dictionary guesses and split this word mid-way at 390 px (qa L1); keep it on one line. */
const KEEP_TOGETHER = "การแสดงผล";

function Title({ text }: { text: string }) {
  const at = text.indexOf(KEEP_TOGETHER);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="whitespace-nowrap">{KEEP_TOGETHER}</span>
      {text.slice(at + KEEP_TOGETHER.length)}
    </>
  );
}

/** The stage content when WebGL is unavailable (MFW-71, backlog 11.5 AC2). No control, no state. */
export function NoWebglNotice() {
  return (
    <section
      aria-label={NO_WEBGL_COPY.title}
      data-testid="no-webgl-notice"
      className="flex h-full w-full items-center justify-center px-4 py-8 text-ink"
    >
      <div className={`flex w-full max-w-md flex-col items-center gap-3 ${UI_CLASSES.floating} px-8 py-12 text-center`}>
        <h1 className="text-display font-semibold text-ink">
          <Title text={NO_WEBGL_COPY.title} />
        </h1>
        <p className="text-body text-ink-muted">{NO_WEBGL_COPY.help}</p>
      </div>
    </section>
  );
}
