import {randomBytes,scrypt as nodeScrypt,timingSafeEqual,createHmac} from 'node:crypto';
const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>nodeScrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:192*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export function passwordLookup(password:string,secret:string){return createHmac('sha256',secret).update('icsh-events-password-v1:'+password).digest('hex');}
export async function hashPassword(password:string){const salt=randomBytes(32),key=await derive(password,salt);return 'scrypt-v1$'+salt.toString('hex')+'$'+key.toString('hex');}
export async function verifyPassword(password:string,encoded:string){const parts=encoded.split('$');if(parts.length!==3||parts[0]!=='scrypt-v1'||!/^[a-f0-9]{64}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;const key=await derive(password,Buffer.from(parts[1],'hex'));return timingSafeEqual(key,Buffer.from(parts[2],'hex'));}
export const dummyPasswordHash='scrypt-v1$'+'0'.repeat(64)+'$'+'0'.repeat(128);
