# Assembly Ascendant

An incremental factory game with automated production, research, and a 2.5D planetary-defense battlefield.

**Release:** v0.1  
**Play:** https://assembly-ascendant.netlify.app

## Features

- Manual mining that grows into automated iron, copper, component, core, and research lines
- Live production and consumption rates with real resource bottlenecks
- Factory equipment visualized as expanding production lines
- Marine, siege tank, and strike-fighter deployment
- Automated alien waves with crawlers, acid spitters, and armored brutes
- 2.5D depth, projectile, recoil, hover, and attack effects
- Base damage can disable real factory equipment
- Permanent victory and game-over states with a new-expedition loop
- Browser-local save data

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
