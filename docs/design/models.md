# Owner-supplied models (krathong MFW-65 / MFW-76, house MFW-66)

Sections 1–9: the krathong designs (MFW-65 / MFW-76, backlog 13.1 / 13.7). Section 10: the riverside house (MFW-66, backlog 13.2).

The krathong is drawn from owner-supplied 3D models instead of the procedural parts. Each model is decimated **once,
offline** into three levels of detail and coloured by a committed, deterministic Node script with pastel vertex colours by
region. Slice 1 (MFW-65) shipped one design, `banana_leaf_01`, end to end; slice 2 (card 13.7, MFW-76) added the other
four as data (decimated sources, region rules, public files) plus two pipeline options (`maxFlames`, `addedFlames`).

## 1. Sources

Owner upload `models_and_refs.zip` (2026-11-26): five one-piece models (one mesh each, POSITION only — no normals, UVs or
colours, about 20 000 triangles, bounds ≈ ±1 on x / z, y ≈ −0.9…0.9) and colour reference images.

| Owner file | Design id | Colour reference | Status |
|---|---|---|---|
| `hy3d-model.glb` | `banana_leaf_01` | the owner's banana-leaf krathong reference (`krathong-ref-owner.png`: green base and leaves, tall fronds at the back, white / coral / pink 5-petal flowers with yellow centres, cream candle) | **owner-confirmed** (2026-11-26); slice 1 |
| `hy3d-model (1).glb` | `lotus_bud_01` | `image_1795720193203851.png` | pipeline done (MFW-76); pairing and palette DRAFT, owner to confirm |
| `hy3d-model (2).glb` | `marigold_01` | `image_1795720401483270.png` | pipeline done (MFW-76); pairing and palette DRAFT, owner to confirm |
| `hy3d-model (3).glb` | `rose_candles_01` | `image_1795720517989598.png` | pipeline done (MFW-76); pairing and palette DRAFT, owner to confirm |
| `hy3d-model (4).glb` | `naga_01` | `image_1795720609153034.png` | pipeline done (MFW-76); pairing and palette DRAFT, owner to confirm |

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

### 3.1 The four MFW-76 designs

Same tool and `weld` step (`gltf-transform weld "hy3d-model (n).glb" <id>.weld.glb`), then per LOD
`gltf-transform simplify <id>.weld.glb assets/krathong/decimated/<id>.<lod>.glb --ratio <r> --error <e>` with the values
below. Selection rule (lead spec MFW-76, decision D1 / D2): medium and low first — the largest ratio of the ladder
(medium 0.052 / 0.048 / 0.045 / 0.04 / 0.035 / 0.03, low 0.043 / 0.04 / 0.035 / 0.03 / 0.025) whose body + procedural
flames is ≤ 1 056 (medium, KA4c) / ≤ 900 (low, KA4) with low body < medium body, at `--error 0.02` if any ratio passes,
else `--error 0.05`; then the largest full ratio (0.28 / 0.24 / 0.22 / 0.20 / 0.18 / 0.16) that keeps the design's three
public files ≤ **300 000 bytes** ((1 572 864 − 338 872) / 4 = 308 498, rounded down for colour-split headroom).

| Design | LOD | `--ratio` | `--error` | Decimated triangles | Body after cut + caps | Procedural flames | Total (guard) | Source bytes | Public bytes |
|---|---|---|---|---|---|---|---|---|---|
| `lotus_bud_01` | full | 0.22 | 0.02 | 4 384 | 4 270 | 1 × 120 | 4 390 (≤ 6 000) | 52 600 | 192 496 |
| `lotus_bud_01` | medium | 0.048 | 0.02 | 1 024 | 998 | 1 × 48 | 1 046 (≤ 1 088) | 12 672 | 55 372 |
| `lotus_bud_01` | low | 0.043 | 0.05 | 848 | 826 | 1 × 36 | 862 (≤ 900) | 10 620 | 47 200 |
| `marigold_01` | full | 0.16 | 0.02 | 3 124 | 3 086 | 1 × 120 | 3 206 (≤ 6 000) | 36 064 | 180 548 |
| `marigold_01` | medium | 0.052 | 0.05 | 988 | 974 | 1 × 48 | 1 022 (≤ 1 088) | 11 760 | 56 460 |
| `marigold_01` | low | 0.043 | 0.05 | 856 | 844 | 1 × 36 | 880 (≤ 900) | 10 332 | 49 804 |
| `rose_candles_01` | full | 0.16 | 0.02 | 3 080 | 2 948 | 15 × 120 | 4 748 (≤ 6 000) | 35 368 | 188 260 |
| `rose_candles_01` | medium | 0.04 | 0.05 | 758 | 740 | 5 × 48 | 980 (≤ 1 088) | 8 964 | 51 716 |
| `rose_candles_01` | low | 0.035 | 0.05 | 700 | 684 | 4 × 36 | 828 (≤ 900) | 8 280 | 48 900 |
| `naga_01` | full | 0.16 | 0.02 | 3 126 | 3 074 | 6 × 120 | 3 794 (≤ 6 000) | 36 856 | 182 512 |
| `naga_01` | medium | 0.048 | 0.05 | 916 | 905 | 3 × 48 | 1 049 (≤ 1 088) | 11 112 | 54 948 |
| `naga_01` | low | 0.04 | 0.05 | 778 | 767 | 3 × 36 | 875 (≤ 900) | 9 564 | 46 980 |

