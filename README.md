# Link&Sort

A browser puzzle game built with PixiJS. Connect matching tiles, collect each category, and explore 30 levels with hidden tiles, keys, locks, and bonus moves.

The playable levels, artwork, audio, and font are bundled with this project.

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
