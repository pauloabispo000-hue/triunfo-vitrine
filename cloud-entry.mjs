import { createTriunfoAPI } from './supabase-api.mjs?v=google-auth-1';
import { recognizeReceipt } from './receipt-ocr.mjs?v=2';

export async function startCloud(client) {
 const validationPage=location.pathname.endsWith('/validacao.html');
 const googleEnabled=validationPage&&window.TRIUNFO_CLOUD?.googleOAuth===true;
 const api=createTriunfoAPI(client,validationPage?{
  redirectTo:'https://pauloabispo000-hue.github.io/triunfo-vitrine/validacao.html'
 }:undefined);
 let recoveryUserId=null;
 let syncGeneration=0,refreshTimer,subscription,checkoutRequest=null;
 let refreshFlight=null,refreshRequested=false;
 const message=error=>error?.message||'Não foi possível concluir. Tente novamente.';
 const attempt=fn=>async(...args)=>{
  try{return await fn(...args)}catch(error){alert(message(error))}
 };
 async function readState(){
  const generation=syncGeneration;
  const {data:{session}}=await client.auth.getSession();
  let account=null;
  if(session)account=await api.account();
  const [products,settings,suggestions,cart,orders]=await Promise.all([
   api.products(),api.settings(),account?api.suggestions():[],
   account?api.cart():[],account?api.orders():[]
  ]);
  if(generation!==syncGeneration)return;
  user=account?{id:account.id,username:account.display_name,role:account.role,photo:account.photo}:null;
  db={products,settings,suggestions:suggestions.map(s=>({...s,user:s.user_id})),
   cart:cart.map(i=>({id:i.product_id,qty:i.qty})),orders,users:[],votes:{}};
  render();
 }
 function refresh(){
  refreshRequested=true;
  if(!refreshFlight){
   refreshFlight=(async()=>{
    do{refreshRequested=false;await readState()}while(refreshRequested);
   })().finally(()=>{refreshFlight=null});
  }
  return refreshFlight;
 }
 function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh().catch(error=>console.warn(message(error))),300)}
 const googleButton=googleEnabled?'<button type="button" class="btn secondary" onclick="startGoogleLogin(this)">Entrar com Google</button>':'';
 window.startGoogleLogin=attempt(async(button)=>{
  if(!googleEnabled||button.disabled)return;
  button.disabled=true;
  try{await api.loginWithGoogle()}
  catch(error){button.disabled=false;throw error}
 });
 auth=function(mode){
  if(mode==='setup-admin')return alert('A permissão administrativa é concedida pelo responsável da loja.');
  const register=mode==='register';
  closeModal();modal(`<h2>${register?'Criar conta':'Entrar'}</h2><form onsubmit="authSubmit(event,'${register?'register':'login'}')">
   ${register?'<label class="field">Nome<input name="name" maxlength="90" required autocomplete="name"></label>':''}
   <label class="field">E-mail<input name="email" type="email" required autocomplete="email"></label>
   <label class="field">Senha<input name="password" type="password" minlength="8" required autocomplete="${register?'new-password':'current-password'}"></label>
   <button class="btn">${register?'Cadastrar':'Entrar'}</button></form>
   <div class="actions">${googleButton}
   ${register?'':'<button class="btn secondary" onclick="auth(\'register\')">Cadastrar</button> <button class="btn secondary" onclick="requestCloudRecovery()">Esqueci a senha</button>'}</div>`);
 };
 window.requestCloudRecovery=()=>{
  closeModal();modal(`<h2>Recuperar senha</h2><form onsubmit="sendCloudRecovery(event)">
   <label class="field">E-mail<input name="email" type="email" required autocomplete="email"></label>
   <button class="btn">Enviar link</button></form>`);
 };
 window.sendCloudRecovery=attempt(async(e)=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  try{
   await api.requestPasswordReset(String(new FormData(e.target).get('email')).trim());
   closeModal();modal('<h2>Confira seu e-mail</h2><p>Se a conta estiver apta, você receberá um link para redefinir a senha.</p>');
  }finally{if(button.isConnected)button.disabled=false}
 });
 function showPasswordReset(){
  closeModal();modal(`<h2>Definir nova senha</h2><form onsubmit="finishCloudRecovery(event)">
   <label class="field">Nova senha<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
   <label class="field">Confirmar nova senha<input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label>
   <button class="btn">Salvar nova senha</button></form>`);
 }
 window.finishCloudRecovery=attempt(async(e)=>{
  e.preventDefault();const f=new FormData(e.target),password=String(f.get('password')||'');
  if(password.length<8||password!==f.get('confirm'))throw Error('Informe duas senhas iguais com pelo menos 8 caracteres.');
  const expectedId=recoveryUserId;
  if(!expectedId)throw Error('Abra um link de recuperação válido para continuar.');
  const button=e.target.querySelector('button');button.disabled=true;
  try{
   const {data,error}=await client.auth.getUser();
   if(error||data?.user?.id!==expectedId||recoveryUserId!==expectedId)throw Error('Abra um novo link de recuperação.');
   await api.changePassword(password);
   recoveryUserId=null;closeModal();await logout();
   modal('<h2>Senha atualizada</h2><p>Entre novamente com a nova senha.</p>');
  }finally{if(button.isConnected)button.disabled=false}
 });
 authSubmit=attempt(async(e,mode)=>{
  e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector('button');
  button.disabled=true;
  try{
   if(mode==='register'){
    const result=await api.register(String(f.get('email')).trim(),String(f.get('password')),String(f.get('name')));
    if(!result.session){closeModal();return alert('Cadastro recebido. Confira seu e-mail para confirmar a conta antes de entrar.')}
   }else await api.login(String(f.get('email')).trim(),String(f.get('password')));
   closeModal();await refresh();nav(admin()?'admin':'account');
  }finally{if(button.isConnected)button.disabled=false}
 });
 logout=attempt(async()=>{await api.logout();checkoutRequest=null;user=null;db.cart=[];db.orders=[];closeModal();await refresh();nav('home')});
 accountView=function(){
  if(!user)return `<h2>Minha conta</h2><div class="panel"><div class="actions"><button class="btn" onclick="auth('login')">Entrar</button> <button class="btn secondary" onclick="auth('register')">Cadastrar</button>${googleButton}</div></div>`;
  return `<h2>Minha conta</h2><div class="panel"><b>${esc(user.username)}</b>
   ${user.photo?'<img class="preview" src="'+esc(user.photo)+'" alt="Foto do perfil">':''}
   <label class="field">Foto do perfil<input type="file" accept="image/*" onchange="uploadProfilePhoto(event)"></label>
   <div class="actions"><button class="btn secondary" onclick="nav('orders')">Pedidos</button>
   ${admin()?'<button class="btn" onclick="nav(\'admin\')">Administração</button>':''}
   <button class="btn outline" onclick="logout()">Sair</button></div></div>`;
 };
 saveProfileCrop=attempt(async()=>{
  const p=profileCrop;if(!p.image||!user)return;
  const size=512,scale=p.base*p.scale,sw=220/scale,sh=220/scale;
  const x=Math.max(0,Math.min(p.image.width-sw,p.image.width/2-p.x/scale));
  const y=Math.max(0,Math.min(p.image.height-sh,p.image.height/2-p.y/scale));
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  canvas.getContext('2d').drawImage(p.image,x,y,Math.min(sw,p.image.width-x),Math.min(sh,p.image.height-y),0,0,size,size);
  await api.updateProfile(user.username,canvas.toDataURL('image/jpeg',.7));closeModal();await refresh();
 });
 vote=attempt(async(pid,yes)=>{if(!mustLogin())return;await api.vote(pid,Boolean(yes));await refresh()});
 suggest=attempt(async(e)=>{
  e.preventDefault();if(!mustLogin())return;
  const f=new FormData(e.target);await api.suggest(String(f.get('name')).trim(),await fileData(f.get('photo')));
  alert('Sugestão enviada');await refresh();nav('home');
 });
 addCart=attempt(async(pid)=>{
  if(!mustLogin())return;const item=db.cart.find(i=>i.id===pid),qty=(item?.qty||0)+1;
  validateStock([{id:pid,qty}]);await api.setCartItem(pid,qty);await refresh();
 });
 qtyChange=attempt(async(pid,n)=>{
  const item=db.cart.find(i=>i.id===pid);if(!item)return;
  const qty=Math.max(0,item.qty+n);if(qty)validateStock([{id:pid,qty}]);
  await api.setCartItem(pid,qty);await refresh();
 });
 payment=attempt(async(items)=>{
  if(!mustLogin())return;
  if(!db.settings.pix)return alert('Pix ainda não configurado pela loja.');
  validateStock(items);
  const fingerprint=JSON.stringify(items.map(i=>({id:i.id,qty:i.qty})).sort((a,b)=>a.id.localeCompare(b.id)));
  if(!checkoutRequest||checkoutRequest.fingerprint!==fingerprint)checkoutRequest={id:crypto.randomUUID(),fingerprint};
  const orderId=await api.createOrder(items,checkoutRequest.id);
  checkoutRequest=null;await refresh();showPayment(orderId);
 });
 function showPayment(orderId){
  const order=db.orders.find(o=>o.id===orderId);if(!order)return alert('Pedido criado. Abra Pedidos para continuar.');
  modal(`<h2>Pagamento Pix</h2><b class="price">${money(order.total_cents/100)}</b>
   <label class="field">Chave Pix<input id="pix" readonly value="${esc(db.settings.pix)}"></label>
   <button class="btn secondary" onclick="navigator.clipboard.writeText(document.getElementById('pix').value)">Copiar chave Pix</button>
   <label class="field">Comprovante<input id="receipt" type="file" accept="image/jpeg,image/png,image/webp"></label>
   <button class="btn" onclick="sendOrder('${orderId}')">Enviar comprovante</button>
   <p class="tiny">Envie uma imagem de até 5 MB. O recebimento do Pix será conferido pelo administrador.</p>`);
 }
 window.resumeCloudPayment=showPayment;
 sendOrder=attempt(async(orderId)=>{
  const file=$('#receipt')?.files?.[0];if(!file)return alert('Anexe o comprovante.');
  if(sendingOrder)return;sendingOrder=true;
  try{await api.sendReceipt(orderId,file);closeModal();await refresh();nav('orders')}
  finally{sendingOrder=false}
 });
 const labels={
  awaiting_receipt:'Aguardando comprovante',under_review:'Aguardando leitura do comprovante',
  amount_matches:'Valor compatível — aguardando confirmação',amount_pending:'Valor inferior — saldo pendente',
  manual_review:'Análise administrativa',confirmed:'Recebimento bancário confirmado',cancelled:'Cancelado'
 };
 ordersView=function(){
  if(!user)return '<h2>Pedidos</h2><button class="btn" onclick="auth(\'login\')">Entrar</button>';
  return '<h2>Pedidos</h2><div class="panel">'+(db.orders.map(o=>{
   const pending=Math.max(0,o.total_cents-o.recognized_cents);
   return `<div class="line"><div class="row"><b>Pedido ${esc(o.id.slice(0,8))}</b><span class="badge">${labels[o.status]||esc(o.status)}</span></div>
    <p>${(o.triunfo_order_items||[]).map(i=>i.qty+' × '+esc(i.name)).join(', ')}</p>
    <b>${money(o.total_cents/100)}</b>
    ${o.status==='amount_pending'?'<p>Saldo pendente: '+money(pending/100)+'</p>':''}
    <div class="actions">
    ${!['confirmed','cancelled'].includes(o.status)?'<button class="btn secondary" onclick="resumeCloudPayment(\''+o.id+'\')">Enviar comprovante / complementar</button>':''}
    <button class="btn secondary" onclick="inspectOrder('${o.id}')">Ver comprovantes</button>
    ${o.status==='awaiting_receipt'||admin()&&!['confirmed','cancelled'].includes(o.status)?'<button class="btn outline" onclick="cancelCloudOrder(\''+o.id+'\')">Cancelar pedido</button>':''}
    ${admin()&&o.status==='amount_matches'?'<button class="btn" onclick="confirmCloudPayment(\''+o.id+'\')">Confirmar recebimento bancário</button>':''}
    </div></div>`;
  }).join('')||'Nenhum pedido.')+'</div>';
 };
 window.cancelCloudOrder=function(id){
  closeModal();modal(`<h2>Cancelar pedido?</h2><p>Os itens deste pedido serão devolvidos ao estoque.</p>
   <div class="actions"><button class="btn secondary" onclick="closeModal()">Voltar</button>
   <button class="btn" onclick="applyCloudCancellation('${id}')">Confirmar cancelamento</button></div>`);
 };
 window.applyCloudCancellation=attempt(async(id)=>{
  await api.cancelOrder(id);closeModal();await refresh();
 });
 window.confirmCloudPayment=function(id){
  if(!admin())return;
  closeModal();modal(`<h2>Confirmar recebimento bancário</h2>
   <p>A compatibilidade do comprovante não confirma o crédito na conta.</p>
   <form onsubmit="applyCloudBankConfirmation(event,'${id}')">
   <label><input type="checkbox" name="bankChecked" required> Conferi o recebimento do valor exato na conta bancária.</label>
   <div class="actions"><button type="button" class="btn secondary" onclick="closeModal()">Voltar</button>
   <button class="btn" type="submit">Confirmar recebimento</button></div></form>`);
 };
 window.applyCloudBankConfirmation=attempt(async(e,id)=>{
  e.preventDefault();if(!admin()||new FormData(e.target).get('bankChecked')!=='on')return;
  await api.confirmPayment(id,true);closeModal();await refresh();
 });
 let receiptURLs=[];
 const oldClose=closeModal;
 closeModal=function(){for(const url of receiptURLs)URL.revokeObjectURL(url);receiptURLs=[];oldClose()};
 inspectOrder=attempt(async(id)=>{
  const receipts=await api.receipts(id);closeModal();
  modal('<h2>Comprovantes</h2><div id="cloud-receipt-list">'+(receipts.length?'Carregando…':'Nenhum comprovante enviado.')+'</div>');
  const cards=[];
  for(const r of receipts){
   const blob=await api.receiptFile(r.object_path),url=URL.createObjectURL(blob);receiptURLs.push(url);
   cards.push(`<section class="line"><img src="${url}" alt="Comprovante de pagamento" style="max-width:100%">
    <p>${r.recognized_cents===null?'Leitura pendente':money(r.recognized_cents/100)}</p>
    ${admin()?'<button class="btn secondary" onclick="readCloudReceiptOCR(\''+r.id+'\',\''+esc(r.object_path)+'\')">Ler imagem com OCR local</button><p class="tiny" id="ocr-'+r.id+'">A leitura não confirma recebimento bancário.</p><label class="field">Valor lido no documento (R$)<input id="amount-'+r.id+'" type="number" step=".01" min=".01"></label><label class="field">Identificador da transação (opcional)<input id="transaction-'+r.id+'" maxlength="64"></label><button class="btn" onclick="recordPayment(\''+r.id+'\')">Registrar leitura</button>':''}</section>`);
  }
  const list=$('#cloud-receipt-list');if(list)list.innerHTML=cards.join('');
 });
 window.readCloudReceiptOCR=attempt(async(receiptId,path)=>{
  if(!admin())return;
  const status=$('#ocr-'+receiptId);if(!status)return;
  status.textContent='Lendo no seu dispositivo…';
  try{
   const blob=await api.receiptFile(path);
   const result=await recognizeReceipt(blob,(_step,p)=>{if(status.isConnected)status.textContent='Leitura local: '+Math.round((p||0)*100)+'%'});
   if(!status.isConnected)return;
   if(result.cents===null){status.textContent='Leitura inconclusiva. Faça a conferência manual.';return}
   $('#amount-'+receiptId).value=(result.cents/100).toFixed(2);
   if(result.transactionId)$('#transaction-'+receiptId).value=result.transactionId;
   status.textContent='Sugestão OCR: '+money(result.cents/100)+'. Confira a imagem e clique em Registrar leitura. O crédito bancário continua não confirmado.';
  }catch(e){if(status.isConnected)status.textContent='OCR indisponível: '+message(e)}
 });
 recordPayment=attempt(async(receiptId)=>{
  if(!admin())return;const raw=$('#amount-'+receiptId)?.value;
  if(!raw||!Number.isFinite(Number(raw))||Number(raw)<=0)return alert('Informe um valor positivo.');
  const cents=Math.round(Number(raw)*100),transaction=$('#transaction-'+receiptId)?.value.trim()||null;
  await api.recordReading(receiptId,cents,transaction);closeModal();await refresh();
  alert('Leitura registrada. A confirmação bancária continua pendente.');
 });
 newProduct=attempt(async(e)=>{
  e.preventDefault();if(!admin())return;const f=new FormData(e.target);
  const image=f.get('photo')?.size?await fileData(f.get('photo')):'';
  await api.saveProduct({name:String(f.get('name')).trim(),price_cents:Math.round(Number(f.get('price'))*100),status:f.get('status'),image,stock:0});
  await refresh();
 });
 saveProductEdit=attempt(async(e,pid)=>{
  e.preventDefault();if(!admin())return;const f=new FormData(e.target),existing=db.products.find(p=>p.id===pid);
  if(!existing)return;
  const image=f.get('photo')?.size?await fileData(f.get('photo')):existing.image;
  await api.saveProduct({id:pid,name:String(f.get('name')).trim(),price_cents:Math.round(Number(f.get('price'))*100),status:f.get('status'),image});
  closeModal();await refresh();
 });
 const localCountStock=countStock;
 countStock=function(pid){
  localCountStock(pid);
  const notice=document.querySelector('#modal p.tiny');
  if(notice)notice.textContent='Informe o total disponível agora. O estoque é reservado na criação do pedido e devolvido quando ele é cancelado.';
 };
 saveStock=attempt(async(e,pid)=>{
  e.preventDefault();if(!admin())return;const stock=Number(new FormData(e.target).get('stock'));
  if(!Number.isSafeInteger(stock)||stock<0||stock>1000000)throw Error('Quantidade inválida.');
  await api.saveProduct({id:pid,stock});closeModal();await refresh();
 });
 statusSet=attempt(async(id,status)=>{if(!admin())return;await api.saveProduct({id,status});await refresh()});
 duplicateProduct=attempt(async(id)=>{if(!admin())return;await api.duplicateProduct(id);await refresh()});
 deleteProduct=function(id){
  if(!admin())return;
  closeModal();modal(`<h2>Arquivar produto?</h2><p>O histórico será preservado.</p>
   <div class="actions"><button class="btn secondary" onclick="closeModal()">Voltar</button>
   <button class="btn" onclick="applyCloudArchive('${id}')">Arquivar produto</button></div>`);
 };
 window.applyCloudArchive=attempt(async(id)=>{
  if(!admin())return;await api.archiveProduct(id);closeModal();await refresh();
 });
 review=attempt(async(id,accepted)=>{if(!admin())return;await api.reviewSuggestion(id,Boolean(accepted));await refresh()});
 settingsSave=attempt(async(e)=>{
  e.preventDefault();if(!admin())return;const f=new FormData(e.target);
  await api.saveSettings(String(f.get('store')).trim(),String(f.get('pix')).trim());await refresh();
 });
 const oldAdminContent=adminContent;
 adminContent=function(){
  const html=oldAdminContent();
  if(adminTab==='settings')return html.replace(/<p class="tiny">Votos mínimos[\s\S]*?<\/p>/,'').replace(/(<input[^>]*name="pix"[^>]*) required/g,'$1');
  if(adminTab==='products')return html.replace('<select name="status">','<select name="status"><option value="archived">Arquivado (rascunho)</option>');
  return html;
 };
 // Fetch current state after reconnect/focus; do not cache private domain data locally.
 client.auth.onAuthStateChange((event,session)=>{
  if(recoveryUserId&&session?.user?.id!==recoveryUserId)recoveryUserId=null;
  if(event==='PASSWORD_RECOVERY'&&session?.user?.id){
   recoveryUserId=session.user.id;
   setTimeout(()=>{if(recoveryUserId===session.user.id)showPasswordReset()},0);
  }
  if(event==='SIGNED_OUT'){++syncGeneration;user=null;db.orders=[];db.cart=[];db.suggestions=[];render()}
  setTimeout(()=>refresh().catch(error=>console.warn(message(error))),0)
 });
 subscription=api.subscribe(scheduleRefresh,status=>{if(status==='SUBSCRIBED')scheduleRefresh()});
 window.addEventListener('focus',scheduleRefresh);
 // Fallback also catches catalog removals whose new row is hidden by RLS.
 const recoveryTimer=setInterval(()=>{if(document.visibilityState==='visible')scheduleRefresh()},60000);
 window.addEventListener('pagehide',()=>{subscription?.();clearTimeout(refreshTimer);clearInterval(recoveryTimer)},{once:true});
 await refresh();
 return {refresh,api};
}

async function bootCloud(){
 try{
  const {createClient}=await import('./vendor/supabase.mjs');
  const usePkce=location.pathname.endsWith('/validacao.html')&&window.TRIUNFO_CLOUD.googleOAuth===true;
  await startCloud(createClient(window.TRIUNFO_CLOUD.url,window.TRIUNFO_CLOUD.publishableKey,{
   auth:{storageKey:'triunfo-cloud-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,
    flowType:usePkce?'pkce':'implicit'}
  }));
 }catch(error){
  document.querySelector('#app').textContent='Não foi possível conectar à loja. Atualize a página para tentar novamente.';
  console.error('Falha de conexão com a loja:',error.message);
 }
}
if(window.TRIUNFO_CLOUD?.enabled)void bootCloud();
