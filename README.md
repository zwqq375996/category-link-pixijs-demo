# Category Link PixiJS Demo

An **unofficial educational demo** of Category Link. This project is not affiliated with or endorsed by the original game's developer. Original game artwork and level data remain the property of their respective owners.

The browser game includes the 30 local levels found in the supplied XAPK, with their level layouts and sprite images. The gameplay is an independent PixiJS implementation. It has not been verified against the original game's live runtime because the original build is blocked by its Google Play license check. The rewarded-ad extra-moves tile grants its configured moves directly in this demo.

The original level files retain their time-limit metadata for reference, but this demo does not run a timer or end a level because of elapsed time.

## Run locally

```sh
npm ci
npm run dev
```

## Publish

The GitHub Actions workflow tests, builds, and deploys the site to GitHub Pages on pushes to `main`. The project URL is <https://zwqq375996.github.io/category-link-pixijs-demo/>.

This repository contains only the browser demo and the assets it needs to run. It does not contain the original XAPK, extracted native libraries, or complete raw asset records.
