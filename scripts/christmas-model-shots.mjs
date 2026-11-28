#!/usr/bin/env node
// Christmas ornament hero renders and design picker thumbnails (MFW-101 / MFW-124, docs/design/models.md §12i and §13f).
//
//   node scripts/christmas-model-shots.mjs
//
// Christmas cannot be opened in the app yet (16.3 / 16.20), so this harness renders each committed full-LOD ornament GLB
// (public/models/christmas/<id>.full.glb) with three under the Loy DAY and NIGHT light presets in the Playwright Chromium
// already installed for e2e (no new dependency, no server: a fake origin served by page.route). It writes
// docs/design/screenshots/mfw-101/<id>-hero-<day|night>.png (390 × 844, DPR 1) and crops the DAY shots into
// public/ui/ornament-designs/<id>.png like scripts/krathong-thumbnails.mjs. Honors PW_CHROMIUM_PATH. The real
// customize-view shots are retaken in 16.20. MFW-124 adds the bell, stocking and gift (docs/design/screenshots/mfw-124/) and a
// prop sheet (snowman and gift pile, medium and low LOD, DAY and NIGHT: props-sheet-<day|night>.png, 800 × 800).
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeThumbnails } from "./krathong-thumbnails.mjs";

/** = ORNAMENT_GLB_DESIGN_IDS (src/config/ornamentModels.config.ts), in the same order; OT1 pins it. */
export const SHOT_DESIGN_IDS = Object.freeze(["ball_01", "star_01", "bow_01", "bell_01", "stocking_01", "gift_01"]);
/** The e2e mobile viewport (CSS px at DPR 1). */
export const SHOT_VIEWPORT = Object.freeze({ width: 390, height: 844 });
/** Looks at the origin; the unit bounding sphere then spans about 175 px. */
export const SHOT_CAMERA = Object.freeze({ fovDeg: 30, position: Object.freeze([0, 0, 18]) });
/** Copies of the LIGHT_PRESETS fields the harness uses (src/config/look.config.ts); OT4 pins them. */
export const SHOT_LIGHTS = Object.freeze({
  DAY: Object.freeze({
    background: "#D8E4CF",
    hemisphere: Object.freeze({ skyColor: "#EEF2EC", groundColor: "#A7BA96", intensity: 1.6 }),
    ambient: Object.freeze({ color: "#FFFFFF", intensity: 0.4 }),
    key: Object.freeze({ color: "#FFF4E3", intensity: 2.4, position: Object.freeze([-5, 6.5, 5]) }),
  }),
  NIGHT: Object.freeze({
    background: "#2E3E63",
    hemisphere: Object.freeze({ skyColor: "#A9B9E6", groundColor: "#5B6A86", intensity: 1.7 }),
    ambient: Object.freeze({ color: "#8FA2D6", intensity: 0.5 }),
    key: Object.freeze({ color: "#CAD7FF", intensity: 1.3, position: Object.freeze([-4, 7, 3]) }),
  }),
});
/** = LOOK_RENDERER; OT4 pins it. */
export const SHOT_TONE_MAPPING = Object.freeze({ toneMapping: "NEUTRAL", toneMappingExposure: 1 });
/** = roughness / metalness of ORNAMENT_DESIGN_BODY_MATERIAL; OT4 pins it. */
export const SHOT_MATERIAL = Object.freeze({ roughness: 1, metalness: 0 });
/** Output directory of the hero renders per design: the MFW-101 files stay where they are. */
export const SHOT_OUT_DIR_BY_DESIGN = Object.freeze({
  ball_01: "docs/design/screenshots/mfw-101",
  star_01: "docs/design/screenshots/mfw-101",
  bow_01: "docs/design/screenshots/mfw-101",
  bell_01: "docs/design/screenshots/mfw-124",
  stocking_01: "docs/design/screenshots/mfw-124",
  gift_01: "docs/design/screenshots/mfw-124",
});
export const PROP_SHEET_OUT_DIR = "docs/design/screenshots/mfw-124";
/** The prop sheet: the two props at both LODs side by side (medium left, low right), looking at the origin. */
export const PROP_SHEET = Object.freeze({
  viewport: Object.freeze({ width: 800, height: 800 }),
  camera: Object.freeze({ fovDeg: 30, position: Object.freeze([0, 6, 17]) }),
  items: Object.freeze([
    Object.freeze({ id: "snowman_01", lod: "medium", position: Object.freeze([-1.25, 1.25, 0]) }),
    Object.freeze({ id: "snowman_01", lod: "low", position: Object.freeze([1.25, 1.25, 0]) }),
    Object.freeze({ id: "gift_pile_01", lod: "medium", position: Object.freeze([-1.25, -1.25, 0]) }),
    Object.freeze({ id: "gift_pile_01", lod: "low", position: Object.freeze([1.25, -1.25, 0]) }),
  ]),
});
/** The square around the ornament in the hero shots (source px, centred on the 390 × 844 viewport). */
export const THUMBNAIL_CROP = Object.freeze({ x: 95, y: 322, size: 200 });
/** = ORNAMENT_DESIGN_THUMBNAIL_PX; OT1 pins it. */
export const THUMBNAIL_OUT_PX = 112;
export const THUMBNAIL_OUT_DIR = "public/ui/ornament-designs";

