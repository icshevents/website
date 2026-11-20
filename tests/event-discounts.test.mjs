import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateDiscount,emptyDiscount,normaliseCode,validDiscountSettings} from '../lib/event-discounts/core.ts';
const source='11111111-1111-4111-8111-111111111111';
const offer=()=>({...emptyDiscount('tickets',source),id:source,code:'EARLY30',active:true,maximum:30,basis:'fixed',value:200});
const lines=[{category:'adult',quantity:2,unitPence:1850},{category:'child',quantity:2,unitPence:925},{category:'donation',quantity:1,unitPence:500}];
test('case-insensitive code normalisation is strict',()=>{assert.equal(normaliseCode(' early_30 '),'EARLY_30');assert.throws(()=>normaliseCode('x'));assert.throws(()=>normaliseCode('INVALID CODE'));});
test('fixed discount once per booking leaves children and donation unchanged',()=>{assert.deepEqual(calculateDiscount({...offer(),categories:'adult'},lines,false),{grossPence:6050,eligiblePence:3700,discountPence:200,payablePence:5850,units:1,eligibleTickets:2});});
test('fixed amount per eligible ticket and ticket limit count',()=>{const r=calculateDiscount({...offer(),application:'per_ticket',redemptionBasis:'ticket'},lines,false);assert.equal(r.discountPence,800);assert.equal(r.units,4);assert.equal(r.payablePence,5250);});
test('percent discount uses integer pence and rounds each ticket separately',()=>{const q=calculateDiscount({...offer(),basis:'percentage',value:15,application:'per_ticket',categories:'adult'},[{category:'adult',quantity:3,unitPence:101}],false);assert.equal(q.discountPence,45);assert.equal(q.payablePence,258);});
test('no donation discount; children-only coupon targets only child tickets',()=>{const q=calculateDiscount({...offer(),categories:'child',basis:'percentage',value:50},lines,false);assert.equal(q.eligiblePence,1850);assert.equal(q.discountPence,925);assert.equal(q.grossPence,6050);});
test('inactive, expired, future, member-only and ineligible tickets are rejected',()=>{const now=Date.parse('2026-11-20T12:00:00Z');const a=offer();for(const s of [{active:false},{expiresAt:'2026-11-19T00:00:00Z'},{startsAt:'2026-11-21T00:00:00Z'},{paidMembersOnly:true}])assert.throws(()=>calculateDiscount({...a,...s},lines,false,now));assert.throws(()=>calculateDiscount({...a,categories:'child'},[{category:'adult',quantity:2,unitPence:1000}],true));});
test('paid member code requires affirmative CRM proof',()=>{assert.equal(calculateDiscount({...offer(),paidMembersOnly:true},lines,true).discountPence,200);});
test('new form discounts start disabled and cannot be activated with empty settings',()=>{const d=emptyDiscount('tickets',source);assert.equal(d.active,false);assert.equal(d.maximum,0);assert.throws(()=>validDiscountSettings({...d,active:true}));});
test('limits, dates, zero-pay and Stripe minimum checked',()=>{const d=offer();assert.throws(()=>validDiscountSettings({...d,maximum:0}));assert.throws(()=>validDiscountSettings({...d,perCustomerMaximum:31}));assert.throws(()=>validDiscountSettings({...d,startsAt:'2026-12-01T00:00:00Z',expiresAt:'2026-11-01T00:00:00Z'}));assert.throws(()=>calculateDiscount({...d,value:1000},[{category:'adult',quantity:1,unitPence:1000}],true));assert.throws(()=>calculateDiscount({...d,value:982},[{category:'adult',quantity:1,unitPence:1000}],true));});

test('Postgres timestamp offsets remain valid for UK start and expiry times',()=>{
 const a=offer();
 assert.doesNotThrow(()=>validDiscountSettings({...a,startsAt:'2026-11-20T07:00:00+00:00',expiresAt:'2026-12-20T12:00:00+00:00'}));
 assert.doesNotThrow(()=>validDiscountSettings({...a,startsAt:'2026-07-20T08:00:00+01:00',expiresAt:'2026-08-20T09:00:00+01:00'}));
});
test('Iftari donated money is never discounted even when admissions receive 100%',()=>{
 const a={...offer(),scopeKind:'iftari',basis:'percentage',value:100};
 const lines=[{category:'adult',quantity:2,unitPence:2500},{category:'child',quantity:1,unitPence:1300},{category:'donation',quantity:1,unitPence:500}];
 const p=calculateDiscount(a,lines,false);
 assert.equal(p.grossPence,6800);assert.equal(p.discountPence,6300);assert.equal(p.payablePence,500);
});
test('a code cannot discount free admissions and cannot over-discount children',()=>{
 const a={...offer(),basis:'fixed',value:90000,categories:'child'};
 assert.throws(()=>calculateDiscount(a,[{category:'adult',quantity:1,unitPence:2500},{category:'child',quantity:2,unitPence:0}],false));
 const p=calculateDiscount(a,[{category:'adult',quantity:1,unitPence:2500},{category:'child',quantity:2,unitPence:500}],false);
 assert.equal(p.discountPence,1000);assert.equal(p.payablePence,2500);
});
