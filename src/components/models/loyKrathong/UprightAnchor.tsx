"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import { Quaternion } from "three";
import type { Group } from "three";
import { computeUprightLocalQuaternion } from "@/core/customization/uprightConstraint";

/** Group that keeps its children world-upright (parent tilt cancelled, yaw kept) every frame. */
export function UprightAnchor(props: {
  name: string;
  position: readonly [number, number, number];
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const parentWorld = useRef(new Quaternion());
  useFrame(() => {
    const group = ref.current;
    if (!group?.parent) return;
    group.parent.getWorldQuaternion(parentWorld.current);
    computeUprightLocalQuaternion(parentWorld.current, group.quaternion);
  });
  return (
    <group ref={ref} name={props.name} position={props.position}>
      {props.children}
    </group>
  );
}
