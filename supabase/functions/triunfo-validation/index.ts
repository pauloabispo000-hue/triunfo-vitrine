import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {fixtures,fixtureBytes} from './fixtures.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const origin='https://pauloabispo000-hue.github.io';
const bucket='triunfo-receipts';
const expiry=Date.parse('2026-11-09T23:59:59Z');
let running=false;
const unwrap=async(q:any)=>{const {data,error}=await q;if(error)throw Error(error.message);return data};
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function client(token?:string){return createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:token?{headers:{Authorization:'Bearer '+token}}:{}})}
async function cleanup(run:string){
 const users=await unwrap(service.auth.admin.listUsers({page:1,perPage:1000}));
 const selected=users.users.filter((u:any)=>u.user_metadata?.triunfo_validation_run===run&&['a','b'].some(s=>u.email==='triunfo-test-'+run+'-'+s+'@example.invalid'));
 for(const u of selected){
  const list=await unwrap(service.storage.from(bucket).list(u.id,{limit:100}));
  if(list.length)await unwrap(service.storage.from(bucket).remove(list.map((o:any)=>u.id+'/'+o.name)));
 }
 const result=await unwrap(service.rpc('triunfo_cleanup_validation',{p_run:run}));
 for(const id of result.users)await unwrap(service.auth.admin.deleteUser(id));
 return {removed_users:result.users.length,removed_orders:result.orders_removed,removed_products:result.products_removed};
}
Deno.serve(async(req:Request)=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
 const reply=(status:number,data:any)=>new Response(JSON.stringify(data),{status,headers});
 if(req.headers.get('Origin')!==origin)return reply(403,{error:'Origem não autorizada'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Método inválido'});
 const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply(401,{error:'Sessão obrigatória'});
 const {data:identity,error:authError}=await service.auth.getUser(token);
 if(authError||!identity.user)return reply(401,{error:'Sessão inválida'});
 const admin=client(token);
 const {data:isAdmin,error:roleError}=await admin.rpc('triunfo_is_admin');
 if(roleError||isAdmin!==true)return reply(403,{error:'Administrador obrigatório'});
 const body=await req.json().catch(()=>({}));
 if(body.action==='cleanup'&&typeof body.run_id==='string'&&/^[0-9a-f-]{36}$/.test(body.run_id)){
  try{return reply(200,{cleanup:await cleanup(body.run_id)})}catch(e){return reply(500,{error:'Limpeza não concluída: '+e.message})}
 }
 if(Date.now()>expiry)return reply(410,{error:'Rotina temporária expirada'});
 if(body.action!=='run')return reply(400,{error:'Ação inválida'});
 if(running)return reply(409,{error:'Validação já está em execução'});
 running=true;
 const run=crypto.randomUUID(),checks:any[]=[];
 const check=(name:string,ok:boolean,detail='')=>{checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+(detail?': '+detail:''))};
 let retained:any=null;
 try{
  const {data:bucketInfo,error:bucketError}=await service.storage.getBucket(bucket);
  check('Bucket permanece privado',!bucketError&&bucketInfo.public===false);
  const accounts:any[]=[];
  for(const suffix of ['a','b']){
   const email='triunfo-test-'+run+'-'+suffix+'@example.invalid',password=(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-','')+'Aa!';
   const created=await unwrap(service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{triunfo_validation_run:run,display_name:'Teste '+suffix}}));
   const c=client();const login=await unwrap(c.auth.signInWithPassword({email,password}));
   accounts.push({id:created.user.id,c,token:login.session.access_token});
  }
  const [a,b]=accounts;
  check('Duas contas com logins e sessões independentes',a.id!==b.id&&a.token!==b.token);
  const product=await unwrap(admin.from('triunfo_products').insert({name:'TESTE VALIDACAO '+run,status:'available',price_cents:125,stock:12}).select().single());
  const orderA=await unwrap(a.c.rpc('triunfo_create_order',{p_items:[{id:product.id,qty:1,price_cents:1}],p_request:crypto.randomUUID()}));
  const orderB=await unwrap(b.c.rpc('triunfo_create_order',{p_items:[{id:product.id,qty:1}],p_request:crypto.randomUUID()}));
  const own=await unwrap(a.c.from('triunfo_orders').select('*').eq('id',orderA).single());
  check('Total calculado pelo servidor, ignorando preço adulterado',own.total_cents===125);
  const foreign=await unwrap(b.c.from('triunfo_orders').select('*').eq('id',orderA));
  check('Cliente B não consulta pedido de A',foreign.length===0);
  const mutation=await b.c.from('triunfo_products').update({price_cents:1,stock:999}).eq('id',product.id).select();
  const unchanged=await unwrap(admin.from('triunfo_products').select('price_cents,stock').eq('id',product.id).single());
  check('Cliente não altera preço nem estoque',unchanged.price_cents===125&&unchanged.stock===10&&(!!mutation.error||mutation.data.length===0));
  let observed=false,resolveEvent:any;
  const event=new Promise(resolve=>{resolveEvent=resolve});
  const channel=b.c.channel('validation-'+run).on('postgres_changes',{event:'UPDATE',schema:'public',table:'triunfo_products',filter:'id=eq.'+product.id},(p:any)=>{if(p.new.stock===11){observed=true;resolveEvent(true)}});
  const subscribed=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),8000);channel.subscribe((status:string)=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve(true)}})});
  if(subscribed){
   await unwrap(admin.from('triunfo_products').update({stock:11}).eq('id',product.id));
   await Promise.race([event,new Promise(resolve=>setTimeout(resolve,8000))]);
   await unwrap(admin.from('triunfo_products').update({stock:10}).eq('id',product.id));
  }
  await b.c.removeChannel(channel);
  check('Realtime entre sessões de clientes independentes',!!subscribed&&observed);
  await unwrap(b.c.auth.updateUser({data:{role:'admin'}}));
  check('Metadados não promovem cliente a administrador',(await unwrap(b.c.rpc('triunfo_is_admin')))===false);
  const escalate=await b.c.schema('triunfo_private').from('admins').insert({user_id:b.id});
  check('Tabela de administradores inacessível ao cliente',!!escalate.error);
  const forbiddenRunner=await fetch(url+'/functions/v1/triunfo-validation',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+a.token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'run'})});
  check('Rotina de testes inacessível ao cliente',forbiddenRunner.status===403);
  const confirm=await a.c.rpc('triunfo_confirm_payment',{p_order:orderA,p_bank_checked:true});
  check('Cliente não confirma pagamento',!!confirm.error);
  const readAttempt=await a.c.rpc('triunfo_admin_read_receipt',{p_receipt:crypto.randomUUID(),p_amount:125});
  check('Cliente não registra valor privilegiado',!!readAttempt.error);
  async function upload(account:any,order:string,bytes:Uint8Array,type='image/png'){
   const form=new FormData();form.set('order_id',order);form.set('receipt',new Blob([bytes],{type}),'ficticio.png');
   const r=await fetch(url+'/functions/v1/submit-receipt',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+account.token,Origin:origin},body:form});
   return {status:r.status,data:await r.json()};
  }
  const partial=fixtureBytes(fixtures.parcial,run);
  const uploaded=await upload(a,orderA,partial);
  check('Upload autenticado pela Edge Function',uploaded.status===201,JSON.stringify(uploaded.data));
  const receipt=await unwrap(a.c.from('triunfo_receipts').select('*').eq('id',uploaded.data.receipt_id).single());
  check('Registro contém hash calculado pelo servidor',receipt.sha256===await hash(partial));
  const stored=await unwrap(service.storage.from(bucket).list(a.id));
  check('Arquivo registrado no bucket privado',stored.some((o:any)=>o.name===receipt.id));
  const ownFile=await unwrap(a.c.storage.from(bucket).download(receipt.object_path));
  check('Download autorizado íntegro',await hash(new Uint8Array(await ownFile.arrayBuffer()))===receipt.sha256);
  const adminFile=await admin.storage.from(bucket).download(receipt.object_path);
  check('Administrador visualiza comprovante',!adminFile.error&&!!adminFile.data);
  const foreignReceipt=await unwrap(b.c.from('triunfo_receipts').select('*').eq('id',receipt.id));
  check('Cliente B não consulta comprovante de A',foreignReceipt.length===0);
  const foreignFile=await b.c.storage.from(bucket).download(receipt.object_path);
  check('Cliente B não baixa arquivo de A',!!foreignFile.error);
  const publicFile=await fetch(url+'/storage/v1/object/public/'+bucket+'/'+receipt.object_path);
  check('URL pública não entrega documento',publicFile.status!==200);
  check('Duplicação bloqueada no mesmo pedido',(await upload(a,orderA,partial)).status===409);
  check('Duplicação bloqueada entre clientes',(await upload(b,orderB,partial)).status===409);
  const filesA=await unwrap(service.storage.from(bucket).list(a.id));
  const filesB=await unwrap(service.storage.from(bucket).list(b.id));
  check('Duplicatas não deixam novos arquivos no bucket',filesA.length===1&&filesB.length===0);
  check('Upload em pedido de outro cliente bloqueado',(await upload(b,orderA,fixtureBytes(fixtures.correto,run))).status===404);
  const invalid=await upload(a,orderA,new TextEncoder().encode('<html>arquivo inválido</html>'));
  check('Arquivo com conteúdo inválido bloqueado',invalid.status===400);
  const truncated=await upload(a,orderA,new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,1]));
  check('PNG truncado bloqueado',truncated.status===400);
  const oversized=await upload(a,orderA,new Uint8Array(5*1024*1024+1));
  check('Arquivo acima de 5 MB bloqueado',[400,413].includes(oversized.status));
  const orderState=async(id:string)=>await unwrap(admin.from('triunfo_orders').select('*').eq('id',id).single());
  const transaction='E'+run.replaceAll('-','').toUpperCase();
  await unwrap(admin.rpc('triunfo_admin_read_receipt',{p_receipt:receipt.id,p_amount:50,p_transaction:transaction}));
  let state=await orderState(orderA);
  check('Valor inferior gera saldo pendente',state.status==='amount_pending'&&state.total_cents-state.recognized_cents===75);
  const complementary=await upload(a,orderA,fixtureBytes(fixtures.complementar,run));
  check('Comprovante complementar aceito',complementary.status===201);
  const repeated=await admin.rpc('triunfo_admin_read_receipt',{p_receipt:complementary.data.receipt_id,p_amount:75,p_transaction:transaction});
  check('Identificador de transação repetido bloqueado',!!repeated.error);
  await unwrap(admin.rpc('triunfo_admin_read_receipt',{p_receipt:complementary.data.receipt_id,p_amount:75}));
  state=await orderState(orderA);
  check('Soma exata permanece aguardando confirmação',state.status==='amount_matches'&&state.recognized_cents===125);
  await unwrap(admin.rpc('triunfo_admin_read_receipt',{p_receipt:complementary.data.receipt_id,p_amount:100}));
  check('Valor excedente exige análise',(await orderState(orderA)).status==='manual_review');
  await unwrap(admin.rpc('triunfo_admin_read_receipt',{p_receipt:complementary.data.receipt_id,p_amount:null}));
  check('Leitura inconclusiva exige análise',(await orderState(orderA)).status==='manual_review');
  await unwrap(admin.rpc('triunfo_admin_read_receipt',{p_receipt:complementary.data.receipt_id,p_amount:75}));
  const exact=await upload(b,orderB,fixtureBytes(fixtures.correto,run));
  check('Segundo cliente envia seu comprovante',exact.status===201);
  await unwrap(admin.rpc('triunfo_admin_read_receipt',{p_receipt:exact.data.receipt_id,p_amount:125}));
  check('Valor exato não confirma recebimento bancário',(await orderState(orderB)).status==='amount_matches');
  const direct=a.c.from('triunfo_receipts').update({recognized_cents:999,status:'read'}).eq('id',receipt.id);
  check('Cliente não adultera leitura de comprovante',!!(await direct).error);
  retained={run_id:run,order_id:orderB,receipt_id:exact.data.receipt_id,object_path:b.id+'/'+exact.data.receipt_id};
 }catch(e){
  if(!checks.some(c=>!c.passed))checks.push({name:'Execução',passed:false,detail:e.message});
 }
 running=false;
 return reply(200,{run_id:run,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks,retained,warning:'Valores digitados para testar regras; OCR e recebimento bancário não simulados como confirmados.'});
});
