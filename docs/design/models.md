# Owner-supplied models (krathong MFW-65 / MFW-76, house MFW-66, ornaments MFW-101, MFW-124)

Sections 1–9: the krathong designs (MFW-65 / MFW-76, backlog 13.1 / 13.7). Section 10: the riverside house (MFW-66, backlog 13.2). Section 11: the
design picker (MFW-78). Section 12: the Christmas ornaments (MFW-101, backlog 16.15). Section 13: ornaments part 2 and props (MFW-124, backlog 16.38).

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
commercially. The repository is public from 2026-11-27 for CI only; that grants no rights to these files. The binding
terms for every model, thumbnail and render are in [NOTICE.md](../../NOTICE.md) §1–§4 (and [LICENSE.md](../../LICENSE.md)).

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
for `banana_leaf_01`, `lotus_bud_01`, `marigold_01`, `rose_candles_01`, `naga_01`. No app code selected a design then (the
picker came with MFW-78, §11), so the shots for the four new designs fulfil the `banana_leaf_01.<lod>.glb` requests with that design's public
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
original licence and credit, or replace the model. No in-app credit is added in MFW-66 (docs/follow-ups.md). See also
[NOTICE.md](../../NOTICE.md) §2.

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
  `qualityTier` branch; MFW-77: LOW now draws the lite shell, §10f). Disposal as before (`InstancedPart`).
- Smoke on a house tap still starts at the roof-top centre (chimney-top smoke is a follow-up).

### 10e. Screenshots

`docs/design/screenshots/mfw-66/` (390 × 844, HIGH pinned with `?pinTier=1`, opening view): `before-world-day.png`,
`before-world-night.png` (procedural houses, BASE) and `after-world-day.png`, `after-world-night.png` (owner model).

### 10f. LOW lite shell (MFW-77, backlog 14.3)

Owner decision (chat, 2026-11-27): "LOW ใช้บ้านแบบเบา". With the fuller village (16 houses, docs/design/loy-krathong-look.md
§20) LOW draws every house with a **lite shell**: the full shell without its trim faces. HIGH and MEDIUM keep the full
model (`HOUSE_SHELL_TIERS` in `src/config/performance.config.ts`: HIGH / MEDIUM `"FULL"`, LOW `"LITE"`).

- Build: the same run as §10b (`node scripts/house-model.mjs --source "<path>/House by Poly by Google - 6PGyqELX8M-.glb"`,
  then `--check`, exit 0). `HOUSE_MODEL_SPEC.liteDroppedRegions` = `["trim"]`; `buildHouseModel` returns `liteShell`, built
  from the same culled faces as the shell minus the roof and minus every `liteDroppedRegions` face, with the same local
  transform, rounding and shell palette. `renderHouseModelModule` writes `liteShell` right after `shell`; the other lines of
  the module are byte-identical (the diff only adds the `liteShell` block). Tests HS6 (script) and HA9 (module).
- Result: shell 612 → lite shell **308** triangles (−304 per house), 234 vertices; palette and `centerY` 0.3809 the same as the
  shell; half extents (0.4, 0.3903, 0.3257) — inside the shell's (0.4137, 0.3903, 0.3257). The woodDark chimney cap is a
  separate region and stays. Guard `HOUSE_MODEL_MAX_TRIANGLES.liteShell` 308 (measured).
- Runtime: `RIVER_HOUSE_BODY_PARTS.LITE` = `houseBody` with the lite geometry and its `yOffset`, and the **same material
  object**; `RiverEnvironment` passes `houseBodyForTier(tier)` to the one house-body `InstancedPart`, so a tier change swaps
  only the geometry (the old one is disposed by `InstancedPart`) and draw calls stay the same. Roofs, windows, tap proxies,
  smoke origins and the stretch extent keep the full shell's box (the lite shell fits inside it).
- Look on LOW: without trim the window holes lose their frames and the corner trim; the glass boxes behind the openings
  still fill them (lit at NIGHT). Screenshot `docs/design/screenshots/mfw-77/after-phone-night-low.png`.

## 11. Design picker (MFW-78)

- **Stored key.** The customizer stores the chosen design as the optional appearance key `design` (one of
  `KRATHONG_DESIGN_IDS`; `KRATHONG_APPEARANCE_OPTIONAL_KEYS`). The strict parser accepts it on the write path
  (`POST /api/creations`) and the zone read path; any other value fails the whole appearance (an unknown id is never stored).
  `DEFAULT_KRATHONG_APPEARANCE` carries `design: "banana_leaf_01"`, so every new creation stores its design explicitly.