Per design (public): lotus 295 068, marigold 286 812, rose 288 876, naga 284 440 bytes — each ≤ 300 000. At `--error 0.02`
medium / low cannot go below ≈ 1 000 (lotus) / 1 440–2 190 (the others) triangles, so all low LODs and the medium LODs of
marigold, rose and naga use 0.05 (decision D2; banana keeps 0.02). One step up the full ladder (0.18 / 0.24) passes
300 000 bytes for every design. Medium / low ratios below were also tried at both errors (scratch probe); the rows above
are the ones the rule picks.

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

Flower centres were read from an orthographic top view of the decimated model.

### 4.1 Pipeline options (MFW-76)

- `maxFlames: { full?, medium?, low? }` — at most this many flame islands are cut per LOD; the tallest win (unrounded
  height, a tie goes to the lower island index). The other islands stay in the body as ordinary faces in their flame-rule
  colour (matte, no glow). Missing = no limit.
- `addedFlames: [{ x, y, z, height, radius }]` — anchors in source coordinates for a flame the model lacks, transformed with
  `footprintTransform` (the transform `normaliseToFootprint` applies) and appended after the cut anchors. Not used by any
  committed design: `lotus_bud_01` turned out to have a flame (below); the option is tested (KS10).
- A design without any flame island no longer throws in `extractFlames`; `buildDesignLod` throws `no flame found` only
  when the final anchor list is empty.

### 4.2 Region rules of the MFW-76 designs

All in source coordinates, first match wins; positions read from orthographic top / front views of the welded source
(0.1 grids) and flat-top / y-profile probes; every colour is sampled from the design's reference image (median of the lit
half of a box over that area; the box is named in the comment next to the colour in
`scripts/krathong-models.designs.mjs`). Petals map to `leaves`, every ornament (flowers, buds, pads, rice, the naga) to
`flowers` (decision D5).

**`lotus_bud_01`** (image_1795720193203851)

| Order | Region | Shape | Colour | Reference area |
|---|---|---|---|---|
| 1 | flame | column (−0.02, −0.023) r 0.21, y ≥ 0.45 | `#FBD7A1` (cut) | the bud-shaped teardrop on the candle top (wick neck at y 0.46) |
| 2–3 | candle | same axis r 0.18, y 0.15…0.45 / −0.3…0.15 | `#FDDCB2` / `#CE8F83` | cream top / peach bottom of the candle |
| 4–5 | flowers | sphere (−0.33, 0.4, −0.61) r 0.07; r 0.22 at y 0.3 | `#EDDA91` / `#E1A49B` | open lotus: yellow centre, pink petals |
| 6–9 | flowers | buds at (0.64, ·, 0.21) and (−0.03, ·, −0.75): top sphere r 0.12, sepal sphere r 0.17 | `#DEA3A7` / `#8B9963` | pink buds with green sepals |
| 10 | leaves | band y −0.45…0.13, r ≤ 0.5 | `#E0BDC0` | pale inner petals |
| 11 | flowers | band y ≥ 0.05, r ≥ 0.33 | `#AAC39C` | lily pads and stems |
| 12 | base | band y ≤ −0.45 | `#5F815D` | green base drum |
| 13 | leaves | any | `#D69EA1` | deeper outer petals |

Flame: the lead's probe found no flame, but the model has a teardrop (two leaf-like halves, y 0.48–0.83, ≈ 0.19 wide) on
the candle top behind a thin wick neck — the reference's flame (outer + inner teardrop) as the generator shaped it. It is
cut and replaced like every other flame (1 anchor per LOD), so `addedFlames` is not needed (deviation from the lead spec).

