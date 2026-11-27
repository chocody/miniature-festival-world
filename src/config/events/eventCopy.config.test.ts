import { describe, expect, it } from "vitest";
import type { FestivalEventId } from "@/config/events";
import { CUSTOMIZER_COPY } from "@/config/customizer.config";
import { SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { MY_CREATIONS_COPY } from "@/config/myCreations.config";
import { OWNER_SWITCH_COPY, OWNER_WISH_COPY } from "@/config/ownerWish.config";
import { RITUAL_COPY } from "@/config/ritual.config";
import { FLOW_STEP_COPY } from "@/config/ui.config";
import { WISH_COPY } from "@/config/wish.config";
import { ZONE_NAV_COPY } from "@/config/zoneNav.config";
import { CHRISTMAS_COPY } from "./christmas.copy";
import { EVENT_COPY, getEventCopy } from "./eventCopy.config";
import { LOY_KRATHONG_COPY } from "./loyKrathong.copy";

const FORBIDDEN_WORDS: Partial<Record<FestivalEventId, readonly string[]>> = {
  christmas: ["กระทง", "สายน้ำ", "คุ้งน้ำ", "ลอย"],
};

function copyStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(copyStrings);
}

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value)
    .flatMap(([k, v]) => keyPaths(v, prefix === "" ? k : `${prefix}.${k}`))
    .sort();
}

function frozenViolations(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  const own = Object.isFrozen(value) ? [] : [path];
  return own.concat(Object.entries(value).flatMap(([k, v]) => frozenViolations(v, `${path}.${k}`)));
}

const entries = Object.entries(EVENT_COPY) as [FestivalEventId, NonNullable<(typeof EVENT_COPY)[FestivalEventId]>][];

describe("per-event copy table (MFW-91)", () => {
  it("EC1 the Loy entry is built from the existing constants", () => {
    const l = LOY_KRATHONG_COPY;
    expect(l.ritual).toBe(RITUAL_COPY);
    expect(l.flowSteps).toBe(FLOW_STEP_COPY);
    expect(l.wish).toBe(WISH_COPY);
    expect(l.myCreations).toBe(MY_CREATIONS_COPY);
    expect(l.ownerWish).toBe(OWNER_WISH_COPY);
    expect(l.ownerSwitch).toBe(OWNER_SWITCH_COPY);
    expect(l.sceneTapHint).toBe(SCENE_TAP_HINT_COPY.scene3d);
    for (const k of Object.keys(l.customizer) as (keyof typeof l.customizer)[]) expect(l.customizer[k]).toBe(CUSTOMIZER_COPY[k]);
    for (const k of Object.keys(l.inspect) as (keyof typeof l.inspect)[]) expect(l.inspect[k]).toBe(INSPECT_POPUP_COPY[k]);
    expect(l.zoneNav).toEqual({ ...ZONE_NAV_COPY, vertical: null });
    expect(l.findMyIcon).toBe("krathong");
  });

  it("EC2 no forbidden word in an event's strings", () => {
    for (const [event, words] of Object.entries(FORBIDDEN_WORDS) as [FestivalEventId, readonly string[]][]) {
      for (const s of copyStrings(EVENT_COPY[event]!)) {
        for (const w of words) expect(s.includes(w), `${event}: "${s}" contains ${w}`).toBe(false);
      }
    }
  });

  it("EC3 every string is non-empty", () => {
    for (const [event, copy] of entries) {
      for (const s of copyStrings(copy)) expect(s.trim().length, `${event}: "${s}"`).toBeGreaterThan(0);
    }
  });

  it("EC4 every entry has the Loy shape", () => {
    const strip = (paths: string[]) => paths.filter((p) => !p.startsWith("zoneNav.vertical"));
    const loy = strip(keyPaths(LOY_KRATHONG_COPY));
    for (const [, copy] of entries) {
      expect(strip(keyPaths(copy))).toEqual(loy);
      expect(Object.keys(copy.customizer)).toHaveLength(9);
      expect(Object.keys(copy.inspect)).toHaveLength(4);
    }
  });

  it("EC5 the table and the fallback", () => {
    expect(Object.keys(EVENT_COPY)).toEqual(["loy_krathong", "christmas"]);
    expect(getEventCopy("christmas")).toBe(CHRISTMAS_COPY);
    expect(getEventCopy("loy_krathong")).toBe(LOY_KRATHONG_COPY);
    expect(getEventCopy("new_year")).toBe(LOY_KRATHONG_COPY);
    expect(getEventCopy(null)).toBe(LOY_KRATHONG_COPY);
  });

  it("EC6 entries are deeply frozen", () => {
    expect(frozenViolations(LOY_KRATHONG_COPY)).toEqual([]);
    expect(frozenViolations(CHRISTMAS_COPY)).toEqual([]);
  });

  it("EC7 the flow buttons keep their name", () => {
    for (const [, copy] of entries) {
      expect(copy.customizer.done).toBe("ถัดไป");
      expect(copy.wish.submit).toBe("ถัดไป");
    }
  });

  it("EC8 christmas pins", () => {
    expect(CHRISTMAS_COPY.zoneNav.vertical).toEqual({ up: "ขึ้นไปชั้นบน", down: "ลงไปชั้นล่าง" });
    expect(CHRISTMAS_COPY.findMyIcon).toBe("ornament");
    expect(CHRISTMAS_COPY.customizer.panelLabel).toBe("แต่งของประดับ");
    expect(CHRISTMAS_COPY.myCreations.title).toBe("ของประดับของฉัน");
  });
});
