# Virtual Fit (Chrome extension MVP)

See how a top fits your measurements on Target AU and Kmart AU product pages. Everything runs in your browser; nothing is sent anywhere except fetching the store's own size guide. Spec: [SPEC.md](SPEC.md).

## Install (unpacked)

Requires Node 20+ and Google Chrome 114+.

```bash
git pull
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `dist` folder in this repo.
3. Pin **Virtual Fit** from the puzzle-piece menu.

After pulling new code, run `npm run build` again and click the reload arrow on the extension card.

## Try it

1. Click the Virtual Fit icon to open the side panel. On the **Profile** tab pick Men or Women, enter your measurements (cm, or switch to in) and press **Save**.
2. Open a top on [target.com.au](https://www.target.com.au/c/men/tops/W133028) or kmart.com.au. Give the page a few seconds: sizes load after the page does.
3. Switch to **Try on**. You get the product, a size dropdown (pre-filled from the page), a front-view render and a line per body region (chest, waist, shoulders, length, sleeves). Change the size and it updates instantly.
4. The bottom of the tab shows which size chart was used and how it was read: `live` (from the store's own size guide), `snapshot` (saved copy, with a warning) or `manual`.
5. If a chart cannot be read, or looks wrong, paste your own as CSV (a header row like `Size,Chest,Waist,Length`, then one row per size).

Notes: values marked "estimated" are not in the store's chart (shoulder, length and sleeve are inferred). Kmart's popup does not say whether it lists body or garment sizes; the extension treats it as body sizes.

## Develop

- `npm run build` typecheck and build to `dist/`
- `npm test` run Vitest (fit engine, parsers, adapters on saved store pages in `tests/fixtures/`)
- `npx tsx scripts/gen-target-snapshots.ts` regenerate the bundled Target size snapshots
- All fit numbers (ease bands, style ease, proportions) live in `src/fit/fit-config.ts`.
