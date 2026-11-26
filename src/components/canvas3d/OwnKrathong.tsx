"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { animated, useSpring, type SpringRef } from "@react-spring/three";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import { KrathongModel } from "@/components/models/loyKrathong";
import { RELEASE_BUMP, RELEASE_MOTION_START } from "@/config/ritual.config";
import { TOY_SCENE_LIGHTING } from "@/config/scene.config";
import type { RiverLaneSet, WorldXZ } from "@/core/coordinates";
import type { KrathongAppearance } from "@/core/customization";
import { createBounceFrame, createMarkCueState } from "@/core/effects";
import {
  createReleaseMotion,
  isRitualBumped,
  type OwnKrathongPoseKind,
  type RitualState,
  type ScalarSpringApi,
  type ScalarSpringStart,
} from "@/core/ritual";
import { prepareRiverItems } from "@/core/world";
import { KrathongBlobShadow } from "./BlobShadows";
import { PartChangeBounce } from "./PartChangeBounce";
import {
  candleLightDistance,
  candleLightIntensity,
  createOwnPoseScratch,
  ownKrathongPoseScale,
  ritualTouchdownXZ,
  writeMarkCueScale,
  writeOwnKrathongPose,
} from "./ownKrathongPose";
import type { RitualSite } from "./ritualSite";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

export interface OwnKrathongProps {
  readonly targetRef: RefObject<Group | null>; // krathongTargetRef (camera "krathong" target)
  readonly appearance: KrathongAppearance;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
  readonly objectRotation: number;
  readonly onSelected: () => void; // () => onTargetSelected("krathong") (unchanged MFW-17 behaviour)
  readonly poseKind: OwnKrathongPoseKind;
  readonly ritual: RitualState;
  readonly site: RitualSite;
  readonly lanes: RiverLaneSet;
  readonly dragPointRef: RefObject<WorldXZ | null>;
  readonly releaseDropRef: RefObject<WorldXZ | null>;
  readonly now: () => number;
  readonly onTouchedDown: (attempt: number, at: WorldXZ) => void;
  readonly onSettled: (attempt: number) => void;
  /** LIGHT_PRESETS[preset].candle.intensityScale: scales the candle light without recreating the release motion (MFW-47). */
  readonly candleIntensityScale: number;
  /** Selection / Find My cue on the own krathong (MFW-67): one bounce, then a steady size-up while true. */
  readonly marked: boolean;
}

type ScalarRef = SpringRef<{ value: number }>;

const toApi = (api: ScalarRef): ScalarSpringApi => ({
  start: (o: ScalarSpringStart) =>
    void api.start({
      from: o.from,
      to: o.to,
      immediate: o.immediate,
      config: o.config,
      onRest: o.onRest
        ? (result: { finished?: boolean }) => {
            if (result.finished !== false) o.onRest?.();
          }
        : undefined,
    }),
});

const NO_ATTEMPT = -1;
/** Widened from literals so react-spring types the animated values as numbers. */
const START_VALUE: number = RELEASE_MOTION_START;
const REST_VALUE: number = RELEASE_BUMP.restValue;
const CANDLE_BASE: number = TOY_SCENE_LIGHTING.candle.intensity;
/** Key the mark cue tracks for the own krathong: a stable string, not data. */
const OWN_MARK_ID = "own";

