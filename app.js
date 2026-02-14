const form = document.getElementById("sim-form");
const metricsEl = document.getElementById("metrics");
const yearlyRowsEl = document.getElementById("yearlyRows");
const chartCanvas = document.getElementById("chart");
const compareSummaryRowsEl = document.getElementById("compareSummaryRows");
const compareYearlyHeadEl = document.getElementById("compareYearlyHead");
const compareYearlyRowsEl = document.getElementById("compareYearlyRows");
const compareChartCanvas = document.getElementById("compareChart");
const compareConfigRowsEl = document.getElementById("compareConfigRows");
const addScenarioEl = document.getElementById("addScenario");
const scenarioRowTemplate = document.getElementById("scenario-row-template");
const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];

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

const SCENARIO_COLOR_PALETTE = [
  "#4f6061",
  "#0f8a73",
  "#2e4ccf",
  "#d96a2b",
  "#8b4ad3",
  "#d14367",
  "#146b9f",
  "#537d17",
];

const DEFAULT_SCENARIOS = [
  {
    enabled: true,
    name: "A) Mortgage Only",
    enableSmith: false,
    dividendUse: "compound",
    taxRefundUse: "cash",
    helocPaymentStrategy: "self_capitalize",
    helocPrincipalPayment: 0,
    taxDividends: false,
    netTaxRefundOfDividendTax: false,
    compoundNetDividends: false,
  },
  {
    enabled: true,
    name: "B) Conservative Smith",
    enableSmith: true,
    dividendUse: "pay_heloc",
    taxRefundUse: "pay_heloc",
    helocPaymentStrategy: "self_capitalize",
    helocPrincipalPayment: 0,
    taxDividends: true,
    netTaxRefundOfDividendTax: true,
    compoundNetDividends: false,
  },
  {
    enabled: true,
    name: "C) Aggressive Smith",
    enableSmith: true,
    dividendUse: "compound",
    taxRefundUse: "repay_mortgage",
    helocPaymentStrategy: "self_capitalize",
    helocPrincipalPayment: 0,
    taxDividends: false,
    netTaxRefundOfDividendTax: false,
    compoundNetDividends: false,
  },
];

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

function clampRate(valuePercent) {
  return Math.min(1, clampNumber(valuePercent, 0) / 100);
}

