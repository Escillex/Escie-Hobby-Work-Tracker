import { describe, it, expect } from "vitest";
import { safeFilename, resolveNoteWrite } from "./vaultNotes";

describe("safeFilename", () => {
  it("strips characters Obsidian/filesystems reject", () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("abcdefghijklmn");
  });
  it("caps length at 60 characters", () => {
    expect(safeFilename("x".repeat(80))).toHaveLength(60);
  });
  it("falls back to Untitled for empty or all-stripped titles", () => {
    expect(safeFilename("")).toBe("Untitled");
    expect(safeFilename("###")).toBe("Untitled");
  });
});

describe("resolveNoteWrite", () => {
  it("creates when the note was never exported", () => {
    expect(resolveNoteWrite("My Note", undefined)).toEqual({
      action: "create",
      filename: "My Note.md",
    });
  });
  it("overwrites the stored path when the title still matches", () => {
    expect(resolveNoteWrite("My Note", "/v/Hyperfocus/My Note.md")).toEqual({
      action: "overwrite",
      path: "/v/Hyperfocus/My Note.md",
    });
  });
  it("overwrites a dedup-suffixed file from create_note", () => {
    expect(resolveNoteWrite("My Note", "/v/Hyperfocus/My Note 2.md")).toEqual({
      action: "overwrite",
      path: "/v/Hyperfocus/My Note 2.md",
    });
  });
  it("creates a fresh file when the note was renamed", () => {
    expect(resolveNoteWrite("New Title", "/v/Hyperfocus/Old Title.md")).toEqual({
      action: "create",
      filename: "New Title.md",
    });
  });
});
