import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";

export interface BounceSpringConfig {
  readonly mass: number;
  readonly tension: number;
  readonly friction: number;
}
export interface PartChangeBounceStart {
  readonly from?: { readonly scale: number };
  readonly to: { readonly scale: number };
  readonly immediate: boolean;
  readonly config?: BounceSpringConfig;
}
/** The subset of a react-spring SpringRef this needs (mirrors CameraAnimationApi in src/core/camera). */
export interface PartChangeBounceApi {
  start: (options: PartChangeBounceStart) => void;
}
export interface PartChangeBounce {
  /** Play the bounce once (reduced motion: snap to rest instead). */
  play(): void;
  /** Snap to rest immediately (used when reduced motion turns on mid-bounce). */
  settle(): void;
}

export function createPartChangeBounce(api: PartChangeBounceApi, reducedMotion: boolean): PartChangeBounce {
  const settle = () => api.start({ to: { scale: PART_CHANGE_BOUNCE.restScale }, immediate: true });
  return {
    play() {
      if (reducedMotion) {
        settle();
        return;
      }
      api.start({
        from: { scale: PART_CHANGE_BOUNCE.fromScale },
        to: { scale: PART_CHANGE_BOUNCE.restScale },
        immediate: false,
        config: { ...PART_CHANGE_BOUNCE.spring },
      });
    },
    settle,
  };
}