- **Legacy rows.** Appearances stored before MFW-78 have no `design` key. They are never rewritten (no migration; the column
  is `jsonb` with an object check) and render as `KRATHONG_DEFAULT_DESIGN` (`krathongDesignForAppearance`).
- **Picker.** One row of five thumbnail buttons, no visible text (accessible names `KRATHONG_DESIGN_LABELS`, PLACEHOLDER);
  it replaces the part tabs ฐาน / ใบตอง / ดอกไม้ / เทียน (owner, 2026-11-27). The part keys stay in stored data at their
  defaults. A design file is fetched on the first tap (no prefetch); while it loads the hero keeps the last design it showed.
- **Thumbnails.** `public/ui/krathong-designs/<id>.png`, 112 × 112 px (shown at 48 CSS px), cropped from
  `docs/design/screenshots/mfw-76/after-<id>-customize-day.png` (square x 95, y 285, 200 px) by
  `node scripts/krathong-thumbnails.mjs` (Playwright Chromium, honours `PW_CHROMIUM_PATH`). Re-run when a palette changes;
  re-probe the crop if the MFW-76 shots are retaken. Not under `public/models/krathong/` (KA2 holds exactly the GLBs there).
- **Screenshots.** `docs/design/screenshots/mfw-78/` (HIGH pinned, `?pinTier=1`, a 12-item zone of legacy / lotus / naga
  items, `tests/e2e/design-picker-screenshots.spec.ts`): `{before,after}-{customize,river}-{phone,desktop}-{day,night}.png`
  at 390 × 844 (phone) and 1440 × 900 (desktop). The "after" customize shot has lotus chosen. On BASE the old parser dropped
  every zone item carrying `design`, so the "before" river shows only the legacy items.
- **Cost.** A mixed zone draws up to 5 design buckets instead of 1: up to +4 instanced draw calls (plus their shadow pass on
  HIGH), no new program (the one design-body material). The first use of a design fetches its river LOD file. Per-LOD body
  triangles stay within the unchanged guards (§9: worst full banana 5 588, medium banana 1 056, low marigold 880).

## 12. Christmas ornaments (MFW-101, backlog 16.15)

The first three owner-made Christmas ornaments go through the same pipeline as the krathong designs: decimated once offline,
coloured by a committed deterministic script, three LODs, behind a design-source registry. Nothing is mounted in the app
yet (`featureFlags.christmas` stays false); 16.18 (tree) and 16.20 (customizer) use these pieces.

### 12a. Sources

Owner-made with Hunyuan3D, 2026-11-27: one-piece models (one mesh, POSITION only, about 20 000 triangles, bounds ≈ ±1) and
colour reference screenshots. The originals and the reference images are **not committed**; `model-3.glb`…`model-7.glb`
(bell, stocking, gift, snowman, gift pile) are processed in §13 (MFW-124).

| Owner file | Design id | sha256 of the owner file | Colour reference | Colours (sRGB) |
|---|---|---|---|---|
| `model-0.glb` | `ball_01` | `f78d78be501ea0148b7c7e630b56d0d9e2dbdb65e8505e1f85cbbbf3cceba9ac` | `ref-01.41.46.png` | body cream `#E0D4C4`, cap and ring tan `#CAB8A0` |
| `model-1.glb` | `star_01` | `b8259e9ab3e8e65a156854c909714cfb06398fd177ec625ee8c31ee1261ec954` | `ref-01.41.57.png` | mustard `#D1B271` |
| `model-2.glb` | `bow_01` | `dd08feca523aa4871408db072b2fc42b47c4227951bc03353f6c69625358a5e6` | `ref-01.42.03.png` | terracotta `#CE927E` |

Palette and pairing are DRAFT; the owner reviews them after merge (the reference ring looks slightly lighter than the cap,
≈ `#DFD2C1`; one tan is used for both, as the AC says "tan cap/ring").

### 12b. Licence

See [NOTICE.md](../../NOTICE.md) §8. The Hunyuan3D terms are **unverified** and an owner gate before 20 Dec.

### 12c. Decimation (offline, once)

Tool: glTF-Transform CLI **v4.5.1** (`@gltf-transform/cli`), installed outside the repo (not a dependency in
`package.json`). Per design (`<n>` = 0 / 1 / 2, `<id>` = ball_01 / star_01 / bow_01), from a scratch folder that holds the
owner file:

