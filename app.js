const form = document.getElementById("sim-form");
const metricsEl = document.getElementById("metrics");
const yearlyRowsEl = document.getElementById("yearlyRows");
const chartCanvas = document.getElementById("chart");
const compareSummaryRowsEl = document.getElementById("compareSummaryRows");
const compareYearlyHeadEl = document.getElementById("compareYearlyHead");
const compareYearlyRowsEl = document.getElementById("compareYearlyRows");
const compareChartCanvas = document.getElementById("compareChart");
const sensitivityMatrixRowsEl = document.getElementById("sensitivityMatrixRows");
const sensitivityBreakEvenEl = document.getElementById("sensitivityBreakEven");
const sensitivityHeatmapHeadEl = document.getElementById("sensitivityHeatmapHead");
const sensitivityHeatmapRowsEl = document.getElementById("sensitivityHeatmapRows");
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
    taxDividends: true,
    netTaxRefundOfDividendTax: true,
    compoundNetDividends: true,
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
    compoundNetDividends: true,
  },
  {
    enabled: true,
    name: "C) Aggressive Smith",
    enableSmith: true,
    dividendUse: "compound",
    taxRefundUse: "repay_mortgage",
    helocPaymentStrategy: "self_capitalize",
    helocPrincipalPayment: 0,
    taxDividends: true,
    netTaxRefundOfDividendTax: true,
    compoundNetDividends: true,
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

function clampAnnualReturn(valueDecimal) {
  return Math.min(1, Math.max(-0.99, valueDecimal));
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

function applyAmountWithRemainder(balance, amount) {
  const safeAmount = Math.max(0, amount);
  const { nextBalance, applied } = applyAmount(balance, safeAmount);
  return {
    nextBalance,
    applied,
    remainder: Math.max(0, safeAmount - applied),
  };
}

function estimateLiquidationTax(portfolioValue, costBasis, marginalTaxRate, inclusionRate) {
  const unrealizedGain = Math.max(0, portfolioValue - costBasis);
  return unrealizedGain * inclusionRate * marginalTaxRate;
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
  addHoldingRow({ symbol: "RY", allocation: 50, priceReturn: 6.5, dividendYield: 3.8 });
  addHoldingRow({ symbol: "TD", allocation: 50, priceReturn: 6.0, dividendYield: 4.1 });
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
    startingPortfolioAcb: clampNumber(v("startingPortfolioAcb"), 0),
    helocRate: clampRate(v("helocRate")),
    taxRate: clampRate(v("taxRate")),
    dividendTaxRate: clampRate(v("dividendTaxRate")),
    capitalGainsInclusionRate: clampRate(v("capitalGainsInclusionRate")),
    taxRefundLagMonths: Math.round(clampNumber(v("taxRefundLagMonths"), 0)),
    taxDividends: document.getElementById("taxDividends").value === "yes",
    netTaxRefundOfDividendTax: document.getElementById("netTaxRefundOfDividendTax").value === "yes",
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

function buildCustomScenario(inputs) {
  return {
    name: "Custom Strategy",
    enableSmith: true,
    dividendUse: inputs.dividendUse,
    taxRefundUse: inputs.taxRefundUse,
    helocPaymentStrategy: inputs.helocPaymentStrategy,
    helocPrincipalPayment: inputs.helocPrincipalPayment,
    taxDividends: inputs.taxDividends,
    netTaxRefundOfDividendTax: inputs.netTaxRefundOfDividendTax,
    compoundNetDividends: true,
  };
}

function runCustomSimulation(inputs) {
  const result = runScenarioSimulation(inputs, buildCustomScenario(inputs));
  return {
    yearly: result.yearly,
    summary: {
      ...result.summary,
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
  let portfolioCostBasis = inputs.startingPortfolioAcb;
  let cashBalance = 0;

  let yearlyDeductibleInterest = 0;
  let yearlyDividendTaxPaid = 0;

  let cumulativeHelocInterest = 0;
  let cumulativeTaxRefund = 0;
  let cumulativeExternalContributions = 0;
  let maxHelocBalance = helocBalance;
  let currentYearHelocInterest = 0;
  let peakAnnualHelocInterest = 0;
  let pendingTaxRefunds = [];

  const timeline = [];

  const scheduledMortgagePayment = monthlyPayment(
    mortgageBalance,
    inputs.mortgageRate,
    amortMonths
  );

  const reborrowIntoPortfolio = (amount) => {
    if (!scenario.enableSmith) return;
    const borrowAmount = Math.max(0, amount);
    if (borrowAmount <= 0) return;
    helocBalance += borrowAmount;
    portfolio += borrowAmount;
    portfolioCostBasis += borrowAmount;
  };

  for (let month = 1; month <= totalMonths; month += 1) {
    const mortgageInterest = mortgageBalance * mortgageRateM;
    const principalPayment = Math.min(
      mortgageBalance,
      Math.max(0, scheduledMortgagePayment + inputs.extraPayment - mortgageInterest)
    );
    mortgageBalance = Math.max(0, mortgageBalance - principalPayment);

    reborrowIntoPortfolio(principalPayment);

    const helocInterest = helocBalance * helocRateM;
    cumulativeHelocInterest += helocInterest;
    yearlyDeductibleInterest += helocInterest;
    currentYearHelocInterest += helocInterest;

    if (scenario.helocPaymentStrategy === "self_capitalize") {
      helocBalance += helocInterest;
    } else if (scenario.helocPaymentStrategy === "interest_only_cashflow") {
      cumulativeExternalContributions += helocInterest;
    } else if (scenario.helocPaymentStrategy === "interest_plus_principal") {
      cumulativeExternalContributions += helocInterest;
      const principalResult = applyAmountWithRemainder(helocBalance, scenario.helocPrincipalPayment);
      helocBalance = principalResult.nextBalance;
      cumulativeExternalContributions += principalResult.applied;
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
      portfolioCostBasis += compoundAmount;
    } else if (scenario.dividendUse === "repay_mortgage") {
      const result = applyAmountWithRemainder(mortgageBalance, dividendsNet);
      mortgageBalance = result.nextBalance;
      reborrowIntoPortfolio(result.applied);
      cashBalance += result.remainder;
    } else if (scenario.dividendUse === "pay_heloc") {
      const result = applyAmountWithRemainder(helocBalance, dividendsNet);
      helocBalance = result.nextBalance;
      cashBalance += result.remainder;
    }

    let taxRefundApplied = 0;
    if (month % 12 === 0 || month === totalMonths) {
      peakAnnualHelocInterest = Math.max(peakAnnualHelocInterest, currentYearHelocInterest);
      currentYearHelocInterest = 0;
      const grossTaxRefund = Math.max(0, yearlyDeductibleInterest * inputs.taxRate);
      const netTaxRefund = scenario.netTaxRefundOfDividendTax
        ? Math.max(0, grossTaxRefund - yearlyDividendTaxPaid)
        : grossTaxRefund;
      if (netTaxRefund > 0) {
        pendingTaxRefunds.push({
          dueMonth: month + inputs.taxRefundLagMonths,
          amount: netTaxRefund,
        });
      }

      yearlyDeductibleInterest = 0;
      yearlyDividendTaxPaid = 0;
    }

    let taxRefundReceived = 0;
    pendingTaxRefunds = pendingTaxRefunds.filter((item) => {
      if (item.dueMonth <= month) {
        taxRefundReceived += item.amount;
        return false;
      }
      return true;
    });

    if (taxRefundReceived > 0) {
      cumulativeTaxRefund += taxRefundReceived;
      if (scenario.taxRefundUse === "reinvest") {
        portfolio += taxRefundReceived;
        portfolioCostBasis += taxRefundReceived;
        taxRefundApplied = taxRefundReceived;
      } else if (scenario.taxRefundUse === "repay_mortgage") {
        const result = applyAmountWithRemainder(mortgageBalance, taxRefundReceived);
        mortgageBalance = result.nextBalance;
        reborrowIntoPortfolio(result.applied);
        taxRefundApplied = result.applied;
        cashBalance += result.remainder;
      } else if (scenario.taxRefundUse === "pay_heloc") {
        const result = applyAmountWithRemainder(helocBalance, taxRefundReceived);
        helocBalance = result.nextBalance;
        taxRefundApplied = result.applied;
        cashBalance += result.remainder;
      } else if (scenario.taxRefundUse === "cash") {
        cashBalance += taxRefundReceived;
      }
    }

    const pendingTaxRefundReceivable = pendingTaxRefunds.reduce((sum, item) => sum + item.amount, 0);

    const homeEquity = inputs.homeValue - mortgageBalance;
    const smithValuePreTax =
      portfolio +
      cashBalance +
      pendingTaxRefundReceivable -
      helocBalance -
      cumulativeExternalContributions;
    const liquidationTax = estimateLiquidationTax(
      portfolio,
      portfolioCostBasis,
      inputs.taxRate,
      inputs.capitalGainsInclusionRate
    );
    const smithValueAfterTax =
      (portfolio - liquidationTax) +
      cashBalance +
      pendingTaxRefundReceivable -
      helocBalance -
      cumulativeExternalContributions;
    const netPosition = homeEquity + smithValuePreTax;
    const netAfterTax = homeEquity + smithValueAfterTax;
    maxHelocBalance = Math.max(maxHelocBalance, helocBalance);

    timeline.push({
      month,
      year: Math.floor((month - 1) / 12) + 1,
      mortgageBalance,
      helocBalance,
      portfolio,
      smithValuePreTax,
      smithValueAfterTax,
      netPosition,
      netAfterTax,
      liquidationTax,
      taxRefundApplied,
      cashBalance,
      pendingTaxRefundReceivable,
      cumulativeExternalContributions,
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
      finalSmithValuePreTax: last.smithValuePreTax,
      finalSmithValueAfterTax: last.smithValueAfterTax,
      finalPreTaxNetPosition: last.netPosition,
      finalAfterTaxNetPosition: last.netAfterTax,
      finalEstimatedLiquidationTax: last.liquidationTax,
      finalCashBalance: last.cashBalance,
      pendingTaxRefundReceivable: last.pendingTaxRefundReceivable,
      cumulativeExternalContributions: last.cumulativeExternalContributions,
      maxHelocBalance,
      peakAnnualHelocInterest,
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

function buildCurrentPlanScenario(inputs) {
  return {
    name: "Current Plan",
    enableSmith: true,
    dividendUse: inputs.dividendUse,
    taxRefundUse: inputs.taxRefundUse,
    helocPaymentStrategy: inputs.helocPaymentStrategy,
    helocPrincipalPayment: inputs.helocPrincipalPayment,
    taxDividends: inputs.taxDividends,
    netTaxRefundOfDividendTax: inputs.netTaxRefundOfDividendTax,
    compoundNetDividends: true,
  };
}

function withInputAdjustments(inputs, adjustments = {}) {
  return {
    ...inputs,
    weightedPriceReturn: clampAnnualReturn(
      (inputs.weightedPriceReturn ?? 0) + (adjustments.weightedPriceReturnDelta ?? 0)
    ),
    weightedDividendYield: Math.max(
      0,
      (inputs.weightedDividendYield ?? 0) * (adjustments.dividendYieldMultiplier ?? 1)
    ),
    helocRate: Math.max(0, (inputs.helocRate ?? 0) + (adjustments.helocRateDelta ?? 0)),
    mortgageRate: Math.max(0, (inputs.mortgageRate ?? 0) + (adjustments.mortgageRateDelta ?? 0)),
  };
}

function countYearsBelowBaseline(result, baseline) {
  const years = Math.min(result.yearly.length, baseline.yearly.length);
  let count = 0;
  for (let i = 0; i < years; i += 1) {
    if (result.yearly[i].netAfterTax < baseline.yearly[i].netAfterTax) {
      count += 1;
    }
  }
  return count;
}

function calculateBreakEvenReturn(inputs, scenario, baselineScenario) {
  const deltaAtReturn = (annualReturn) => {
    const adjustedInputs = { ...inputs, weightedPriceReturn: clampAnnualReturn(annualReturn) };
    const strategyNet = runScenarioSimulation(adjustedInputs, scenario).summary.finalAfterTaxNetPosition;
    const baselineNet = runScenarioSimulation(adjustedInputs, baselineScenario).summary.finalAfterTaxNetPosition;
    return strategyNet - baselineNet;
  };

  let low = -0.1;
  let high = 0.2;
  let lowDelta = deltaAtReturn(low);
  let highDelta = deltaAtReturn(high);

  if (lowDelta >= 0) {
    return { status: "below_range", value: low };
  }
  if (highDelta <= 0) {
    return { status: "above_range", value: high };
  }

  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    const midDelta = deltaAtReturn(mid);
    if (midDelta < 0) {
      low = mid;
      lowDelta = midDelta;
    } else {
      high = mid;
      highDelta = midDelta;
    }
  }

  return {
    status: "ok",
    value: (low + high) / 2,
    lowDelta,
    highDelta,
  };
}

function buildSensitivityHeatmap(inputs, currentScenario, baselineScenario) {
  const returnAdjustments = [-0.04, -0.02, 0, 0.02, 0.04];
  const helocAdjustments = [-0.02, -0.01, 0, 0.01, 0.02];

  const rows = returnAdjustments.map((returnAdj) => {
    const cells = helocAdjustments.map((helocAdj) => {
      const adjustedInputs = withInputAdjustments(inputs, {
        weightedPriceReturnDelta: returnAdj,
        helocRateDelta: helocAdj,
      });
      const result = runScenarioSimulation(adjustedInputs, currentScenario);
      const baseline = runScenarioSimulation(adjustedInputs, baselineScenario);
      const delta = result.summary.finalAfterTaxNetPosition - baseline.summary.finalAfterTaxNetPosition;
      return {
        helocAdj,
        delta,
      };
    });
    return {
      returnAdj,
      cells,
    };
  });

  return {
    helocAdjustments,
    rows,
  };
}

function runSensitivity(inputs) {
  const baselineScenario = {
    name: "Mortgage-only Baseline",
    enableSmith: false,
    dividendUse: "compound",
    taxRefundUse: "cash",
    helocPaymentStrategy: "self_capitalize",
    helocPrincipalPayment: 0,
    taxDividends: inputs.taxDividends,
    netTaxRefundOfDividendTax: inputs.netTaxRefundOfDividendTax,
    compoundNetDividends: true,
  };
  const currentScenario = buildCurrentPlanScenario(inputs);
  const conservativeScenario = {
    ...DEFAULT_SCENARIOS[1],
    name: "Conservative Smith",
    taxDividends: inputs.taxDividends,
    netTaxRefundOfDividendTax: inputs.netTaxRefundOfDividendTax,
    compoundNetDividends: true,
  };
  const stressScenario = {
    ...currentScenario,
    name: "Stress (lower return, higher rates)",
  };
  const upsideScenario = {
    ...currentScenario,
    name: "Upside (higher return, lower rates)",
  };

  const baselineResult = runScenarioSimulation(inputs, baselineScenario);
  const currentResult = runScenarioSimulation(inputs, currentScenario);
  const conservativeResult = runScenarioSimulation(inputs, conservativeScenario);
  const stressInputs = withInputAdjustments(inputs, {
    weightedPriceReturnDelta: -0.03,
    helocRateDelta: 0.015,
    mortgageRateDelta: 0.01,
    dividendYieldMultiplier: 0.7,
  });
  const stressResult = runScenarioSimulation(
    stressInputs,
    stressScenario
  );
  const stressBaselineResult = runScenarioSimulation(stressInputs, baselineScenario);
  const upsideInputs = withInputAdjustments(inputs, {
    weightedPriceReturnDelta: 0.02,
    helocRateDelta: -0.01,
    mortgageRateDelta: -0.005,
    dividendYieldMultiplier: 1.2,
  });
  const upsideResult = runScenarioSimulation(
    upsideInputs,
    upsideScenario
  );
  const upsideBaselineResult = runScenarioSimulation(upsideInputs, baselineScenario);

  const matrix = [
    { result: baselineResult, baseline: baselineResult },
    { result: currentResult, baseline: baselineResult },
    { result: conservativeResult, baseline: baselineResult },
    { result: stressResult, baseline: stressBaselineResult },
    { result: upsideResult, baseline: upsideBaselineResult },
  ].map(({ result, baseline }) => ({
    ...result,
    deltaVsBaseline: result.summary.finalAfterTaxNetPosition - baseline.summary.finalAfterTaxNetPosition,
    yearsBelowBaseline: countYearsBelowBaseline(result, baseline),
  }));

  const breakEven = calculateBreakEvenReturn(inputs, currentScenario, baselineScenario);
  const heatmap = buildSensitivityHeatmap(inputs, currentScenario, baselineScenario);

  return {
    matrix,
    breakEven,
    heatmap,
  };
}

function drawCustomChart(yearly) {
  const ctx = chartCanvas.getContext("2d");
  const w = chartCanvas.width;
  const h = chartCanvas.height;
  const pad = { top: 20, right: 16, bottom: 30, left: 60 };

  ctx.clearRect(0, 0, w, h);
  if (!yearly.length) return;

  const values = yearly.flatMap((d) => [d.portfolio, d.helocBalance, d.netAfterTax]);
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
    { key: "netAfterTax", color: "#2e4ccf", label: "After-tax Economic Net" },
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

  const values = results.flatMap((result) => result.yearly.map((d) => d.netAfterTax));
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
      const py = y(point.netAfterTax);
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
    ["Final Smith-Only Value (After-tax)", summary.finalSmithValueAfterTax],
    ["Final Net Position (Pre-tax)", summary.finalPreTaxNetPosition],
    ["Est. Liquidation Tax", summary.finalEstimatedLiquidationTax],
    ["Final After-tax Economic Closeout Net", summary.finalAfterTaxNetPosition],
    ["Ending Cash (Uninvested)", summary.finalCashBalance],
    ["Pending Tax Refund Receivable", summary.pendingTaxRefundReceivable],
    ["External Cash Required", summary.cumulativeExternalContributions],
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
      const netClass = d.netAfterTax < 0 ? "negative" : "";
      const smithClass = d.smithValueAfterTax < 0 ? "negative" : "";
      return `<tr>
        <td>${d.year}</td>
        <td>${currency.format(d.mortgageBalance)}</td>
        <td>${currency.format(d.helocBalance)}</td>
        <td>${currency.format(d.portfolio)}</td>
        <td>${currency.format(d.taxRefundApplied)}</td>
        <td>${currency.format(d.netPosition)}</td>
        <td class="${netClass}">${currency.format(d.netAfterTax)}</td>
        <td class="${smithClass}">${currency.format(d.smithValueAfterTax)}</td>
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
      const netClass = result.summary.finalAfterTaxNetPosition < 0 ? "negative" : "";
      return `<tr>
        <td>${result.scenario.name}</td>
        <td>${currency.format(result.summary.finalMortgageBalance)}</td>
        <td>${currency.format(result.summary.finalHelocBalance)}</td>
        <td>${currency.format(result.summary.finalPortfolio)}</td>
        <td class="${netClass}">${currency.format(result.summary.finalAfterTaxNetPosition)}</td>
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
    `<tr><th>Year</th>${results
      .map((result) => `<th>${result.scenario.name} After-tax Economic Net</th>`)
      .join("")}</tr>`;

  const years = results[0].yearly;
  compareYearlyRowsEl.innerHTML = years
    .map((yearRow, idx) => {
      const valueCells = results
        .map((result) => `<td>${currency.format(result.yearly[idx].netAfterTax)}</td>`)
        .join("");
      return `<tr><td>${yearRow.year}</td>${valueCells}</tr>`;
    })
    .join("");
}

function formatSignedCurrency(value) {
  const abs = currency.format(Math.abs(value));
  return value >= 0 ? `+${abs}` : `-${abs}`;
}

function renderSensitivityMatrix(matrix) {
  sensitivityMatrixRowsEl.innerHTML = matrix
    .map((row) => {
      const deltaClass = row.deltaVsBaseline < 0 ? "negative" : "";
      return `<tr>
        <td>${row.scenario.name}</td>
        <td>${currency.format(row.summary.finalAfterTaxNetPosition)}</td>
        <td class="${deltaClass}">${formatSignedCurrency(row.deltaVsBaseline)}</td>
        <td>${currency.format(row.summary.maxHelocBalance)}</td>
        <td>${currency.format(row.summary.peakAnnualHelocInterest)}</td>
        <td>${row.yearsBelowBaseline}</td>
      </tr>`;
    })
    .join("");
}

function renderBreakEven(breakEven) {
  const pct = `${(breakEven.value * 100).toFixed(2)}%`;
  if (breakEven.status === "below_range") {
    sensitivityBreakEvenEl.textContent = `< ${pct} (below tested range)`;
    return;
  }
  if (breakEven.status === "above_range") {
    sensitivityBreakEvenEl.textContent = `> ${pct} (above tested range)`;
    return;
  }
  sensitivityBreakEvenEl.textContent = pct;
}

function renderSensitivityHeatmap(heatmap) {
  sensitivityHeatmapHeadEl.innerHTML =
    `<tr><th>Return \\ HELOC</th>${heatmap.helocAdjustments
      .map((adj) => `<th>${adj >= 0 ? "+" : ""}${(adj * 100).toFixed(1)}%</th>`)
      .join("")}</tr>`;

  const maxAbs = Math.max(
    1,
    ...heatmap.rows.flatMap((row) => row.cells.map((cell) => Math.abs(cell.delta)))
  );

  sensitivityHeatmapRowsEl.innerHTML = heatmap.rows
    .map((row) => {
      const label = `${row.returnAdj >= 0 ? "+" : ""}${(row.returnAdj * 100).toFixed(1)}%`;
      const cells = row.cells
        .map((cell) => {
          const intensity = Math.min(1, Math.abs(cell.delta) / maxAbs);
          const alpha = 0.12 + 0.35 * intensity;
          const background =
            cell.delta >= 0 ? `rgba(20, 120, 80, ${alpha})` : `rgba(180, 60, 60, ${alpha})`;
          const textColor = cell.delta >= 0 ? "#0a3f2a" : "#5c1111";
          return `<td class="heat-cell" style="background:${background};color:${textColor};">${formatSignedCurrency(
            cell.delta
          )}</td>`;
        })
        .join("");
      return `<tr><th>${label}</th>${cells}</tr>`;
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

function yesNo(value) {
  return value ? "Yes" : "No";
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
    `Tax dividends: ${yesNo(inputs.taxDividends)}. ` +
    `Net refund of dividend tax: ${yesNo(inputs.netTaxRefundOfDividendTax)}. ` +
    `Refund lag: ${inputs.taxRefundLagMonths} month(s). ` +
    `HELOC strategy: ${labelForHelocStrategy(inputs.helocPaymentStrategy)}. ` +
    `Smith-only value excludes home equity and isolates the strategy sleeve (portfolio/cash/refunds minus HELOC/external cash). ` +
    `After-tax closeout includes selling the full portfolio, taxes unrealized gains using your inclusion and marginal tax inputs, ` +
    `adds uninvested cash and pending tax refunds, and subtracts any external cash used to service HELOC interest/principal.`;
}

function runAndRender() {
  const inputs = parseInputs();
  const custom = runCustomSimulation(inputs);
  const comparison = runComparison(inputs);
  const sensitivity = runSensitivity(inputs);

  renderMetrics(custom.summary);
  renderYearlyRows(custom.yearly);
  drawCustomChart(custom.yearly);
  renderStrategySummary(inputs, custom.summary);

  renderComparisonSummary(comparison);
  renderComparisonYearlyRows(comparison);
  drawComparisonChart(comparison);

  renderSensitivityMatrix(sensitivity.matrix);
  renderBreakEven(sensitivity.breakEven);
  renderSensitivityHeatmap(sensitivity.heatmap);
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
    taxDividends: true,
    netTaxRefundOfDividendTax: true,
    compoundNetDividends: true,
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