**`marigold_01`** (image_1795720401483270): flame column (−0.023, −0.023) r 0.17 y ≥ 0.43 (1 flame); candle column r 0.175
y −0.2…0.43 `#DDC4A3` (cream candle); inner petals band r ≤ 0.45 y ≥ −0.45 `#D27F83` and outer petals r ≤ 0.7 y ≥ −0.1
`#C67577` (rose lotus); base bands y ≤ −0.61 `#4E7B4F` (lower woven band) and −0.61…−0.44 `#729E6F` (upper band);
12 marigold spheres r 0.3 on a ring of radius 0.82 at y −0.2, every 30° from −103°, alternating orange `#CD8A42` and yellow
`#DDAC56`; any → orange.

**`rose_candles_01`** (image_1795720517989598): 17 candles read from a top view clipped at y 0.15 (circles r ≈ 0.11, the
big front one r ≈ 0.18), 15 with a flame (axis = flame tip, top = flat candle top) and two flame-less ones (tops at
y 0.26). Flame columns r 0.08 (big 0.15) from top + 0.04 (just above the wick foot, so a decimated candle top never joins
two flames into one island); candle columns r 0.12 (big 0.19) y −0.1…top, cream `#E0C39D` / pale green `#B3C0A0`
alternating as in the reference; base y ≤ −0.6 `#588759`; green filler band y −0.6…−0.5 `#79A177`; red lotus-roses
(3 spheres) `#AD4951`, coral roses (2) `#B96867`, purple orchids box front-right `#90628E`, white carnations box front-left
`#DBCFBF`, any → pale-yellow carnations `#EED8A6`. `maxFlames: { full: 16, medium: 5, low: 5 }` (decision D3): full cuts all
15; medium the 5 tallest; the low decimation (0.035 @ 0.05, the only low ratio that fits) keeps only 4 flame islands, so
low has 4. The flame rule colour `#D6A355` (matte orange teardrops in the reference) shows on the uncut flames.

**`naga_01`** (image_1795720609153034): 6 candles (centre r 0.12, five r 0.1), flame columns r 0.09 from above the
neighbouring tops, candle columns y −0.3…flame foot, pink `#EEA5A4` / peach `#FCDCAF` per candle; naga head sphere at the
front (−0.165, −0.05, 0.8) r 0.17 `#94AB84` with crest r 0.07 `#D5AA8E`; rice stalks (3 spheres, left / right / back)
`#E0B789`; naga body swags band y −0.72…−0.4, r ≥ 0.86 `#94AB84`; base y ≤ −0.42 `#6D9368`; inner petals r ≤ 0.6
`#D2A6A4`; any → outer petals `#D39D97`. `maxFlames: { medium: 3, low: 3 }` — forced by the guards: at `--error 0.05` the
decimation loses one small flame and merges others (medium 0.052 / 0.048 keep 5 islands, low 0.035 keeps 3 of which 2
span two candles), and 5 × 48 + body does not fit 1 056 at any medium ratio whose low partner fits 900. So full has 6,
medium and low the 3 tallest (centre, the tall back-right one, the front one). The lead's KA5 "same count at all three
LODs" is replaced by "medium = low = maxFlames, full ≥ medium" (deviation, reported). Crease angles (DRAFT):
`CREASE_DEG = { full: 60, medium: 75, low: 75 }` — smooth clay shading inside a region, hard edges at folds.

## 5. GLB contract (script writer ↔ runtime parser)

- GLB v2, a JSON chunk and a BIN chunk, both padded to 4 bytes.
- One node, one mesh, one primitive, mode 4 (triangles).
- Attributes `POSITION` (5126 VEC3, with min / max), `NORMAL` (5126 VEC3), `COLOR_0` (5121 normalized VEC4, alpha 255,
  **linear** colour — three treats vertex colours as linear) and indices (5123 when ≤ 65 535 vertices, else 5125).
- Buffer views in that order, tightly packed (no byteStride), each byteOffset a multiple of 4.
- `meshes[0].extras.krathongFlames: [x, y, z, height, radius][]` (model-local, y = flame base). The list holds the cut
  flames in island order, then any `addedFlames` anchors (MFW-76).
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
   ≤ 1.5 MiB, all decimated sources ≤ 640 KiB. MFW-76 share: each of the four new designs ≤ 300 000 public bytes (§3.1).
   After MFW-76: public 1 494 068 bytes (of 1 572 864), sources 336 032 bytes (of 655 360). `banana_leaf_01` is
   byte-identical to MFW-65 (KA9 pins its SHA-256). Triangles per LOD ≤ `KRATHONG_MAX_TRIANGLES_BY_LOD` incl. the procedural
   flames (KA4); a full MEDIUM / LOW zone stays within the MFW-48 river triangles (KA4b); a full HIGH zone (colour + shadow
   pass) stays within `HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES` (KA4c).

