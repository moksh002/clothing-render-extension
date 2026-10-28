# Virtual Fit Extension: MVP Spec

Oct 28, 2026 · @Moksh

## Overview and goal

This MVP is a local Chrome extension that answers one question on a clothing product page: given my measurements and the size I picked, how will this top fit me? The user enters body measurements once, opens a product page from Target AU or Kmart AU, picks a size, and sees a 2D render of their body wearing the garment, drawn from the store's own size chart.

The point of the PoC is to prove the pipeline end to end (measurements in, size chart scraped, fit computed, render out) with the cheapest possible rendering. Realism comes later. Fit accuracy and a working loop come first.

**Hand-off note for Claude Code:** treat this doc as the product, design and engineering requirements. Where a decision is marked as made, do not reopen it. Where it is marked open, pick the stated default and flag it in the PR description.

## Scope and decisions made

The MVP covers tops only, on one or two named stores, in a locally loaded Chrome extension with no backend.

**Decisions made (do not reopen)**

- Platform: Chrome (Manifest V3), loaded unpacked. No Web Store publishing.
- Garments: tops only (t-shirts, shirts, hoodies, jumpers).
- Stores: Target AU first, then Kmart AU, each with its own adapter and chart resolver (see Store size guides and chart resolution). Target is the reference store because its size charts are public and readable. Myer AU is deferred until after the MVP.
- Body inputs: Men/Women toggle plus core measurements (height, weight, chest or bust, waist, hips, shoulder width, inseam).
- Render: 2D parametric front view first. A 3D upgrade is a later phase, not part of this build.
- No accounts, no server, no analytics. All data stays in the browser (chrome.storage.local).

**Out of scope for the MVP**

- Bottoms, dresses, outerwear, shoes, accessories, and Myer AU support (deferred until after the MVP)
- Fabric stretch, drape, texture or colour matching to the real product photo
- Side or back views, rotation, animation
- Automatic size recommendation (the user chooses the size, the tool shows the fit)
- Generic scraping of arbitrary stores, LLM parsing, AI-generated images
- Photo-based body scanning
- Business model, pricing, privacy policy, store partnerships

## Render approach: start 2D, upgrade to 3D

Build a 2D parametric front-view render first, then add 3D in a second phase. 2D is the only option that shows real fit (tight, true, loose) from the size chart with no backend, no cost per render and no 3D assets. AI image generation looks best but ignores the size chart, which defeats the product's purpose.

| Option | Realism | Uses size chart for fit | Build effort | Running cost | Main downside |
| --- | --- | --- | --- | --- | --- |
| 2D parametric overlay (SVG or Canvas) | Low (stylised mannequin) | Yes, directly | Low, days | None | Looks like a diagram, front view only |
| 3D in browser (Three.js with a parametric body mesh) | Medium | Yes, if the garment mesh is built from chart dimensions | High, needs body mesh, garment mesh and rigging | None | Needs 3D assets and mesh deformation work |
| AI image generation (try-on model API) | High | No, the model guesses fit | Medium | Per render, plus API key | Wrong fit is the key failure, needs backend or key handling |
| Blender pipeline | High | Possible via scripts | High | None, but offline | Not live in a browser, unsuitable for an on-page tool |

**Phasing**

1. Phase 1 (this build): 2D parametric. Body silhouette driven by measurements, garment outline driven by size chart dimensions, ease shown as a gap or overlap between garment and body.
2. Phase 2 (later): swap the render layer for Three.js with a parametric body mesh (a MakeHuman or SMPL-style model exported as glTF with measurement-driven morph targets). Keep the fit engine unchanged and only replace the renderer.
3. Phase 3 (optional): AI try-on as a cosmetic preview on top of the fit result, clearly labelled as illustrative.

**Design rule that keeps phase 2 cheap:** the fit engine must output a renderer-agnostic result (body dimensions, garment dimensions and the ease per body region) and the renderer only draws that result. Do not leak SVG concepts into the fit engine.

## User flow and UI

