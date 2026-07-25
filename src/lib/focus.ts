import type { AppData, FocusRef } from "./types";
import { sameRef } from "./types";
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

export { sameRef };

/** Focus actions shared by every place that can set the current focus. */
export function useFocusActions() {
  const { data, dispatch } = useApp();

  const focus = data.focus;

  /** Make `ref` the NOW focus. Any previous NOW is simply dropped — the queue
   *  is curated deliberately, so nothing is demoted into it automatically. */
  const focusNow = (ref: FocusRef) => {
    if (sameRef(focus.now, ref)) return;
    dispatch({ type: "focus/now", ref });
    dispatch({ type: "focus/unqueue", ref });
  };

  const queue = (ref: FocusRef) => dispatch({ type: "focus/queue", ref });

  const isNow = (ref: FocusRef) => sameRef(focus.now, ref);
  const isQueued = (ref: FocusRef) => focus.next.some((r) => sameRef(r, ref));
  const isFocused = (ref: FocusRef) => isNow(ref) || isQueued(ref);

  return { focusNow, queue, isNow, isQueued, isFocused };
}
