import test from 'node:test';
import assert from 'node:assert/strict';
import {sealEventPassword,openEventPassword} from '../lib/events-hub/password-vault.ts';
const secret='fictional-test-only-secret-'.repeat(3),lookup='a'.repeat(64);
test('administrator password copy is encrypted with a fresh nonce and authenticated context',()=>{
 const one=sealEventPassword('Abc123',lookup,secret),two=sealEventPassword('Abc123',lookup,secret);
 assert.notEqual(one,two);assert.ok(!one.includes('Abc123'));assert.equal(openEventPassword(one,lookup,secret),'Abc123');
 assert.equal(openEventPassword(sealEventPassword('Äbc123',lookup,secret),lookup,secret),'Äbc123');
 assert.throws(()=>openEventPassword(one,'b'.repeat(64),secret));assert.throws(()=>openEventPassword(one,lookup,'different-secret-'.repeat(4)));
 const parts=one.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);assert.throws(()=>openEventPassword(parts.join('.'),lookup,secret));
 for(const invalid of ['', 'not-encrypted',one+'.extra',one.slice(0,-1)])assert.throws(()=>openEventPassword(invalid,lookup,secret));
 assert.throws(()=>sealEventPassword('short',lookup,secret));assert.throws(()=>sealEventPassword('Abc123',lookup,'short'));assert.throws(()=>sealEventPassword('Abc123','invalid',secret));
});

test('six-character and longer passwords round-trip, including long Unicode passwords',()=>{
 for(const password of ['Abc123','Longer-event-password!','A'.repeat(128),'漢'.repeat(128)])assert.equal(openEventPassword(sealEventPassword(password,lookup,secret),lookup,secret),password);
 for(const password of ['','12345','A'.repeat(129)])assert.throws(()=>sealEventPassword(password,lookup,secret),/6 and 128/);
});
