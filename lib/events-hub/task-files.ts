export function attachmentType(name:string,bytes:Uint8Array){
 const ext=name.split('.').pop()?.toLowerCase();const b=Buffer.from(bytes);
 if(ext==='pdf'&&b.subarray(0,5).toString()==='%PDF-')return {ext,mime:'application/pdf'};
 if(['jpg','jpeg'].includes(ext||'')&&b[0]===255&&b[1]===216&&b[2]===255)return {ext:'jpg',mime:'image/jpeg'};
 if(ext==='png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext,mime:'image/png'};
 if(ext==='webp'&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {ext,mime:'image/webp'};
 const office:Record<string,string>={docx:'wordprocessingml.document',xlsx:'spreadsheetml.sheet',pptx:'presentationml.presentation'};
 if(ext&&office[ext]&&b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4)return {ext,mime:'application/vnd.openxmlformats-officedocument.'+office[ext]};
 if(ext==='txt'&&!b.includes(0)&&!b.toString('utf8').includes('\uFFFD'))return {ext,mime:'text/plain'};
 return null;
}