```sh
gltf-transform weld model-<n>.glb <id>.weld.glb
gltf-transform simplify <id>.weld.glb assets/christmas/decimated/<id>.full.glb   --ratio 0.2   --error 0.02
gltf-transform simplify <id>.weld.glb assets/christmas/decimated/<id>.medium.glb --ratio 0.02  --error 0.02
gltf-transform simplify <id>.weld.glb assets/christmas/decimated/<id>.low.glb    --ratio 0.005 --error 0.05
```

Low needs error 0.05: at 0.02 the simplifier stops at 114–310 triangles. No ratio had to be stepped down. The pipeline adds
no triangles, so the public triangles equal the source triangles.

| Design | LOD | Ratio | Error | Triangles (guard) | Source bytes | Public bytes |
|---|---|---|---|---|---|---|
| `ball_01` | full | 0.2 | 0.02 | 4 000 (≤ 4 000) | 48 904 | 82 936 |
| `ball_01` | medium | 0.02 | 0.02 | 400 (≤ 400) | 5 700 | 12 384 |
| `ball_01` | low | 0.005 | 0.05 | 100 (≤ 100) | 2 092 | 4 752 |
| `star_01` | full | 0.2 | 0.02 | 4 000 (≤ 4 000) | 48 932 | 81 564 |
| `star_01` | medium | 0.02 | 0.02 | 400 (≤ 400) | 5 720 | 9 276 |
| `star_01` | low | 0.005 | 0.05 | 100 (≤ 100) | 2 120 | 4 332 |
| `bow_01` | full | 0.2 | 0.02 | 3 998 (≤ 4 000) | 48 712 | 123 500 |
| `bow_01` | medium | 0.02 | 0.02 | 398 (≤ 400) | 5 628 | 18 392 |
| `bow_01` | low | 0.005 | 0.05 | 100 (≤ 100) | 2 036 | 7 132 |
| **Total** | | | | | **169 844** (≤ 655 360) | **344 268** (≤ 1 572 864) |

Largest single file: `bow_01.full.glb`, 123 500 bytes (≤ 262 144).

### 12d. Colouring script

```sh
node scripts/christmas-models.mjs                     # write public/models/christmas/<id>.<lod>.glb (9 files)
node scripts/christmas-models.mjs --design ball_01    # one design
node scripts/christmas-models.mjs --check             # write nothing; exit 1 when a committed output differs
```

Exit codes: 0 ok · 1 differs (`--check`) · 2 usage error or missing decimated source.

Files: `scripts/christmas-models.mjs` (CLI), `scripts/christmas-models-lib.mjs` (`buildOrnamentLod`,
`boundsCentreTransform`, `normaliseToBoundingRadius`), `scripts/christmas-models.designs.mjs` (data:
`CHRISTMAS_MODEL_DESIGNS`, `MODEL_RADIUS`, `ORNAMENT_CREASE_DEG` = the krathong `CREASE_DEG`, DRAFT).

Shared with the krathong pack (`scripts/krathong-models-lib.mjs`, `scripts/model-pack-cli.mjs`):

- `colourAndWeld({ positions, indices, creaseDeg, faceRgb })`: crease normals, per-face vertex colour and corner
  de-duplication (first-seen order, alpha 255), moved verbatim out of `buildDesignLod`.
- `writeGlb(input, { generator?, extras? })`: `generator` defaults to `mfw scripts/krathong-models.mjs`; `extras`
  undefined writes `{ krathongFlames }` (the krathong behaviour), `null` omits `meshes[0].extras`, an object is written
  as-is.
- `runModelPackCli({ name, script, designs, lods, sourceDir, publicDir, build })`: the CLI both packs run.

The refactor keeps every krathong output **byte-identical**: `node scripts/krathong-models.mjs --check` exits 0, and KA7 /
KA9 and CS6 guard it.

Pipeline (`buildOrnamentLod`): read the decimated source → classify each face by its centroid in source coordinates (first
matching rule wins) → normalise (below) → crease normals → vertex colours → write the GLB with the hook anchor.

### 12e. Region rules

Source coordinates; the first match wins; the last rule is `any`. Colours: the median of the lit half of a pixel box on the
reference image (the MFW-76 method).

| Design | Rules (in order) |
|---|---|
| `ball_01` | 1. `cap` `#CAB8A0`, band y 0.35 … 2, r 0 … 2 (the cap is a column r ≈ 0.27, y 0.35–0.56, the ring sits above it; ref box 215,60–265,80). 2. `body` `#E0D4C4`, any (ref box 180,110–280,200). |
| `star_01` | 1. `body` `#D1B271`, any (ref box 190,90–300,180). |
| `bow_01` | 1. `body` `#CE927E`, any (ref box 150,70–330,130). |

