# GAM[fest]

![GAMfest hero preview](src/assets/images/gamfest-hero.png)

Source for [gamfest.org](https://gamfest.org/) — the recap site for GAM[fest], a Baltimore
community festival celebrating Games | Art | Music, built around playing classic videogames
live on a giant LED billboard. A freelance build for the event organizer: recap GAM[fest] #1
with some personality, and point people to Discord/Facebook for the next one (TBD).

## Highlights

- Retro arcade "loading screen" theme — pixel type, scanlines, neon-on-black palette
- Hero canvas renders a parallax skyline + billboard scene that switches between day/night
  palettes based on time of day (`?heroTime=day|night` to override)
- The hero canvas doubles as a hidden mini-game (desktop only): click it to drop a sprite
  into a small [Matter.js](https://brm.io/matter-js/) physics world and walk/jump around the
  scene — `Esc` to exit
- A couple of audio easter eggs tucked into the FAQ (dial-up modem sound, 8-bit coin pickup)
- Lightbox gallery, Framer Motion scroll reveals, and a sticky "level select" nav that
  highlights the current section as you scroll
- Mobile-first and accessibility-minded: full keyboard nav, `prefers-reduced-motion`
  fallbacks, alt text throughout

## Stack

- [Astro](https://astro.build) (static output) with [React](https://react.dev) islands for
  interactive pieces
- [Framer Motion](https://motion.dev) for UI motion; Canvas 2D + Matter.js for the hero
  scene/mini-game
- CSS custom properties as design tokens — no hardcoded colors/spacing in components
- TypeScript, ESLint (`eslint-plugin-astro`, `eslint-plugin-jsx-a11y`), Prettier

## Project structure

```text
/
├── public/              # static assets served as-is (favicons, sprite sheets)
├── src/
│   ├── assets/          # images/audio imported by Astro/Vite
│   ├── components/      # shared UI (Button, Card, Badge, Section, ...)
│   │   ├── islands/      # interactive React bits (gallery modal, FAQ audio gags, copy button)
│   │   └── motion/        # Framer Motion helpers + the hero canvas/mini-game
│   ├── data/            # site config (external links, contact info)
│   ├── layouts/         # base page layout & global nav
│   ├── lib/             # shared hooks
│   ├── pages/           # routes (index.astro composes the sections below)
│   ├── sections/        # one component per page section (hero, recap, lineup, gallery, ...)
│   └── styles/          # global styles & design tokens
└── docs/                # planning docs (PRD, source copy) — local only, gitignored
```

## Commands

All commands are run from the project root:

| Command                | Action                                         |
| :--------------------- | :--------------------------------------------- |
| `npm install`          | Install dependencies                           |
| `npm run dev`          | Start the local dev server at `localhost:4321` |
| `npm run build`        | Build the production site to `./dist/`         |
| `npm run preview`      | Preview the production build locally           |
| `npm run typecheck`    | Type-check the project (`astro check`)         |
| `npm run test:e2e`     | Run focused Playwright smoke tests             |
| `npm run lint`         | Lint with ESLint                               |
| `npm run lint:fix`     | Lint and auto-fix with ESLint                  |
| `npm run format`       | Format the project with Prettier               |
| `npm run format:check` | Check formatting without writing changes       |

The Playwright suite starts Astro on `127.0.0.1:4322` and covers production smoke flows:
landmarks/axe, section nav, FAQ expansion, gallery lightbox, hero mute, video controls, and
reduced-motion hero behavior. It is intended for pre-release or explicit browser-check
passes, not every small edit.

## Hero Mini-Game Notes

The hero canvas lives in `src/components/motion/HeroGame.tsx`. The supporting modules under
`src/components/motion/heroGame/` split out the game-specific drawing and helpers:

| Module                  | Responsibility                                      |
| :---------------------- | :-------------------------------------------------- |
| `audio.ts`              | Shared muted-by-default audio engine, SFX, music    |
| `background.ts`         | Skyline, street, billboard placement/background art |
| `billboard.ts`          | Billboard rendering, help overlay geometry/UI       |
| `clouds.ts`             | One-way cloud platform helpers                      |
| `constants.ts`          | Physics, timing, layout, and gameplay constants     |
| `fireworks.ts`          | Star-power/fireworks finale effects                 |
| `interactiveObjects.ts` | Physics-backed hero text, badges, and CTA objects   |
| `palette.ts`            | Day/night palette selection                         |
| `pickupsAndFx.ts`       | Rings, star pickup, feedback text, confetti         |
| `sprites.ts`            | Public sprite-sheet loading and sprite drawing      |

The mini-game is intentionally a mouse/pointer-only easter egg. The `<canvas>` is
`aria-hidden`, mobile shows a static hero backdrop, and `prefers-reduced-motion` users keep
the normal hero content instead of activating gameplay.

## Manual Test Checklist

Before a handoff/release, manually check the pieces that are intentionally playful or
visual:

- Desktop hero: click the canvas, move/jump/sprint, collect rings/star, use `Esc` to exit,
  and confirm the original hero content returns.
- Billboard help: while in-game, click the small top-right `?` chip, confirm help opens,
  press `Esc` once to close help, then press `Esc` again to exit the game.
- Reduced motion: with OS/browser reduced motion enabled, confirm the hero does not enter
  game mode and the static content remains visible.
- Mobile/narrow viewport: confirm the canvas is replaced by the static skyline backdrop and
  nav/menu/CTAs remain usable.
- Audio: confirm hero audio starts muted, mute state persists, FAQ audio controls are
  opt-in, and no sound autoplays unexpectedly.
- Gallery/video: open and close the lightbox with pointer and `Esc`; tab to the video
  controls and confirm play/mute buttons are independently reachable.

## Deployment & Social Preview

The site builds as static output. Set `PUBLIC_SITE_URL` in the deployment environment to
the production origin, without a trailing slash, so canonical and Open Graph URLs point at
the real site. If unset, `astro.config.mjs` falls back to
`https://gamfest-demo.vercel.app`.

Social cards use the stable public asset `public/gamfest-og.png`. After deployment, test a
shared URL in Discord/Facebook/social debuggers to confirm the Open Graph image, title,
description, and canonical URL are fetched from the production domain.

## Known Limitations

- The hero mini-game is intentionally not keyboard/assistive-technology playable; it is a
  decorative easter egg layered behind accessible hero content.
- `npm run format:check` may report local ignored files such as `.claude/settings.local.json`
  or prior local formatting churn in `src/components/motion/HeroGame.tsx`. Avoid sweeping
  unrelated formatting into feature commits.
