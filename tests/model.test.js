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
// Portfolio loan advances pay HELOC interest only; the loan's own interest is paid in cash.
r=run({helocRate:.12,marginRate:.12},{helocPaymentStrategy:'portfolio_loan_interest'});
close(r.summary.finalHelocBalance,100000);close(r.summary.finalMarginBalance,12000);
close(r.summary.finalPortfolio,100000);close(r.summary.cumulativeMarginInterest,660);
close(r.summary.cumulativeExternalContributions,660);
// Portfolio borrowing stops at the modeled maintenance limit, with the shortfall paid in cash.
r=run({helocRate:.12,marginRate:0,marginMaintenanceLtv:.005},{helocPaymentStrategy:'portfolio_loan_interest'});
close(r.summary.finalMarginBalance,500);close(r.summary.cumulativeExternalContributions,11500);
assert.ok(r.summary.warnings.some(w=>w.includes('Portfolio loan room')));
// Capacity excludes impossible borrowing and self-funded interest is recorded as external.
r=run({initialHelocRoom:10000,helocRate:.12},{helocPaymentStrategy:'self_capitalize'});close(r.summary.finalHelocBalance,10000);assert.ok(r.summary.warnings.length);close(r.summary.cumulativeExternalContributions,1200);
// Mortgage-only comparisons never use the optional initial HELOC withdrawal.
r=run({}, {enableSmith:false,marginRatio:.3});close(r.summary.finalPortfolio,0);close(r.summary.finalMarginBalance,0);close(r.summary.finalHelocBalance,0);
// Zero-interest mortgage pays off in exact months and reports age.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:0},{enableSmith:false});assert.equal(r.summary.mortgagePayoffMonths,12);assert.equal(r.summary.mortgagePayoffAge,36);
// Each dollar of mortgage principal paid down is readvanced and invested when room permits.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:0,initialHelocRoom:0});
close(r.monthly[0].mortgageBalance,11000);close(r.monthly[0].helocBalance,1000);
close(r.monthly[0].portfolio,1000);
assert.equal(run({mortgagePrincipal:12000,amortYears:25},{enableSmith:false}).summary.mortgagePayoffMonths,null);
// A taxable-portfolio sale can clear every loan before scheduled mortgage payoff.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:0,startingPortfolio:20000,startingPortfolioAcb:20000},{enableSmith:false});
assert.equal(r.summary.mortgagePayoffMonths,12);assert.equal(r.summary.debtFreeExitMonths,1);
// Selling appreciated investments must cover the modeled capital-gains tax too.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:0,startingPortfolio:12000,startingPortfolioAcb:0},{enableSmith:false});
assert.ok(r.summary.debtFreeExitMonths>1);
// Borrowed portfolio value is offset by the HELOC and cannot be counted as free cash.
r=run({mortgagePrincipal:12000,amortYears:1,initialWithdrawal:20000});
assert.equal(r.summary.debtFreeExitMonths,12);
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
// The mortgage alternative invests the same monthly outside cash and tracks its cost basis.
r=run({initialWithdrawal:0, weightedPriceReturn:.1,
  cashInvestmentSchedule:Array(12).fill(1000)},{enableSmith:false});
close(r.summary.cumulativeExternalContributions,12000);
close(r.summary.finalPortfolioAcb,12000);
assert.ok(r.summary.finalAfterTaxNetPosition>inputs.homeValue);
assert.equal(r.monthly.length,12);
close(r.monthly.reduce((sum, month)=>sum+month.externalCashOutlay,0),12000);
console.log('19 financial model checks passed');
