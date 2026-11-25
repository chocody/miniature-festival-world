"use client";

import { useId, useState, type FormEvent } from "react";
import { MODERATION_COPY } from "@/config/moderation.config";
import {
  DISPLAY_NAME_MAX_LENGTH,
  WISH_COPY,
  WISH_TEXT_MAX_LENGTH,
  WISH_TEXTAREA_ROWS,
  type WishComposerIssue,
} from "@/config/wish.config";
import { evaluateWishComposer } from "@/services/api/wishComposer";
import { describeModerationReasons, type ModerationReason } from "@/services/moderation";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { OwnershipNotice } from "./OwnershipNotice";
import { WishVisibilitySwitch } from "./WishVisibilitySwitch";

type StatusIssue = Exclude<WishComposerIssue, "name_blocked" | "wish_blocked">;
/** The moderation issues have their own warning block; every other issue gets the status line. */
function isStatusIssue(issue: WishComposerIssue): issue is StatusIssue {
  return issue !== "name_blocked" && issue !== "wish_blocked";
}

export interface WishModalProps {
  /** Called after the composed wish is in useBuilderStore; FlowRoot dispatches SUBMIT_WISH. */
  onSubmitted: () => void;
}

/**
 * Wish / let-go composer (backlog 4.3, 12.2): optional display name, the wish text and one switch "เปิดให้ทุกคนเห็น"
 * (off = private, the default). Live 2.3 guard warning: the name always, the wish only when the switch is on.
 * No request and no storage: the composed wish and name stay in useBuilderStore memory until the release.
 */
export function WishModal({ onSubmitted }: WishModalProps) {
  const ids = useId();
  const storedWish = useBuilderStore((s) => s.wish);
  const storedDisplayName = useBuilderStore((s) => s.wishDisplayName);
  const storedServerReasons = useBuilderStore((s) => s.wishServerReasons);
  const submitWish = useBuilderStore((s) => s.submitWish);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  // Initial values only: re-opening the step shows the stored wish; later store changes do not overwrite typing.
  const [name, setName] = useState(storedDisplayName ?? "");
  const [text, setText] = useState(storedWish?.text ?? "");
  const [open, setOpen] = useState(storedWish?.visibility === "public");
  const [serverReasons, setServerReasons] = useState<readonly ModerationReason[] | null>(storedServerReasons);

  const evaluation = evaluateWishComposer({ text, open, displayName: name });
  const reasons =
    serverReasons ?? (evaluation.ok ? [] : [...evaluation.wishModerationReasons, ...evaluation.nameModerationReasons]);
  const warning = reasons.length > 0 ? describeModerationReasons(reasons) : null;
  const firstIssue = evaluation.ok ? undefined : evaluation.issues.find(isStatusIssue);
  const status = firstIssue === undefined ? null : WISH_COPY.issues[firstIssue];
  const nameInvalid = !evaluation.ok && evaluation.issues.some((i) => i.startsWith("name_"));
  const textInvalid = (!evaluation.ok && evaluation.issues.includes("wish_blocked")) || serverReasons !== null;
  const canSubmit = evaluation.ok && serverReasons === null;
  // Invariant F: colour transitions only, and none under reduced motion.
  const transition = reducedMotion ? "" : " transition-colors";

  const titleId = `${ids}-title`;
  const nameId = `${ids}-name`;
  const nameHintId = `${ids}-name-hint`;
  const textId = `${ids}-text`;
  const countId = `${ids}-count`;
  const warningId = `${ids}-warning`;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (submitWish({ text, open, displayName: name }).ok) onSubmitted();
  };

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      data-testid="wish-modal"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className="flex w-full flex-col gap-4 rounded-3xl border border-black/10 bg-white p-4 shadow-lg dark:border-white/15 dark:bg-zinc-900"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {WISH_COPY.title}
      </h2>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="text-sm font-medium">
            {WISH_COPY.nameLabel}
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoComplete="off"
            placeholder={WISH_COPY.namePlaceholder}
            aria-describedby={warning && nameInvalid ? `${nameHintId} ${warningId}` : nameHintId}
            aria-invalid={nameInvalid || undefined}
            onChange={(e) => {
              setName(e.target.value);
              setServerReasons(null);
            }}
            className="min-h-11 w-full rounded-2xl border border-black/15 bg-white p-3 text-base dark:border-white/20 dark:bg-zinc-800"
          />
          <p id={nameHintId} className="text-xs text-zinc-600 dark:text-zinc-300">
            {WISH_COPY.nameHint}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={textId} className="text-sm font-medium">
            {WISH_COPY.textLabel}
          </label>
          <textarea
            id={textId}
            value={text}
            rows={WISH_TEXTAREA_ROWS}
            maxLength={WISH_TEXT_MAX_LENGTH}
            placeholder={WISH_COPY.textPlaceholder}
            aria-describedby={warning && textInvalid ? `${countId} ${warningId}` : countId}
            aria-invalid={textInvalid || undefined}
            onChange={(e) => {
              setText(e.target.value);
              setServerReasons(null);
            }}
            className="w-full resize-none rounded-2xl border border-black/15 bg-white p-3 text-base dark:border-white/20 dark:bg-zinc-800"
          />
          <p id={countId} className="self-end text-xs text-zinc-600 dark:text-zinc-300">
            {`${text.length}/${WISH_TEXT_MAX_LENGTH}`}
          </p>
        </div>
        <WishVisibilitySwitch
          checked={open}
          onToggle={() => {
            setOpen(!open);
            setServerReasons(null);
          }}
          animate={!reducedMotion}
        />
        {open && (
          <p data-testid="wish-public-hint" className="text-sm text-zinc-700 dark:text-zinc-200">
            {MODERATION_COPY.publicHint}
          </p>
        )}
        {warning && (
          <div
            role="alert"
            id={warningId}
            data-testid="wish-moderation-warning"
            className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          >
            <p className="font-semibold">{warning.title}</p>
            <ul className="list-disc pl-5">
              {warning.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>{warning.hint}</p>
          </div>
        )}
        {status && (
          <p data-testid="wish-status" aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-300">
            {status}
          </p>
        )}
        <OwnershipNotice />
        <button
          type="submit"
          disabled={!canSubmit}
          className={`min-h-11 min-w-11 self-end rounded-full bg-zinc-900 px-5 text-white${transition} hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`}
        >
          {WISH_COPY.submit}
        </button>
      </form>
    </section>
  );
}