function percentText(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function applyAmount(balance, amount) {
  const safeAmount = Math.max(0, amount);
  const applied = Math.min(balance, safeAmount);
  return {
    nextBalance: Math.max(0, balance - applied),
    applied,
  };
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
  addHoldingRow({ symbol: "XIU", allocation: 60, priceReturn: 5.8, dividendYield: 3.0 });
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

function activateTab(targetId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tabTarget === targetId);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function parseHoldings() {
  const rows = [...holdingsRowsEl.querySelectorAll("tr")].map((row) => ({
    symbol: row.querySelector(".h-symbol").value.trim().toUpperCase(),
    allocation: clampNumber(Number(row.querySelector(".h-allocation").value), 0),
    priceReturn: Number(row.querySelector(".h-return").value) / 100,
    dividendYield: clampNumber(Number(row.querySelector(".h-dividend").value), 0) / 100,
  }));

  return rows.filter(
    (row) => row.symbol || row.allocation > 0 || row.priceReturn !== 0 || row.dividendYield !== 0
  );
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

  const fallbackPortfolioReturn = Number(v("fallbackPortfolioReturn")) / 100;
  const weightedAssumptions = weightedPortfolioAssumptions(holdings, fallbackPortfolioReturn);

  return {
    mortgagePrincipal: clampNumber(v("mortgagePrincipal"), 0),
    mortgageRate: clampRate(v("mortgageRate")),
    amortYears: clampNumber(v("amortYears"), 1),
    extraPayment: clampNumber(v("extraPayment"), 0),
    horizonYears: clampNumber(v("horizonYears"), 1),
    startingPortfolio: clampNumber(v("startingPortfolio"), 0),
    helocRate: clampRate(v("helocRate")),
    taxRate: clampRate(v("taxRate")),
    dividendTaxRate: clampRate(v("dividendTaxRate")),
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

function updateScenarioRowPrincipalVisibility(row) {
  const strategy = row.querySelector(".s-heloc").value;
  const principalEl = row.querySelector(".s-heloc-principal");
  const show = strategy === "interest_plus_principal";
  principalEl.disabled = !show;
  if (!show) principalEl.value = "0";
}

function addScenarioRow(values = {}) {
  const row = scenarioRowTemplate.content.firstElementChild.cloneNode(true);

  row.querySelector(".s-enabled").checked = values.enabled ?? true;
  row.querySelector(".s-name").value = values.name || "";
  row.querySelector(".s-smith").checked = values.enableSmith ?? true;
  row.querySelector(".s-dividend").value = values.dividendUse || "compound";
  row.querySelector(".s-taxrefund").value = values.taxRefundUse || "reinvest";
  row.querySelector(".s-heloc").value = values.helocPaymentStrategy || "self_capitalize";
  row.querySelector(".s-heloc-principal").value = values.helocPrincipalPayment ?? 0;
  row.querySelector(".s-tax-div").checked = values.taxDividends ?? false;
  row.querySelector(".s-net-refund").checked = values.netTaxRefundOfDividendTax ?? false;
  row.querySelector(".s-net-div-compound").checked = values.compoundNetDividends ?? false;

  compareConfigRowsEl.appendChild(row);
  updateScenarioRowPrincipalVisibility(row);
}

function loadDefaultScenarios() {
  if (compareConfigRowsEl.children.length > 0) return;
  DEFAULT_SCENARIOS.forEach((scenario) => addScenarioRow(scenario));
}

function parseScenarioConfigs() {
  const rows = [...compareConfigRowsEl.querySelectorAll("tr")];

  return rows.map((row, index) => {
    const name = row.querySelector(".s-name").value.trim() || `Scenario ${index + 1}`;

    return {
      enabled: row.querySelector(".s-enabled").checked,
      name,
      enableSmith: row.querySelector(".s-smith").checked,
      dividendUse: row.querySelector(".s-dividend").value,
      taxRefundUse: row.querySelector(".s-taxrefund").value,
      helocPaymentStrategy: row.querySelector(".s-heloc").value,
      helocPrincipalPayment: clampNumber(Number(row.querySelector(".s-heloc-principal").value), 0),
      taxDividends: row.querySelector(".s-tax-div").checked,
      netTaxRefundOfDividendTax: row.querySelector(".s-net-refund").checked,
      compoundNetDividends: row.querySelector(".s-net-div-compound").checked,
    };
  });
}

function runCustomSimulation(inputs) {
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
  let cumulativeTaxRefund = 0;

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

    if (inputs.helocPaymentStrategy === "self_capitalize") {
      helocBalance += helocInterest;
    } else if (inputs.helocPaymentStrategy === "interest_plus_principal") {
      const principalPay = Math.min(helocBalance, inputs.helocPrincipalPayment);
      helocBalance = Math.max(0, helocBalance - principalPay);
    }

    portfolio *= 1 + portfolioPriceRateM;
    const dividends = Math.max(0, portfolio * portfolioDividendRateM);

    if (inputs.dividendUse === "compound") {
      portfolio += dividends;
    } else if (inputs.dividendUse === "repay_mortgage") {
      const result = applyAmount(mortgageBalance, dividends);
      mortgageBalance = result.nextBalance;
    } else {
      const result = applyAmount(helocBalance, dividends);
      helocBalance = result.nextBalance;
    }

    let taxRefundApplied = 0;
    if (month % 12 === 0 || month === totalMonths) {
      const taxRefund = Math.max(0, yearlyDeductibleInterest * inputs.taxRate);
      yearlyDeductibleInterest = 0;
      cumulativeTaxRefund += taxRefund;

      if (inputs.taxRefundUse === "reinvest") {
        portfolio += taxRefund;
        taxRefundApplied = taxRefund;
      } else if (inputs.taxRefundUse === "repay_mortgage") {
        const result = applyAmount(mortgageBalance, taxRefund);
        mortgageBalance = result.nextBalance;
        taxRefundApplied = result.applied;
      } else if (inputs.taxRefundUse === "pay_heloc") {
        const result = applyAmount(helocBalance, taxRefund);
        helocBalance = result.nextBalance;
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
      cumulativeTaxRefund,
      weightedPriceReturn: inputs.weightedPriceReturn,
      weightedDividendYield: inputs.weightedDividendYield,
    },
  };
}

function runScenarioSimulation(inputs, scenario) {
  const totalMonths = Math.round(inputs.horizonYears * 12);
  const amortMonths = Math.round(inputs.amortYears * 12);
  const mortgageRateM = inputs.mortgageRate / 12;
  const helocRateM = inputs.helocRate / 12;
  const portfolioPriceRateM = inputs.weightedPriceReturn / 12;
  const portfolioDividendRateM = inputs.weightedDividendYield / 12;

  let mortgageBalance = inputs.mortgagePrincipal;
  let helocBalance = 0;
  let portfolio = inputs.startingPortfolio;

  let yearlyDeductibleInterest = 0;
  let yearlyDividendTaxPaid = 0;

  let cumulativeHelocInterest = 0;
  let cumulativeTaxRefund = 0;

  const timeline = [];

  const scheduledMortgagePayment = monthlyPayment(
    mortgageBalance,
    inputs.mortgageRate,
    amortMonths
  );

  for (let month = 1; month <= totalMonths; month += 1) {
    const mortgageInterest = mortgageBalance * mortgageRateM;
    const principalPayment = Math.min(
      mortgageBalance,
      Math.max(0, scheduledMortgagePayment + inputs.extraPayment - mortgageInterest)
    );
    mortgageBalance = Math.max(0, mortgageBalance - principalPayment);

    if (scenario.enableSmith) {
      helocBalance += principalPayment;
      portfolio += principalPayment;
    }

    const helocInterest = helocBalance * helocRateM;
    cumulativeHelocInterest += helocInterest;
    yearlyDeductibleInterest += helocInterest;

    if (scenario.helocPaymentStrategy === "self_capitalize") {
      helocBalance += helocInterest;
    } else if (scenario.helocPaymentStrategy === "interest_plus_principal") {
      const principalResult = applyAmount(helocBalance, scenario.helocPrincipalPayment);
      helocBalance = principalResult.nextBalance;
    }

    portfolio *= 1 + portfolioPriceRateM;

    const dividendsGross = Math.max(0, portfolio * portfolioDividendRateM);
    const dividendTax = scenario.taxDividends ? dividendsGross * inputs.dividendTaxRate : 0;
    const dividendsNet = Math.max(0, dividendsGross - dividendTax);
    yearlyDividendTaxPaid += dividendTax;

    if (scenario.dividendUse === "compound") {
      const compoundAmount =
        scenario.taxDividends || scenario.compoundNetDividends ? dividendsNet : dividendsGross;
      portfolio += compoundAmount;
    } else if (scenario.dividendUse === "repay_mortgage") {
      const result = applyAmount(mortgageBalance, dividendsNet);
      mortgageBalance = result.nextBalance;
    } else if (scenario.dividendUse === "pay_heloc") {
      const result = applyAmount(helocBalance, dividendsNet);
      helocBalance = result.nextBalance;
    }

    let taxRefundApplied = 0;
    if (month % 12 === 0 || month === totalMonths) {
      const grossTaxRefund = Math.max(0, yearlyDeductibleInterest * inputs.taxRate);
      const netTaxRefund = scenario.netTaxRefundOfDividendTax
        ? Math.max(0, grossTaxRefund - yearlyDividendTaxPaid)
        : grossTaxRefund;

      cumulativeTaxRefund += netTaxRefund;

      if (scenario.taxRefundUse === "reinvest") {
        portfolio += netTaxRefund;
        taxRefundApplied = netTaxRefund;
      } else if (scenario.taxRefundUse === "repay_mortgage") {
        const result = applyAmount(mortgageBalance, netTaxRefund);
        mortgageBalance = result.nextBalance;
        taxRefundApplied = result.applied;
      } else if (scenario.taxRefundUse === "pay_heloc") {
        const result = applyAmount(helocBalance, netTaxRefund);
        helocBalance = result.nextBalance;
        taxRefundApplied = result.applied;
      }

      yearlyDeductibleInterest = 0;
      yearlyDividendTaxPaid = 0;
    }

    const homeEquity = inputs.homeValue - mortgageBalance;
    const netPosition = homeEquity + portfolio - helocBalance;

    timeline.push({
      month,
      year: Math.floor((month - 1) / 12) + 1,
      mortgageBalance,
      helocBalance,
      portfolio,
      netPosition,
      taxRefundApplied,
    });
  }

  const yearly = timeline.filter((entry) => entry.month % 12 === 0 || entry.month === totalMonths);
  const last = timeline[timeline.length - 1];

  return {
    scenario,
    yearly,
    summary: {
      finalMortgageBalance: last.mortgageBalance,
      finalHelocBalance: last.helocBalance,
      finalPortfolio: last.portfolio,
      finalNetPosition: last.netPosition,
      cumulativeHelocInterest,
      cumulativeTaxRefund,
    },
  };
}

function runComparison(inputs) {
  const scenarios = parseScenarioConfigs().filter((scenario) => scenario.enabled);

  return scenarios.map((scenario, index) => {
    const withColor = {
      ...scenario,
      color: SCENARIO_COLOR_PALETTE[index % SCENARIO_COLOR_PALETTE.length],
    };
    return runScenarioSimulation(inputs, withColor);
  });
}

function drawCustomChart(yearly) {
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
}

function drawComparisonChart(results) {
  const ctx = compareChartCanvas.getContext("2d");
  const w = compareChartCanvas.width;
  const h = compareChartCanvas.height;
  const pad = { top: 20, right: 16, bottom: 30, left: 60 };

  ctx.clearRect(0, 0, w, h);
  if (!results.length) return;

  const values = results.flatMap((result) => result.yearly.map((d) => d.netPosition));
  let minY = Math.min(...values);
  let maxY = Math.max(...values);

  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  minY = Math.min(minY, 0);

  const points = results[0].yearly;
  const x = (i) => {
    if (points.length === 1) return (w - pad.left - pad.right) / 2 + pad.left;
    return pad.left + (i / (points.length - 1)) * (w - pad.left - pad.right);
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

  results.forEach((result) => {
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = result.scenario.color;
    result.yearly.forEach((point, i) => {
      const px = x(i);
      const py = y(point.netPosition);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  let legendY = pad.top + 8;
  const legendX = pad.left + 10;
  results.forEach((result) => {
    ctx.fillStyle = result.scenario.color;
    ctx.fillRect(legendX, legendY, 12, 12);
    ctx.fillStyle = "#132021";
    ctx.font = "12px sans-serif";
    ctx.fillText(result.scenario.name, legendX + 18, legendY + 11);
    legendY += 18;
  });
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

function renderComparisonSummary(results) {
  if (!results.length) {
    compareSummaryRowsEl.innerHTML =
      '<tr><td colspan="5" style="text-align:left;">Enable at least one scenario to compare.</td></tr>';
    return;
  }

  compareSummaryRowsEl.innerHTML = results
    .map((result) => {
      const netClass = result.summary.finalNetPosition < 0 ? "negative" : "";
      return `<tr>
        <td>${result.scenario.name}</td>
        <td>${currency.format(result.summary.finalMortgageBalance)}</td>
        <td>${currency.format(result.summary.finalHelocBalance)}</td>
        <td>${currency.format(result.summary.finalPortfolio)}</td>
        <td class="${netClass}">${currency.format(result.summary.finalNetPosition)}</td>
      </tr>`;
    })
    .join("");
}

function renderComparisonYearlyRows(results) {
  if (!results.length) {
    compareYearlyHeadEl.innerHTML = "<tr><th>Year</th></tr>";
    compareYearlyRowsEl.innerHTML = "";
    return;
  }

  compareYearlyHeadEl.innerHTML =
    `<tr><th>Year</th>${results.map((result) => `<th>${result.scenario.name} Net</th>`).join("")}</tr>`;

  const years = results[0].yearly;
  compareYearlyRowsEl.innerHTML = years
    .map((yearRow, idx) => {
      const valueCells = results
        .map((result) => `<td>${currency.format(result.yearly[idx].netPosition)}</td>`)
        .join("");
      return `<tr><td>${yearRow.year}</td>${valueCells}</tr>`;
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
  const custom = runCustomSimulation(inputs);
  const comparison = runComparison(inputs);

  renderMetrics(custom.summary);
  renderYearlyRows(custom.yearly);
  drawCustomChart(custom.yearly);
  renderStrategySummary(inputs, custom.summary);

  renderComparisonSummary(comparison);
  renderComparisonYearlyRows(comparison);
  drawComparisonChart(comparison);
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

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tabTarget);
  });
});

compareConfigRowsEl.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-scenario")) return;
  const row = event.target.closest("tr");
  if (!row) return;
  row.remove();
  runAndRender();
});

compareConfigRowsEl.addEventListener("change", (event) => {
  const row = event.target.closest("tr");
  if (!row) return;
  if (event.target.classList.contains("s-heloc")) {
    updateScenarioRowPrincipalVisibility(row);
  }
  runAndRender();
});

addScenarioEl.addEventListener("click", () => {
  const nextIndex = compareConfigRowsEl.querySelectorAll("tr").length + 1;
  addScenarioRow({
    enabled: true,
    name: `Custom ${nextIndex}`,
    enableSmith: true,
    dividendUse: "compound",
    taxRefundUse: "reinvest",
    helocPaymentStrategy: "self_capitalize",
    helocPrincipalPayment: 0,
    taxDividends: false,
    netTaxRefundOfDividendTax: false,
    compoundNetDividends: false,
  });
  runAndRender();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runAndRender();
});

loadDefaultHoldings();
loadDefaultScenarios();
updateTaxRateFromBracket();
updateHelocPrincipalFieldVisibility();
activateTab("customTabPanel");
runAndRender();
