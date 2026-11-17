import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
const context='icsh-admin-event-passwords-v1';
function key(secret:string){if(secret.length<32)throw Error('Password storage key is unavailable.');return Buffer.from(hkdfSync('sha256',secret,context,'aes-256-gcm',32));}
function aad(lookup:string){if(!/^[a-f0-9]{64}$/.test(lookup))throw Error('Invalid password context.');return Buffer.from(context+':'+lookup);}
/** Login continues to use scrypt hashes. This encrypted copy is for explicit Admin Hub viewing only. */
export function sealEventPassword(password:string,lookup:string,secret:string){
 if(password.length!==6)throw Error('Use exactly 6 characters.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(aad(lookup));
 const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
 return ['aesgcm-v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function openEventPassword(envelope:string,lookup:string,secret:string){
 if(envelope.length>512||!/^aesgcm-v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{8,32}$/.test(envelope))throw Error('Invalid saved password.');
 const [,iv,tag,payload]=envelope.split('.'),decipher=createDecipheriv('aes-256-gcm',key(secret),Buffer.from(iv,'base64url'));decipher.setAAD(aad(lookup));decipher.setAuthTag(Buffer.from(tag,'base64url'));
 const password=Buffer.concat([decipher.update(Buffer.from(payload,'base64url')),decipher.final()]).toString('utf8');if(password.length!==6)throw Error('Invalid saved password.');return password;
}
