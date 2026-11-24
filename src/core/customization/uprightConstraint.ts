import { Quaternion } from "three";

/** Below this |(q.y, q.w)| the parent is ~180° tilted and has no defined yaw; use identity yaw. Lead decision. */
export const UPRIGHT_TWIST_EPSILON = 1e-9;

const twist = new Quaternion();

/**
 * Writes into `out` the local rotation that makes a child's WORLD rotation a pure yaw (world +Y stays up),
 * given the parent's world quaternion. Keeps the parent's yaw (twist about Y). No allocation.
 */
export function computeUprightLocalQuaternion(parentWorld: Quaternion, out: Quaternion): Quaternion {
  const len = Math.hypot(parentWorld.y, parentWorld.w);
  if (len < UPRIGHT_TWIST_EPSILON) twist.set(0, 0, 0, 1);
  else twist.set(0, parentWorld.y / len, 0, parentWorld.w / len);
  return out.copy(parentWorld).invert().multiply(twist);
}
