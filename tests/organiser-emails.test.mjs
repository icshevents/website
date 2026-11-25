import test from 'node:test';
import assert from 'node:assert/strict';
import {organiserAddress,organiserNoticeContent,organiserNoticeSchema} from '../lib/form-emails/organiser.ts';
const v={type:'event',stage:'confirmed',reference:'EVT-1234',title:'Community lunch',status:'Payment received',details:{Name:'A Member',Email:'member@icsh.org.uk'},tickets:[{category:'Adult ICSH member',quantity:2,unitAmount:1850},{category:'Adult non-member',quantity:1,unitAmount:2050},{category:'Child',quantity:2,unitAmount:925},{category:'Under 5',quantity:1,unitAmount:0}],total:7340,donation:500,discount:760};
test('organiser email accurately totals categories, complimentary places, donation and discount',()=>{
 assert.equal(organiserAddress,'events@icsh.org.uk');
 const c=organiserNoticeContent(v);
 for(const s of ['Total tickets: 6','Adult ICSH member: 2 × £18.50 = £37.00','Adult non-member: 1 × £20.50 = £20.50','Child: 2 × £9.25 = £18.50','Under 5: 1 × £0.00 = £0.00','Additional donation: £5.00','Discount: -£7.60','Confirmed total: £73.40'])assert.ok(c.textbody.includes(s),s);
 assert.throws(()=>organiserNoticeSchema.parse({...v,total:7341}),/does not match/);
});
test('submitted records never claim payment or activation and null details are omitted',()=>{
 for(const type of ['membership','donation','rishta','event','custom','stall','participation']){
  const c=organiserNoticeContent({...v,type,stage:'submitted',tickets:[],total:2000,donation:0,discount:0,details:{Email:null}});
  assert.match(c.textbody,/does not confirm payment or membership activation/);
  assert.match(c.textbody,/Submitted value: £20.00/);assert.doesNotMatch(c.textbody,/Email: null/);
 }
});
test('untrusted answers and form titles cannot inject HTML or email headers',()=>{
 const c=organiserNoticeContent({...v,title:'<script>alert(1)</script>',reference:'EVT-123\r\nBcc: attacker',details:{'<img>':'<script>bad()</script>'}});
 assert.doesNotMatch(c.subject,/[\r\n]/);assert.doesNotMatch(c.htmlbody,/<script>|<img>/);
 assert.match(c.htmlbody,/&lt;script&gt;/);
});
