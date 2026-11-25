import {
  RELEASE_BUMP,
  RELEASE_CANDLE,
  RELEASE_LOWER_SPRING,
  RELEASE_MOTION_END,
  RELEASE_MOTION_START,
  RELEASE_SETTLE_SPRING,
} from "@/config/ritual.config";

export interface ReleaseSpringConfig {
  readonly mass: number;
  readonly tension: number;
  readonly friction: number;
}
export interface ScalarSpringStart {
  readonly from?: { readonly value: number };
  readonly to: { readonly value: number };
  readonly immediate: boolean;
  readonly config?: ReleaseSpringConfig;
  readonly onRest?: () => void; // called once when the animation finishes
}
export interface ScalarSpringApi {
  start(options: ScalarSpringStart): void;
}
export interface ReleaseMotionApis {
  readonly lower: ScalarSpringApi;
  readonly settle: ScalarSpringApi;
  readonly bump: ScalarSpringApi;
  readonly candle: ScalarSpringApi;
}
export interface ReleaseMotion {
  lower(onDone: () => void): void;
  settle(onDone: () => void): void;
  bump(): void;
  brightenCandle(): void;
  reset(): void;
}

/** Release choreography on scalar springs; reduced motion sets every value at once and completes synchronously (invariant F). */
export function createReleaseMotion(
  apis: ReleaseMotionApis,
  reducedMotion: boolean,
  baseCandleIntensity: number,
): ReleaseMotion {
  const bright = baseCandleIntensity * RELEASE_CANDLE.brightenFactor;
  const travel = (api: ScalarSpringApi, config: ReleaseSpringConfig, onDone: () => void): void => {
    if (reducedMotion) {
      api.start({ to: { value: RELEASE_MOTION_END }, immediate: true });
      onDone();
      return;
    }
    api.start({
      from: { value: RELEASE_MOTION_START },
      to: { value: RELEASE_MOTION_END },
      immediate: false,
      config: { ...config },
      onRest: onDone,
    });
  };
  return {
    lower: (onDone) => travel(apis.lower, RELEASE_LOWER_SPRING, onDone),
    settle: (onDone) => travel(apis.settle, RELEASE_SETTLE_SPRING, onDone),
    bump() {
      if (reducedMotion) {
        apis.bump.start({ to: { value: RELEASE_BUMP.restValue }, immediate: true });
        return;
      }
      apis.bump.start({
        from: { value: RELEASE_BUMP.fromValue },
        to: { value: RELEASE_BUMP.restValue },
        immediate: false,
        config: { ...RELEASE_BUMP.spring },
      });
    },
    brightenCandle() {
      if (reducedMotion) {
        apis.candle.start({ to: { value: bright }, immediate: true });
        return;
      }
      apis.candle.start({ to: { value: bright }, immediate: false, config: { ...RELEASE_CANDLE.spring } });
    },
    reset() {
      apis.lower.start({ to: { value: RELEASE_MOTION_START }, immediate: true });
      apis.settle.start({ to: { value: RELEASE_MOTION_START }, immediate: true });
      apis.bump.start({ to: { value: RELEASE_BUMP.restValue }, immediate: true });
      apis.candle.start({ to: { value: baseCandleIntensity }, immediate: true });
    },
  };
}
