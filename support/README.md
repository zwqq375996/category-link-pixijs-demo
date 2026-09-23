# Link&Sort support tools

Keep this folder beside `game/`. The evaluator and tests import the actual game rules and level configuration from that sibling folder; no second copy of the gameplay logic is maintained here.

Use Node.js 22 or newer:

```sh
npm test
npm run evaluate
```

`npm run evaluate -- --runs 200 --baseline-file baselines/levels-before-11-14-easing.json` compares levels 11–14 against the included older configuration, including when this folder is distributed as an archive. In a Git clone, `--baseline-rev 84253e0` also works. Reports are written to `reports/`. The player models are explicit assumptions and should be recalibrated with actual playtest data.

`legacy-pages-assets/` holds older generated JavaScript and CSS files so cached GitHub Pages HTML can still load during updates. The deployment workflow copies them into the build input; they are not part of the standalone game source package.
