import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordOrganiserSignIn} from '../lib/organiser-signin.ts';
function fixture({allowed=true,authError=null,user={email:'admin@icsh.org.uk'},status='organiser'}={}){
 const calls=[];const client={auth:{signInWithPassword:async input=>{calls.push(['signIn',input]);return{data:{user},error:authError};},signOut:async input=>{calls.push(['signOut',input]);return{error:null};}}};
 return{calls,deps:{allowAttempt:async()=>{calls.push(['limit']);return allowed;},client:async()=>{calls.push(['client']);return client;},verify:async()=>{calls.push(['verify']);return{status};}}};
}
function form(password='fictional-password'){const f=new FormData();f.set('password',password);return f;}
test('valid password creates a protected organiser session using only the server-selected account',async()=>{
 const f=fixture();const input=form();input.set('email','attacker@example.com');input.set('role','organiser');
 assert.deepEqual(await passwordOrganiserSignIn(input,f.deps),{ok:true});
 assert.deepEqual(f.calls,[['limit'],['client'],['signIn',{email:'admin@icsh.org.uk',password:'fictional-password'}],['verify']]);
});
test('invalid, empty and file-valued passwords stop before authentication or rate-limit calls',async()=>{
 const f=fixture();const file=new FormData();file.set('password',new Blob(['x']),'password.txt');
 for(const input of [new FormData(),form(''),form('x'.repeat(1025)),file])assert.match((await passwordOrganiserSignIn(input,f.deps)).error,/Enter/);
 assert.deepEqual(f.calls,[]);
});
test('rate-limited requests never reach authentication and service failures fail closed',async()=>{
 const f=fixture({allowed:false});assert.match((await passwordOrganiserSignIn(form(),f.deps)).error,/ten minutes/);assert.deepEqual(f.calls,[['limit']]);
 const failing=fixture();failing.deps.allowAttempt=async()=>{throw Error('private database error');};assert.match((await passwordOrganiserSignIn(form(),failing.deps)).error,/temporarily unavailable/);assert.deepEqual(failing.calls,[]);
});
test('wrong passwords return a generic error without granting or checking organiser permissions',async()=>{
 const f=fixture({authError:{message:'sensitive provider details'},user:null});const result=await passwordOrganiserSignIn(form(),f.deps);assert.match(result.error,/Check the password/);assert.doesNotMatch(JSON.stringify(result),/fictional-password|sensitive|admin@/);assert.ok(!f.calls.some(x=>x[0]==='verify'));
});
test('only a verified shared-account organiser can enter; other sessions are signed out',async()=>{
 for(const options of [{status:'forbidden'},{status:'database'},{user:{email:'other@example.com'}}]){
  const f=fixture(options);const result=await passwordOrganiserSignIn(form(),f.deps);assert.match(result.error,/could not be confirmed/);assert.deepEqual(f.calls.at(-1),['signOut',{scope:'local'}]);
 }
});
test('missing configuration and unexpected authentication errors never report successful sign-in',async()=>{
 const f=fixture();f.deps.client=async()=>null;assert.match((await passwordOrganiserSignIn(form(),f.deps)).error,/temporarily unavailable/);
 const bad=fixture();bad.deps.client=async()=>{throw Error('secret');};assert.doesNotMatch(JSON.stringify(await passwordOrganiserSignIn(form(),bad.deps)),/secret/);
});
