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
  it("falls back to Untitled for a title of only dots", () => {
    expect(safeFilename("..")).toBe("Untitled");
  });
  it("collapses runs of dots and strips leading/trailing dots", () => {
    expect(safeFilename("notes..md")).toBe("notes.md");
  });
});

describe("resolveNoteWrite", () => {
  it("creates when the note was never exported", () => {
    expect(resolveNoteWrite("My Note", undefined, undefined)).toEqual({
      action: "create",
      filename: "My Note.md",
    });
  });
  it("overwrites the stored path when the title still matches vaultTitle", () => {
    expect(
      resolveNoteWrite("My Note", "/v/Hyperfocus/My Note.md", "My Note"),
    ).toEqual({
      action: "overwrite",
      path: "/v/Hyperfocus/My Note.md",
    });
  });
  it("creates a fresh file when the note was renamed", () => {
    expect(
      resolveNoteWrite("New Title", "/v/Hyperfocus/Old Title.md", "Old Title"),
    ).toEqual({
      action: "create",
      filename: "New Title.md",
    });
  });
  it("creates when vaultFile is set but vaultTitle is undefined", () => {
    expect(
      resolveNoteWrite("My Note", "/v/Hyperfocus/My Note.md", undefined),
    ).toEqual({
      action: "create",
      filename: "My Note.md",
    });
  });
  it("does not misfire on a dedup-suffixed filename that coincidentally matches a rename", () => {
    // "Version 2" was exported (create_note may have suffixed the file);
    // renaming to "Version" must create a new file, not overwrite the old one.
    expect(
      resolveNoteWrite(
        "Version",
        "/v/Hyperfocus/Version 2.md",
        "Version 2",
      ),
    ).toEqual({
      action: "create",
      filename: "Version.md",
    });
  });
});
