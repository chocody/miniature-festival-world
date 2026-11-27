# Krathong models — owner-supplied designs (MFW-65, backlog 13.1)

The krathong is drawn from owner-supplied 3D models instead of the procedural parts. Each model is decimated **once,
offline** into three levels of detail and coloured by a committed, deterministic Node script with pastel vertex colours by
region. Slice 1 (this card) ships one design, `banana_leaf_01`, end to end; slice 2 (card 13.7, MFW-76) adds the other
four as data only.

## 1. Sources

Owner upload `models_and_refs.zip` (2026-11-26): five one-piece models (one mesh each, POSITION only — no normals, UVs or
colours, about 20 000 triangles, bounds ≈ ±1 on x / z, y ≈ −0.9…0.9) and colour reference images.

| Owner file | Design id | Colour reference | Status |
|---|---|---|---|
| `hy3d-model.glb` | `banana_leaf_01` | the owner's banana-leaf krathong reference (`krathong-ref-owner.png`: green base and leaves, tall fronds at the back, white / coral / pink 5-petal flowers with yellow centres, cream candle) | **owner-confirmed** (2026-11-26); slice 1 |
| `hy3d-model (1).glb` | `lotus_bud_01` | `image_1795720193203851.png` | lead's by-eye match, owner to confirm in 13.7 |
| `hy3d-model (2).glb` | `marigold_01` | `image_1795720401483270.png` | lead's by-eye match, owner to confirm in 13.7 |
| `hy3d-model (3).glb` | `rose_candles_01` | `image_1795720517989598.png` | lead's by-eye match, owner to confirm in 13.7 |
| `hy3d-model (4).glb` | `naga_01` | `image_1795720609153034.png` | lead's by-eye match, owner to confirm in 13.7 |

`image_1795720573196605.png` (orchid / rice / basket) has no model and is not used; the banana-leaf reference replaces it
for `hy3d-model.glb` (owner, 2026-11-26: "รูป ref ที่ไม่ตรงกับโมเดล อันนี้ไม่มีเป็นอันนี้แทน"). The supplied house is card
13.2. The supplied tree pack is not used — too heavy, so the procedural trees stay (loop assessment, owner delegated:
"ถ้ามันกินแล้วคุณประเมินว่าหนักก็ใช้ model ต้นไม้เดิมของเรา").

Only the decimated files are committed (`assets/krathong/decimated/`, not served) and the coloured outputs
(`public/models/krathong/`). The original 20 000-triangle uploads are not in the repo.

## 2. Licence

Owner, 2026-11-26: "ใช้ได้แต่ไม่ใช้เชิงพาณิชย์" (usable, non-commercial). The models may be used in this project but not
commercially.

## 3. Decimation (offline, once)

Tool: glTF-Transform CLI **v4.5.1** (`@gltf-transform/cli`), installed outside the repo (not a dependency in
`package.json`). Commands, run once from a scratch folder that holds the owner file:

```sh
gltf-transform weld "hy3d-model.glb" banana_leaf_01.weld.glb
gltf-transform simplify banana_leaf_01.weld.glb assets/krathong/decimated/banana_leaf_01.full.glb   --ratio 0.28  --error 0.02
gltf-transform simplify banana_leaf_01.weld.glb assets/krathong/decimated/banana_leaf_01.medium.glb --ratio 0.052 --error 0.02
gltf-transform simplify banana_leaf_01.weld.glb assets/krathong/decimated/banana_leaf_01.low.glb    --ratio 0.043 --error 0.02
```

| LOD | Decimated source triangles | Body after the flame cut + caps | + procedural flame | Total (guard) | Source bytes | Public bytes |
|---|---|---|---|---|---|---|
| full (hero) | 5 598 | 5 468 | 120 | 5 588 (≤ 6 000) | 67 672 | 239 112 |
| medium (river HIGH / MEDIUM) | 1 038 | 1 008 | 48 | 1 056 (≤ 1 088) | 13 152 | 54 120 |
| low (river LOW) | 856 | 832 | 36 | 868 (≤ 900) | 11 016 | 45 640 |

