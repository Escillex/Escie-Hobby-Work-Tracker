import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "./state";
import { uid } from "./types";
import { notesDir } from "./obsidian";
import { getLastWrites, planReconcile, type VaultFileInfo } from "./vaultSync";

/** Keep notes and their vault files in sync while the app runs: a full
 *  reconcile at startup and on every folder change event. Reads the whole
 *  folder each pass — notes folders are small, and it keeps the logic
 *  simple and self-healing. Dormant without a configured vault path. */
export function useVaultSync(): void {
  const { data, dispatch, hydrated } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const pending = useRef(false);
  const { vaultPath, vaultNotesFolder } = data.settings;

  useEffect(() => {
    if (!hydrated || !vaultPath) return;
    const dir = notesDir(dataRef.current.settings);
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const reconcile = async () => {
      if (running.current) {
        pending.current = true;
        return;
      }
      running.current = true;
      try {
        const files = await invoke<VaultFileInfo[]>("list_notes", { dir });
        const contents = new Map<string, string>();
        for (const f of files) {
          try {
            contents.set(f.path, await invoke<string>("read_note", { path: f.path }));
          } catch {
            // Unreadable this pass (e.g. deleted mid-scan); next event retries.
          }
        }
        if (disposed) return;
        const d = dataRef.current;
        const actions = planReconcile({
          notes: d.notes,
          dir,
          files,
          contents,
          archived: d.vaultArchived ?? [],
          lastWrites: getLastWrites(),
        });
        for (const a of actions) {
          switch (a.kind) {
            case "update":
              dispatch({
                type: "note/patch",
                id: a.noteId,
                patch: { body: a.body, updatedAt: a.updatedAt },
              });
              break;
            case "relink":
              dispatch({
                type: "note/patch",
                id: a.noteId,
                patch: { vaultFile: a.path, vaultTitle: a.title, title: a.title },
              });
              break;
            case "unlink":
              dispatch({
                type: "note/patch",
                id: a.noteId,
                patch: { vaultFile: undefined, vaultTitle: undefined },
              });
              break;
            case "import":
              dispatch({
                type: "note/add",
                note: {
                  id: uid(),
                  title: a.title,
                  body: a.body,
                  createdAt: a.iso,
                  updatedAt: a.iso,
                  vaultFile: a.path,
                  vaultTitle: a.title,
                },
              });
              break;
            case "set-archived":
              dispatch({ type: "vault/set-archived", paths: a.paths });
              break;
          }
        }
      } catch (e) {
        console.error("Vault sync failed:", e);
      } finally {
        running.current = false;
        if (pending.current) {
          pending.current = false;
          void reconcile();
        }
      }
    };

    invoke("watch_notes", { dir }).catch((e) =>
      console.error("Vault watcher failed:", e),
    );
    void reconcile();
    listen("notes:changed", () => void reconcile()).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [hydrated, vaultPath, vaultNotesFolder, dispatch]);
}
