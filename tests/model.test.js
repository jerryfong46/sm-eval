const assert = require('node:assert/strict');
const {simulate, monthlyPayment, marginalRates, annualTax, ontarioTax} = require('../model.js');
const inputs = {age:35, horizonYears:1, amortYears:25, mortgagePrincipal:0, mortgageRate:0,
  extraPayment:0, homeValue:1000000, initialWithdrawal:100000, initialHelocRoom:200000,
  startingPortfolio:0, startingPortfolioAcb:0, weightedPriceReturn:0, weightedDividendYield:0,
  eligibleDividendShare:1, helocRate:0, marginRate:0, taxRate:.5, dividendTaxRate:.3,
  capitalGainsInclusionRate:.5, taxRefundLagMonths:0, taxMode:'rates', grossIncome:100000};
const scenario = {enableSmith:true, dividendUse:'compound', taxRefundUse:'cash',
  helocPaymentStrategy:'interest_only_cashflow', helocPrincipalPayment:0,
  taxDividends:true, netTaxRefundOfDividendTax:true, marginRatio:0};
function run(i={},s={}) {return simulate({...inputs,...i},{...scenario,...s});}
function close(a,b,t=.01) {assert.ok(Math.abs(a-b)<t, `${a} != ${b}`);}
// Borrowing itself produces no wealth, even with additional margin borrowing.
let r=run({}, {marginRatio:.3});close(r.summary.finalPortfolio,130000);close(r.summary.finalMarginBalance,30000);close(r.summary.finalSmithValueAfterTax,0);
// Annual CAGR compounds exactly once over 12 months; only gains are taxed.
r=run({weightedPriceReturn:.1});close(r.summary.finalPortfolio,110000);close(r.summary.finalEstimatedLiquidationTax,2500);close(r.summary.finalSmithValueAfterTax,7500);
// Eligible dividend taxes are counted once, with no capital gains on reinvested dividends.
r=run({weightedDividendYield:.12});const gross=100000*(1.01**12-1);close(r.summary.cumulativeDividendTax,gross*.3);close(r.summary.finalPortfolioAcb,r.summary.finalPortfolio);close(r.summary.finalSmithValueAfterTax,gross*.7);
// Paying distribution tax monthly vs annually has equal results when distributions stay cash.
const annual=run({weightedDividendYield:.12},{dividendUse:'pay_interest'});
const monthly=run({weightedDividendYield:.12},{dividendUse:'pay_interest',netTaxRefundOfDividendTax:false});
close(annual.summary.finalAfterTaxNetPosition,monthly.summary.finalAfterTaxNetPosition);close(annual.summary.cumulativeDividendTax,3600);
// Refund lag records signed liabilities and does not forgive final unpaid tax.
r=run({weightedDividendYield:.12,taxRefundLagMonths:12},{dividendUse:'pay_interest'});close(r.summary.pendingTaxRefundReceivable,-3600);close(r.summary.finalSmithValueAfterTax,8400);
// Dividends service interest without increasing debt; interest shortfalls require external cash.
r=run({weightedDividendYield:.12,helocRate:.06},{dividendUse:'pay_interest'});close(r.summary.finalHelocBalance,100000);close(r.summary.cumulativeHelocInterest,6000);close(r.summary.cumulativeExternalContributions,0);close(r.summary.finalCashBalance,5400);close(r.summary.finalSmithValueAfterTax,5400);
// Margin interest is included in deductions and margin principal in liquidation.
r=run({marginRate:.12},{marginRatio:.3});close(r.summary.cumulativeMarginInterest,3600);close(r.summary.cumulativeExternalContributions,3600);close(r.summary.finalSmithValueAfterTax,-1800);
// Capacity excludes impossible borrowing and self-funded interest is recorded as external.
r=run({initialHelocRoom:10000,helocRate:.12},{helocPaymentStrategy:'self_capitalize'});close(r.summary.finalHelocBalance,10000);assert.ok(r.summary.warnings.length);close(r.summary.cumulativeExternalContributions,1200);
// Mortgage-only comparisons never use the optional initial HELOC withdrawal.
r=run({}, {enableSmith:false,marginRatio:.3});close(r.summary.finalPortfolio,0);close(r.summary.finalMarginBalance,0);close(r.summary.finalHelocBalance,0);
// Zero-interest mortgage pays off in exact months and reports age.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:0},{enableSmith:false});assert.equal(r.summary.mortgagePayoffMonths,12);assert.equal(r.summary.mortgagePayoffAge,36);
assert.equal(run({mortgagePrincipal:12000,amortYears:25},{enableSmith:false}).summary.mortgagePayoffMonths,null);
// No liquidation tax benefit is invented for unrealized losses.
r=run({weightedPriceReturn:-.5});close(r.summary.finalEstimatedLiquidationTax,0);
// Top Ontario tax rates, ordinary vs eligible distributions, and progressive deductions.
close(marginalRates(300000).ordinary,.535296,.00001);close(marginalRates(300000).eligible,.39344048,.00001);
const low=annualTax({...inputs,taxMode:'income',grossIncome:20000},0,0,100000);assert.ok(low.relief <= ontarioTax(20000));
assert.ok(annualTax({...inputs,taxMode:'income'},0,10000,0).dividendTax > annualTax({...inputs,taxMode:'income'},10000,0,0).dividendTax);
// Margin maintenance breach is reported, rather than pretending the path is executable.
r=run({weightedPriceReturn:-.9,marginMaintenanceLtv:.5},{marginRatio:.3});assert.ok(r.summary.warnings.some(x=>x.includes('maintenance')));
close(monthlyPayment(12000,0,12),1000);
// Freed mortgage payments stay in cash after early payoff under the matched budget.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:0,extraPayment:1000},{enableSmith:false});
assert.equal(r.summary.mortgagePayoffMonths,6);close(r.summary.finalCashBalance,12000);
console.log('16 financial model checks passed');
