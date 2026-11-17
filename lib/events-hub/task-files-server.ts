import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hubRpc,HubError} from './server';
import {attachmentType} from './task-files';
import {createEventService} from '../event-forms/service.js';
type StoredFile={id:string;name:string;size:number;mime:string;storage_key:string;uploaded_by:string;created_at:string};
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
export async function taskFileRequest(req:Request,path:string){
 const url=new URL(req.url),event=z.uuid().parse(url.searchParams.get('event')),task=z.uuid().parse(url.searchParams.get('task'));
 const files=await hubRpc('icsh_hub_task_files',{p_event:event,p_task:task}) as StoredFile[];
 if(req.method==='GET'&&path==='task/files')return Response.json({files:files.map(({id,name,size,uploaded_by,created_at})=>({id,name,size,uploaded_by,created_at}))},{headers});
 const db=createEventService();
 if(req.method==='GET'&&path==='task/download'){
  const id=z.uuid().parse(url.searchParams.get('file')),file=files.find(f=>f.id===id);if(!file)throw new HubError('File not found.',404);
  const r=await db.storage.from('icsh-task-files').download(file.storage_key);if(r.error||!r.data)throw new HubError('File unavailable.',404);
  return new Response(r.data,{headers:{...headers,'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(req.method!=='POST'||path!=='task/upload')throw new HubError('Action not found.',404);
 if(files.length>=20)throw new HubError('This task already has 20 files.');
 let name:string;try{name=decodeURIComponent(req.headers.get('x-file-name')||'');}catch{throw new HubError('Invalid file name.');}
 if(!name||name.length>180||/[\u0000-\u001f\u007f/\\]/.test(name))throw new HubError('Use a file name up to 180 characters.');
 const reader=req.body?.getReader();if(!reader)throw new HubError('Choose a file.');let size=0;const chunks:Uint8Array[]=[];
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>10*1024*1024){await reader.cancel();throw new HubError('Choose a file no larger than 10 MB.',413);}chunks.push(part.value);}
 if(!size)throw new HubError('The file is empty.');const bytes=Buffer.concat(chunks),type=attachmentType(name,bytes);if(!type)throw new HubError('Choose a PDF, JPG, PNG, WebP, Word, Excel, PowerPoint or text file.');
 const id=randomUUID(),key=task+'/'+id+'.'+type.ext;const uploaded=await db.storage.from('icsh-task-files').upload(key,bytes,{contentType:type.mime,upsert:false});if(uploaded.error)throw new HubError('The file could not be uploaded. Please retry.',503);
 try{await hubRpc('icsh_hub_task_file_add',{p_event:event,p_task:task,p_id:id,p_key:key,p_name:name,p_size:size,p_mime:type.mime});}catch(e){await db.storage.from('icsh-task-files').remove([key]);throw e;}
 return Response.json({ok:true,id},{headers});
}