The error bound stayed at 0.02 for every LOD (no raise needed). The full guard `KRATHONG_MAX_TRIANGLES_BY_LOD.full` was
raised 3 800 → 6 000 for this close-up model (loop decision, DRAFT; hero only — the river draws medium / low, whose
guards are unchanged). The medium / low models are faceted but read as the same krathong at river distance
(screenshots §8).

## 4. Colouring script

```sh
node scripts/krathong-models.mjs                 # rebuild every public file from the decimated sources
node scripts/krathong-models.mjs --design <id>   # one design
node scripts/krathong-models.mjs --check         # write nothing; exit 1 if a committed output differs
```

Exit codes: 0 ok · 1 differs (`--check`) · 2 usage error. Node built-ins only; the output is byte-identical across runs
(no randomness, no dates; tests KS7 and KA7).

- `scripts/krathong-models-lib.mjs` — pure functions: `readGlbMesh`, `normaliseToFootprint`, `classifyFaces`,
  `extractFlames`, `computeCreaseNormals`, `srgbHexToLinearBytes`, `writeGlb`, `buildDesignLod`.
- `scripts/krathong-models.designs.mjs` — data: `FOOTPRINT` (= `KRATHONG_DESIGN_FOOTPRINT`), `CREASE_DEG`, and
  `KRATHONG_MODEL_DESIGNS` (id, source file, reference image, region rules).

