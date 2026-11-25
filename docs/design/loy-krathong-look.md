# Loy Krathong look v2 — art direction (MFW-47, backlog 9.1)

Every value here mirrors `src/config/look.config.ts`; config wins.

Owner decisions: open question 27 (visual target) and open question 32 (day / night), both 2026-11-25.

## 1. Visual target

The target is `docs/spec/assets/loy-krathong-look-ref.png`.

The image is a 3/4 isometric, toy/clay diorama in soft overcast daylight. It shows pale sage land, a calm blue-grey
river, cream houses with a muted teal roof and a terracotta roof, round blob trees on short brown trunks, a light
wooden pier, and a green banana-leaf krathong with coral/cream flowers and a glowing candle. Every edge is rounded.
Nothing is glossy, and no pixel is near-black. Shadows are soft, low-contrast, green/blue-grey blobs under trees,
houses and the krathong, with no hard edges. The light comes from the upper left and the fill is strong and even:
the shadow side of a house is only about 35 % darker than its lit side.

## 2. Palette (`LOOK_PALETTE`)

Sampled from the reference image (median colour per region). All values are DRAFT until the owner signs off on the
screenshots. "Reserved" keys are not used yet; the listed card builds on them.

| Key | Hex | Use |
|---|---|---|
| grass | #A7BA96 | lit land (banks) |
| grassShade | #5E6D54 | land in contact shade under trees — reserved for 9.3 |
| water | #90AAAE | river body |
| waterLight | #ACC3C7 | river highlight near the bank — reserved for 9.3 |
| waterDeep | #546970 | water in shade by the bank / under the pier — reserved for 9.3 |
| wallCream | #E4D4B3 | house walls |
| roofTeal | #718C86 | house roofs (one roof material today) |
| roofTerracotta | #D1936B | second roof colour — reserved for 9.3 |
| doorWood | #B9815A | doors, crates — reserved for 9.3 |
| woodLight | #D4AE82 | pier deck |
| woodDark | #725F46 | pier posts, lamp posts |
| trunk | #7C5D40 | tree trunks |
| canopy | #8CA682 | tree canopies |
| canopyShade | #4E644E | canopy shade side — reserved for 9.3 |
| leafLight | #8DA667 | krathong banana leaf, lit — reserved for 9.2 |
| leafDark | #3F5B35 | krathong banana leaf, shade — reserved for 9.2 |
| flowerCoral | #E19A7C | krathong flower petals — reserved for 9.2 |
| flowerCream | #EBDFC4 | pale krathong petals — reserved for 9.2 |
| flowerYellow | #F2D585 | flower centres, lamp heads |
| candleWax | #D5B279 | candle body — reserved for 9.2 |
| flameCore | #FDF7C6 | flame core — reserved for 9.2 |
| flameHalo | #F9EAA6 | flame halo — reserved for 9.2 |
| lanternGlow | #FFC46B | warm lamp emissive |
| shadowTint | #40564A | blob-shadow tint (dark sage, never black) |
| daySky | #D8E4CF | DAY background (pale sage haze); also the 2D fallback background |
| nightSky | #2E3E63 | NIGHT background (deep periwinkle, not black) |

## 3. Material rules

- Matte only: roughness 1, metalness 0 (the `MatteMaterialSpec` literal types enforce it).
- Curved parts are smooth-shaded (`flatShading: false`): rounded house bodies, cylinders (trunks, posts, piles),
  icosahedron canopies (detail 1) and the small lamp heads. Planar pyramids (roofs) stay flat-shaded.
  - Instanced parts share one shader program: a flat-shaded part spec gets its flatness baked into per-face normals
    (`createInstancedPartGeometry`) and a smooth-shaded material. It looks the same and avoids a second program compile.
  - Banks (flat ribbons with up normals) and the deck (a box) use `flatShading: false`. They look the same and share
    the water / krathong program.
- House bodies are bevelled: `roundedBox` with radius 0.06 and 1 bevel segment (108 triangles), smooth-shaded so the
  edge reads rounded. The lead's draft had 2 segments (300 triangles); at the scene's size the two look the same, and
  the extra triangles cost frame time in the SwiftShader e2e (see §7). The per-part low-poly guard
  `ENVIRONMENT_PART_MAX_TRIANGLES` is 320.