The ball cap threshold stays at the lead's `yMin` 0.35: the DAY hero shot shows a tan cap and ring and a cream sphere with
no bleed either way.

### 12f. GLB contract

As §5, with these differences:

- `asset.generator = "mfw scripts/christmas-models.mjs"`.
- Optional `meshes[0].extras.ornamentHook: [x, y, z]` (model-local, 4 decimals): the hanging point at the top of the bbox
  centre axis, `[0, max y, 0]`. All three designs write it; props (16.38) will write none. No `krathongFlames`.
- Model-local frame: the bbox centre is the origin and the bounding radius about it is `ORNAMENT_MODEL_RADIUS` = 1
  (normalised per LOD). +Y = hook / up, +Z = the outward face. No rotation is applied: the sources already have +Y up and
  are mirror-symmetric in z.

Parser: `parseOrnamentDesignGlb` (`src/core/customization/ornamentDesignGlb.ts`) on the shared core `parseDesignGlbCore`
(`designGlb.ts`, also used by `parseKrathongDesignGlb`, which still requires its flames). Violations throw
`OrnamentGlbError`; a missing `ornamentHook` gives `hook: null`, a malformed one fails.

### 12g. Runtime

- **Registry.** `ORNAMENT_DESIGN_SOURCES` (`src/config/ornamentModels.config.ts`) maps all six designs (`ball_01`, `star_01`, `bow_01`, `bell_01`, `stocking_01`, `gift_01`) to
  `{ kind: "glb", fallbackColor }` (fallback = the design's main, last-rule colour). L17 adds a `procedural` kind. A design
  without a source never fetches and shows the fallback sphere in the default design's
  tint.
- **Loader.** `src/components/models/christmas/ornamentDesignLoader.ts`: its own instance of the generic
  `createDesignGlbLoader` (`src/components/models/designGlbLoader.ts`, also behind the krathong loader). One fetch per URL
  per session, no retry, never logs; its status is independent of `data-krathong-models`.
- **Per canvas.** `createOrnamentAssets` / `OrnamentAssetsProvider`: one geometry per loaded (design, LOD), one shared
  vertex-colour material (`ORNAMENT_DESIGN_BODY_MATERIAL` = the krathong design-body spec), all disposed with the canvas.
  `useOrnamentDesign` requests a file only once the device profiler has decided the tier (`profiled`).
- **Fallback.** One `SphereGeometry(1, 8, 6)` per canvas (80 triangles, ≤ the low guard) and one matte material per
  distinct tint (the same program as any matte standard material). It renders while a design loads and after a failure.
  It is larger than the ball body (≈ 0.79), so the model "settles" on load (DRAFT).
- **Hero.** `OrnamentModel` draws a 1-instance `InstancedMesh` (no shadows, no frame callback), so it shares the program
  with the 16.18 instanced tree. Named `ornament-design-body` / `ornament-fallback`; `userData.ornamentDesign` = design.
- **No app mount** until 16.18 / 16.20.

### 12h. Budgets and size

- Triangle guards `ORNAMENT_MAX_TRIANGLES_BY_LOD`: full 4 000 (customizer hero), medium 400 (tree on HIGH / MEDIUM), low 100
  (tree on LOW). DRAFT (plan L16 v3). Measured: §12c.
- `CHRISTMAS_MODEL_ASSET_BUDGET`: each file ≤ 256 KiB, public total ≤ 1.5 MiB, source total ≤ 640 KiB. Measured: public
  344 268 bytes, sources 169 844 bytes, largest file 123 500 bytes.
- World size: `ORNAMENT_WORLD_RADIUS` = `TREE_ORNAMENT_HIT_RADIUS` = 0.3 (DRAFT, owner art call from the 16.18
  screenshots), so `ORNAMENT_WORLD_SCALE` = 0.3. CA9 checks that every design and the fallback sphere stay ≤ half the
  minimum slot spacing of a 3-band tree (≈ 0.613 / 2 = 0.3065 at the time of writing; not pinned).
- Tests: `tests/unit/christmas-model-assets.test.ts` (CA1–CA9), `tests/unit/christmas-models-script.test.ts` (CS1–CS6).

### 12i. Thumbnails and screenshots

`node scripts/christmas-model-shots.mjs` (Playwright Chromium already installed for e2e, honours `PW_CHROMIUM_PATH`,
SwiftShader; no server and no new dependency: a fake origin served by `page.route` with three from `node_modules`):

- Hero renders `docs/design/screenshots/mfw-101/<id>-hero-{day,night}.png`, 390 × 844, of `<id>.full.glb` with a
  `MeshStandardMaterial` (white, vertex colours, roughness 1, metalness 0), camera fov 30° at (0, 0, 18) looking at the
  origin, and copies of the Loy `LIGHT_PRESETS` DAY / NIGHT (background, hemisphere, ambient, key) and `LOOK_RENDERER`
  (Neutral tone mapping). OT4 pins the copies to the app config.
- Thumbnails `public/ui/ornament-designs/<id>.png`, 112 × 112, cropped from the DAY hero render (square x 95, y 322,
  200 px) with the shared `writeThumbnails` of `scripts/krathong-thumbnails.mjs`.

**Deviation:** the AC asks for customize-view screenshots, but Christmas cannot be opened in the app until 16.3 / 16.20
and Christmas light presets arrive in 16.16. These are harness renders under the Loy presets; the real customize-view shots
(DAY and NIGHT) are retaken in 16.20.

## 13. Christmas ornaments part 2 and props (MFW-124, backlog 16.38)

Bell, stocking and gift as three-LOD hangable ornaments, and the snowman and the gift pile as scene props with medium and low
LODs only and no hook. Same pipeline as §12; nothing is mounted (16.19 places the props, 16.20 builds the customizer).

### 13a. Sources

Owner-made with Hunyuan3D, not committed (sha256 of the original, reference image used for colours):

| File | Id | sha256 | Reference |
|---|---|---|---|
| `model-3.glb` | `bell_01` | `7e0120241beb4839718a22eabc611d587e6bd0dffb3574ad9323ac84465da0ac` | `ref-01.45.47.png` |
| `model-4.glb` | `stocking_01` | `688aa182416007da322400c282b312befe5a6a3c7631f619e2cf1cbb226c0c5e` | `ref-01.42.09.png` |
| `model-5.glb` | `gift_01` | `7eaa6c55131ba8b4248ed0d31faea52b18d4a352afa9d0161ce874739bee0638` | `ref-01.42.14.png` |
| `model-6.glb` | `snowman_01` | `04c46cbdc95113b881784e0909c27468e0fabdc3156c14b3297815d11ddcd580` | `ref-01.42.25.png` |
| `model-7.glb` | `gift_pile_01` | `1b3e578dca90cc0f9b302a5b520cef3852bb22a474ad4852fb5061c92572e2e2` | `ref-01.42.39.png` |

### 13b. Decimation

Per file: `gltf-transform weld model-<n>.glb <id>.weld.glb`, then `gltf-transform simplify <id>.weld.glb
assets/christmas/decimated/<id>.<lod>.glb --ratio R --error E` (glTF-Transform 4.5.1, not a dependency). Values used (no step-down was needed):

| Id | full R / E | medium R / E | low R / E |
|---|---|---|---|
| `bell_01` | 0.2 / 0.02 | 0.02 / 0.02 | 0.005 / **0.08** |
| `stocking_01` | 0.2 / 0.02 | 0.02 / 0.02 | 0.005 / 0.05 |
| `gift_01` | 0.2 / 0.02 | 0.02 / 0.02 | 0.005 / 0.05 |
| `snowman_01` | — | 0.075 / 0.02 | 0.03 / 0.02 |
| `gift_pile_01` | — | 0.075 / 0.02 | 0.03 / **0.03** |

- Bell low: at error 0.05 the simplifier stops at 114 triangles because the clapper is a second mesh island; 0.08 gives 98.
- Pile low: at error 0.02 it stops at 688 triangles; 0.03 gives 588.

Measured (triangles · decimated source bytes · public bytes):

| File | Triangles | Source bytes | Public bytes |
|---|---|---|---|
| `bell_01.full` / `.medium` / `.low` | 4000 / 400 / 98 | 48928 / 5724 / 2108 | 97412 / 16332 / 6704 |
| `stocking_01.full` / `.medium` / `.low` | 4000 / 400 / 100 | 48924 / 5720 / 2116 | 95060 / 11488 / 6016 |
| `gift_01.full` / `.medium` / `.low` | 4000 / 400 / 100 | 48880 / 5676 / 2072 | 125020 / 17116 / 6040 |
| `snowman_01.medium` / `.low` | 1500 / 600 | 18924 / 8124 | 41180 / 21664 |
| `gift_pile_01.medium` / `.low` | 1494 / 588 | 18456 / 7688 | 57444 / 29016 |

Totals of all 22 files against `CHRISTMAS_MODEL_ASSET_BUDGET`: public 874 760 of 1 572 864 bytes, decimated sources
393 184 of 655 360 bytes; the largest file is 125 020 of 262 144 bytes.

### 13c. Pipeline additions

- **`frame`** (optional per design, `{ up, out }` as source-space directions): `orientToFrame` rotates the source so that
  +Y = up and +Z = out (`frameBasis`: z = out, y = up without its z part, x = y × z) before the region rules, the
  normalisation and the hook. Region rules are therefore in **oriented source coordinates**. A design without `frame` takes
  the same input arrays as before, so the ball, star, bow and krathong outputs are byte-identical.
- **`lods`** (optional per design): `runModelPackCli` builds `design.lods ?? lods`, so the props never need a `full` source
  and one `--check` still covers the pack.

### 13d. Region rules

First match wins; colours are sRGB hex. Large regions use the §12e method (median of the lit half of a reference pixel box,
"ref box"); the snowman's eyes, buttons and nose are too small for it (brown = median of the darkest quartile of box 98,98–110,108;
orange = median of the most saturated quartile of box 115,108–126,122).