/** Hero render of one design under one preset ("DAY" | "NIGHT"), relative to the repo root. */
export function shotPath(id, preset) {
  const dir = /** @type {Record<string, string>} */ (SHOT_OUT_DIR_BY_DESIGN)[id];
  if (dir === undefined) throw new Error(`unknown shot design ${id}`);
  return `${dir}/${id}-hero-${preset.toLowerCase()}.png`;
}

/** Prop sheet under one preset ("DAY" | "NIGHT"), relative to the repo root. */
export function propSheetPath(preset) {
  return `${PROP_SHEET_OUT_DIR}/props-sheet-${preset.toLowerCase()}.png`;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://mfw-shots.invalid";
const CONTENT_TYPES = { ".js": "text/javascript", ".glb": "model/gltf-binary" };

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head><body>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
window.__render = async ({ models, viewport, camera: cam, lights, toneMapping, material }) => {
  document.body.replaceChildren();
  window.__shotReady = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(viewport.width, viewport.height);
  renderer.toneMapping = toneMapping.toneMapping === "NEUTRAL" ? THREE.NeutralToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = toneMapping.toneMappingExposure;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(lights.background);
  scene.add(new THREE.HemisphereLight(lights.hemisphere.skyColor, lights.hemisphere.groundColor, lights.hemisphere.intensity));
  scene.add(new THREE.AmbientLight(lights.ambient.color, lights.ambient.intensity));
  const key = new THREE.DirectionalLight(lights.key.color, lights.key.intensity);
  key.position.set(...lights.key.position);
  scene.add(key);
  for (const { url, position } of models) {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.traverse((node) => {
      if (node.isMesh) node.material = new THREE.MeshStandardMaterial({ color: "#FFFFFF", vertexColors: true, ...material });
    });
    gltf.scene.position.set(...position);
    scene.add(gltf.scene);
  }
  const camera = new THREE.PerspectiveCamera(cam.fovDeg, viewport.width / viewport.height, 0.1, 100);
  camera.position.set(...cam.position);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  window.__shotReady = true;
};
window.__harnessReady = true;
</script></body></html>`;

/** Serves `<prefix>**` from `dir` (no path escape), else null. */
function fileUnder(dir, rest) {
  const path = normalize(join(dir, rest));
  if (!path.startsWith(dir + sep) || !existsSync(path)) return null;
  return path;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const context = await browser.newContext({ viewport: SHOT_VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const threeDir = join(ROOT, "node_modules/three");
    const modelDir = join(ROOT, "public/models/christmas");
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) return route.fulfill({ status: 404, body: "" });
      if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
      let file = null;
      if (url.pathname.startsWith("/three/")) file = fileUnder(threeDir, url.pathname.slice("/three/".length));
      else if (url.pathname.startsWith("/models/christmas/")) file = fileUnder(modelDir, url.pathname.slice("/models/christmas/".length));
      if (file === null) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ status: 200, contentType: CONTENT_TYPES[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => window.__harnessReady === true);
    for (const dir of new Set([...Object.values(SHOT_OUT_DIR_BY_DESIGN), PROP_SHEET_OUT_DIR])) mkdirSync(join(ROOT, dir), { recursive: true });
    for (const id of SHOT_DESIGN_IDS) {
      for (const preset of /** @type {const} */ (["DAY", "NIGHT"])) {
        await page.evaluate((config) => window.__render(config), {
          models: [{ url: `/models/christmas/${id}.full.glb`, position: [0, 0, 0] }],
          viewport: SHOT_VIEWPORT,
          camera: SHOT_CAMERA,
          lights: SHOT_LIGHTS[preset],
          toneMapping: SHOT_TONE_MAPPING,
          material: SHOT_MATERIAL,
        });
        await page.waitForFunction(() => window.__shotReady === true);
        await page.screenshot({ type: "png", path: join(ROOT, shotPath(id, preset)) });
        process.stdout.write(`${shotPath(id, preset)}\n`);
      }
    }
    const sheetPage = await context.newPage();
    await sheetPage.setViewportSize(PROP_SHEET.viewport);
    await sheetPage.goto(`${ORIGIN}/`);
    await sheetPage.waitForFunction(() => window.__harnessReady === true);
    for (const preset of /** @type {const} */ (["DAY", "NIGHT"])) {
      await sheetPage.evaluate((config) => window.__render(config), {
        models: PROP_SHEET.items.map((item) => ({ url: `/models/christmas/${item.id}.${item.lod}.glb`, position: item.position })),
        viewport: PROP_SHEET.viewport,
        camera: PROP_SHEET.camera,
        lights: SHOT_LIGHTS[preset],
        toneMapping: SHOT_TONE_MAPPING,
        material: SHOT_MATERIAL,
      });
      await sheetPage.waitForFunction(() => window.__shotReady === true);
      await sheetPage.screenshot({ type: "png", path: join(ROOT, propSheetPath(preset)) });
      process.stdout.write(`${propSheetPath(preset)}\n`);
    }
    await sheetPage.close();
    const thumbPage = await browser.newPage({ viewport: { width: THUMBNAIL_OUT_PX, height: THUMBNAIL_OUT_PX }, deviceScaleFactor: 1 });
    await writeThumbnails(thumbPage, {
      ids: SHOT_DESIGN_IDS,
      sourcePath: (id) => shotPath(id, "DAY"),
      sourceWidthPx: SHOT_VIEWPORT.width,
      crop: THUMBNAIL_CROP,
      outPx: THUMBNAIL_OUT_PX,
      outDir: THUMBNAIL_OUT_DIR,
    });
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
