import { useEffect } from "react";
import { useApp } from "./state";
import { notify } from "./notify";

/** Fires early + due system notifications for dated one-off todos.
 *  Runs at app level so reminders work regardless of the active view. */
export function useTodoScheduler() {
  const { data, dispatch } = useApp();

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const t of data.todos) {
        if (t.done || t.recurrence !== "none" || !t.dueAt) continue;
        const due = new Date(t.dueAt).getTime();
        if (!t.notifiedDue && now >= due) {
          notify("Due now", t.text);
          dispatch({ type: "todo/update", todo: { ...t, notifiedDue: true, notifiedEarly: true } });
        } else if (!t.notifiedEarly && now >= due - t.earlyMinutes * 60_000) {
          const mins = Math.max(1, Math.round((due - now) / 60_000));
          notify(`In ${mins} min`, t.text);
          dispatch({ type: "todo/update", todo: { ...t, notifiedEarly: true } });
        }
      }
    };
    check();
    const timer = window.setInterval(check, 20_000);
    return () => window.clearInterval(timer);
  }, [data.todos, dispatch]);
}
