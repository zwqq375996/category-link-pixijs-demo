# Link&Sort

A browser puzzle game built with PixiJS. Connect matching tiles, collect each category, and explore 30 levels with hidden tiles, keys, locks, and bonus moves.

The playable levels, artwork, audio, and font are bundled with this project.

## Star ratings

Every win earns at least one star. Each level has its own remaining-move targets for two and three stars, visible in Settings. The targets are provisional: they use the median remaining moves of successful newcomer and practiced runs in the seeded difficulty evaluation. Bonus moves and long-chain refunds count toward the remaining-move total; hints and shuffles do not reduce stars. The level picker saves the highest stars earned on this device. Earlier completions have no recorded stars until replayed.

## Run locally

```sh
npm ci
npm run dev
```

## Evaluate level difficulty

Run seeded, repeatable simulations with three explicitly assumed play styles:

```sh
npm run evaluate -- --runs 200 --baseline-rev 84253e0
```

This writes a Markdown report and summary JSON to `reports/difficulty-evaluation.*`. The baseline revision is the level configuration before levels 11–14 were eased. Simulated win rates are comparisons between rule sets, not predictions of real-player completion rates; the assumed behavior needs calibration with playtest data.

## Publish

Pushes to `main` run the tests, build the site, and deploy it to [Link&Sort](https://zwqq375996.github.io/link-and-sort/).
