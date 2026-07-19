import { useEffect } from "react";
import { useApp } from "./state";
import { notify } from "./notify";
import { doneForOccurrence, dueTarget } from "./schedule";

/** "Due now" only fires when the moment just passed; anything older (e.g.
 *  the app launched hours late) records its key silently and the task
 *  simply shows overdue. */
const GRACE_MS = 2 * 60_000;

/** Fires early + due system notifications for dated one-off todos and
 *  scheduled recurring todos. Runs at app level so reminders work
 *  regardless of the active view. */
export function useTodoScheduler() {
  const { data, dispatch } = useApp();

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const earlyMs = (data.settings.earlyWarningMinutes ?? 10) * 60_000;
      for (const t of data.todos) {
        const target = dueTarget(t, now);
        if (!target || doneForOccurrence(t, target)) continue;
        const key = target.toISOString();
        const due = target.getTime();
        if (t.notifiedDueFor !== key && now.getTime() >= due) {
          if (now.getTime() - due < GRACE_MS) notify("Due now", t.text);
          dispatch({
            type: "todo/update",
            todo: { ...t, notifiedDueFor: key, notifiedEarlyFor: key },
          });
        } else if (t.notifiedEarlyFor !== key && now.getTime() >= due - earlyMs) {
          const mins = Math.max(1, Math.round((due - now.getTime()) / 60_000));
          notify(`In ${mins} min`, t.text);
          dispatch({ type: "todo/update", todo: { ...t, notifiedEarlyFor: key } });
        }
      }
    };
    check();
    const timer = window.setInterval(check, 20_000);
    return () => window.clearInterval(timer);
  }, [data.todos, data.settings.earlyWarningMinutes, dispatch]);
}