The extension has one side panel with two tabs, Profile and Try on. A user fills Profile once, then uses Try on on any supported product page.

1. User opens the extension side panel and chooses Men or Women.
2. User enters measurements on the Profile tab and saves. Values persist in chrome.storage.local.
3. User navigates to a product page on a supported store. The extension detects the page and shows the product name and the sizes found in the size guide.
4. User picks a size from a dropdown (pre-filled from the page where possible).
5. The Try on tab shows the render plus a short fit summary per body region (for example: Chest: 4 cm loose, Length: ends at the hip, Shoulders: true to size).
6. User changes the size and the render and summary update immediately.

**UI requirements**

- Use the Chrome side panel API so the panel stays open while browsing, with a popup as the fallback.
- Profile tab: Men/Women toggle, numeric fields in centimetres with a cm/in unit switch, validation ranges per field (for example height 140 to 210 cm), a Save button and a Reset button.
- Try on tab: a read-only product title, a size selector, the 2D render, a fit summary list and a clear message if the page is unsupported or the size guide could not be read.
- Manual fallback: if scraping fails, show a textarea where the user can paste a size chart as CSV, so the render still works.
- Plain, functional styling. No design system, no branding work.

## Functional requirements

Each requirement has an ID so Claude Code can reference it in tasks and tests.

**Body profile**

- FR-1: Store a profile with gender (men or women), height, weight, chest or bust, waist, hips, shoulder width and inseam.
- FR-2: All measurements are in cm internally. The UI can display inches and convert on input.
- FR-3: Validate ranges and block saving invalid values with an inline error.
- FR-4: Derive any missing body dimension the renderer needs (for example torso length, arm length) from height and gender using fixed proportion ratios kept in one config file.

**Garment ingestion**

- FR-5: A content script runs on the supported stores' product pages and extracts the product title, the product image URL (for reference only) and the size guide table.
- FR-6: Parse the size guide into a normalised structure: for each size label, the garment or body dimensions available (chest, waist, length, shoulder, sleeve), in cm.
- FR-7: Detect whether the chart lists garment measurements or body measurements and record that in the data model. If body measurements, treat the garment as the body size plus a fixed ease allowance per style (see Fit logic).
- FR-8: If scraping fails, show the manual CSV paste fallback.

**Fit engine**

- FR-9: Given a body profile and a selected size, compute the ease per region (garment dimension minus body dimension) and classify it as tight, fitted, true to size, loose or oversized using thresholds in a config file.
- FR-10: Compute where the garment hem and sleeve end on the body (for example hip, mid-thigh, wrist) from the garment length and body torso length.
- FR-11: Output a renderer-agnostic FitResult object (body dimensions, garment dimensions, ease per region, hem and sleeve positions).

**Render**

- FR-12: Draw a front-view silhouette for the selected gender, scaled from the body dimensions, as inline SVG.
- FR-13: Draw the garment outline over the body, scaled from the garment dimensions so that looser sizes visibly extend beyond the body and tighter sizes sit flush or compress.
- FR-14: Colour the garment neutrally, or by ease (for example a red tint where the garment is tight). No product colours or textures in the MVP.
- FR-15: Re-render instantly when the size or profile changes.

**Persistence**

- FR-16: Persist the profile and the last used size per product in chrome.storage.local. No network calls except fetching the store page the user is already on.

## Store size guides and chart resolution

Target AU publishes full public size charts that the extension can read, and Kmart AU shows its chart in a popup opened by a "Size guide" button. Myer AU publishes size guidance per brand and is deferred until after the MVP, but its research notes are kept below. Research was done on 2026-10-28 by opening each store's live pages, including the three sample product pages listed under Verified sample pages. Claude Code must verify the Kmart popup in a real browser before building that adapter.

**What each store exposes**