- Lamp heads stay icosahedron detail 0 (about 7 px on screen), smooth-shaded.
- Pastel: no environment albedo below `LOOK_MIN_ALBEDO_LUMINANCE` = 0.1 (WCAG relative luminance).
- No black shadows: the key-light shadow has `shadow.intensity` < 1, and blob shadows are a translucent sage tint.
- Readability guard (AC3): the estimated lit luminance (`estimateLitLuminance`, linear Lambert before tone mapping)
  of every environment surface, up-facing and camera-facing side, is ≥ `LOOK_MIN_LIT_LUMINANCE` = 0.025 in both
  presets. The MFW-27 night look scored ≤ 0.014 and fails it.

## 4. Light presets (`LIGHT_PRESETS`)

Renderer: Neutral tone mapping (`LOOK_RENDERER`, exposure 1). It keeps the pastel albedo close to the sampled hexes;
R3F's default ACES darkens and shifts them. All lights are world-fixed (outside the pan/rotate group).

| Field | DAY | NIGHT |
|---|---|---|
| background | #D8E4CF (daySky) | #2E3E63 (nightSky) |
| hemisphere sky / ground / intensity | #EEF2EC / #A7BA96 / 1.6 | #A9B9E6 / #5B6A86 / 1.7 |
| ambient colour / intensity | #FFFFFF / 0.4 | #8FA2D6 / 0.5 |
| key (sun / moon) colour / intensity / position | #FFF4E3 / 2.4 / [-5, 6.5, 5] | #CAD7FF / 1.3 / [-4, 7, 3] |
| key shadow intensity / radius / bias / normalBias | 0.5 / 5 / -0.0005 / 0.02 | 0.4 / 5 / -0.0005 / 0.02 |
| candle point light scale | 0.15 | 1 |
| flame emissive intensity | 2.2 | 3.0 |