/** The user's own krathong across modes: origin (CUSTOMIZE), pier (ritual), release motion, live river pose (MFW-23). */
export function OwnKrathong({
  targetRef,
  appearance,
  shadows,
  reducedMotion,
  objectRotation,
  onSelected,
  poseKind,
  ritual,
  site,
  lanes,
  dragPointRef,
  releaseDropRef,
  now,
  onTouchedDown,
  onSettled,
  candleIntensityScale,
  marked,
}: OwnKrathongProps) {
  const invalidate = useThree((s) => s.invalidate);
  const [lowerS, lowerApi] = useSpring(() => ({ value: START_VALUE, onChange: invalidate }));
  const [settleS, settleApi] = useSpring(() => ({ value: START_VALUE, onChange: invalidate }));
  const [bumpS, bumpApi] = useSpring(() => ({ value: REST_VALUE, onChange: invalidate }));
  const [candleS, candleApi] = useSpring(() => ({ value: CANDLE_BASE, onChange: invalidate }));
  const motion = useMemo(
    () =>
      createReleaseMotion(
        { lower: toApi(lowerApi), settle: toApi(settleApi), bump: toApi(bumpApi), candle: toApi(candleApi) },
        reducedMotion,
        TOY_SCENE_LIGHTING.candle.intensity,
      ),
    [lowerApi, settleApi, bumpApi, candleApi, reducedMotion],
  );
  const poseScale = ownKrathongPoseScale(poseKind);
  const candleIntensity = useMemo(
    () => candleS.value.to((v) => candleLightIntensity(v, candleIntensityScale, poseScale)),
    [candleS.value, candleIntensityScale, poseScale],
  );
  const own = useMemo(
    () =>
      ritual.saved
        ? (prepareRiverItems(
            [{ id: ritual.saved.id, coord: ritual.saved.coord, createdAtMs: ritual.saved.createdAtMs }],
            lanes,
          )[0] ?? null)
        : null,
    [ritual.saved, lanes],
  );

  const bumpedFor = useRef(NO_ATTEMPT);
  const settledFor = useRef(NO_ATTEMPT);
  const dropOrigin = ritual.origin?.kind === "drop";

  // A: lower to the water, then ripple.
  useEffect(() => {
    if (ritual.phase === "RELEASING" && !ritual.touchedDown) {
      const attempt = ritual.attempt;
      motion.lower(() => onTouchedDown(attempt, ritualTouchdownXZ(site, dropOrigin ? releaseDropRef.current : null)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the release is keyed by phase/attempt/touchedDown
  }, [ritual.phase, ritual.attempt, ritual.touchedDown, motion]);

  // B: candle brightens at touchdown.
  useEffect(() => {
    if (ritual.phase !== "IDLE" && ritual.touchedDown) motion.brightenCandle();
  }, [ritual.phase, ritual.attempt, ritual.touchedDown, motion]);

  // C: bump once per release when the spot moved (client collision or server move).
  const bumped = isRitualBumped(ritual);
  useEffect(() => {
    if (ritual.phase === "RELEASING" && ritual.touchedDown && bumped && bumpedFor.current !== ritual.attempt) {
      bumpedFor.current = ritual.attempt;
      motion.bump();
    }
  }, [ritual.phase, ritual.attempt, ritual.touchedDown, bumped, motion]);

  // D: settle into the saved coord once saved.
  const hasSaved = ritual.saved !== null;
  useEffect(() => {
    if (ritual.phase === "RELEASING" && ritual.touchedDown && hasSaved && settledFor.current !== ritual.attempt) {
      settledFor.current = ritual.attempt;
      const attempt = ritual.attempt;
      motion.settle(() => onSettled(attempt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSettled is stable (store dispatch)
  }, [ritual.phase, ritual.attempt, ritual.touchedDown, hasSaved, motion]);

  // E: back at the pier (failure or reset).
  useEffect(() => {
    if (ritual.phase === "IDLE") motion.reset();
  }, [ritual.phase, ritual.attempt, motion]);

  const poseRef = useRef<Group | null>(null);
  const scratch = useRef(createOwnPoseScratch());
  const markRef = useRef<Group | null>(null);
  const markState = useRef(createMarkCueState());
  const markOut = useRef(createBounceFrame());
  useEffect(() => invalidate(), [marked, invalidate]); // draw the first marked / unmarked frame on the demand canvas
  useFrame(() => {
    const nowMs = now();
    const g = poseRef.current;
    if (!g) return;
    writeOwnKrathongPose(
      g,
      {
        kind: poseKind,
        site,
        dragPoint: dragPointRef.current,
        releaseDrop: dropOrigin ? releaseDropRef.current : null,
        own,
        lower: lowerS.value.get(),
        settle: settleS.value.get(),
        bump: bumpS.value.get(),
        nowMs,
        reducedMotion,
      },
      scratch.current,
    );
    const m = markRef.current;
    const marking =
      m !== null && writeMarkCueScale(m, marked ? OWN_MARK_ID : null, nowMs, reducedMotion, markState.current, markOut.current);
    if (marking || poseKind === "RELEASING" || poseKind === "RIVER" || poseKind === "DRAG") invalidate();
  });

  return (
    <group ref={poseRef} name={SCENE_OBJECT_NAMES.krathongPose}>
      <group
        ref={targetRef}
        name={SCENE_OBJECT_NAMES.krathong}
        rotation={[0, objectRotation, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelected();
        }}
      >
        <animated.pointLight
          color={TOY_SCENE_LIGHTING.candle.color}
          intensity={candleIntensity}
          distance={candleLightDistance(poseScale)}
          decay={TOY_SCENE_LIGHTING.candle.decay}
          position={TOY_SCENE_LIGHTING.candle.position}
        />
        <KrathongBlobShadow />
        <group ref={markRef} name={SCENE_OBJECT_NAMES.krathongMarkCue}>
          <PartChangeBounce changeKey={appearance} reducedMotion={reducedMotion}>
            <KrathongModel appearance={appearance} shadows={shadows} />
          </PartChangeBounce>
        </group>
      </group>
    </group>
  );
}