| Store | Product URL pattern | Where sizing lives | Chart basis | Status |
| --- | --- | --- | --- | --- |
| Target AU (target.com.au) | `/p/<slug>/<item code>`, for example `/p/plus-size-australian-cotton-business-shirt/73190387` | Product page shows the size list and a "Size Guide" link. Charts live at `/modal/size-charts` and `/size-chart/viewallsize`. Product text gives fit (for example "Regular fit") and the model size. | Body measurements in cm (bust or chest, waist, hips) | Charts retrieved |
| Myer AU (myer.com.au) | `/p/<slug>`, for example `/p/city-chic-plus-size-davina-cotton-tee-in-ivory` | Multi-brand store. Myer's own pages say each product has its own size guide because fit varies by brand. Product page shows size options and a "Size and Fit" text with model size, fit notes (for example "Bust: Relaxed") and sometimes a garment length. The generic `/content/find-your-true-fit` page is images only. | Brand-specific, mixed body and garment | Deferred, not in the MVP |
| Kmart AU (kmart.com.au) | `/product/<slug>-<sku>/`, for example `/product/target-curve-plus-size-australian-cotton-long-sleeve-stripe-top-s444233/` | Product page shows a size selector and a line such as "Model wears a size 16+". A "Size guide" button opens the chart in a popup, so the chart is not in the static page text. Kmart does publish category fit guides, for example `/womens-denim-fit-guide/`. | Unknown | Popup chart, contents not yet seen |

Two cross-store facts matter for the resolver. First, kmart.com.au also lists Target-branded products (the Target Curve example above is marked "Sold and shipped by Target"), so a Kmart URL does not guarantee a Kmart chart. Second, Target's own site is separate (target.com.au), so a Target-branded item can appear under either domain.

**How the code picks the right chart from a product link**

The resolver runs these steps in order and stops at the first that produces a chart. It must record which step won.

1. **Store from hostname.** `target.com.au` maps to the Target adapter, `myer.com.au` to a "Myer support is planned" message, `kmart.com.au` to Kmart. Any other host shows the unsupported-page message.
2. **Product page check from the path.** Target: `^/p/[^/]+/\d+$`. Myer: `^/p/[^/]+$`. Kmart: `^/product/[^/]+/?$`. Category and search pages show "open a product page".
3. **Product facts from the DOM.** Title, breadcrumb (for example Men, Tops, Shirts), brand, the list of size labels, fit keywords ("Regular fit", "Relaxed shape through body", "Slim", "Oversized"), and the model size if stated.
4. **Live chart first.** Read the chart the page itself points to (the "Size Guide" link on Target, the "Size guide" popup on Kmart). The page's own chart is the most authoritative, so it wins over any bundled data.
5. **Rule-based chart second.** Use the Target rule table below, or ask for the manual paste on Kmart if the popup cannot be read.
6. **Snapshot third (Target only).** Use the bundled tables below, labelled with their retrieval date, only if the live read fails.
7. **Manual CSV last.** The paste fallback from FR-8.

**Target chart rules for tops** (starting rules, verify against live pages)

| Signals on the product page | Chart to use | Where it lives |
| --- | --- | --- |
| Women, breadcrumb under Women, sizes 4 to 20 or XXXS to XXXL | Womenswear (bust, waist, hips) | `/size-chart/viewallsize` |
| Women, title or brand says Petite | Women's Petite Sizes (4P to 16P) | `/modal/size-charts` |
| Women, title or brand says Curve or Plus Size, sizes 16+ and up | Women's Plus (sizes 16 to 26), cross-check the 16+/18+ to 24+/26+ rows in Womenswear | `/modal/size-charts`, `/size-chart/viewallsize` |
| Women, Maternity category | Women's Maternity | `/size-chart/viewallsize` |
| Men, breadcrumb Men then Tops, alpha sizes XS to 2XL | Men's Tops (chest) | `/modal/size-charts` |
| Men, numeric sizes 28 to 50, or Plus Size, or brand Target Man Plus, sizes 3XL to 7XL | Men's Tops / Shirts / Jackets, or Mr Big Tops | `/size-chart/viewallsize`, `/modal/size-charts` |
| Men's business shirt sized by collar (38 to 46) | Neck chart only, so chest is unknown: ask the user to confirm or paste a chest size | `/modal/size-charts` |

