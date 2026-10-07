// Offline DOM wiring smoke test. Browser layout and networking need separate QA.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const {execFileSync} = require('child_process');
class Node {
  constructor(data) {
    this.tagName = data.tag; this.attrs = data.attrs || {}; this.children = (data.children || []).map(d=>new Node(d));
    this.children.forEach(c=>c.parent=this); this.dataset={}; this.style={}; this.events={};
    this.value=this.attrs.value || ''; this.checked='checked' in this.attrs; this.disabled=false; this.hidden=false; this.validity={valid:true};
    this.isConnected=true; this.innerHTML=''; this.textContent='';
    this.classList={toggle:()=>{},contains:c=>(this.attrs.class||'').split(' ').includes(c)};
    if(this.tagName==='select') this.value=(this.children.find(c=>'selected' in c.attrs)||this.children[0])?.value || '';
    if(this.tagName==='template') this.content={firstElementChild:this.children[0]};
  }
  get firstElementChild(){return this.children[0];} get lastElementChild(){return this.children.at(-1);}
  matches(s){return s.split(',').some(q=>{q=q.trim();return q.startsWith('.')?(this.attrs.class||'').split(' ').includes(q.slice(1)):q.startsWith('#')?this.attrs.id===q.slice(1):this.tagName===q;});}
  querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0] || null;}
  cloneNode(){return new Node({tag:this.tagName,attrs:{...this.attrs},children:this.children.map(c=>c.serialize())});}
  serialize(){return {tag:this.tagName,attrs:{...this.attrs},children:this.children.map(c=>c.serialize())};}
  appendChild(n){this.children.push(n);n.parent=this;return n;} add(n){this.appendChild(n);if(!this.value)this.value=n.value;}
  append(...ns){ns.filter(n=>n instanceof Node).forEach(n=>this.appendChild(n));}
  replaceChildren(...ns){this.children=[];this.append(...ns);}
  setAttribute(k,v){this.attrs[k]=v;}
  focus(){this.focused=true;}
  scrollIntoView(){this.scrolledIntoView=true;}
  addEventListener(e,cb){(this.events[e] ||= []).push(cb);} closest(s){return this.matches(s)?this:this.parent?.closest(s);}
  getContext(){return new Proxy({}, {get:()=>()=>{}});}
  fire(e,target=this){for(const cb of this.events[e]||[]) cb({target,preventDefault(){}});}
}
const document = new Node(JSON.parse(execFileSync('python3',[path.join(__dirname,'html_tree.py')],{encoding:'utf8'})));
document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Node({tag});
const sandbox={document,Intl,console,Option:class extends Node{constructor(text,value){super({tag:'option',attrs:{value}});this.textContent=text;}},
  AbortSignal:{timeout:()=>undefined},fetch:async url=>({ok:true,json:async()=>({symbol:new URL(url,'https://example.test').searchParams.get('symbol'),
    price:100,dividendYield:.04,priceReturns:{'1':.1,'3':.07,'5':.06},asOf:'2026-10-05T00:00:00Z',source:'Fixture',sourceUrl:'https://example.test'})})};
vm.createContext(sandbox);
for(const file of ['model.js','market.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox,{filename:file});
(async()=>{
  await new Promise(r=>setImmediate(r));
  assert.ok(document.getElementById('metrics').innerHTML.includes('Mortgage Paid Off'));
  assert.equal(document.getElementById('compareConfigRows').children.length,7);
  assert.equal(document.getElementById('holdingsRows').children.length,1);
  assert.equal(document.getElementById('holdingsRows').children[0].querySelector('.h-symbol').value,'VFV');
  assert.equal(document.getElementById('mortgageRate').value,'4');
  assert.equal(document.getElementById('helocRate').value,'4.45');
  assert.equal(document.getElementById('marginRate').value,'3.95');
  assert.equal(document.getElementById('horizonYears').value,'25');
  assert.equal(document.getElementById('horizonYearsValue').textContent,'25 years');
  const amort=document.getElementById('amortYears');amort.value='30';amort.fire('change');
  assert.equal(document.getElementById('horizonYears').value,30);
  const horizon=document.getElementById('horizonYears');horizon.value='10';horizon.fire('input');horizon.fire('change');
  assert.equal(document.getElementById('horizonYearsValue').textContent,'10 years');
  assert.equal(vm.runInContext('parseInputs().horizonYears',sandbox),10);
  const tenYearNet=vm.runInContext('runComparison(parseInputs())[1].summary.finalAfterTaxNetPosition',sandbox);
  amort.value='25';horizon.value='25';horizon.fire('input');horizon.fire('change');
  assert.ok(document.getElementById('compareTabPanel').classList.contains('active'));
  assert.ok(document.getElementById('compareConfigRows').children.some(row=>row.querySelector('.s-heloc').value==='portfolio_loan_interest'));
  assert.ok(document.getElementById('compareSummaryRows').innerHTML.includes('Margin + compound'));
  assert.ok(document.getElementById('compareSummaryRows').innerHTML.includes('comparison-delta'));
  assert.ok(document.getElementById('compareSummaryRows').innerHTML.includes('Min Yrs Pay Off:'));
  assert.ok(!document.getElementById('compareSummaryRows').innerHTML.includes('NaN'));
  const comparison=vm.runInContext('runComparison(parseInputs())',sandbox);
  assert.notEqual(tenYearNet,comparison[1].summary.finalAfterTaxNetPosition);
  assert.equal(comparison.at(-1).summary.advantageVsMatchedMortgage,0);
  assert.ok(comparison[1].summary.matchedMortgageNet>1500000);
  assert.equal(document.getElementById('taxRate').value,'53.5296');
  assert.equal(document.getElementById('grossIncomeWrap').hidden,true);
  const bracket=document.getElementById('taxBracket');bracket.value='income';bracket.fire('change');
  const income=document.getElementById('grossIncome');income.value='100000';income.fire('input');
  assert.equal(document.getElementById('grossIncomeWrap').hidden,false);
  assert.ok(Number(document.getElementById('taxRate').value)<53.53);
  const select=document.getElementById('compareConfigRows').children[0].querySelector('.s-investment');
  select.value='VFV';document.getElementById('compareConfigRows').fire('change',select);
  await new Promise(r=>setImmediate(r));
  assert.ok(document.getElementById('holdingsRows').children.some(r=>r.querySelector('.h-symbol').value==='VFV'));
  assert.ok(document.getElementById('compareSummaryRows').innerHTML.includes('VFV (6.0% price / 4.0% yield)'));
  const initial=document.getElementById('initialWithdrawal');initial.value='50000';document.getElementById('sim-form').fire('submit');
  assert.ok(!document.getElementById('metrics').innerHTML.includes('NaN'));
  assert.equal(document.getElementById('resultsHeading').focused,true);
  assert.equal(document.getElementById('results').scrolledIntoView,true);
  sandbox.fetch=async()=>{throw new Error('offline');};
  vm.runInContext('marketCache.clear()',sandbox);
  document.getElementById('refreshMarket').fire('click');await new Promise(r=>setImmediate(r));
  assert.ok(document.getElementById('marketStatus').textContent.includes('errors'));
  console.log('Interface smoke checks passed: initialization, live-data fixture, income mode, ticker comparison, initial borrowing and offline fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
