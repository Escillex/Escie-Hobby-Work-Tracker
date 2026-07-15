# Hyperfocus Dash

A local-first ADHD dashboard in Rosé Pine. Tauri 2 + React + TypeScript.

- **Quick launchers** — top bar buttons that run arbitrary terminal commands (`zen-browser`, `steam`, …). Right-click a button to edit or delete it.
- **Impulse parking lot** — rapid-fire capture for thoughts before they escape. Promote one to **NOW** (▶) or **NEXT** (⏭).
- **Now / Next card** — one thing at a time; "Done → pull next" chains through the queue.
- **Media tracker** — Anime/Manga tabs sync two-way with AniList; Movies/TV/custom tabs are manual lists.
- **Hyperfocus timer** — counts *up*, with gentle hydrate/stretch nudges at 60 and 120 minutes.
- **Dopamine menu** — 5/15/30-minute quick wins with a 🎲 surprise-me picker.
- **GitHub graph** — your public contribution calendar in Rosé Pine colors.
- **Stats bar** — open-streak, impulses captured this week, media finished this month.

## Running

```sh
pnpm install
pnpm tauri dev      # development
pnpm tauri build    # release binary
```

## Data

Everything persists to a single `data.json` in the app data directory
(`~/.local/share/com.hyperfocus.dash/data.json`). No database, no cloud.

## AniList sync setup (one-time)

1. Go to <https://anilist.co/settings/developer> → *Create New Client*.
   Name it anything; set the redirect URL to `https://anilist.co/api/v2/oauth/pin`.
2. In the dash, open ⚙ Settings, enter the client ID, hit **Authorize ↗**.
3. AniList opens in your browser and shows an access token — copy it, paste it
   into the token field, hit **Connect**.
4. Use **⟳ Sync** on the Anime/Manga tabs to pull your lists. `+1` and status
   changes push back to AniList automatically.

> ⚠️ The token is stored in plaintext inside the local `data.json`. That's fine
> for a single-user machine, but don't commit or share that file.

## GitHub widget

Uses the public [github-contributions-api](https://github-contributions-api.jogruber.de)
— no token required. The last successful fetch is cached so the widget works offline.
Change the username in ⚙ Settings.
