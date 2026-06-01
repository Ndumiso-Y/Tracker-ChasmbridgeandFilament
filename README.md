# Chasm Bridge & Filament Tracker

Project command center for the Embark Digitals Phase 1 Digital Foundation & Launch Setup.

## Run locally

```bash
npm install
npm run dev
```

The app uses Vite, React, Tailwind CSS, and `HashRouter` so static hosting does not break page navigation.

## Build

```bash
npm run build
npm run preview
```

## Deploy

Vercel can use the default build command:

```bash
npm run build
```

GitHub Pages can use:

```bash
npm run deploy
```

The Vite config uses `/Tracker-ChasmbridgeandFilament/` for non-Vercel production builds and `/` when Vercel sets its deployment environment variable.
