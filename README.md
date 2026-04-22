# Empire Economy Tracker

A static, GitHub Pages-hosted web application for players of a tabletop/LARP-style game to fill out **tax submission forms** and **FTA bulk sale forms**.

## Features

- **Live item data** pulled from a public Google Sheet, cached in IndexedDB for 4 hours
- **Tax Submission tab** — calculates base tax, race modifier, buyback cap, and Empire payout
- **FTA Bulk Sale tab** — calculates FTA price (×1.25), cut rate brackets, loyalty tier tracking, and weekly settlement cap
- **Shared cart** with dual-price model (specialisation-adjusted price for Tax; `currentPrice` for FTA)
- Items marked `buying = No` are excluded from all totals with a clear red warning
- Copy-to-clipboard form output in the correct Empire template format
- Dark parchment/imperial theme — no external frameworks, pure vanilla HTML/CSS/JS

## Deployment

### GitHub Pages

1. Fork or push this repo to GitHub.
2. In your repository settings → **Pages** → set source to `main` branch, root folder.
3. GitHub Pages will serve the site at `https://<username>.github.io/<repo-name>/`.

No build step required. The entire project is static.

### Local development

```bash
npx serve .
# or use VS Code Live Server
```

## File Structure

```
/
├── index.html        Shell: layout, all markup
├── style.css         All visual styling (CSS variables, dark theme)
├── js/
│   ├── main.js       App init, tab switching, shared state
│   ├── cache.js      Google Sheets CSV fetch + IndexedDB caching
│   ├── search.js     Item search + autocomplete suggestions
│   ├── cart.js       Cart add/remove/quantity, dual-price model
│   ├── tax.js        Tax calculation logic + live display
│   ├── fta.js        FTA calculation logic + live display
│   └── form.js       Form text generation + clipboard copy
└── README.md
```

## Data Source

The item price list is fetched from a public Google Sheet via its CSV export endpoint. No API key is required as long as the sheet is publicly viewable.

Cache is stored in IndexedDB and refreshed automatically every 4 hours, or manually via the **Refresh** button.

## Notes

- **Hamlet** settlements have no tax and no buyback. The Tax tab shows a notice and the Generate button is disabled.
- **Specialisation** affects Tax tab prices only. The FTA tab always uses `currentPrice` (base empire price).
- **Per-person limit** snaps to valid loyalty tier increments (150–450 in steps of 50).
- Items with `buying = No` are shown with a red **Not Accepted** badge and are excluded from all totals and form output.
