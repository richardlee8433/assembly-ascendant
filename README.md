# Assembly Ascendant

An incremental factory game with automated production, research, and a 2.5D planetary-defense battlefield.

**Release:** v0.2
**Play:** https://assembly-ascendant.netlify.app

## Features

- A streamlined iron, steel, copper, circuit, and core production network
- Automated frontline progression across escalating nests and region bosses
- Marine, siege-tank, and strike-fighter deployment with optional auto-reinforcement
- Safe retreats instead of punitive game-over resets
- Up to 24 hours of offline factory and expedition progress
- Voluntary orbital redeployment with permanent Industry, Military, and Expedition technology
- Progressive unlocks that reveal new systems as territory is secured
- Browser-local saves with legacy v0.1 migration

## Run locally

The project uses Node.js 22.13+ and standard Next.js.

```bash
npm ci
npm run dev
```

Then open the local address shown in the terminal.

## Deploy

The repository includes `netlify.toml`. Netlify builds the project with
`npm run build` and publishes the standard Next.js `.next` output through the
Netlify Next.js Runtime.

## Validation

```bash
npm test
```

## Main source

- `app/page.tsx` — game state, economy, combat, and interface
- `app/globals.css` — factory and 2.5D battlefield presentation
- `public/units/` — original transparent unit artwork

## Save data

Progress is stored in the browser under `assembly-ascendant-save`. Clearing site storage or using the in-game reset starts a new expedition.
