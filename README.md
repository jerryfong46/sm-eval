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
- Includes a Strategy Compare tab with presets:
  - A) Mortgage only (no Smith Manoeuvre)
  - B) Conservative Smith (dividends to HELOC, self-capitalized HELOC interest, tax refund net of dividend tax to HELOC)
  - C) Aggressive Smith (self-capitalize HELOC interest, compound dividends, tax refund to mortgage)
- Strategy Compare is fully configurable:
  - enable/disable any scenario
  - add unlimited custom scenarios
  - choose HELOC payment strategy, dividend handling, tax refund handling, dividend tax treatment, and net-refund behavior per scenario
- Includes a Sensitivity tab with:
  - downside/upside scenario matrix
  - break-even annual return vs mortgage-only baseline
  - return-vs-HELOC-rate heatmap of after-tax net outcomes
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
- After-tax closeout net estimates liquidation tax as:
  - unrealized gain x capital-gains inclusion rate x marginal tax rate
- Home value is held constant (no appreciation/depreciation)
- This is educational planning software, not financial advice