## 8. Screenshots

`docs/design/screenshots/mfw-65/` (390 × 844, HIGH pinned; "before" = the procedural model, made by blocking the model
files on this branch, which renders exactly as BASE):

- `before-customize-day.png`, `after-customize-day.png`, `after-customize-night.png` — the customize close-up.
- `before-river-night.png`, `after-river-day.png`, `after-river-night.png` — river distance after the release.

`docs/design/screenshots/mfw-76/` (24 PNGs, 390 × 844, HIGH pinned, `?pinTier=1`): `before-{customize,river}-{day,night}.png`
(the procedural krathong, model files blocked; shared by all five designs) and `after-<id>-{customize,river}-{day,night}.png`
for `banana_leaf_01`, `lotus_bud_01`, `marigold_01`, `rose_candles_01`, `naga_01`. No app code selects a design yet (picker =
MFW-78), so the shots for the four new designs fulfil the `banana_leaf_01.<lod>.glb` requests with that design's public
file (route substitution, decision D6).

## 9. Runtime cost (MFW-76)

- +4 instanced buckets (`design:<id>|designBody`, after `design:banana_leaf_01`, bucket count 19 → 23; banana stays
  index 18). They stay empty and invisible (count 0, `visible = false`) until the picker maps an appearance to them: no draw
  call, no new program, no per-frame work; memory only (instance buffers 4 × 80 matrices). The geometry of a design is only
  fetched when a krathong uses it.
- Flame bucket capacity unchanged (`KRATHONG_DESIGN_MAX_FLAMES` 16 per krathong; the most any design has is 15).
- Worst design per LOD (KA4, body + procedural flames): full `rose_candles_01` 4 748 (banana 5 588 stays the worst);
  medium `banana_leaf_01` 1 056 (new designs ≤ 1 049); low `marigold_01` 880 (banana 868). All within the unchanged guards 6 000 / 1 088 / 900.

## 10. House (MFW-66, backlog 13.2)

The seven riverside houses are drawn from the owner's house model instead of the procedural body / roof / door. A run-once
offline script turns it into a committed TypeScript data module; the owner file itself is **not** in the repo (owner:
commit only the outputs).

### 10a. Source and licence

| Field | Value |
|---|---|
| Owner file | `House by Poly by Google - 6PGyqELX8M-.glb` (from the owner's `models_and_refs.zip`, 2026-11-26) |
| sha256 | `cead59093e07cdcf6112748716dad9dbadc6ae1c177f3bd13b0c27572cda9722` |
| Embedded metadata | `asset.generator = "obj2gltf"`, `asset.version = "2.0"`; **no** `asset.copyright`, no `extras`, no extensions, no licence or author field |
| Geometry | 49 nodes (one mesh each, no node transforms), 4 materials, indexed triangles ≈ 1 300 |
| Owner note | "ใช้ได้แต่ไม่ใช้เชิงพาณิชย์" (usable, non-commercial; the owner wrote "…เชิงภาณิชย์") |

**Licence flag (open, owner):** the file carries no licence metadata. "Poly by Google" models were usually published
CC-BY, but that is **unverified** for this file, and the attribution line is pending the owner. Loop decision: the model
is used for the **Loy Krathong 2026 private test only**; before the public launch (Christmas) the owner must confirm the
original licence and credit, or replace the model. No in-app credit is added in MFW-66 (docs/follow-ups.md).

### 10b. Build (offline, once)

```sh
node scripts/house-model.mjs --source "<path>/House by Poly by Google - 6PGyqELX8M-.glb"           # writes the module
node scripts/house-model.mjs --source "<path>/House by Poly by Google - 6PGyqELX8M-.glb" --check   # exit 1 if stale
```

Output: `src/config/events/loyKrathong.houseModel.ts` (generated, do not edit; ≈ 31 KB). Exit codes: 0 ok · 1 differs
(`--check`) · 2 usage / missing source / parse error. Node built-ins only, deterministic (no dates; test HS5).

- `scripts/house-model.data.mjs` — `HOUSE_MODEL_SPEC`, every number of the build (below).
- `scripts/house-model-lib.mjs` — `readGlbPrimitives`, `buildHouseModel`, `renderHouseModelModule` (tests HS1–HS5).

Rules, in order (source units unless stated):

1. Drop the door knob (`Cylinder001`, 216 triangles, under 1 px).
2. Region per face: material 1 = roof; `Box001` material 0 = walls; `Box002` chimney; `Box003` chimney cap; `Box040`
   step; `Plane006`, `Box035`–`Box039` door; every other node = trim.
3. Turn by `sourceYawRad` π/18 so the walls are axis-aligned: rotated = (x cosθ − z sinθ, y, x sinθ + z cosθ).
4. Walls bbox (before culling) gives the four wall planes.
5. Drop degenerate faces, then faces with unit normal y < `downFaceMaxNormalY` −0.84 (never seen from the fixed camera
   elevation, any yaw; test HA7), then trim / door / step faces within `wallBand` 6 of a wall plane that face into the
   wall (n · outward < `inwardDot` −0.9). No decimation.
6. House-local: X = −(x′ − cx)·k, Y = (y − y0)·k, Z = −(z′ − cz)·k with k = `bodyWidth` 0.8 / walls x extent (the old
   procedural body width) — the door ends at +Z, the walls are centred, the base is y 0.
7. Shell (every non-roof region, per-face palette index) and roof; round to 4 decimals and weld; y stored about the
   part's mid height (`centerY` = the part's `yOffset`).
