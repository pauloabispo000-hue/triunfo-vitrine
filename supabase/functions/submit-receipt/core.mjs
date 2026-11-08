// No credentials in this module. Dependencies are injected for local validation.
export const MAX_FILE = 5 * 1024 * 1024;
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=(c>>>8)^crcTable[(c^b)&255];return (c^0xffffffff)>>>0};
const safeDimensions=(w,h)=>w>0&&h>0&&w<=12000&&h<=12000&&w*h<=12000000;
export function imageMime(bytes) {
 if(!(bytes instanceof Uint8Array)||bytes.length<12)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)){
  let offset=8,header=false,data=false,chunks=0;
  while(offset+12<=bytes.length&&++chunks<=10000){
   const length=view.getUint32(offset),type=ascii(offset+4,offset+8),end=offset+12+length;
   if(end>bytes.length||!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))return null;
   if(!header){
    if(type!=='IHDR'||length!==13||!safeDimensions(view.getUint32(offset+8),view.getUint32(offset+12)))return null;
    header=true;
   }else if(type==='IHDR')return null;
   if(type==='IDAT'&&length>0)data=true;
   if(type==='IEND')return length===0&&data&&end===bytes.length?'image/png':null;
   offset=end;
  }
  return null;
 }
 if(bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217){
  let p=2,frame=false;
  while(p+4<bytes.length){
   if(bytes[p++]!==255)return null;
   while(bytes[p]===255)p++;
   const marker=bytes[p++];
   if(marker===218)return frame?'image/jpeg':null;
   if(marker===217)return null;
   const len=view.getUint16(p);
   if(len<2||p+len>bytes.length)return null;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
    if(len<8||!safeDimensions(view.getUint16(p+5),view.getUint16(p+3)))return null;
    frame=true;
   }
   p+=len;
  }
  return null;
 }
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'&&view.getUint32(4,true)===bytes.length-8&&bytes.length>=30){
  const kind=ascii(12,16),length=view.getUint32(16,true);
  if(20+length>bytes.length)return null;
  if(kind==='VP8X'){
   const w=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),h=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);
   if(length<10||!safeDimensions(w,h))return null;
  }else if(kind==='VP8 '){
   if(bytes[23]!==157||bytes[24]!==1||bytes[25]!==42||!safeDimensions(view.getUint16(26,true)&16383,view.getUint16(28,true)&16383))return null;
  }else if(kind==='VP8L'){
   if(bytes[20]!==47)return null;
   const bits=view.getUint32(21,true);
   if(!safeDimensions((bits&16383)+1,((bits>>>14)&16383)+1))return null;
  }else return null;
  return 'image/webp';
 }
 return null;
}
export async function limitedForm(request) {
 const cap=MAX_FILE+64*1024;
 if(Number(request.headers.get('content-length'))>cap)throw Error('size');
 const reader=request.body?.getReader(); if(!reader)throw Error('file');
 let size=0; const chunks=[];
 try {
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>cap){await reader.cancel();throw Error('size')}chunks.push(value)}
 }finally{reader.releaseLock()}
 return new Response(new Blob(chunks),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
export function createReceiptHandler({client,origin}) {
 return async request=>{
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.headers.get('origin')!==origin)return json(403,{error:'Origem não autorizada'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json(405,{error:'Método inválido'});
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return json(401,{error:'Entre para continuar'});
  try {
   const {data:auth,error:authError}=await client.auth.getUser(token);
   if(authError||!auth?.user)return json(401,{error:'Sessão inválida'});
   const form=await limitedForm(request);
   const order=form.get('order_id'),file=form.get('receipt');
   if(file&&typeof file.size==='number'&&file.size>MAX_FILE)return json(413,{error:'Arquivo muito grande'});
   if(typeof order!=='string'||!/^[-0-9a-f]{36}$/i.test(order)||!file||typeof file.arrayBuffer!=='function'
    ||file.size<12||file.size>MAX_FILE)return json(400,{error:'Envie JPEG, PNG ou WebP de até 5 MB'});
   const {data:owned,error:orderError}=await client.from('triunfo_orders').select('id,status').eq('id',order).eq('user_id',auth.user.id).maybeSingle();
   if(orderError||!owned||['confirmed','cancelled'].includes(owned.status))return json(404,{error:'Pedido indisponível'});
   const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageMime(bytes);
   if(!mime||mime!==file.type)return json(400,{error:'O conteúdo não corresponde ao formato da imagem'});
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   const id=crypto.randomUUID(),path=auth.user.id+'/'+id;
   const bucket=client.storage.from('triunfo-receipts');
   const {error:uploadError}=await bucket.upload(path,bytes,{contentType:mime,upsert:false});
   if(uploadError)return json(503,{error:'Não foi possível armazenar o comprovante'});
   const {error:registerError}=await client.rpc('triunfo_register_receipt',{
    p_id:id,p_order:order,p_user:auth.user.id,p_hash:hash,
    p_name:String(file.name||'comprovante').slice(0,200),p_mime:mime
   });
   if(registerError){
    // Clean up only an explicit database rejection, not an uncertain network result.
    if(registerError.code && /^[0-9A-Z]{5}$/.test(registerError.code))await bucket.remove([path]);
    return json(registerError.code==='23505'?409:400,{error:registerError.code==='23505'?'Comprovante já enviado':'Não foi possível registrar o comprovante'});
   }
   // OCR worker is intentionally not emulated with client-provided text/amount.
   // Until a trusted worker is deployed, every upload requires administrator reading.
   return json(201,{receipt_id:id,status:'under_review',ocr_status:'pending',
    message:'Comprovante recebido para leitura e conferência administrativa. Não confirma recebimento bancário.'});
  }catch(error){
   return json(error.message==='size'?413:500,{error:error.message==='size'?'Arquivo muito grande':'Falha ao processar o comprovante'});
  }
 };
}