Pipeline per design and LOD: read → classify every face by the first matching region rule at its centroid (source
coordinates) → normalise to the footprint (horizontal radius 1.15 about the bbox centre axis, lowest point y −0.18: the
procedural default krathong's size) → cut out the flame faces, cap each hole with a fan, record one flame anchor
`[x, y, z, height, radius]` per flame island → crease normals per face corner → per-face colour (sRGB → linear) →
de-duplicate corners → write the GLB.

Region rules of `banana_leaf_01` (source coordinates; first match wins):

| Order | Region | Shape | Colour (sRGB) | From the reference |
|---|---|---|---|---|
| 1 | flame | column on the candle axis (−0.012, 0.010), r 0.16, y ≥ 0.37 (above the wick neck) | — (cut out) | the flame is drawn by the procedural MFW-69 flame |
| 2 | candle | same axis, r 0.165, y −0.3…0.37 | `#F6E7C1` | cream pillar candle |
| 3–6 | flowers | sphere r 0.07 at each flower centre (4 flowers, y −0.21) | `#F7C94F` | yellow flower centres |
| 7–10 | flowers | sphere r 0.2 around each flower (y −0.25) | `#FFF3E6`, `#F7B3C2`, `#F59A8C`, `#FFF3E6` | white, pink and coral 5-petal flowers |
| 11 | base | band y ≤ −0.45 | `#4F8A45` | deep green bowl |
| 12 | leaves | band y ≥ −0.05 | `#86C06A` | lighter upright banana fronds behind the candle |
| 13 | leaves | any | `#6FAE57` | mid-green leaf ring around the rim |

Flower centres were read from an orthographic top view of the decimated model. Crease angles (DRAFT):
`CREASE_DEG = { full: 60, medium: 75, low: 75 }` — smooth clay shading inside a region, hard edges at folds.

## 5. GLB contract (script writer ↔ runtime parser)

- GLB v2, a JSON chunk and a BIN chunk, both padded to 4 bytes.
- One node, one mesh, one primitive, mode 4 (triangles).
- Attributes `POSITION` (5126 VEC3, with min / max), `NORMAL` (5126 VEC3), `COLOR_0` (5121 normalized VEC4, alpha 255,
  **linear** colour — three treats vertex colours as linear) and indices (5123 when ≤ 65 535 vertices, else 5125).
- Buffer views in that order, tightly packed (no byteStride), each byteOffset a multiple of 4.
- `meshes[0].extras.krathongFlames: [x, y, z, height, radius][]` (model-local, y = flame base).
- No `materials`, `textures`, `images` or `samplers`. `asset.generator = "mfw scripts/krathong-models.mjs"`.

Parser: `parseKrathongDesignGlb` (`src/core/customization/krathongDesignGlb.ts`) validates this contract and returns
typed-array views on the fetched buffer (no copy); any violation throws `KrathongGlbError`.

## 6. Runtime

- **Loader** (`src/components/models/loyKrathong/krathongDesignLoader.ts`): fetches
  `/models/krathong/<id>.<lod>.glb` once per session (one promise per URL; the cache holds CPU data only). A failed load
  stays failed (no retry in the session) and nothing is logged. The aggregate status is the scene attribute
  `data-krathong-models` (`idle | loading | ready | failed`).
- **Lazy, after the tier is decided**: the hero (`useKrathongDesign`) and the river (`useKrathongDesignPlanSource`)
  request a file only once `useDeviceStore.profiled` is true. Nothing is in the first-screen bundle.
- **Assets per canvas** (`krathongAssets.ts`): one `BufferGeometry` per (design, LOD) and one vertex-colour
  `MeshStandardMaterial` (`KRATHONG_DESIGN_BODY_MATERIAL`, matte, no texture), shared by the hero and every river krathong;
  disposed with the canvas. Zone switches create and free nothing (as since MFW-34); a tier change rebuilds GPU geometry
  from the cached CPU data without a refetch.
- **Fallback**: the procedural model renders until the design loads, and permanently if it fails.
- **Mapping**: every appearance maps to `KRATHONG_DEFAULT_DESIGN` (`banana_leaf_01`) until the design picker (card 14.4);
  the stored appearance format is unchanged.
- **Hero** (`DesignKrathongModel`): the body is a 1-instance `InstancedMesh` (`krathong-design-body`), so the hero and the
  river share one program variant; plus one procedural flame per anchor.
- **River** (`riverKrathongBatch.ts`): one instanced bucket per design (appended after incense, `river-batch-18` for
  `banana_leaf_01`); its flames go to the shared flame bucket (capacity `KRATHONG_DESIGN_MAX_FLAMES` 16 per krathong).
- **Flames**: the GLB's own flame is cut out offline; each anchor is drawn with the existing MFW-69 teardrop flame
  geometry, the shared `flame` material (emissive glow per light preset) and the shared flicker (scale per frame; static
  under reduced motion). The flame tilts with the body.

## 7. Regenerate and budgets

1. New or changed colours / rules: edit `scripts/krathong-models.designs.mjs`, run `node scripts/krathong-models.mjs`,
   commit the changed public files; `pnpm test` (KA7) fails if they are stale.
2. A new design (slice 2): decimate as in §3, commit `assets/krathong/decimated/<id>.{full,medium,low}.glb`, add its spec
   to `KRATHONG_MODEL_DESIGNS`, append the id to `KRATHONG_DESIGN_IDS`, run the script.
3. Budgets (lead guards, `KRATHONG_DESIGN_ASSET_BUDGET`, test KA2): each public file ≤ 256 KiB, all public files
   ≤ 1.5 MiB, all decimated sources ≤ 640 KiB. Triangles per LOD ≤ `KRATHONG_MAX_TRIANGLES_BY_LOD` incl. the procedural
   flames (KA4); a full MEDIUM / LOW zone stays within the MFW-48 river triangles (KA4b); a full HIGH zone (colour + shadow
   pass) stays within `HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES` (KA4c).

## 8. Screenshots

`docs/design/screenshots/mfw-65/` (390 × 844, HIGH pinned; "before" = the procedural model, made by blocking the model
files on this branch, which renders exactly as BASE):

- `before-customize-day.png`, `after-customize-day.png`, `after-customize-night.png` — the customize close-up.
- `before-river-night.png`, `after-river-day.png`, `after-river-night.png` — river distance after the release.