- **`bell_01`** (no frame): body `#E5CF9A` column r 0.34, y ≤ 0.53 (keeps the dome under the bow); bow `#CE8F7A` box
  [−0.75, 0.42, −0.3]…[0.75, 0.8, 0.3] (ref box 120,25–160,60); body `#E5CF9A` any (ref box 130,100–230,170). Ring and clapper stay mustard.
- **`stocking_01`**: frame `up [0, 0.48, −0.877]`, `out [0.273, −0.844, −0.462]` (out = thinnest principal axis; cuff on
  top, toe at +X, profile +Z). Body `#D69580` column (cx −0.15, cz 0.05, r 0.6, y ≤ 0.19); cuff `#E6DCCC` band y ≥ 0.05 (ref box 165,30–260,80); body any (ref box 190,110–290,190).
- **`gift_01`**: frame `up [0, 1, 0]`, `out [1, 0, 0]` (bow loops face +Z). Ribbon `#D5C6B6`: band y ≥ 0.62, box z −0.18…0.15, box x −0.14…0.18 (ref box 197,110–211,170); body `#99A48F` any (ref box 220,110–233,170).
- **`snowman_01`** (no frame, face at +Z): nose `#E09261` box; eyes and buttons `#5B3C2E` spheres; hat `#D79E8C` band y ≥ 0.47 and
  band y ≥ 0.36, r ≥ 0.4 (the tilted brim; ref box 70,10–160,60); scarf `#D79E8C` band y −0.15…0.12 and the tail box; body `#E2D1C1` any (ref box 60,150–110,200). The numbers are in `scripts/christmas-models.designs.mjs`.
