import { describe, expect, it } from "vitest";
import type { Note } from "./types";
import { planReconcile, type VaultFileInfo } from "./vaultSync";

const DIR = "/vault/Hyperfocus";
const T0 = 1_770_000_000_000; // fixed epoch ms for deterministic ISO strings

function note(p: Partial<Note> & { id: string }): Note {
  return {
    title: "",
    body: "",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...p,
  };
}

function file(path: string, mtimeMs = T0): VaultFileInfo {
  return { path, mtimeMs };
}

function plan(over: Partial<Parameters<typeof planReconcile>[0]>) {
  return planReconcile({
    notes: [],
    dir: DIR,
    files: [],
    contents: new Map(),
    archived: [],
    lastWrites: new Map(),
    ...over,
  });
}

describe("planReconcile", () => {
  it("updates a linked note whose file content changed", () => {
    const n = note({ id: "a", title: "Idea", body: "old", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/Idea.md`)],
      contents: new Map([[`${DIR}/Idea.md`, "new"]]),
    });
    expect(actions).toEqual([
      { kind: "update", noteId: "a", body: "new", updatedAt: new Date(T0).toISOString() },
    ]);
  });

  it("does nothing when file content equals the note body", () => {
    const n = note({ id: "a", title: "Idea", body: "same", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/Idea.md`)],
      contents: new Map([[`${DIR}/Idea.md`, "same"]]),
    });
    expect(actions).toEqual([]);
  });

  it("suppresses the echo of the app's own write", () => {
    const n = note({ id: "a", title: "Idea", body: "typed more", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/Idea.md`)],
      contents: new Map([[`${DIR}/Idea.md`, "typed"]]),
      lastWrites: new Map([[`${DIR}/Idea.md`, "typed"]]),
    });
    expect(actions).toEqual([]);
  });

  it("imports an unowned file with filename as title", () => {
    const actions = plan({
      files: [file(`${DIR}/Fresh thought.md`)],
      contents: new Map([[`${DIR}/Fresh thought.md`, "hello"]]),
    });
    expect(actions).toEqual([
      {
        kind: "import",
        path: `${DIR}/Fresh thought.md`,
        title: "Fresh thought",
        body: "hello",
        iso: new Date(T0).toISOString(),
      },
    ]);
  });

  it("never imports an archived path", () => {
    const actions = plan({
      files: [file(`${DIR}/Old name.md`)],
      contents: new Map([[`${DIR}/Old name.md`, "stale copy"]]),
      archived: [`${DIR}/Old name.md`],
    });
    expect(actions).toEqual([]);
  });

  it("skips an unowned file that matches the app's own fresh write", () => {
    // A capture's file exists before its note/patch lands; must not import a duplicate.
    const actions = plan({
      files: [file(`${DIR}/Captured.md`)],
      contents: new Map([[`${DIR}/Captured.md`, ""]]),
      lastWrites: new Map([[`${DIR}/Captured.md`, ""]]),
    });
    expect(actions).toEqual([]);
  });

  it("unlinks a note whose file is gone", () => {
    const n = note({ id: "a", title: "Gone", body: "kept", vaultFile: `${DIR}/Gone.md`, vaultTitle: "Gone" });
    const actions = plan({ notes: [n] });
    expect(actions).toEqual([{ kind: "unlink", noteId: "a" }]);
  });

  it("unlinks a note linked outside the current folder", () => {
    const n = note({ id: "a", title: "Moved", body: "kept", vaultFile: "/vault/OldFolder/Moved.md", vaultTitle: "Moved" });
    const actions = plan({ notes: [n] });
    expect(actions).toEqual([{ kind: "unlink", noteId: "a" }]);
  });

  it("relinks a lost note to an unowned file with identical content", () => {
    const n = note({ id: "a", title: "Before", body: "same words", vaultFile: `${DIR}/Before.md`, vaultTitle: "Before" });
    const actions = plan({
      notes: [n],
      files: [file(`${DIR}/After.md`)],
      contents: new Map([[`${DIR}/After.md`, "same words"]]),
    });
    expect(actions).toEqual([
      { kind: "relink", noteId: "a", path: `${DIR}/After.md`, title: "After" },
    ]);
  });

  it("relinks at most one note per file; the other lost note unlinks", () => {
    const a = note({ id: "a", title: "A", body: "dup", vaultFile: `${DIR}/A.md`, vaultTitle: "A" });
    const b = note({ id: "b", title: "B", body: "dup", vaultFile: `${DIR}/B.md`, vaultTitle: "B" });
    const actions = plan({
      notes: [a, b],
      files: [file(`${DIR}/C.md`)],
      contents: new Map([[`${DIR}/C.md`, "dup"]]),
    });
    expect(actions).toEqual([
      { kind: "relink", noteId: "a", path: `${DIR}/C.md`, title: "C" },
      { kind: "unlink", noteId: "b" },
    ]);
  });

  it("prunes archived paths whose files are gone", () => {
    const actions = plan({
      files: [file(`${DIR}/Still here.md`)],
      contents: new Map([[`${DIR}/Still here.md`, "x"]]),
      archived: [`${DIR}/Still here.md`, `${DIR}/Deleted.md`],
    });
    expect(actions).toEqual([
      { kind: "set-archived", paths: [`${DIR}/Still here.md`] },
    ]);
  });

  it("skips updates for files whose content could not be read", () => {
    const n = note({ id: "a", title: "Idea", body: "old", vaultFile: `${DIR}/Idea.md`, vaultTitle: "Idea" });
    const actions = plan({ notes: [n], files: [file(`${DIR}/Idea.md`)] });
    expect(actions).toEqual([]);
  });
});
