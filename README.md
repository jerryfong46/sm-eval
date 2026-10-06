# Smith Manoeuvre Simulator

Compare Canadian mortgage paydown and leveraged investment strategies, with distribution taxes, annual tax settlements and after-tax portfolio liquidation.

## Features

- Canadian ETF / stock dropdown: VFV, BMO, XEQT, RY, TD, ZNQ, CM, XDIV, VDY, XEI, XIU, XIC, VCN, ZCN, VEQT, ZSP and ZEB. BMO, RY, TD and CM are bank stocks.
- Fetch latest available CAD close, trailing 12-month cash distribution yield and 1/3/5/10-year annualized **price** returns from Yahoo Finance. Distributions are added separately to avoid counting them twice. Dates, available history and manual overrides are visible. Shorter history is explicitly identified.
- Age, horizon, existing portfolio/ACB, initial HELOC withdrawal, available room, loan rates and additional margin borrowing.
- Default Ontario highest combined marginal bracket (53.5296%, eligible dividends 39.344048%); Ontario 2026 gross-income estimate or custom rates for other provinces.
- Adjustable eligible Canadian distribution share per holding; remaining distributions use ordinary-income treatment. Mixed ETF shares are illustrative, editable assumptions, not fetched tax breakdowns.
- Six configurable comparisons, initially ordered from most leverage to least: margin + compound, capitalize + compound, dividend mortgage accelerator, dividends service interest, reduce investment debt, mortgage only.
- Each comparison can select the shared allocation mix or an individual ticker. Choosing a new ticker adds an editable holding with zero allocation, so it does not change the shared mix.
- Annual tax refunds/payables with timing lag; distribution tax is counted once. Monthly tax withholding and annual settlement are alternative timing choices.
- Mortgage payoff month/age, ending age, separate HELOC and margin balances, liquidation tax, external cash required, annual distributions/taxes/interest benefits and comparison charts.
- HELOC room expands with mortgage principal paid, bounded by modeled 65% HELOC and 80% combined loan-to-value limits. Unavailable investment advances are skipped and flagged; interest funding gaps use external cash.
- Same monthly mortgage budget across comparisons: freed payments after payoff accumulate as cash.
- Sensitivity scenarios, break-even returns and return/rate heatmap.

## Run locally with live data

No third-party Python dependencies are required:

```sh
python3 server.py --port 8000
```

Open [http://localhost:8000](http://localhost:8000). The server binds to localhost and serves the website plus `/api/market?symbol=VFV`.

The project already has Vercel project metadata. `api/market.py` is a Python serverless endpoint for Vercel. Vercel can serve the root HTML/CSS/JS and the API together. There is no deployment included in this change.

Opening `index.html` directly, using a plain static file server, or publishing only to GitHub Pages supports manual forecasts; **live fetching requires the market API**. Failed requests preserve editable assumptions and show an error. The provider can rate-limit or change its endpoint. Responses are cached for one hour. Only an allowlist of Canadian tickers can be requested; no account credentials or portfolio inputs are sent to the provider.

## Financial assumptions

- Mortgage uses Canadian semiannual compounding. Price returns use effective monthly compounding consistent with annual CAGR. Cash distributions are spread monthly; actual payment schedules differ.
- A 30% margin setting adds $30 for each $100 of initial/new HELOC investment (also on existing portfolio at startup). It does not recursively borrow against gains, dividends or the margin-funded purchase. Margin interest is paid monthly from cashflow. Maintenance debt/portfolio breaches are flagged; forced sales and margin-call liquidation taxes are not simulated, so breached paths are not executable forecasts.
- Self-capitalization assumes a separate, traceable advance actually pays deductible interest. Simply leaving compound interest unpaid does not support the same tax assumptions.
- Ontario income mode applies 2026 federal/provincial brackets, basic personal amounts, eligible dividend gross-up/credits and surtax. Gross income is treated as taxable income before investment activity. CPP/EI, health premium, employment/other credits, tax reduction, AMT and benefit clawbacks are excluded. Income, brackets and tax law remain constant over the horizon. Other provinces use manual rates.
- ETF distribution tax breakdowns are not inferred from dividend yield. ROC, distributed capital gains, foreign tax credits and non-cash distributions/ACB adjustments are excluded; enter updated assumptions after checking issuer tax information.
- Annual settlement nets deductible-interest savings against distribution taxes. Negative settlements remain liabilities until paid, including at closeout; monthly withholding is reconciled against the annual calculation.
- Liquidation taxes only positive unrealized gains using ACB and the editable inclusion rate (default 50%). Income mode applies progressive tax to terminal gains. No tax credit is invented for losses.
- After-tax economic closeout = home equity + portfolio after liquidation tax + cash + pending tax settlements − HELOC − margin debt − cumulative external loan-servicing contributions. The separate portfolio-less-loans figure excludes home equity/cash/external contributions.
- Mortgage payoff clears the mortgage alone: investment loans can remain. No mortgage penalties, lender-specific prepayment limits, trading costs, inflation, home-price changes or return volatility are modeled.

Sources: [CRA 2026 tax brackets](https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html), [Ontario personal amounts and surtax](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html), [interest deductibility](https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax/income-tax-folios-index/series-3-property-investments-savings-plans/series-3-property-investments-savings-plan-folio-6-interest/income-tax-folio-s3-f6-c1-interest-deductibility.html), [ETF tax distribution types](https://www.blackrock.com/ca/investors/en/resources/faqs/distributions-and-tax).

## Checks

```sh
node tests/model.test.js
node tests/ui-smoke.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
```

Financial tests cover tax settlement, dividends, debt, CAGR/ACB, capacity, payoff, matched mortgage budgets and margin warnings. The interface smoke test uses an offline DOM fixture and mocked market responses; it is not browser/layout verification. Market tests exercise price/distribution calculations without network access.

Educational planning estimates, not financial advice.