- **`gift_pile_01`** (no frame): one fused island (18 198 of 20 000 triangles), so it cannot be coloured by island. One
  box rule per object from the nine footprints on the ground (y −2…2), colours from the reference: sage `#ABB59E` (box 200,45–225,90),
  cream `#D8BFAA` (75,95–110,150), terracotta `#E1A28B` (320,90–350,130), mustard `#D3B276` (175,240–205,280); neighbours never share a colour. Ribbons on the pile are not coloured separately (DRAFT; owner art review). No box edge was moved from the spec values.

### 13e. Props

`snowman_01` and `gift_pile_01` (`src/config/christmasPropModels.config.ts`, three-free): medium and low LODs only, DRAFT
guards ≤ 1 500 / ≤ 600 triangles (CA10), `hook: false` so the GLB mesh carries no `extras` (CA11), same public directory, model-local
frame (bbox centre at the origin, bounding radius `ORNAMENT_MODEL_RADIUS`) and asset budget as the ornaments. World scale and anchor are 16.19's.

### 13f. Screenshots

`node scripts/christmas-model-shots.mjs` (as §12i) now renders six designs: `mfw-101/` keeps ball, star, bow; `mfw-124/` holds
`bell_01`, `stocking_01`, `gift_01` hero shots (DAY and NIGHT) and `props-sheet-{day,night}.png` (800 × 800, fov 30° at (0, 6, 17):
snowman medium and low on the top row, gift pile medium and low below). Thumbnails for all six designs are written to `public/ui/ornament-designs/`.

**Deviation (same as §12i):** the customize-view screenshots wait for the customizer (16.20); these are harness renders under the Loy presets.
