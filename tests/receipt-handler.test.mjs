import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptHandler,imageMime,MAX_FILE} from '../supabase/functions/submit-receipt/core.mjs';
const origin='https://pauloabispo000-hue.github.io';
const validPNG=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==','base64'));
const order='10000000-0000-4000-8000-000000000001';
function fixture({authorized=true,owned=true,duplicate=false,uploadError=false}={}){
 const calls=[];
 const query={select(){return this},eq(){return this},async maybeSingle(){return {data:owned?{id:order,status:'awaiting_receipt'}:null}}};
 const bucket={async upload(path,bytes,options){calls.push(['upload',path,bytes.length,options]);return {error:uploadError?{}:null}},async remove(paths){calls.push(['remove',paths]);return {error:null}}};
 const client={
  auth:{async getUser(){return {data:authorized?{user:{id:'user-a'}}:null,error:authorized?null:{}}}},
  from(){return query}, storage:{from(){return bucket}},
  async rpc(name,args){calls.push(['rpc',name,args]);return {error:duplicate?{code:'23505'}:null}}
 };
 return {calls,handler:createReceiptHandler({client,origin})};
}
function request(bytes=validPNG,options={}){
 const body=new FormData();body.set('order_id',order);body.set('receipt',new Blob([bytes],{type:options.type||'image/png'}),'test.png');
 return new Request('https://example.test/submit-receipt',{method:'POST',headers:{origin,authorization:'Bearer fake-test-token',...options.headers},body});
}
test('signatures recognize PNG/JPEG/WebP and reject unknown content',()=>{
 assert.equal(imageMime(validPNG),'image/png');
 assert.equal(imageMime(new Uint8Array([255,216,255,0])),null);
 assert.equal(imageMime(new TextEncoder().encode('RIFF0000WEBP')),null);
 assert.equal(imageMime(new TextEncoder().encode('<script>')) ,null);
});
test('unauthenticated/foreign-origin/foreign-order requests cannot upload',async()=>{
 for(const options of [{authorized:false},{owned:false}]){
  const {calls,handler}=fixture(options);const r=await handler(request());
  assert.ok([401,404].includes(r.status));assert.equal(calls.length,0);
 }
 const {handler,calls}=fixture();
 assert.equal((await handler(request(undefined,{headers:{origin:'https://evil.test'}}))).status,403);
 assert.equal(calls.length,0);
});
test('invalid signatures and oversized bodies rejected',async()=>{
 const {calls,handler}=fixture();
 assert.equal((await handler(request(new TextEncoder().encode('not a real image at all')))).status,400);
 assert.equal((await handler(request(undefined,{headers:{'content-length':String(MAX_FILE+100000)}}))).status,413);
 assert.equal(calls.length,0);
});
test('server computes SHA256 and never accepts amount as banking confirmation',async()=>{
 const {calls,handler}=fixture();const r=await handler(request());assert.equal(r.status,201);
 const result=await r.json();assert.equal(result.status,'under_review');assert.equal(result.ocr_status,'pending');
 const args=calls.find(c=>c[0]==='rpc')[2];
 assert.match(args.p_hash,/^[0-9a-f]{64}$/);assert.equal(args.p_user,'user-a');
 assert.equal(args.p_amount,undefined);assert.equal(args.status,undefined);
});
test('global duplicate constraint cleans new file and returns conflict',async()=>{
 const {calls,handler}=fixture({duplicate:true});
 assert.equal((await handler(request())).status,409);
 assert.ok(calls.some(c=>c[0]==='remove'));
});
test('storage failure never registers a receipt',async()=>{
 const {calls,handler}=fixture({uploadError:true});
 assert.equal((await handler(request())).status,503);
 assert.ok(!calls.some(c=>c[0]==='rpc'));
});

test('truncated PNG and damaged CRC never reach storage',async()=>{
 const {handler,calls}=fixture();
 assert.equal((await handler(request(validPNG.subarray(0,20)))).status,400);
 const damaged=validPNG.slice();damaged[damaged.length-1]^=1;
 assert.equal((await handler(request(damaged))).status,400);
 assert.equal(calls.length,0);
});
