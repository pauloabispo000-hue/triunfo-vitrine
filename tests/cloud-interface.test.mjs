import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

const bundle=await build({entryPoints:['cloud-entry.mjs'],bundle:true,write:false,format:'iife',globalName:'CloudUI',platform:'browser',external:['./vendor/supabase.mjs']});
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const pid='20000000-0000-4000-8000-000000000001';
const oid='30000000-0000-4000-8000-000000000001';
function mockClient({isAdmin=false,signedIn=true}={}){
 const calls=[];
 const rows={
  profiles:{id:'customer-a',display_name:'Cliente A'},
  products:[{id:pid,name:'Mousse',price_cents:1200,status:'available',stock:10,image:null,emoji:'🍮'}],
  settings:{store:'Triunfo',pix:'teste-chave'},
  suggestions:[],cart_items:[{product_id:pid,qty:2}],
  orders:[{id:oid,total_cents:2400,recognized_cents:2400,status:'amount_matches',triunfo_order_items:[{name:'Mousse',qty:2}]}]
 };
 function from(name){
  const key=name.replace('triunfo_','');let payload,mutation=false;
  const q={
   select(){return this},eq(){return this},order(){return this},limit(){return this},single(){return this},
   update(value){payload=value;mutation=true;return this},insert(value){payload=value;mutation=true;return this},
   upsert(value){payload=value;mutation=true;return this},delete(){mutation=true;return this},
   then(resolve,reject){if(mutation)calls.push({table:name,payload});return Promise.resolve({data:mutation?{id:pid}:rows[key],error:null}).then(resolve,reject)}
  };return q;
 }
 return {
  calls,rows,
  auth:{
   async getUser(){return {data:{user:signedIn?{id:'customer-a'}:null}}},
   async getSession(){return {data:{session:signedIn?{}:null}}},
   onAuthStateChange(){return {}},
   async signOut(){signedIn=false;return {error:null}}
  },
  from,async rpc(name,args){calls.push({rpc:name,args});return {data:name==='triunfo_is_admin'?isAdmin:name==='triunfo_vote_totals'?[]:name==='triunfo_create_order'?oid:null,error:null}},
  channel(){return {on(){return this},subscribe(){return this}}},
  removeChannel(){},
  functions:{async invoke(){return {data:{status:'under_review'}}}}
 };
}
async function mount(options={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 const observers=[],NativeObserver=w.MutationObserver;
 w.MutationObserver=class extends NativeObserver{constructor(callback){super(callback);observers.push(this)}};
 w.ResizeObserver=class {observe(){}disconnect(){}};
 w.structuredClone=structuredClone;
 w.alerts=[];w.alert=m=>w.alerts.push(m);w.confirm=()=>true;w.scrollTo=()=>{};
 w.TRIUNFO_CLOUD={enabled:true};
 // A cached local administrator must not authorize a cloud session.
 w.localStorage.setItem('triunfo-demo',JSON.stringify({users:[{id:'admin-local',username:'Admin',role:'admin'}]}));
 w.sessionStorage.setItem('triunfo-demo-user',JSON.stringify({id:'admin-local',username:'Admin',role:'admin'}));
 const before=w.localStorage.getItem('triunfo-demo');
 new Script(app).runInContext(dom.getInternalVMContext());
 assert.equal(w.localStorage.getItem('triunfo-demo'),before);
 assert.equal(w.eval('user'),null);
 w.TRIUNFO_CLOUD={enabled:false};
 new Script(bundle.outputFiles[0].text).runInContext(dom.getInternalVMContext());
 const client=mockClient(options),running=await w.CloudUI.startCloud(client);
 return {w,client,running,close(){for(const observer of observers)observer.disconnect();w.dispatchEvent(new w.Event('pagehide'));w.close()}};
}
test('cloud mode ignores cached local administrator and renders server catalog',async()=>{
 const m=await mount();try{
  assert.equal(m.w.eval('admin()'),false);
  assert.match(m.w.document.querySelector('main').textContent,/Mousse/);
  assert.equal(m.w.document.querySelectorAll('button').length>0,true);
  assert.doesNotMatch(m.w.document.querySelector('#app').textContent,/Administração/);
  m.w.auth('login');
  assert.ok(m.w.document.querySelector('input[type=email]'));
 }finally{m.close()}
});
test('compatible amount is never rendered as bank-confirmed',async()=>{
 const m=await mount();try{
  m.w.nav('orders');
  assert.match(m.w.document.querySelector('main').textContent,/Valor compatível — aguardando confirmação/);
  assert.doesNotMatch(m.w.document.querySelector('main').textContent,/Recebimento bancário confirmado/);
 }finally{m.close()}
});
test('checkout sends only product IDs and quantities, then displays server total',async()=>{
 const m=await mount();try{
  await m.w.payment([{id:pid,qty:2,price:0.01}]);
  const call=m.client.calls.find(c=>c.rpc==='triunfo_create_order');
  assert.deepEqual(JSON.parse(JSON.stringify(call.args.p_items)),[{id:pid,qty:2}]);
  assert.match(m.w.document.querySelector('#modal').textContent,/24,00/);
 }finally{m.close()}
});
test('stock update never overwrites product price/name with stale fields',async()=>{
 const m=await mount({isAdmin:true});try{
  m.w.countStock(pid);
  const form=m.w.document.querySelector('#modal form');form.elements.stock.value='4';
  await m.w.saveStock({preventDefault(){},target:form},pid);
  const call=m.client.calls.find(c=>c.table==='triunfo_products');
  assert.deepEqual(JSON.parse(JSON.stringify(call.payload)),{stock:4});
 }finally{m.close()}
});
test('signout removes private in-memory orders and never falls back to local admin',async()=>{
 const m=await mount();try{
  await m.w.logout();
  assert.equal(m.w.eval('user'),null);assert.equal(m.w.eval('db.orders.length'),0);
  assert.equal(m.w.eval('admin()'),false);
 }finally{m.close()}
});
