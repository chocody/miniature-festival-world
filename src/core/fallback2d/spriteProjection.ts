/** Orthographic 3/4 view angles of a 2D sprite = the 3D camera's azimuth and elevation (fallback2d.config). */
export interface FlatSpriteView {
  readonly azimuthRad: number;
  readonly elevationRad: number;
}
/** Orthographic 3/4 view: camera azimuth/elevation around the model, plus the model's own yaw (three rotation.y). */
export interface FlatKrathongView extends FlatSpriteView {
  readonly modelYawRad: number;
}
export interface ProjectedPoint2D {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

/** Model point → sprite units: screen x right, screen y DOWN, depth toward the camera. Derived at render time, NEVER persisted. */
export function projectModelPoint(p: readonly [number, number, number], view: FlatKrathongView): ProjectedPoint2D {
  const [x, y, z] = p;
  const cosRho = Math.cos(view.modelYawRad);
  const sinRho = Math.sin(view.modelYawRad);
  const xw = x * cosRho + z * sinRho;
  const zw = -x * sinRho + z * cosRho;
  const cosA = Math.cos(view.azimuthRad);
  const sinA = Math.sin(view.azimuthRad);
  const sx = xw * cosA - zw * sinA;
  const zt = xw * sinA + zw * cosA; // toward the camera
  const cosPhi = Math.cos(view.elevationRad);
  const sinPhi = Math.sin(view.elevationRad);
  return { x: sx, y: -y * cosPhi + zt * sinPhi, depth: zt * cosPhi + y * sinPhi };
}