**Myer and Kmart rules.** Myer (deferred, notes for later): resolve by brand, taken from the brand link on the product page (for example `/b/city-chic`). Never reuse one brand's chart for another. If the brand's guide cannot be read, fall back to the "Size and Fit" text plus the manual paste. Kmart: if the title starts with "Target" or the page says "Sold and shipped by Target", use the Target rules above and flag the assumption in the UI. Otherwise read the chart from the Size guide popup (see Verified sample pages).

**Verified sample pages** (opened 2026-10-28, use as fixtures T1, T2 and K1; save each page's rendered HTML into `tests/fixtures/`)

| Fixture | URL | Facts read from the page | Expected result |
| --- | --- | --- | --- |
| T1 Target men | `https://www.target.com.au/p/australian-cotton-relaxed-t-shirt/73125303` | Item code 73125303. Breadcrumb Men, Tops, T-Shirts. Sizes S, M, L, XL, XXL, XXXL. Fit line "Relaxed fit". "Model wears a size L". A "Size Guide" link sits beside the size list. | Men, relaxed ease. Chart is whichever one the Size Guide opens. Chart C has an XXXL row while Chart D labels that size 3XL under Mr Big, so record the real chart during FR-24 and assert it in the test. |
| T2 Target women | `https://www.target.com.au/p/european-linen-3-4-sleeve-femme-popover-blouse/73109822` | Item code 73109822. Breadcrumb Women, Tops, Blouses. Sizes 6, 8, 10, 12, 14, 16, 18, 20. Fit line "Regular fit". "Model wears a size 10". Also lists 3/4 length sleeves and soft gathers at the shoulders. | Women, regular ease. Chart A is expected because it covers sizes 6 to 20 (Chart B only covers 8 to 18). Verify against the Size Guide link. |
| K1 Kmart men | `https://www.kmart.com.au/product/oversized-print-t-shirt-s175529/?selectedSwatch=Gry+Taco` | SKU P\_S175529, and the URL path ends in s175529. Breadcrumb Mens, Clothing, Tops, T Shirts. A "Size guide" button. Size options are not in the static HTML and load after the page renders. Under "Fit and Model Size": "Oversized fit" and "The model featured is wearing a Size M". Features include a drop shoulder design. | Men, oversized ease. Chart comes from the popup, contents not yet seen. |

**Target page notes.** Both Target samples list the sizes, the "Size Guide" link, the item code, a fit line and a model size in the page HTML, so the Target adapter can read them without clicking anything. Each colour has its own item code and URL, so treat each colour URL as its own product.

**Kmart Size guide popup procedure** (from the K1 page and your description; verify in a real browser)

1. Wait for the product page to render. The size options and the Size guide button are not in the static HTML, so the content script must wait for them (a MutationObserver or a short polling loop with a timeout).
2. Find the button whose visible text is "Size guide" next to the size selector and click it from the content script.
3. Wait for the popup, read its table or tables, then close it so the page is left as it was found.
4. The popup's layout is unknown. Record it in a fixture, parse it with the same normaliser as Target, and detect whether it lists body or garment measurements (FR-7).
5. Ignore query parameters such as `selectedSwatch` when identifying the product. They only select a colour.

**Target chart snapshots for tops** (body measurements in cm, retrieved 2026-10-28 from the pages above; bundle as test fixtures and as the snapshot fallback). All four are body charts, so `convention` is `body` and garment size is body size plus the style ease from Fit logic. Where a size has a range, use the midpoint.

Chart A: Womenswear, `/size-chart/viewallsize`

| AU size | Alpha | Bust | Waist | Hips |
| --- | --- | --- | --- | --- |
| 4 | XXXS | 77-81 | 59-63 | 85-89 |
| 6 | XXS | 81-85 | 63-67 | 89-93 |
| 8 | XS | 85-89 | 67-71 | 93-97 |
| 10 | S | 89-93 | 71-75 | 97-101 |
| 12 | M | 94-98 | 76-80 | 102-106 |
| 14 | L | 99-103 | 81-85 | 107-111 |
| 16 | XL | 104-108 | 86-90 | 112-116 |
| 18 | XXL | 109-114 | 91-96 | 117-122 |
| 20 | XXXL | 115-120 | 97-102 | 123-128 |

Chart B: Women's Regular, `/modal/size-charts` (single values, and note they differ from Chart A, see the conflict rule below)

| AU size | Bust | Waist | Hips |
| --- | --- | --- | --- |
| 8 | 82 | 63 | 88 |
| 10 | 87 | 68 | 93 |
| 12 | 92 | 73 | 98 |
| 14 | 97 | 78 | 103 |
| 16 | 102 | 83 | 108 |
| 18 | 107 | 88 | 113 |

Chart C: Men's Tops / Shirts / Jackets, `/size-chart/viewallsize`

| Numeric size | Alpha | Chest |
| --- | --- | --- |
| 28 | XS | 87 |
| 30 | S | 92 |
| 32 | M | 97 |
| 34 | L | 102 |
| 36 | XL | 108 |
| 38 | XXL | 114 |
| 40 | XXXL | 120 |
| 42 | 3XL | 122 |
| 44 | 4XL | 127 |
| 46 | 5XL | 132 |
| 48 | 6XL | 137 |
| 50 | 7XL | 143 |

Chart D: Men's Tops and Mr Big Tops, `/modal/size-charts`

| Alpha | XXS | XS | S | M | L | XL | 2XL | 3XL | 4XL | 5XL | 6XL | 7XL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chest | 82 | 87 | 92 | 97 | 102 | 107 | 117 | 117 | 122 | 127 | 132 | 137 |

The Mr Big Tops row (3XL to 7XL) is labelled "Waist" on the Target page although the figures match chest values, so treat it as chest and flag it in the code as an unverified label.

**Conflict rule.** Target's two chart pages disagree in places (for example Chart A size 10 bust is 89-93 while Chart B gives 87, and Chart C XXL is 114 while Chart D 2XL is 117). When the live "Size Guide" on the product page identifies a chart, use that chart. Otherwise use the chart named in the rule table and show its name and URL in the fit summary so the user can see which one was used.

**Additional functional requirements**

- FR-17: Detect the store from the hostname (Target and Kmart in the MVP) and reject unsupported hosts, including Myer, with a clear message.
- FR-18: Detect a product page from the path patterns above and reject category and search pages.
- FR-19: Extract `ProductFacts` (title, brand, breadcrumb, size labels, fit keywords, model size) in each adapter.
- FR-20: Implement the chart resolver with the seven-step order above and record the winning step in `ChartSource`.
- FR-21: Normalise size labels before matching to chart rows. Examples: `XS/14` becomes alpha XS and AU 14, `3XL` stays 3XL, bare numerals such as `10` match the AU numeric column, and Myer's unordered size list (for example 24 12 22 26 16 18 14 10 20) is sorted.
- FR-22: Show the chart name, URL, retrieval method (live, rule, snapshot, manual) and chart convention in the Try on tab. Show a warning when the method is not live.
- FR-23: Never apply a Target chart to a Kmart-branded product. When Myer is added later, never share a chart between Myer brands.
- FR-24: Run a discovery spike per store before writing its adapter. Open real product pages in a browser (Playwright or Chrome DevTools), find where the chart loads (inline table, modal, iframe or network call), record the selector or request, and save the HTML as a fixture. If no machine-readable chart exists for a store or brand, ship the manual paste fallback for it and say so, rather than guessing numbers.
- FR-25: Map fit keywords to style ease using the table in Fit logic. Starting mapping: "slim" or "fitted" to slim, "regular" to regular, "relaxed" or "loose" to relaxed, "oversized" or "drop shoulder" to oversized, and no keyword to regular.

**Type additions** (extend the Core types in the Architecture and data models section)

```ts
type StoreId = 'target' | 'myer' | 'kmart';

interface ChartSource {
  store: StoreId;
  chartName: string;      // for example 'Womenswear' or 'Men's Tops'
  url: string;            // page the chart was read from
  method: 'live' | 'rule' | 'snapshot' | 'manual';
  retrievedAt: string;    // ISO date; snapshots carry 2026-10-28
}

interface ProductFacts {
  store: StoreId;
  url: string;
  title: string;
  brand?: string;
  breadcrumb: string[];
  sizeLabels: string[];
  fitText: string[];      // raw fit lines, for example 'Regular fit'
  modelSize?: string;
}

interface ResolvedChart {
  chart: SizeChart;       // add `source: ChartSource` to SizeChart
  source: ChartSource;
}

interface ChartResolver {
  resolve(facts: ProductFacts, doc: Document): Promise<ResolvedChart | null>;
}
```

`StoreAdapter.extract` (in Core types) should return `ProductFacts` plus the raw size guide element if one is on the page, and the resolver turns that into a `SizeChart`.

## Architecture and data models

All logic runs in the browser with no backend, and the fit engine is the only place that knows how fit is computed.

&#91;embedded content: architecture · 6 components, no backend\]

A content script on the product page reads the size guide and sends it to the side panel app, where the fit engine combines it with the saved profile and passes one FitResult to the renderer.

**Suggested stack**

- TypeScript, Vite with the CRXJS plugin, Manifest V3
- React for the side panel UI, inline SVG for the render (no canvas or 3D library in phase 1)
- Vitest for the fit engine and the parsers, using saved HTML fixtures per store
- chrome.storage.local for persistence and chrome.runtime messaging between the content script and the panel

**Suggested repo layout**

```
src/
  manifest.json
  panel/       React UI (Profile tab, Try on tab)
  content/     content script entry, picks an adapter by hostname
  adapters/    one file per store, each implementing StoreAdapter
  fit/         fit engine, fit-config.ts, size chart normaliser
  render/      Renderer interface plus the 2D SVG implementation
  types/       shared types
tests/
  fixtures/    saved product page HTML per store
```

**Core types** (Claude Code fills in the dimension types and landmarks)

```ts
type Gender = 'men' | 'women';
type Region = 'chest' | 'waist' | 'shoulder' | 'length' | 'sleeve';
type FitLabel = 'tight' | 'fitted' | 'true' | 'loose' | 'oversized';

interface BodyProfile {
  gender: Gender;
  heightCm: number; weightKg: number;
  chestCm: number; waistCm: number; hipsCm: number;
  shoulderCm: number; inseamCm: number;
}

interface SizeRow {
  label: string;
  chestCm?: number; waistCm?: number; lengthCm?: number;
  shoulderCm?: number; sleeveCm?: number;
}

interface SizeChart {
  convention: 'garment-circumference' | 'garment-flat' | 'body';
  rows: SizeRow[];
}

interface Garment {
  title: string;
  imageUrl?: string;
  chart: SizeChart;
  styleEase?: 'slim' | 'regular' | 'relaxed' | 'oversized';
}

interface FitResult {
  body: BodyDims;
  garment: GarmentDims;
  easeCm: Record<Region, number>;
  label: Record<Region, FitLabel>;
  hemAt: BodyLandmark;
  sleeveEndsAt: BodyLandmark;
}

interface StoreAdapter {
  matches(url: URL): boolean;
  extract(doc: Document): Promise<Garment | null>;
}

interface Renderer {
  render(fit: FitResult, el: SVGElement): void;
}
```

## Fit logic

Fit is ease: the garment dimension minus the body dimension, per region. Every number below is a starting default that lives in one config file (fit-config.ts) and is expected to be tuned by eye during testing.

**Step 1: normalise the size chart.** Size charts mix conventions, so the parser must handle three cases and record which one applied.

- Garment circumference (for example chest 108 cm): use as is.
- Garment flat width (pit to pit, for example chest 54 cm): if a chest value is below roughly 80 cm on an adult top, treat it as flat and double it to get circumference.
- Body measurement chart (for example size M fits chest 96 to 101 cm): use the midpoint as the body size and add a style ease (slim 4 cm, regular 10 cm, relaxed 16 cm, oversized 24 cm). Default to regular unless the product title says otherwise.

**Step 2: compute ease per region.** Chest or bust, waist and shoulder width are compared directly. Hem position comes from garment length against the user's torso length. Sleeve end comes from garment sleeve length against the user's arm length.

**Step 3: classify chest ease** (starting thresholds, cm of circumference):

| Chest ease | Label | Render behaviour |
| --- | --- | --- |
| below 0 | Tight | Garment drawn flush, tinted red |
| 0 to 6 | Fitted | Garment hugs the body outline |
| 6 to 14 | True to size | Small gap at the sides |
| 14 to 22 | Loose | Visible gap, hem and sleeves slightly longer |
| above 22 | Oversized | Large gap, dropped shoulder |

**Step 4: derive missing body dimensions** from height and gender when the user did not enter them. Starting ratios, approximate: torso length (base of neck to hip) 0.30 of height, arm length (shoulder to wrist) 0.33 of height, men and women using separate shoulder-to-hip ratio presets. Keep these in the same config file.

**Step 5: map to the 2D render.** Convert circumference to front-view width with the same factor for body and garment, so the ratio between them is visually honest. Starting factor: front-view width equals 0.37 times circumference at chest and hip, 0.34 at waist (assumes torso depth around 70 percent of width). Because body and garment share the factor, the factor only changes how wide the figure looks, not the fit result.

**Men and women body types:** two base silhouette templates (men: broader shoulders, straighter waist-to-hip; women: narrower shoulders, more waist-to-hip difference). Each template is a parametric SVG path whose control points move with the body dimensions, so inputs like a wide waist or narrow shoulders visibly change the shape within the same template.

## Build milestones and acceptance criteria

Build in this order. Each milestone should leave the extension in a loadable state and ends with its acceptance check.

1. **Scaffold.** MV3 extension with Vite and CRXJS, side panel with Profile and Try on tabs, loads unpacked in Chrome. Done when: the panel opens from the toolbar icon and the tabs switch.
2. **Profile.** Men/Women toggle, measurement fields, validation, cm/in switch, save to chrome.storage.local. Done when: values survive closing and reopening the panel, and invalid values are blocked.
3. **Fit engine (pure TypeScript, no UI).** Size chart normalisation, ease computation, classification, FitResult output, config file. Done when: Vitest tests pass for all three chart conventions and for each ease band, using fixture charts.
4. **Renderer v1.** Parametric SVG body for men and women, garment overlay from a hard-coded FitResult. Done when: changing a measurement or hard-coded size visibly changes the body and garment, and a tight size looks different from an oversized one.
5. **Target adapter and chart resolver.** Content script, FR-17 to FR-22 and the Target adapter. Resolve the chart from the product link using the rule table, read the live Size Guide, and fall back to the bundled snapshots. Done when: it works on both Target sample pages (T1 and T2) plus at least one more men's and one more women's top, the resolver picks the expected chart for each, and tests pass against saved HTML fixtures.
6. **Wire it together.** Page detection, size selector, live render and fit summary driven by the real scraped chart. Done when: on a supported product page, picking a size renders the garment and lists ease per region.
7. **Fallback and errors.** Manual CSV paste, unsupported-page message, scrape-failure message. Done when: an unsupported page and a broken size guide each show a clear message, and pasting a CSV chart still renders.
8. **Kmart adapter.** Run the FR-24 discovery spike on the Kmart sample page K1: click the Size guide button, capture the popup HTML and any network call behind it, and save fixtures. Build the adapter to open the popup and parse its table, or ship the manual paste path for Kmart if the table cannot be read. Done when: on K1 the extension either resolves a chart from the popup or tells the user clearly that it cannot.
9. **Sanity check.** Enter the owner's own measurements, pick the sizes they already own, and confirm the fit labels match reality. Adjust fit-config.ts. Done when: the owner agrees at least 3 of 4 known garments are labelled correctly.

**Definition of done for the MVP:** steps 1 to 7 and 9 complete, the extension loads unpacked in Chrome, and the whole loop (profile, product page, size, render and fit summary) works on Target AU without a backend, and Kmart either resolves a chart from its popup or shows the manual paste fallback. Myer is out of scope for the MVP.

## Risks and open questions

**Open questions** (Claude Code should use the stated default and flag it)

- Build order? Default: Target AU first, then Kmart AU, with Myer AU deferred. Sample URLs for Target (men's and women's) and Kmart (men's) are listed under Verified sample pages. Still useful but not blocking: a Kmart women's top URL.
- Metric or imperial as the default unit? Default: cm, with an inches toggle.
- Side panel or popup? Default: side panel, popup as fallback.
- Stack? Default: TypeScript, Vite with the CRXJS plugin, React for the panel UI, inline SVG for the render, Vitest for the fit engine.

**Risks**

- Scraping is the most fragile part. Size guides are often in modals, iframes or loaded on click, and layouts change without notice. Mitigation: per-store adapters behind one interface, saved HTML fixtures for tests, and the manual CSV fallback.
- Size chart conventions are ambiguous (flat vs circumference, body vs garment). A wrong guess produces a confident but wrong render. Mitigation: record the detected convention in the data model and show it in the fit summary so the user can spot it.
- A 2D mannequin may read as low quality. Mitigation: the PoC goal is fit accuracy, and the renderer is deliberately swappable for phase 2.
- Fit thresholds are guesses until tested. Mitigation: keep them in config and compare the output against the user's own clothes in known sizes before trusting it.
- Scraping store pages may breach site terms. Mitigation: local, personal-use PoC that reads only the page the user already has open, with no data leaving the browser.

## Handing this to Claude Code

Export this doc as Markdown and save it in the repo root as SPEC.md, then start Claude Code with this prompt:

```
Read SPEC.md in full. Do not write code yet. Produce a build plan for milestones 1 to 9, and list every question that blocks you in one batch. Treat decisions marked as made as fixed. For open items, use the stated defaults and list which ones you used. Before writing each store adapter, run the FR-24 discovery spike in a real browser and save the product page HTML as a fixture. Wait for my approval before building.
```

## Sources

Pages opened on 2026-10-28 for the store size guide research. The Kmart denim fit guide link was seen in a search result and not opened.

- [Target size charts, all categories](https://www.target.com.au/size-chart/viewallsize)
- [Target size charts, modal version](https://www.target.com.au/modal/size-charts)
- [Target product page example](https://www.target.com.au/p/plus-size-australian-cotton-business-shirt/73190387)
- [Target category page example](https://www.target.com.au/c/men/plus-size/tops/business-shirts/W1298288)
- [Myer product page example](https://www.myer.com.au/p/city-chic-plus-size-davina-cotton-tee-in-ivory)
- [Myer Find Your True Fit page](https://www.myer.com.au/content/find-your-true-fit)
- [Myer curve category page](https://www.myer.com.au/c/women/womens-plus-size)
- [Kmart product page example](https://www.kmart.com.au/product/target-curve-plus-size-australian-cotton-long-sleeve-stripe-top-s444233/)
- [Kmart women's denim fit guide](https://www.kmart.com.au/womens-denim-fit-guide/)

* [Target men's sample page T1](https://www.target.com.au/p/australian-cotton-relaxed-t-shirt/73125303)
* [Target women's sample page T2](https://www.target.com.au/p/european-linen-3-4-sleeve-femme-popover-blouse/73109822)
* [Kmart men's sample page K1](https://www.kmart.com.au/product/oversized-print-t-shirt-s175529/?selectedSwatch=Gry+Taco)
