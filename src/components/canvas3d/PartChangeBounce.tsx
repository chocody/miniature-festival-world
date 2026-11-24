"use client";

import { animated, useSpring } from "@react-spring/three";
import { useEffect, useRef, type ReactNode } from "react";
import { PART_CHANGE_BOUNCE } from "@/config/customizer.config";
import { createPartChangeBounce } from "@/core/customization/partChangeBounce";

export interface PartChangeBounceProps {
  /** Any change of identity (Object.is) plays one bounce; the first render does not. */
  changeKey: unknown;
  reducedMotion: boolean;
  children: ReactNode;
}

/** Widened from the literal `1` so react-spring types the animated value as a number. */
const REST_SCALE: number = PART_CHANGE_BOUNCE.restScale;

/** Gentle scale bounce on part change (backlog story 4, task 2, AC2); reduced motion → no animation. */
export function PartChangeBounce({ changeKey, reducedMotion, children }: PartChangeBounceProps) {
  const [spring, api] = useSpring(() => ({ scale: REST_SCALE }));
  const lastKey = useRef(changeKey);

  useEffect(() => {
    const bounce = createPartChangeBounce({ start: (options) => void api.start({ ...options }) }, reducedMotion);
    if (Object.is(lastKey.current, changeKey)) {
      if (reducedMotion) bounce.settle();
      return;
    }
    lastKey.current = changeKey;
    bounce.play();
  }, [api, changeKey, reducedMotion]);

  return (
    <animated.group name="part-change-bounce" scale={spring.scale}>
      {children}
    </animated.group>
  );
}
