# Virtual Fit (Chrome extension MVP)

See how a top fits your measurements on Target AU and Kmart AU product pages. Spec: [SPEC.md](SPEC.md).

## Run locally

Requires Node 20+ and Google Chrome 114+.

```bash
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder in this repo.
4. Click the puzzle-piece icon and pin **Virtual Fit**, then click its icon to open the side panel.

After changing code, run `npm run build` again and click the reload icon on the extension card. `npm run dev` rebuilds on save.

## Scripts

- `npm run build` typecheck and build to `dist/`
- `npm test` run Vitest
