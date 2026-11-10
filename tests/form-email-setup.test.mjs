import test from 'node:test';
import assert from 'node:assert/strict';
import {authorisedSetupTest,setupConfirmation,setupKinds} from '../lib/form-emails/setup-test.ts';
import {confirmationContent} from '../lib/form-emails/core.ts';
const secret='a'.repeat(64);
test('internal delivery test requires its own enabled flag and strong matching bearer',()=>{
 const request=new Request('https://icsh.org.uk/api/admin/form-emails/setup-test',{headers:{authorization:'Bearer '+secret}});
 assert.equal(authorisedSetupTest(request,{}),false);
 assert.equal(authorisedSetupTest(request,{FORM_EMAIL_SETUP_TEST_ENABLED:'true',FORM_EMAIL_SETUP_TEST_SECRET:'short'}),false);
 const env={FORM_EMAIL_SETUP_TEST_ENABLED:'true',FORM_EMAIL_SETUP_TEST_SECRET:secret};
 assert.equal(authorisedSetupTest(request,env),true);
 assert.equal(authorisedSetupTest(new Request(request.url,{headers:{authorization:'Bearer '+'b'.repeat(64)}}),env),false);
});
test('all setup messages have a fixed recipient, fictional details and repeatable separate claim IDs',()=>{
 const ids=new Set();
 for(const kind of setupKinds){
  const value=setupConfirmation(kind,secret),content=confirmationContent(value);
  assert.equal(value.recipient,'events@icsh.org.uk');
  assert.equal(value.id,setupConfirmation(kind,secret).id);
  assert.match(content.subject,/^\[TEST\]/);
  assert.match(content.textbody,/fictional details/);
  ids.add(value.id);
 }
 assert.equal(ids.size,6);
});
