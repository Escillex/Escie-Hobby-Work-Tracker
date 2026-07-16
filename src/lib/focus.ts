import type { AppData, FocusRef } from "./types";
import { useApp } from "./state";

export interface ResolvedFocus {
  label: string;
  sublabel?: string;
  kind: FocusRef["kind"];
  /** True when a "Done" action can meaningfully complete the item. */
  completable: boolean;
}

/** Resolve a focus pointer to display text, or null if the item is gone. */
export function resolveFocus(data: AppData, ref: FocusRef): ResolvedFocus | null {
  switch (ref.kind) {
    case "note": {
      const n = data.notes.find((x) => x.id === ref.id);
      return n ? { label: n.title || "Untitled note", kind: "note", completable: false } : null;
    }
    case "todo": {
      const t = data.todos.find((x) => x.id === ref.id);
      return t ? { label: t.text, kind: "todo", completable: true } : null;
    }
    case "media": {
      const m = data.media.entries.find((x) => x.id === ref.id);
      return m ? { label: m.title, kind: "media", completable: false } : null;
    }
    case "task": {
      const m = data.media.entries.find((x) => x.id === ref.parentId);
      const item = m?.checklist?.find((c) => c.id === ref.id);
      return item
        ? { label: item.text, sublabel: m!.title, kind: "task", completable: true }
        : null;
    }
  }
}

export const sameRef = (a?: FocusRef, b?: FocusRef) =>
  a != null &&
  b != null &&
  a.kind === b.kind &&
  a.id === b.id &&
  a.parentId === b.parentId;

/** Focus actions shared by every place that can set the current focus. */
export function useFocusActions() {
  const { data, dispatch } = useApp();

  const focus = data.focus ?? {};

  /** Make `ref` the NOW focus; any existing NOW slides down to NEXT. */
  const focusNow = (ref: FocusRef) => {
    if (sameRef(focus.now, ref)) return;
    if (focus.now && !sameRef(focus.now, ref)) {
      dispatch({ type: "focus/set", slot: "next", ref: focus.now });
    }
    dispatch({ type: "focus/set", slot: "now", ref });
  };

  const focusNext = (ref: FocusRef) =>
    dispatch({ type: "focus/set", slot: "next", ref });

  const isFocused = (ref: FocusRef) =>
    sameRef(focus.now, ref) || sameRef(focus.next, ref);

  return { focusNow, focusNext, isFocused };
}
