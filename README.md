# FPL PWA

Installable progressive web app for **weekly Fantasy Premier League decision support**.
The product **shell** and **explorer routes** load **published** history from
[vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League)
via jsDelivr (not a git submodule). Dexie caches seasons locally; use **Refresh**
on an explorer to pull new gameweeks after they are published.

## Run locally

```bash
npm install
npm run dev
```

Vite serves on **port 5303** (`strictPort`). On this host the app is available at
[http://fpl.dev.songara.uk](http://fpl.dev.songara.uk) (Caddy → `localhost:5303`).

```bash
npm run build    # production bundle
npm run preview  # serve the production build
npm run lint
npm test
```

The user unit `~/.config/systemd/user/fpl-pwa.service` runs `npm run dev` from the
primary checkout (`~/projects/FPL-PWA`). Restart it after switching that checkout to a
branch you want to verify:

```bash
systemctl --user restart fpl-pwa.service
```

## Foundation

`@songara/pwa-base` is a sibling `file:../PWA-Base` dependency. Isolated KanDev
worktrees should run the sibling linker before install — see
[consuming-pwa-base.md](../PWA-Base/docs/guides/consuming-pwa-base.md).

Workflow and role prompts: [`.kandev/`](./.kandev/). How to contribute:
[`CONTRIBUTING.md`](./CONTRIBUTING.md).
