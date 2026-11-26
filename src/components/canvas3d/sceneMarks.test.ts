// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getSceneMarks, type SceneMarkInput } from "./sceneMarks";

const input = (patch: Partial<SceneMarkInput>): SceneMarkInput => ({
  selectedTarget: null,
  findMyId: null,
  ownId: null,
  ownShown: false,
  ...patch,
});
const NONE = { markedRiverId: null, ownMarked: false };
const OWN = { markedRiverId: null, ownMarked: true };

describe("getSceneMarks (MFW-67)", () => {
  it("a tap on the own krathong marks it", () => {
    expect(getSceneMarks(input({ selectedTarget: "krathong" }))).toEqual(OWN);
    expect(getSceneMarks(input({ selectedTarget: "krathong", findMyId: "x", ownId: "o", ownShown: true }))).toEqual(OWN);
  });

  it("Find My marks the river krathong", () => {
    expect(getSceneMarks(input({ selectedTarget: "riverKrathong", findMyId: "x" }))).toEqual({
      markedRiverId: "x",
      ownMarked: false,
    });
    expect(getSceneMarks(input({ selectedTarget: "riverKrathong", findMyId: "x", ownId: "o", ownShown: true }))).toEqual({
      markedRiverId: "x",
      ownMarked: false,
    });
  });

  it("Find My on the own krathong marks OwnKrathong while it draws it", () => {
    expect(getSceneMarks(input({ selectedTarget: "riverKrathong", findMyId: "o", ownId: "o", ownShown: true }))).toEqual(OWN);
  });

  it("own id equal but not shown by OwnKrathong: RiverFlow carries the mark", () => {
    expect(getSceneMarks(input({ selectedTarget: "riverKrathong", findMyId: "o", ownId: "o", ownShown: false }))).toEqual({
      markedRiverId: "o",
      ownMarked: false,
    });
  });

  it("riverKrathong without a Find My item marks nothing", () => {
    expect(getSceneMarks(input({ selectedTarget: "riverKrathong" }))).toEqual(NONE);
  });

  it.each(["water", "lamp", null] as const)("%s marks no krathong", (selectedTarget) => {
    expect(getSceneMarks(input({ selectedTarget, findMyId: "x", ownId: "x", ownShown: true }))).toEqual(NONE);
  });
});