DAY was tuned from the lead's draft on the screenshots: a cooler sky fill (#F6F2E6 → #EEF2EC) and a less orange
sun (#FFF0D9 → #FFF4E3) keep the river blue-grey, and a lower sun ([-5, 8, 4] → [-5, 6.5, 5]) lights the cream walls
as in the reference instead of only the ground.

Candle and flame:

- The own-krathong candle point light is `TOY_SCENE_LIGHTING.candle` (#ffb35c, 14, distance 7) × the preset's
  `candle.intensityScale`. The scale is applied through a spring interpolation, so a preset switch never restarts a
  release.
- The shared krathong flame material is not tone-mapped (`KRATHONG_FLAME_GLOW`), and its emissive intensity is set
  per preset. That makes the flame the brightest surface in both presets without a bloom pass (guarded in
  `riverLayout.test.ts`).
- Lamp heads are pale yellow with a small warm emissive (lanternGlow, 0.35). Per-preset lamps and lit windows are 9.3.

A preset change is an instant cut (no cross-fade), so it is safe under reduced motion by construction.

## 5. Shadows

- HIGH: the tier's key-light shadow map (`MOON_SHADOW_MAP_SIZE_PX`, clamped to the tier texture size). three 0.187
  maps R3F's soft type to PCF, which honours `shadow.radius` 5; `shadow.intensity` 0.4–0.5 under a strong hemisphere
  fill keeps shadows soft and never black. Plus the blob shadows below.
- MEDIUM / LOW: no shadow map (tier budget); blob shadows only.
- Blob shadows on every 3D tier: vertex-alpha fans (`buildBlobShadowFan`, no texture), alpha 1 at the centre falling to
  0 at the rim (`falloffExponent` 1.6), tint `shadowTint` at opacity 0.35, lifted 0.006 above the surface with a
  polygon offset.
  - Fan resolution (`BLOB_SHADOW_TIER_GEOMETRY`, segments × rings): HIGH 16×2 (48 triangles), MEDIUM 12×2 (36),
    LOW 10×2 (30, the cheap variant). The lead's draft had HIGH 24×3 and MEDIUM 16×3; lowered for the same e2e frame
    budget, with no visible difference.
  - Radii (`RIVER_ENVIRONMENT_BLOB_SHADOWS`, local units × instance scale): houses 0.56 × 0.44, trees 0.42, lamps 0.1.
  - Own krathong: `KRATHONG_BLOB_SHADOW` radius 1.45 model units at the water line. River krathongs:
    `RIVER_KRATHONG_BLOB_SHADOW_RADIUS` = 1.45 × `RIVER_KRATHONG_SCALE` world units, moved per frame with the krathong.
  - Three draw calls in total (environment, river and own-krathong InstancedMeshes; the own-krathong one holds a single
    instance so it shares the blob program), whatever the number of krathongs.
  - Blobs ignore raycasts (`NO_RAYCAST`), so they never steal a tap from the water, props or krathongs.

## 6. Time of day and the switch

- AUTO (default) follows the device's local clock: DAY from 06:00 to 18:00, NIGHT otherwise (`DAY_NIGHT_HOURS`,
  PLACEHOLDER). One timer fires at the next boundary, and the clock is re-read when the tab becomes visible again.
  There is no per-frame or per-second work.
- The switch below the scene ("แสงในฉาก": ตามเวลาจริง / กลางวัน / กลางคืน) overrides AUTO. It is hidden before profiling
  and on FALLBACK_2D (the 2D view keeps the DAY albedo until MFW-51).
- The choice is a per-device display preference. It is kept only in this device's LocalStorage under
  `mfw:lightPreset:v1` ("DAY" or "NIGHT"; AUTO = no key) and in `useDeviceStore.lightPresetChoice`. It is never sent
  to the server and is not creation data.
- SSR snapshot: NIGHT (`LIGHT_PRESET_SERVER_FALLBACK`); the scene never renders on the server.

## 7. Tiers and performance

- The per-tier budgets in `performance.config.ts` are unchanged. Every environment part stays one InstancedMesh, so
  the rounded shapes add triangles but no draw calls.
- e2e `perf-audit.spec.ts` numbers (SwiftShader, local container), before (BASE fe5c4bf) → after (MFW-47):
  - "Draw calls do not grow" (ran at MEDIUM both times): 17 → 19 draw calls with one or a full zone of river
    krathongs; triangles 1 440 → 3 416 (one krathong) and 19 300 → 22 968 (full zone).
  - LOW zone switches: 17 → 19 draw calls, flat across 20 switches; geometries 18 → 21, flat; programs 8 → 8.
  - Probe soak (80 river krathongs): 28 → 30 draw calls, 23 168 → 26 134 triangles, geometries 23 → 26, programs
    8 → 8; every counter flat across 20 zone switches.
  - Draw calls do not grow with the number of river krathongs, before or after.
  - Measured +2 calls (environment and river blobs). The own-krathong blob adds a third call whenever the own krathong is
    drawn; the audited WORLD_EXPLORE views do not draw it.
- SwiftShader frame budget: the e2e profiler drops a 3D tier to FALLBACK_2D below 20 FPS. SwiftShader renders and
  compiles shaders on the CPU, so triangles and shader programs cost real frame time there; a tier step-down
  re-creates the canvas and recompiles every program.
  - The lead's draft had about 2.8× BASE's triangles in the HIGH world view (11 592 against 4 200) and 12 programs
    against 8, and the HIGH e2e specs fell back to 2D under load more often than BASE.
  - With 1-segment house bevels, detail-0 lamp heads, lighter blob fans, a one-instance krathong blob and shared
    instanced / planar programs it has 7 488 triangles and 8 programs, the same program count as BASE.
  - Real phone GPUs are far from this limit; the on-device check is in `docs/follow-ups.md`.
- Reduced motion: nothing in the look animates (lights, blobs, preset change), so the output is identical with
  reduced motion on.

## 8. What 9.2–9.5 build on

- 9.2 (MFW-48, krathong models): leafLight, leafDark, flowerCoral, flowerCream, flowerYellow, candleWax, flameCore,
  flameHalo; the flame-glow rule; `KRATHONG_BLOB_SHADOW`.
- 9.3 (MFW-49, river and environment): grassShade, waterLight, waterDeep, roofTerracotta, doorWood, canopyShade;
  per-preset lamps, lit windows, wider water.
- 9.4 (MFW-50, villagers): the palette and the blob-shadow helpers (`DynamicBlobShadows`).
- 9.5 (MFW-51, 2D): the same palette; a 2D day/night preset and switch.

## 9. DRAFT / PLACEHOLDER values

- DRAFT: every `LOOK_PALETTE` hex; every `LIGHT_PRESETS` value; `LOOK_RENDERER`; `BLOB_SHADOW_LOOK`;
  `BLOB_SHADOW_TIER_GEOMETRY`; `KRATHONG_BLOB_SHADOW`; `RIVER_ENVIRONMENT_BLOB_SHADOWS`; the switch copy and its visual
  design; the instant-cut preset change.
- PLACEHOLDER: `DAY_NIGHT_HOURS` (06:00–18:00).
- Lead guards (not product numbers): `LOOK_MIN_LIT_LUMINANCE` 0.025, `LOOK_MIN_ALBEDO_LUMINANCE` 0.1,
  `ENVIRONMENT_PART_MAX_TRIANGLES` 320.