8. Window glass: one box behind each of the five open window holes (2 front, 2 back, 1 side), the size of the largest
   opening + `glassMargin` 0.01 per side, depth `glassDepth` 0.02.

Shell palette (`LOOK_PALETTE` clay pastels, vertex colours, no textures): walls `wallCream` #E4D4B3, chimney and step
`stone` #B9B7A8, chimney cap and trim `woodDark` #725F46, door `doorWood` #B9815A. The roof colour comes from the roof
kind (`roofTeal` / `roofTerracotta`).

### 10c. Triangles and budgets

| Part | Triangles | Culled (stats) |
|---|---|---|
| shell | 612 (guard `HOUSE_MODEL_MAX_TRIANGLES.shell` 640) | walls:down 68, chimney:down 2, trim:down 76, trim:inward 76, door:down 10, door:inward 10, step:down 2 |
| roof | 200 (guard 200) | — |
| knob | 0 | 216 dropped |
| window glass | 5 boxes × 12 = 60 | — |

k = 0.0080630 (written as `scale` 0.0081). Shell half extents (0.4137, 0.3903, 0.3257), centre y 0.3809; roof
(0.4245, 0.1963, 0.3101), centre y 0.5803; glass 0.1759 × 0.2015 × 0.02 — all inside the old procedural envelope
(0.92 × 0.72, top ≤ 0.85; test HA4).

**Budget raise (stated openly; lead, DRAFT for owner review):** the house goes from 152 to 872 triangles (+720) × 7
houses = **+5 040** measured: environment triangles 7 464 / 7 104 / 4 368 → 12 504 / 12 144 / 9 408 (HIGH / MEDIUM /
LOW). `ENVIRONMENT_RENDER_BUDGETS.maxTriangles` 7 800 / 7 350 / 5 400 → 12 900 / 12 450 / 10 500 (+5 100 each).
Draw calls go **down** by one (the door is part of the model): 20 / 20 / 19 → 19 / 19 / 18; `maxDrawCalls` unchanged.

### 10d. Runtime

- Parts (`RIVER_ENVIRONMENT_PARTS`, one `InstancedMesh` each, placed by the unchanged house layout): `houseBody` = the
  shell (`staticMesh` geometry, `HOUSE_SHELL_MATERIAL` = white matte × vertex colours — the same program variant as the
  MFW-65 krathong design body); `houseRoof` / `houseRoofGable` = the same roof geometry in teal / terracotta; `houseWindow`
  = the glass box (emissive at NIGHT, MFW-49; lights on a house tap, MFW-60). House draw calls 5 → 4.
- `staticMesh` geometry (`createStaticMeshGeometry`): non-indexed, flat normals, colour = Uint8 RGBA normalized.
- `HOUSE_FACADE.windows` = the model's five windows, each with its own yaw (back π, side π/2); every window lights (W = 5
  per house, existing glow cap).
- Static: no per-frame work, no texture, no new program, the same model on every tier (no `reducedMotion` /
  `qualityTier` branch). Disposal as before (`InstancedPart`).
- Smoke on a house tap still starts at the roof-top centre (chimney-top smoke is a follow-up).

### 10e. Screenshots

`docs/design/screenshots/mfw-66/` (390 × 844, HIGH pinned with `?pinTier=1`, opening view): `before-world-day.png`,
`before-world-night.png` (procedural houses, BASE) and `after-world-day.png`, `after-world-night.png` (owner model).
