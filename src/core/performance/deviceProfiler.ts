import type { QualityTier } from "@/config/performance.config";
import {
  detectDeviceCapabilities,
  subscribeReducedMotion,
  type CapabilityEnv,
} from "./deviceCapabilities";
import { createFpsMeter, type FpsSample, type FrameScheduler } from "./fpsMeter";
import { pickInitialTier } from "./initialTier";
import { createTierController } from "./tierController";

export interface DeviceProfileSink {
  setFps(fps: number | null): void;
  setQualityTier(tier: QualityTier): void;
  setReducedMotion(reduced: boolean): void;
}
export interface VisibilityDocumentLike {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}
export interface ProfilerEnv extends CapabilityEnv {
  scheduler?: FrameScheduler;
  document?: VisibilityDocumentLike;
}

/** Browser environment; call only on the client (inside an effect), never at import time. */
export function getBrowserProfilerEnv(): ProfilerEnv {
  if (typeof window === "undefined") return {};
  return {
    navigator: window.navigator,
    createCanvas: () => document.createElement("canvas"),
    matchMedia:
      typeof window.matchMedia === "function" ? (q) => window.matchMedia(q) : undefined,
    scheduler:
      typeof window.requestAnimationFrame === "function"
        ? {
            request: (cb) => window.requestAnimationFrame(cb),
            cancel: (h) => window.cancelAnimationFrame(h),
          }
        : undefined,
    document,
  };
}

/** Detects capabilities, picks the initial tier, then watches FPS. Returns an idempotent cleanup. */
export function startDeviceProfiler(
  sink: DeviceProfileSink,
  env: ProfilerEnv = getBrowserProfilerEnv(),
): () => void {
  const caps = detectDeviceCapabilities(env);
  sink.setReducedMotion(caps.reducedMotion);
  const unsubRM = subscribeReducedMotion(env.matchMedia, sink.setReducedMotion);

  const tier = pickInitialTier(caps);
  sink.setQualityTier(tier);
  if (tier === "FALLBACK_2D" || !env.scheduler) return () => unsubRM();

  const controller = createTierController(tier);
  const doc = env.document;
  let visibilityAttached = false;

  function detachVisibility() {
    if (doc && visibilityAttached) {
      doc.removeEventListener("visibilitychange", onVisibility);
      visibilityAttached = false;
    }
  }

  function onSample(s: FpsSample) {
    sink.setFps(s.fps);
    const d = controller.onSample(s);
    if (d) {
      sink.setQualityTier(d.to);
      if (d.to === "FALLBACK_2D") {
        meter.stop();
        detachVisibility();
      }
    }
  }

  const meter = createFpsMeter(env.scheduler, onSample, { onStall: () => controller.reset() });

  function onVisibility() {
    if (doc?.visibilityState === "hidden") {
      meter.stop();
      controller.reset();
    } else {
      meter.start();
    }
  }

  if (doc) {
    doc.addEventListener("visibilitychange", onVisibility);
    visibilityAttached = true;
  }
  if (doc?.visibilityState !== "hidden") meter.start();

  return () => {
    meter.stop();
    detachVisibility();
    unsubRM();
  };
}
