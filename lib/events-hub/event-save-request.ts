import {z} from 'zod';
import {saveSchema} from './core.ts';
export const liveSaveSchema=saveSchema.omit({status:true}).extend({visibility:z.enum(['published','hidden','archive'])});
export const posterLimit=5*1024*1024;
export function posterFormat(bytes:Uint8Array){
 const b=Buffer.from(bytes);
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'png',mime:'image/png'};
 if(b[0]===255&&b[1]===216&&b[2]===255)return {ext:'jpg',mime:'image/jpeg'};
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {ext:'webp',mime:'image/webp'};
 throw Error('Choose a JPG, PNG or WebP image.');
}
async function bounded(request:Request,limit:number){const reader=request.body?.getReader();if(!reader)throw Error('No event details were received.');const parts:Uint8Array[]=[];let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw Error('The poster must be smaller than 5 MB.');}parts.push(part.value);}return Buffer.concat(parts);}
export async function readEventSaveRequest(request:Request){
 const type=request.headers.get('content-type')||'';
 if(type.startsWith('application/json'))return {input:liveSaveSchema.parse(JSON.parse((await bounded(request,64000)).toString('utf8'))),poster:null};
 if(!type.startsWith('multipart/form-data'))throw Error('Invalid event save request.');
 const bytes=await bounded(request,posterLimit+128*1024),form=await new Request(request.url,{method:'POST',headers:request.headers,body:bytes}).formData();
 if([...form.keys()].some(k=>!['payload','poster'].includes(k))||form.getAll('payload').length!==1||form.getAll('poster').length>1)throw Error('Invalid event save request.');
 const payload=form.get('payload');if(typeof payload!=='string'||Buffer.byteLength(payload)>64000)throw Error('Invalid event details.');
 const input=liveSaveSchema.parse(JSON.parse(payload)),file=form.get('poster');
 if(file===null)return {input,poster:null};
 if(!(file instanceof File)||!file.size||file.size>posterLimit)throw Error('Choose an image smaller than 5 MB.');
 const image=Buffer.from(await file.arrayBuffer());return {input,poster:{bytes:image,...posterFormat(image)}};
}
