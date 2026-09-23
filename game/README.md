# Link&Sort game

This folder is the standalone PixiJS web game. It includes the 30 playable levels and all artwork, audio, and fonts they use. Evaluation scripts and reports are kept in the sibling `support/` folder of the full repository.

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

For a production build, run `npm run build`. The result is written to `dist/`.

Every completed level earns at least one star. Remaining-move targets for two and three stars are visible in Settings, and the highest rating earned on this device appears in the level picker. Earlier completions have no recorded stars until replayed.
