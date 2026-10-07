/* Deterministic forecast model. Currency CAD; annual price returns are CAGRs. */
(function (root) {
  const FED = [[58523,.14],[117045,.205],[181440,.26],[258482,.29],[Infinity,.33]];
  const ON = [[53891,.0505],[107785,.0915],[150000,.1116],[220000,.1216],[Infinity,.1316]];
  function bracketTax(income, brackets) {
    let tax = 0, lower = 0;
    for (const [upper, rate] of brackets) {
      tax += Math.max(0, Math.min(income, upper) - lower) * rate;
      lower = upper;
    }
    return tax;
  }
  // Planning estimate: basic personal amounts and eligible dividend credits;
  // excludes health premium, CPP/EI, employment credits, AMT and other credits.
  function ontarioTax(income, eligible = 0, ordinary = 0, deduction = 0, gains = 0) {
    const taxable = Math.max(0, income + eligible * 1.38 + ordinary + gains - deduction);
    const bpa = 16452 - 1623 * Math.min(1, Math.max(0, (taxable - 181440) / (258482 - 181440)));
    const federal = Math.max(0, bracketTax(taxable, FED) - .14 * bpa - eligible * 1.38 * .150198);
    const provincialBase = Math.max(0, bracketTax(taxable, ON) - .0505 * 12989);
    const surtax = .2 * Math.max(0, provincialBase - 5818) + .36 * Math.max(0, provincialBase - 7446);
    const provincial = Math.max(0, provincialBase + surtax - eligible * 1.38 * .10);
    return federal + provincial;
  }
  function marginalRates(income) {
    const ordinary = ontarioTax(income + 1) - ontarioTax(income);
    const eligible = ontarioTax(income, 1) - ontarioTax(income);
    return {ordinary, eligible: Math.max(0, eligible)};
  }
  function monthlyPayment(principal, annual, months) {
    const rate = Math.pow(1 + annual / 2, 1 / 6) - 1; // Canadian semiannual convention
    return principal <= 0 ? 0 : rate === 0 ? principal / months : principal * rate / (1 - (1 + rate) ** -months);
  }
  function distributionRate(inputs) {
    const share = inputs.eligibleDividendShare ?? 1;
    return share * inputs.dividendTaxRate + (1 - share) * inputs.taxRate;
  }
  function annualTax(inputs, eligible, ordinary, interest) {
    if (inputs.taxMode === 'income') {
      const base = ontarioTax(inputs.grossIncome);
      const withDiv = ontarioTax(inputs.grossIncome, eligible, ordinary);
      const withLoan = ontarioTax(inputs.grossIncome, eligible, ordinary, interest);
      return {dividendTax: Math.max(0, withDiv - base), relief: Math.max(0, withDiv - withLoan)};
    }
    return {dividendTax: eligible * inputs.dividendTaxRate + ordinary * inputs.taxRate, relief: interest * inputs.taxRate};
  }
  function simulate(inputs, scenario) {
    const months = Math.round(inputs.horizonYears * 12);
    const monthlyMortgageRate = Math.pow(1 + inputs.mortgageRate / 2, 1 / 6) - 1;
    const priceRate = Math.pow(1 + inputs.weightedPriceReturn, 1 / 12) - 1;
    const payment = monthlyPayment(inputs.mortgagePrincipal, inputs.mortgageRate, Math.round(inputs.amortYears * 12));
    const initialDraw = scenario.enableSmith ? (inputs.initialWithdrawal || 0) : 0;
    const marginRatio = scenario.enableSmith ? (scenario.marginRatio || 0) : 0;
    let mortgage = inputs.mortgagePrincipal, heloc = 0, margin = 0;
    let portfolio = inputs.startingPortfolio, acb = inputs.startingPortfolioAcb, cash = 0;
    let external = 0, interestTotal = 0, marginInterestTotal = 0, refundsTotal = 0, dividendsTaxTotal = 0;
    let peakInterest = 0, maxHeloc = 0, maxMarginLtv = 0, payoff = mortgage <= .005 ? 0 : null;
    let annualInterest = 0, annualEligible = 0, annualOrdinary = 0, annualPaidTax = 0, pending = [];
    let appliedRefundYear = 0, annualGrossDividends = 0, capacityShortfall = 0;
    const timeline = [], warnings = new Set();
    const capacity = () => Math.max(0, Math.min((inputs.initialHelocRoom ?? Infinity) + inputs.mortgagePrincipal - mortgage,
      inputs.homeValue * .65, inputs.homeValue * .8 - mortgage) - heloc);
    const invest = (amount, leverage = true) => {
      portfolio += amount; acb += amount;
      if (leverage && marginRatio) { const extra = amount * marginRatio; margin += extra; portfolio += extra; acb += extra; }
    };
    const borrow = amount => {
      if (!scenario.enableSmith) return;
      const actual = Math.min(amount, capacity());
      capacityShortfall += amount - actual;
      if (actual + .005 < amount) warnings.add('HELOC capacity limits some investment advances.');
      heloc += actual; invest(actual);
    };
    borrow(initialDraw);
    if (marginRatio && inputs.startingPortfolio) {
      const extra = inputs.startingPortfolio * marginRatio; margin += extra; portfolio += extra; acb += extra;
    }
    const repayMortgage = amount => {
      const applied = Math.min(mortgage, amount); mortgage -= applied; borrow(applied); cash += amount - applied;
    };
    const repayHeloc = amount => { const applied = Math.min(heloc, amount); heloc -= applied; cash += amount - applied; };
    const spendCash = amount => { const used = Math.min(cash, amount); cash -= used; external += amount - used; };
    for (let month = 1; month <= months; month++) {
      const mortgageInterest = mortgage * monthlyMortgageRate;
      const principal = Math.min(mortgage, Math.max(0, payment + inputs.extraPayment - mortgageInterest));
      // Keep a matched monthly mortgage budget across strategies. Once paid off,
      // freed scheduled payments accumulate as cash, rather than disappearing.
      cash += Math.max(0, payment + inputs.extraPayment - mortgageInterest - principal);
      mortgage -= principal; borrow(principal);
      const hi = heloc * inputs.helocRate / 12;
      const mi = margin * (inputs.marginRate || 0) / 12;
      interestTotal += hi; marginInterestTotal += mi; annualInterest += hi + mi;
      // Margin interest is paid monthly from cashflow; margin does not compound.
      spendCash(mi);
      portfolio *= 1 + priceRate;
      const gross = portfolio * inputs.weightedDividendYield / 12;
      const eligible = gross * (inputs.eligibleDividendShare ?? 1);
      annualEligible += eligible; annualOrdinary += gross - eligible; annualGrossDividends += gross;
      const deferTax = scenario.taxDividends && scenario.netTaxRefundOfDividendTax;
      const paidTax = scenario.taxDividends && !deferTax ? gross * distributionRate(inputs) : 0;
      annualPaidTax += paidTax;
      let dividendCash = gross - paidTax;
      let interestCash = 0;
      if (scenario.dividendUse === 'pay_interest') {
        interestCash = Math.min(dividendCash, hi); dividendCash -= interestCash;
      }
      if (scenario.helocPaymentStrategy === 'portfolio_loan_interest') {
        // Draw the portfolio loan only for the HELOC interest bill. Its own
        // interest remains a cash expense and is never added to loan principal.
        const due = Math.max(0, hi - interestCash);
        const loanRoom = Math.max(0, portfolio * (inputs.marginMaintenanceLtv ?? .5) - margin);
        const financed = Math.min(due, loanRoom);
        margin += financed;
        if (due - financed > .005) {
          spendCash(due - financed);
          warnings.add('Portfolio loan room limits HELOC interest financing; the remainder needs cash.');
        }
      } else if (scenario.helocPaymentStrategy === 'self_capitalize' && scenario.dividendUse !== 'pay_interest') {
        const financed = Math.min(hi, capacity()); heloc += financed;
        if (hi - financed > .005) { spendCash(hi - financed); warnings.add('HELOC room exhausted: some interest needs external cash.'); }
      } else {
        spendCash(hi - interestCash);
        if (scenario.helocPaymentStrategy === 'interest_plus_principal') {
          const paid = Math.min(heloc, scenario.helocPrincipalPayment || 0); heloc -= paid; spendCash(paid);
        }
      }
      if (scenario.dividendUse === 'compound') invest(dividendCash, false);
      else if (scenario.dividendUse === 'repay_mortgage') repayMortgage(dividendCash);
      else if (scenario.dividendUse === 'pay_heloc') repayHeloc(dividendCash);
      else cash += dividendCash; // excess dividends after paying interest
      const yearEnd = month % 12 === 0 || month === months;
      let taxYear = null;
      if (yearEnd) {
        taxYear = annualTax(inputs, annualEligible, annualOrdinary, annualInterest);
        if (!scenario.taxDividends) taxYear.dividendTax = 0;
        dividendsTaxTotal += taxYear.dividendTax;
        pending.push({dueMonth: month + inputs.taxRefundLagMonths, amount: taxYear.relief + annualPaidTax - taxYear.dividendTax});
        peakInterest = Math.max(peakInterest, annualInterest);
      }
      let received = 0;
      pending = pending.filter(item => { if (item.dueMonth <= month) { received += item.amount; return false; } return true; });
      if (received < 0) spendCash(-received);
      if (received > 0) {
        refundsTotal += received; appliedRefundYear += received;
        if (scenario.taxRefundUse === 'reinvest') invest(received, false);
        else if (scenario.taxRefundUse === 'repay_mortgage') repayMortgage(received);
        else if (scenario.taxRefundUse === 'pay_heloc') repayHeloc(received);
        else cash += received;
      }
      if (mortgage < .005) { mortgage = 0; if (payoff === null) payoff = month; }
      const pendingRefund = pending.reduce((sum, x) => sum + x.amount, 0);
      const gain = Math.max(0, portfolio - acb) * inputs.capitalGainsInclusionRate;
      const liquidationTax = inputs.taxMode === 'income'
        ? Math.max(0, ontarioTax(inputs.grossIncome, annualEligible, annualOrdinary, annualInterest, gain) - ontarioTax(inputs.grossIncome, annualEligible, annualOrdinary, annualInterest))
        : gain * inputs.taxRate;
      const smithPre = portfolio + cash + pendingRefund - heloc - margin - external;
      const smithAfter = smithPre - liquidationTax;
      const ltv = portfolio > 0 ? margin / portfolio : 0;
      maxMarginLtv = Math.max(maxMarginLtv, ltv);
      if (margin > 0 && ltv > (inputs.marginMaintenanceLtv ?? .5)) warnings.add('Margin maintenance threshold exceeded; forced sales are not simulated.');
      maxHeloc = Math.max(maxHeloc, heloc);
      timeline.push({month, year: Math.ceil(month / 12), age: (inputs.age || 0) + month / 12,
        mortgageBalance: mortgage, helocBalance: heloc, marginBalance: margin, portfolio,
        portfolioCostBasis: acb, smithValuePreTax: smithPre, smithValueAfterTax: smithAfter,
        netPosition: inputs.homeValue - mortgage + smithPre, netAfterTax: inputs.homeValue - mortgage + smithAfter,
        liquidationTax, taxRefundApplied: appliedRefundYear, cashBalance: cash,
        pendingTaxRefundReceivable: pendingRefund, cumulativeExternalContributions: external,
        annualDividendTax: taxYear?.dividendTax || 0, annualInterestDeductionBenefit: taxYear?.relief || 0,
        annualGrossDividends, annualLoanInterest: annualInterest});
      if (yearEnd) { annualInterest = 0; annualEligible = 0; annualOrdinary = 0; annualPaidTax = 0; appliedRefundYear = 0; annualGrossDividends = 0; }
    }
    const last = timeline[timeline.length - 1];
    return {scenario, yearly: timeline.filter(x => x.month % 12 === 0 || x.month === months), summary: {
      finalMortgageBalance: mortgage, finalHelocBalance: heloc, finalMarginBalance: margin, finalPortfolio: portfolio,
      finalPortfolioAcb: acb, finalSmithValuePreTax: last.smithValuePreTax, finalSmithValueAfterTax: last.smithValueAfterTax,
      finalPreTaxNetPosition: last.netPosition, finalAfterTaxNetPosition: last.netAfterTax,
      finalEstimatedLiquidationTax: last.liquidationTax, finalCashBalance: cash,
      pendingTaxRefundReceivable: last.pendingTaxRefundReceivable, cumulativeExternalContributions: external,
      maxHelocBalance: maxHeloc, peakAnnualHelocInterest: peakInterest, cumulativeHelocInterest: interestTotal,
      cumulativeMarginInterest: marginInterestTotal, cumulativeTaxRefund: refundsTotal, cumulativeDividendTax: dividendsTaxTotal,
      mortgagePayoffMonths: payoff, mortgagePayoffAge: payoff === null ? null : inputs.age + payoff / 12,
      endingAge: inputs.age + inputs.horizonYears, maxMarginLtv, capacityShortfall, warnings: [...warnings]
    }};
  }
  const api = {simulate, monthlyPayment, ontarioTax, marginalRates, annualTax};
  if (typeof module !== 'undefined') module.exports = api;
  root.SMModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
