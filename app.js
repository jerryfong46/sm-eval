const form = document.getElementById("sim-form");
const metricsEl = document.getElementById("metrics");
const yearlyRowsEl = document.getElementById("yearlyRows");
const chartCanvas = document.getElementById("chart");
const taxBracketEl = document.getElementById("taxBracket");
const taxRateEl = document.getElementById("taxRate");
const helocStrategyEl = document.getElementById("helocPaymentStrategy");
const helocPrincipalWrapEl = document.getElementById("helocPrincipalPaymentWrap");
const helocPrincipalPaymentEl = document.getElementById("helocPrincipalPayment");
const holdingsRowsEl = document.getElementById("holdingsRows");
const addHoldingEl = document.getElementById("addHolding");
const holdingRowTemplate = document.getElementById("holding-row-template");
const strategySummaryEl = document.getElementById("strategySummary");

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function monthlyPayment(principal, annualRate, months) {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function clampNumber(value, min) {
  if (!Number.isFinite(value)) return min;
  return Math.max(value, min);
}

function percentText(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function addHoldingRow(values = {}) {
  const row = holdingRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".h-symbol").value = values.symbol || "";
  row.querySelector(".h-allocation").value = values.allocation ?? 0;
  row.querySelector(".h-return").value = values.priceReturn ?? 6;
  row.querySelector(".h-dividend").value = values.dividendYield ?? 2;
  holdingsRowsEl.appendChild(row);
}

function loadDefaultHoldings() {
  if (holdingsRowsEl.children.length > 0) return;
  addHoldingRow({ symbol: "VFV", allocation: 60, priceReturn: 6.5, dividendYield: 1.3 });
  addHoldingRow({ symbol: "XEI", allocation: 40, priceReturn: 4.5, dividendYield: 5.0 });
}

function updateTaxRateFromBracket() {
  if (taxBracketEl.value === "custom") {
    taxRateEl.disabled = false;
    return;
  }
  taxRateEl.disabled = true;
  taxRateEl.value = (Number(taxBracketEl.value) * 100).toFixed(2);
}

function updateHelocPrincipalFieldVisibility() {
  const show = helocStrategyEl.value === "interest_plus_principal";
  helocPrincipalWrapEl.style.display = show ? "grid" : "none";
  if (!show) helocPrincipalPaymentEl.value = "0";
}

function parseHoldings() {
  const rows = [...holdingsRowsEl.querySelectorAll("tr")].map((row) => ({
    symbol: row.querySelector(".h-symbol").value.trim().toUpperCase(),
    allocation: clampNumber(Number(row.querySelector(".h-allocation").value), 0),
    priceReturn: Number(row.querySelector(".h-return").value) / 100,
    dividendYield: clampNumber(Number(row.querySelector(".h-dividend").value), 0) / 100,
  }));

  const activeRows = rows.filter(
    (row) => row.symbol || row.allocation > 0 || row.priceReturn !== 0 || row.dividendYield !== 0
  );

  return activeRows;
}

function weightedPortfolioAssumptions(holdings, fallbackPortfolioReturn) {
  const totalAllocation = holdings.reduce((sum, row) => sum + row.allocation, 0);

  if (totalAllocation <= 0) {
    return {
      weightedPriceReturn: fallbackPortfolioReturn,
      weightedDividendYield: 0,
      totalAllocation,
    };
  }

  const weightedPriceReturn = holdings.reduce(
    (sum, row) => sum + row.priceReturn * (row.allocation / totalAllocation),
    0
  );
  const weightedDividendYield = holdings.reduce(
    (sum, row) => sum + row.dividendYield * (row.allocation / totalAllocation),
    0
  );

  return {
    weightedPriceReturn,
    weightedDividendYield,
    totalAllocation,
  };
}

function parseInputs() {
  const v = (id) => Number(document.getElementById(id).value);
  const holdings = parseHoldings();

  const fallbackPortfolioReturn = v("fallbackPortfolioReturn") / 100;
  const weightedAssumptions = weightedPortfolioAssumptions(holdings, fallbackPortfolioReturn);

  return {
    mortgagePrincipal: clampNumber(v("mortgagePrincipal"), 0),
    mortgageRate: clampNumber(v("mortgageRate"), 0) / 100,
    amortYears: clampNumber(v("amortYears"), 1),
    extraPayment: clampNumber(v("extraPayment"), 0),
    horizonYears: clampNumber(v("horizonYears"), 1),
    startingPortfolio: clampNumber(v("startingPortfolio"), 0),
    helocRate: clampNumber(v("helocRate"), 0) / 100,
    taxRate: clampNumber(v("taxRate"), 0) / 100,
    homeValue: clampNumber(v("homeValue"), 0),
    dividendUse: document.getElementById("dividendUse").value,
    taxRefundUse: document.getElementById("taxRefundUse").value,
    helocPaymentStrategy: document.getElementById("helocPaymentStrategy").value,
    helocPrincipalPayment: clampNumber(v("helocPrincipalPayment"), 0),
    holdings,
    fallbackPortfolioReturn,
    weightedPriceReturn: weightedAssumptions.weightedPriceReturn,
    weightedDividendYield: weightedAssumptions.weightedDividendYield,
    holdingsAllocationTotal: weightedAssumptions.totalAllocation,
  };
}

function applyAmount(balance, amount) {
  const safeAmount = Math.max(0, amount);
  const applied = Math.min(balance, safeAmount);
  return {
    nextBalance: Math.max(0, balance - applied),
    applied,
    unused: safeAmount - applied,
  };
}

function runSimulation(inputs) {
  const totalMonths = Math.round(inputs.horizonYears * 12);
  const amortMonths = Math.round(inputs.amortYears * 12);
  const mortgageRateM = inputs.mortgageRate / 12;
  const helocRateM = inputs.helocRate / 12;
  const portfolioPriceRateM = inputs.weightedPriceReturn / 12;
  const portfolioDividendRateM = inputs.weightedDividendYield / 12;

  let mortgageBalance = inputs.mortgagePrincipal;
  let helocBalance = 0;
  let portfolio = inputs.startingPortfolio;

  let cumulativeHelocInterest = 0;
  let yearlyDeductibleInterest = 0;
  let cumulativeDividends = 0;
  let cumulativeTaxRefund = 0;
  let cumulativeHelocCashPayment = 0;

  let dividendsToPortfolio = 0;
  let dividendsToMortgage = 0;
  let dividendsToHeloc = 0;

  let taxRefundToPortfolio = 0;
  let taxRefundToMortgage = 0;
  let taxRefundToHeloc = 0;

  const scheduledMortgagePayment = monthlyPayment(
    mortgageBalance,
    inputs.mortgageRate,
    amortMonths
  );

  const timeline = [];

  for (let month = 1; month <= totalMonths; month += 1) {
    const mortgageInterest = mortgageBalance * mortgageRateM;
    const principalPayment = Math.min(
      mortgageBalance,
      Math.max(0, scheduledMortgagePayment + inputs.extraPayment - mortgageInterest)
    );
    mortgageBalance = Math.max(0, mortgageBalance - principalPayment);

    helocBalance += principalPayment;
    portfolio += principalPayment;

    const helocInterest = helocBalance * helocRateM;
    cumulativeHelocInterest += helocInterest;
    yearlyDeductibleInterest += helocInterest;

    let helocCashPayment = 0;
    if (inputs.helocPaymentStrategy === "self_capitalize") {
      helocBalance += helocInterest;
    } else if (inputs.helocPaymentStrategy === "interest_only_cashflow") {
      helocCashPayment += helocInterest;
    } else {
      helocCashPayment += helocInterest;
      const principalPay = Math.min(helocBalance, inputs.helocPrincipalPayment);
      helocBalance = Math.max(0, helocBalance - principalPay);
      helocCashPayment += principalPay;
    }
    cumulativeHelocCashPayment += helocCashPayment;

    portfolio *= 1 + portfolioPriceRateM;
    const dividends = Math.max(0, portfolio * portfolioDividendRateM);
    cumulativeDividends += dividends;

    if (inputs.dividendUse === "compound") {
      portfolio += dividends;
      dividendsToPortfolio += dividends;
    } else if (inputs.dividendUse === "repay_mortgage") {
      const result = applyAmount(mortgageBalance, dividends);
      mortgageBalance = result.nextBalance;
      dividendsToMortgage += result.applied;
    } else {
      const result = applyAmount(helocBalance, dividends);
      helocBalance = result.nextBalance;
      dividendsToHeloc += result.applied;
    }

    let taxRefundApplied = 0;
    if (month % 12 === 0 || month === totalMonths) {
      const taxRefund = Math.max(0, yearlyDeductibleInterest * inputs.taxRate);
      yearlyDeductibleInterest = 0;
      cumulativeTaxRefund += taxRefund;

      if (inputs.taxRefundUse === "reinvest") {
        portfolio += taxRefund;
        taxRefundToPortfolio += taxRefund;
        taxRefundApplied = taxRefund;
      } else if (inputs.taxRefundUse === "repay_mortgage") {
        const result = applyAmount(mortgageBalance, taxRefund);
        mortgageBalance = result.nextBalance;
        taxRefundToMortgage += result.applied;
        taxRefundApplied = result.applied;
      } else if (inputs.taxRefundUse === "pay_heloc") {
        const result = applyAmount(helocBalance, taxRefund);
        helocBalance = result.nextBalance;
        taxRefundToHeloc += result.applied;
        taxRefundApplied = result.applied;
      }
    }

    const homeEquity = inputs.homeValue - mortgageBalance;
    const netPosition = homeEquity + portfolio - helocBalance;

    timeline.push({
      month,
      year: Math.floor((month - 1) / 12) + 1,
      mortgageBalance,
      helocBalance,
      portfolio,
      homeEquity,
      netPosition,
      taxRefundApplied,
    });
  }

  const yearly = timeline.filter((entry) => entry.month % 12 === 0 || entry.month === totalMonths);
  const last = timeline[timeline.length - 1];

  return {
    yearly,
    summary: {
      finalMortgageBalance: last.mortgageBalance,
      finalHelocBalance: last.helocBalance,
      finalPortfolio: last.portfolio,
      finalNetPosition: last.netPosition,
      cumulativeHelocInterest,
      cumulativeHelocCashPayment,
      cumulativeDividends,
      cumulativeTaxRefund,
      weightedPriceReturn: inputs.weightedPriceReturn,
      weightedDividendYield: inputs.weightedDividendYield,
      dividendsToPortfolio,
      dividendsToMortgage,
      dividendsToHeloc,
      taxRefundToPortfolio,
      taxRefundToMortgage,
      taxRefundToHeloc,
    },
  };
}

function drawChart(yearly) {
  const ctx = chartCanvas.getContext("2d");
  const w = chartCanvas.width;
  const h = chartCanvas.height;
  const pad = { top: 20, right: 16, bottom: 30, left: 60 };

  ctx.clearRect(0, 0, w, h);
  if (!yearly.length) return;

  const values = yearly.flatMap((d) => [d.portfolio, d.helocBalance, d.netPosition]);
  let minY = Math.min(...values);
  let maxY = Math.max(...values);

  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  minY = Math.min(minY, 0);

  const x = (i) => {
    if (yearly.length === 1) return (w - pad.left - pad.right) / 2 + pad.left;
    return pad.left + (i / (yearly.length - 1)) * (w - pad.left - pad.right);
  };

  const y = (v) => pad.top + ((maxY - v) / (maxY - minY)) * (h - pad.top - pad.bottom);

  ctx.strokeStyle = "#d3dfe0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const gy = pad.top + (i / 4) * (h - pad.top - pad.bottom);
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();

    const value = maxY - (i / 4) * (maxY - minY);
    ctx.fillStyle = "#486061";
    ctx.font = "12px sans-serif";
    ctx.fillText(currency.format(value), 4, gy + 4);
  }

  const lines = [
    { key: "portfolio", color: "#2f8f82", label: "Portfolio" },
    { key: "helocBalance", color: "#d96a2b", label: "HELOC" },
    { key: "netPosition", color: "#2e4ccf", label: "Net" },
  ];

  for (const line of lines) {
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = line.color;
    yearly.forEach((point, i) => {
      const px = x(i);
      const py = y(point[line.key]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  let legendY = pad.top + 8;
  const legendX = pad.left + 10;
  lines.forEach((line) => {
    ctx.fillStyle = line.color;
    ctx.fillRect(legendX, legendY, 12, 12);
    ctx.fillStyle = "#132021";
    ctx.font = "12px sans-serif";
    ctx.fillText(line.label, legendX + 18, legendY + 11);
    legendY += 18;
  });

  ctx.fillStyle = "#486061";
  ctx.font = "12px sans-serif";
  ctx.fillText("Year", w / 2 - 14, h - 8);
}

function renderMetrics(summary) {
  const metricItems = [
    ["Final Mortgage", summary.finalMortgageBalance],
    ["Final HELOC", summary.finalHelocBalance],
    ["Final Portfolio", summary.finalPortfolio],
    ["Final Net Position", summary.finalNetPosition],
    ["Total HELOC Interest", summary.cumulativeHelocInterest],
    ["Total Tax Refund", summary.cumulativeTaxRefund],
    ["Weighted Price Return", percentText(summary.weightedPriceReturn)],
    ["Weighted Dividend Yield", percentText(summary.weightedDividendYield)],
  ];

  metricsEl.innerHTML = metricItems
    .map(([label, value]) => {
      const isNumber = typeof value === "number";
      const display = isNumber ? currency.format(value) : value;
      const cls = isNumber && value < 0 ? "negative" : "";
      return `<article class="metric"><h3>${label}</h3><p class="${cls}">${display}</p></article>`;
    })
    .join("");
}

function renderYearlyRows(yearly) {
  yearlyRowsEl.innerHTML = yearly
    .map((d) => {
      const netClass = d.netPosition < 0 ? "negative" : "";
      return `<tr>
        <td>${d.year}</td>
        <td>${currency.format(d.mortgageBalance)}</td>
        <td>${currency.format(d.helocBalance)}</td>
        <td>${currency.format(d.portfolio)}</td>
        <td>${currency.format(d.taxRefundApplied)}</td>
        <td class="${netClass}">${currency.format(d.netPosition)}</td>
      </tr>`;
    })
    .join("");
}

function labelForDividendUse(value) {
  if (value === "compound") return "Compound in portfolio";
  if (value === "repay_mortgage") return "Repay mortgage";
  return "Pay down HELOC";
}

function labelForTaxRefundUse(value) {
  if (value === "reinvest") return "Reinvest";
  if (value === "repay_mortgage") return "Repay mortgage";
  if (value === "pay_heloc") return "Pay down HELOC";
  return "Keep as cash";
}

function labelForHelocStrategy(value) {
  if (value === "self_capitalize") return "Self-capitalize";
  if (value === "interest_only_cashflow") return "Interest from cashflow";
  return "Interest + principal payment";
}

function renderStrategySummary(inputs, summary) {
  const sourceText =
    inputs.holdingsAllocationTotal > 0
      ? `${inputs.holdings.length} holdings`
      : "fallback return only";

  strategySummaryEl.textContent =
    `Portfolio assumptions: ${sourceText}, weighted return ${percentText(summary.weightedPriceReturn)}, ` +
    `weighted dividend yield ${percentText(summary.weightedDividendYield)}. ` +
    `Dividends: ${labelForDividendUse(inputs.dividendUse)}. ` +
    `Tax refund: ${labelForTaxRefundUse(inputs.taxRefundUse)}. ` +
    `HELOC strategy: ${labelForHelocStrategy(inputs.helocPaymentStrategy)}.`;
}

function runAndRender() {
  const inputs = parseInputs();
  const data = runSimulation(inputs);

  renderMetrics(data.summary);
  renderYearlyRows(data.yearly);
  drawChart(data.yearly);
  renderStrategySummary(inputs, data.summary);
}

holdingsRowsEl.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-holding")) return;
  const row = event.target.closest("tr");
  if (row) row.remove();
});

addHoldingEl.addEventListener("click", () => {
  addHoldingRow();
});

taxBracketEl.addEventListener("change", () => {
  updateTaxRateFromBracket();
});

helocStrategyEl.addEventListener("change", () => {
  updateHelocPrincipalFieldVisibility();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runAndRender();
});

loadDefaultHoldings();
updateTaxRateFromBracket();
updateHelocPrincipalFieldVisibility();
runAndRender();
