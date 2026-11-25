import { Quaternion } from "three";

/** Below this |(q.y, q.w)| the parent is ~180° tilted and has no defined yaw; use identity yaw. Lead decision. */
export const UPRIGHT_TWIST_EPSILON = 1e-9;

const twist = new Quaternion();

/**
 * Writes into `out` the twist of `source` about world +Y (its yaw), normalised. Identity when `source` has no defined yaw.
 * `out` may be `source`. No allocation. This is the rule UprightAnchor and the river batch share (MFW-34).
 */
export function writeYawTwistQuaternion(source: Quaternion, out: Quaternion): Quaternion {
  const len = Math.hypot(source.y, source.w);
  if (len < UPRIGHT_TWIST_EPSILON) return out.set(0, 0, 0, 1);
  return out.set(0, source.y / len, 0, source.w / len);
}

/**
 * Writes into `out` the local rotation that makes a child's WORLD rotation a pure yaw (world +Y stays up),
 * given the parent's world quaternion. Keeps the parent's yaw (twist about Y). No allocation.
 */
export function computeUprightLocalQuaternion(parentWorld: Quaternion, out: Quaternion): Quaternion {
  writeYawTwistQuaternion(parentWorld, twist);
  return out.copy(parentWorld).invert().multiply(twist);
}
