# Smith Manoeuvre Simulator

A simple static web app to model mortgage paydown and portfolio growth under a Smith Manoeuvre-style strategy.

## What it does

- Calculates monthly mortgage amortization (plus optional extra payments)
- Re-borrows monthly principal paydown to a HELOC and invests it
- Lets users define a holdings mix (stocks/ETFs), allocation, price return assumptions, and dividend yields
- Supports dividend strategy:
  - compound in portfolio
  - repay mortgage
  - pay down HELOC
- Supports tax refund strategy:
  - reinvest
  - repay mortgage
  - pay down HELOC
  - keep as cash
- Supports HELOC strategy:
  - self-capitalize interest
  - pay interest from cashflow
  - pay interest plus monthly principal
- Shows headline metrics, yearly table, and chart

## Tax-aware ticker guidance (Canada)

- For non-registered Smith Manoeuvre setups, many users try to minimize return of capital (ROC) and favor eligible Canadian dividends to reduce tax-reporting complexity.
- Common Canadian starting points:
  - Core Canadian equity: `XIU`, `XIC`, `VCN`, `ZCN`
  - Canadian dividend tilt: `XEI`, `VDY`, `CDZ`
  - One-ticket equity: `VEQT`, `XEQT` (distributions can include mixed tax types)
- Verify each ETF's latest annual tax breakdown from the issuer before buying.

## Run locally

Because this is a static app, you can run it with any local file server.

### Option 1: open directly

Open `index.html` in a browser.

### Option 2: serve over HTTP (recommended)

```bash
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

## Publish on GitHub Pages (jerryfong46)

1. Create a new repository on GitHub (for example `smith-manoeuvre-sim`).
2. Upload these files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
3. In GitHub, go to **Settings > Pages**.
4. Under **Build and deployment**, choose:
   - **Source**: Deploy from a branch
   - **Branch**: `main` and `/ (root)`
5. Save and wait for deployment.
6. Your app URL will be:
   - `https://jerryfong46.github.io/smith-manoeuvre-sim/`

## Important assumptions

- Fixed mortgage rate and payment across the full horizon
- Constant return assumptions based on your holdings inputs
- HELOC interest deduction/refund is estimated using a single marginal tax rate
- Home value is held constant (no appreciation/depreciation)
- This is educational planning software, not financial advice
