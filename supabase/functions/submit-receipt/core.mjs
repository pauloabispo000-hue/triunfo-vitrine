// No credentials in this module. Dependencies are injected for local validation.
export const MAX_FILE = 5 * 1024 * 1024;
export function imageMime(bytes) {
 if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';
 const ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
 if(ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP')return 'image/webp';
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
