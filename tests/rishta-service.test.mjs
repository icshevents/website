import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanAnswers,ageFromDob,fields,visible} from '../lib/rishta/model.ts';
import {handleRishta,decodePhoto} from '../lib/rishta/api.ts';

const origin='https://icsh.test',url=origin+'/api/rishta/applications';
const today='2026-10-23',requestKey='638fd540-a972-4b13-bd46-5092a0ead42e';
const valid=changes=>({Name_first:'Fictional',Name_last:'Applicant',Dropdown:'Male',Date:'1992-10-23',SingleLine4:'rishta-test@example.invalid',SingleLine5:'+447700900000',SingleLine3:'Fictional test address',Dropdown1:"5'9",SingleLine2:'British',Dropdown8:"Bachelor\'s degree",SingleLine11:'Prefer to discuss',Dropdown6:'Single (Never married)',MultiLine1:'Fictional test profile.',MultiLine3:'A compatible life partner.',TermsConditions:true,...changes});
const deps=overrides=>({secret:'local-test-secret-not-production',today,available:async()=>true,rateLimit:async()=>true,save:async()=>{},...overrides});
async function boot(d){const r=await handleRishta(new Request(url),d);const b=await r.json();return {csrf:b.csrf,cookie:r.headers.get('set-cookie')?.split(';')[0],response:r};}
async function send(d,changes={},headers={}){const s=await boot(d);return handleRishta(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json',cookie:s.cookie,'x-csrf-token':s.csrf,...headers},body:JSON.stringify({requestKey,answers:valid(),photo:null,website:'',...changes})}),d);}
test('Age uses the whole date and rejects impossible or future dates',()=>{
 assert.equal(ageFromDob('2008-10-23',today),18);assert.equal(ageFromDob('23/10/2008',today),18);assert.equal(ageFromDob('2008-10-24',today),17);assert.equal(ageFromDob('2026-02-31',today),null);assert.equal(ageFromDob('2027-01-01',today),null);
});
test('Original required questions remain required; optional fields may be blank',()=>{
 assert.deepEqual(cleanAnswers(valid(),today).errors,{});
 for(const id of ['Name_first','Name_last','Dropdown','Date','SingleLine4','SingleLine5','SingleLine3','Dropdown1','SingleLine2','Dropdown8','SingleLine11','Dropdown6','MultiLine1','MultiLine3','TermsConditions'])assert.ok(cleanAnswers(valid({[id]:''}),today).errors[id],id);
});
test('Under-18 and invalid date submissions are blocked; age is recomputed',()=>{
 assert.ok(cleanAnswers(valid({Date:'2008-10-24'}),today).errors.Date);
 assert.equal(cleanAnswers(valid({Number:'99'}),today).answers.Number,'34');
});
test('Gender conditional answers are discarded if they do not apply',()=>{
 const male=cleanAnswers(valid({Dropdown12:'Yes',Dropdown16:'Prefer to discuss later',Radio5:'Sometimes'}),today).answers;
 assert.equal(male.Radio5,'Sometimes');assert.equal('Dropdown12' in male,false);assert.equal('Dropdown16' in male,false);
 const female=cleanAnswers(valid({Dropdown:'Female',Radio5:'Yes',Dropdown12:'Prefer not to say'}),today).answers;
 assert.equal('Radio5' in female,false);assert.equal(female.Dropdown12,'Prefer not to say');
});
test('Marital-history follow-ups only apply to the relevant answers',()=>{
 const never=cleanAnswers(valid({Radio1:'Yes',Dropdown7:'Me'}),today);assert.equal('Radio1' in never.answers,false);assert.equal('Dropdown7' in never.answers,false);
 assert.ok(cleanAnswers(valid({Dropdown6:'Single (Divorced/ Widowed)'}),today).errors.Radio1);
 const parent=cleanAnswers(valid({Dropdown6:'Single (Divorced/ Widowed)',Radio1:'Yes',Dropdown7:'Other',Dropdown7_other:'Shared care'}),today);
 assert.deepEqual(parent.errors,{});assert.equal(parent.answers.Dropdown7_other,'Shared care');
});
test('Partner-children follow-up is hidden/reset when not applicable',()=>{
 assert.equal(visible(fields.find(f=>f.id==='Dropdown15'),{Dropdown14:'No'}),false);
 assert.equal('Dropdown15' in cleanAnswers(valid({Dropdown14:'No',Dropdown15:'Yes'}),today).answers,false);
});
test('Unsupported choices, invalid email and phone, and blank Other answers fail',()=>{
 for(const pair of [{Dropdown:'Unlisted'},{SingleLine4:'broken'},{SingleLine5:'not a phone'},{Dropdown9:'Other'}])assert.ok(Object.keys(cleanAnswers(valid(pair),today).errors).length);
});
test('Photo validation rejects SVG, content-type disguises and oversized content',()=>{
 assert.throws(()=>decodePhoto({type:'image/svg+xml',data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}));
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 assert.equal(decodePhoto({type:'image/png',data:png}).extension,'png');assert.throws(()=>decodePhoto({type:'image/jpeg',data:png}));assert.throws(()=>decodePhoto({type:'image/png',data:'A'.repeat(4194308)}));
});
test('Bootstrap sets an HttpOnly secure same-site cookie and returns no profiles',async()=>{
 const b=await boot(deps());assert.equal(b.response.status,200);assert.match(b.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(b.response.headers.get('set-cookie'),/Secure/);assert.match(b.response.headers.get('cache-control'),/no-store/);assert.equal(typeof b.csrf,'string');
});
test('Successful save returns only the reference and status; no private answers',async()=>{
 let saved;const r=await send(deps({save:async v=>{saved=v;}}),{answers:valid({unrecognised:'discard',Radio1:'Yes'})});assert.equal(r.status,201);const b=await r.json();assert.deepEqual(Object.keys(b).sort(),['reference','status']);assert.match(b.reference,/^RIS-/);assert.equal(saved.answers.unrecognised,undefined);assert.equal(saved.answers.Radio1,undefined);assert.equal(saved.photo,null);
});
test('Wrong origin, missing cookie and wrong CSRF cannot save',async()=>{
 let writes=0;const d=deps({save:async()=>{writes++;}});
 for(const h of [{origin:'https://other.test'},{cookie:''},{'x-csrf-token':'wrong'}])assert.equal((await send(d,{},h)).status,403);
 assert.equal(writes,0);
});
test('Wrong content type and method are rejected',async()=>{
 assert.equal((await send(deps(),{},{'content-type':'text/plain'})).status,415);
 assert.equal((await handleRishta(new Request(url,{method:'DELETE'}),deps())).status,405);
});
test('Validation, honeypot, invalid request keys and empty answers never save',async()=>{
 let writes=0;const d=deps({save:async()=>{writes++;}});
 for(const changes of [{answers:valid({TermsConditions:false})},{answers:valid({Date:'2030-01-01'})},{website:'spam'},{requestKey:'not-a-uuid'},{answers:null}])assert.equal((await send(d,changes)).status,400);
 assert.equal(writes,0);
});
test('Rate limiting blocks writes and does not return input details',async()=>{
 let writes=0;const r=await send(deps({rateLimit:async()=>false,save:async()=>{writes++;}}));assert.equal(r.status,429);assert.equal(writes,0);assert.doesNotMatch(JSON.stringify(await r.json()),/example.invalid/);
});
test('Unavailable database and failed save never issue a receipt',async()=>{
 assert.equal((await handleRishta(new Request(url),deps({available:async()=>false}))).status,503);
 const r=await send(deps({save:async()=>{throw Error('secret database diagnostic');}}));assert.equal(r.status,503);const b=await r.json();assert.equal(b.reference,undefined);assert.doesNotMatch(b.error,/secret database/);
});
