---
name: verify
description: How to verify hyperfocus-dash changes at runtime without touching the user's real data
---

# Verifying hyperfocus-dash

Tauri 2 GUI on the user's live niri/Wayland desktop. The user is often at the
machine — avoid stealing focus or injecting input while they work.

## Isolated runtime with seeded data

The store honors `XDG_DATA_HOME`. Seed a data file and launch against it:

```sh
mkdir -p $SCRATCH/xdg/com.hyperfocus.dash
# tauri-plugin-store format: {"data": <AppData>} — see src/lib/types.ts
cat > $SCRATCH/xdg/com.hyperfocus.dash/data.json << 'EOF'
{ "data": { ... } }
EOF
XDG_DATA_HOME=$SCRATCH/xdg pnpm tauri dev   # run_in_background
```

- Boot is fast if `src-tauri/target/debug` is warm.
- **Port 1420 may already be in use** by the user's own `pnpm tauri dev`. The
  DevCommand binary still starts and attaches to the existing vite (which
  serves the current working tree), even though the CLI exits 1. `pgrep -af
  hyperfocus` to find your PID; kill only yours when done.
- **HMR hazard:** any already-running dev window hot-reloads onto your edited
  code against the user's REAL `~/.local/share/com.hyperfocus.dash/data.json`
  — migrations in `loadData()` can run on their real file. Check with the
  user's data in mind before editing `migrate()` while their dev session runs.

## Observing

- State changes: the store debounce-saves (~400 ms) the whole tree to the
  seeded `data.json` — poll it with python/jq. Scheduler effects (notified
  keys, resets) show up there within ~20 s (poll interval).
- Screenshots: `niri msg windows` to find the window by PID, `niri msg action
  focus-window --id N`, then `grim $SCRATCH/shot.png` (captures all outputs).
- Input injection: `ydotoold` runs; `ydotool mousemove --absolute -x X -y Y
  && ydotool click 0xC0`. Multi-monitor coordinate mapping is unreliable —
  clicks can land on the wrong window. Prefer seeded-state + file observation.
