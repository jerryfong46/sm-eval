const INVESTMENTS = {
  VFV: {name: 'Vanguard S&P 500 ETF', eligibleShare: 0},
  BMO: {name: 'Bank of Montreal stock', eligibleShare: 100},
  XEQT: {name: 'iShares All-Equity ETF', eligibleShare: 25},
  RY: {name: 'Royal Bank stock', eligibleShare: 100},
  TD: {name: 'Toronto-Dominion stock', eligibleShare: 100},
  ZNQ: {name: 'BMO Nasdaq 100 ETF', eligibleShare: 0},
  CM: {name: 'CIBC stock', eligibleShare: 100},
  XDIV: {name: 'iShares Canadian Dividend ETF', eligibleShare: 100},
  VDY: {name: 'Vanguard Canadian High Dividend ETF', eligibleShare: 100},
  XEI: {name: 'iShares Canadian High Dividend ETF', eligibleShare: 100},
  XIU: {name: 'iShares S&P/TSX 60 ETF', eligibleShare: 100},
  XIC: {name: 'iShares Canadian Composite ETF', eligibleShare: 100},
  VCN: {name: 'Vanguard Canadian All Cap ETF', eligibleShare: 100},
  ZCN: {name: 'BMO Canadian Composite ETF', eligibleShare: 100},
  VEQT: {name: 'Vanguard All-Equity ETF', eligibleShare: 25},
  ZSP: {name: 'BMO S&P 500 ETF', eligibleShare: 0},
  ZEB: {name: 'BMO Equal Weight Banks ETF', eligibleShare: 100},
};
const marketCache = new Map();
const marketRequests = new Map();
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
function populateInvestmentSelect(select, mix) {
  if (mix) select.add(new Option('Shared portfolio mix', 'mix'));
  Object.entries(INVESTMENTS).forEach(([symbol, data]) => select.add(new Option(`${symbol} — ${data.name}`, symbol)));
}
function weightedEligibleShare(holdings) {
  const total = holdings.reduce((s,h) => s + h.allocation * h.dividendYield, 0);
  return total > 0 ? holdings.reduce((s,h) => s + h.allocation * h.dividendYield * h.eligibleShare, 0) / total : 0;
}
function payoffText(summary) {
  const m = summary.mortgagePayoffMonths;
  if (m === null) return 'Beyond forecast';
  if (m === 0) return 'Already paid';
  return `${Math.floor(m / 12)} yr ${m % 12} mo`;
}
function chosenHistory(data) {
  const wanted = document.getElementById('historyPeriod').value;
  if (data.priceReturns[wanted] !== undefined) return {rate: data.priceReturns[wanted], years: wanted, fallback: false};
  // Never silently label a short history as the requested longer period.
  const available = Object.keys(data.priceReturns).map(Number).filter(y => y <= Number(wanted)).sort((a,b) => b-a);
  return available.length ? {rate: data.priceReturns[available[0]], years: String(available[0]), fallback: true} : null;
}
async function fetchMarket(symbol, force = false) {
  if (!force && marketCache.has(symbol)) return marketCache.get(symbol);
  if (marketRequests.has(symbol)) return marketRequests.get(symbol);
  const promise = (async () => {
    const response = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}`, {signal: AbortSignal.timeout(25000), cache: force ? 'reload' : 'default'});
    if (!response.ok) throw new Error('Provider unavailable');
    const data = await response.json();
    if (data.symbol !== symbol || !Number.isFinite(data.dividendYield) || !data.priceReturns || !data.asOf) throw new Error('Invalid market data');
    marketCache.set(symbol, data);
    return data;
  })();
  marketRequests.set(symbol, promise);
  try { return await promise; } finally { marketRequests.delete(symbol); }
}
function applyMarketToRow(row, data) {
  const history = chosenHistory(data);
  if (history) row.querySelector('.h-return').value = (history.rate * 100).toFixed(1);
  row.querySelector('.h-dividend').value = (data.dividendYield * 100).toFixed(1);
  const status = row.querySelector('.h-data');
  status.replaceChildren();
  const link = document.createElement('a');
  link.href = data.sourceUrl; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = `${data.source} · ${data.asOf.slice(0,10)} · $${data.price.toFixed(2)} CAD`;
  status.append(link, document.createElement('br'));
  status.append(history ? `${history.years}y price CAGR${history.fallback ? ' (shorter history)' : ''}; TTM cash yield. ` : 'Insufficient history: price return stays manual. ');
  status.append(Object.entries(data.priceReturns).map(([y,r]) => `${y}y ${(r*100).toFixed(2)}%`).join(' · '));
  row.dataset.marketLoaded = 'yes';
}
async function fetchHoldingRow(row, force = false) {
  const symbol = row.querySelector('.h-symbol').value;
  const requestId = String(Number(row.dataset.requestId || 0) + 1);
  row.dataset.requestId = requestId;
  const status = row.querySelector('.h-data');
  status.textContent = `Fetching ${symbol}…`;
  try {
    const data = await fetchMarket(symbol, force);
    if (!row.isConnected || row.querySelector('.h-symbol').value !== symbol || row.dataset.requestId !== requestId) return;
    applyMarketToRow(row, data);
    document.getElementById('marketStatus').textContent = 'Fetched history is now used in forecasts. Edit return/yield fields to test other assumptions.';
  } catch {
    if (!row.isConnected || row.querySelector('.h-symbol').value !== symbol || row.dataset.requestId !== requestId) return;
    status.textContent = 'Fetch unavailable — manual assumptions retained. Retry with Fetch data.';
    document.getElementById('marketStatus').textContent = 'Live data needs the market API (python3 server.py locally, or Vercel). Provider/network errors leave manual assumptions in place.';
  }
  runAndRender();
}
function resolveScenarioInvestment(inputs, symbol) {
  if (!symbol || symbol === 'mix') return {inputs, label: 'Shared mix'};
  const holding = inputs.holdings.find(h => h.symbol === symbol);
  if (holding) return {inputs: {...inputs, weightedPriceReturn: holding.priceReturn,
    weightedDividendYield: holding.dividendYield, eligibleDividendShare: holding.eligibleShare},
    label: `${symbol} (${(holding.priceReturn*100).toFixed(1)}% price / ${(holding.dividendYield*100).toFixed(1)}% yield)`};
  const data = marketCache.get(symbol);
  const history = data && chosenHistory(data);
  const priceReturn = history?.rate ?? .05;
  const dividendYield = data?.dividendYield ?? .02;
  return {inputs: {...inputs, weightedPriceReturn: priceReturn, weightedDividendYield: dividendYield,
    eligibleDividendShare: INVESTMENTS[symbol].eligibleShare / 100},
    label: `${symbol} (${(priceReturn*100).toFixed(1)}% price / ${(dividendYield*100).toFixed(1)}% yield${data && history ? '' : '; illustrative manual return/yield'})`};
}
function initializeMarketControls() {
  document.getElementById('grossIncome').addEventListener('input', () => { updateTaxRateFromBracket(); runAndRender(); });
  holdingsRowsEl.addEventListener('change', event => {
    const row = event.target.closest('tr');
    if (!row) return;
    if (event.target.classList.contains('h-symbol')) {
      row.querySelector('.h-eligible').value = INVESTMENTS[event.target.value].eligibleShare;
      row.querySelector('.h-return').value = '5.0';
      row.querySelector('.h-dividend').value = '2.0';
      fetchHoldingRow(row);
    } else {
      if (event.target.matches('.h-return, .h-dividend, .h-eligible')) {
        row.dataset.requestId = String(Number(row.dataset.requestId || 0) + 1);
        row.querySelector('.h-data').textContent = 'Manual override — forecast uses these edited assumptions.';
      }
      runAndRender();
    }
  });
  document.getElementById('historyPeriod').addEventListener('change', () => {
    [...holdingsRowsEl.querySelectorAll('tr')].forEach(row => {
      const data = marketCache.get(row.querySelector('.h-symbol').value);
      if (data) applyMarketToRow(row, data);
    });
    runAndRender();
  });
  document.getElementById('refreshMarket').addEventListener('click', () => {
    [...holdingsRowsEl.querySelectorAll('tr')].forEach(row => fetchHoldingRow(row, true));
    [...compareConfigRowsEl.querySelectorAll('.s-investment')].forEach(select => {
      if (select.value !== 'mix') fetchMarket(select.value, true).then(runAndRender).catch(runAndRender);
    });
  });
  [...holdingsRowsEl.querySelectorAll('tr')].forEach(row => fetchHoldingRow(row));
}
