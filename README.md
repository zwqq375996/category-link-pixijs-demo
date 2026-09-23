# Link&Sort

This repository separates the playable PixiJS game from development support:

| Directory | Contents |
| --- | --- |
| [`game/`](game/) | Standalone web game, 30 level configurations, artwork, audio, and build configuration |
| [`support/`](support/) | Level evaluation, tests, reports, and archived assets needed for older cached Pages builds |
| `.github/workflows/` | GitHub Pages automation; GitHub requires workflows at the repository root |

To run or share only the game, use `game/`:

```sh
cd game
npm ci
npm run dev
```

For evaluation and tests, keep `support/` next to `game/`:

```sh
cd support
npm test
npm run evaluate -- --runs 200 --baseline-file baselines/levels-before-11-14-easing.json
```

The evaluation output is written to `support/reports/`. The included baseline snapshot lets the comparison run from source archives; `--baseline-rev 84253e0` also works in a Git clone. Simulated results are assumptions about player behavior, not observed player win rates.

Pushes to `main` test and build `game/`, then deploy it to [Link&Sort](https://zwqq375996.github.io/link-and-sort/). The game URL does not change with this directory layout.
