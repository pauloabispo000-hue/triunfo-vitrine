// Local PostgreSQL/WASM validation, not a substitute for hosted Auth/Storage tests.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
 grant usage on schema auth to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select on storage.objects to anon,authenticated;
`);
await db.exec(await readFile(new URL('../supabase/migrations/202611080001_triunfo.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202611080002_image_safety.sql',import.meta.url),'utf8'));
const uid = ['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
const product='20000000-0000-4000-8000-000000000001';
const voting='20000000-0000-4000-8000-000000000002';
const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
async function asUser(index,fn,role='authenticated'){
 await db.exec('begin');
 try {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[index===null?'':uid[index]]);
  await db.exec('set local role '+role);
  const result=await fn(); await db.exec('commit'); return result;
 }catch(e){await db.exec('rollback'); throw e}
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name)}
for(let i=0;i<uid.length;i++)await db.query("insert into auth.users(id,raw_user_meta_data) values($1,$2)",[uid[i],{display_name:'Teste '+i}]);
await db.query('insert into triunfo_private.admins(user_id) values($1)',[uid[2]]);
await db.query("insert into public.triunfo_products(id,name,price_cents,status,stock) values($1,'Mousse',1200,'available',10),($2,'Trufa',0,'voting',0)",[product,voting]);
await test('profiles created without storing passwords',async()=>{
 assert.equal(await scalar('select count(*)::int from public.triunfo_profiles'),3);
 assert.equal(await scalar("select count(*)::int from information_schema.columns where table_name='triunfo_profiles' and column_name like '%password%'"),0);
});
await test('all 10 exposed tables have RLS',async()=>assert.equal(await scalar("select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'triunfo_%' and c.relkind='r' and c.relrowsecurity"),10));
await test('anonymous catalog and no private profiles',async()=>{
 assert.equal(await asUser(null,()=>scalar('select count(*)::int from public.triunfo_products'),'anon'),2);
 await assert.rejects(asUser(null,()=>db.query('select * from public.triunfo_profiles'),'anon'),/permission denied/);
});
await test('users see only their profile and cannot become admin',async()=>{
 assert.equal(await asUser(0,()=>scalar('select count(*)::int from public.triunfo_profiles')),1);
 assert.equal(await asUser(0,()=>scalar('select public.triunfo_is_admin()')),false);
 await assert.rejects(asUser(0,()=>db.query('insert into triunfo_private.admins(user_id) values($1)',[uid[0]])),/permission denied/);
});
await test('voting unique per user; clients cannot change votes',async()=>{
 await asUser(0,()=>db.query('select public.triunfo_cast_vote($1,false)',[voting]));
 await assert.rejects(asUser(0,()=>db.query('select public.triunfo_cast_vote($1,true)',[voting])),/duplicate key/);
 await asUser(1,()=>db.query('select public.triunfo_cast_vote($1,false)',[voting]));
 assert.equal(await asUser(0,()=>scalar('select count(*)::int from public.triunfo_votes')),1);
 const totals=await asUser(null,()=>db.query('select * from public.triunfo_vote_totals()'),'anon');
 assert.equal(Number(totals.rows[0].no),2);
 await assert.rejects(asUser(0,()=>db.query('delete from public.triunfo_votes')),/permission denied/);
});
await test('server prices, duplicate items consolidated, idempotent checkout',async()=>{
 const req='30000000-0000-4000-8000-000000000001';
 const items=JSON.stringify([{id:product,qty:1,price_cents:1},{id:product,qty:1}]);
 const first=await asUser(0,()=>scalar('select public.triunfo_create_order($1,$2)',[items,req]));
 const second=await asUser(0,()=>scalar('select public.triunfo_create_order($1,$2)',[items,req]));
 assert.equal(first,second);
 assert.equal(await scalar('select stock from public.triunfo_products where id=$1',[product]),8);
 assert.equal(await scalar('select total_cents from public.triunfo_orders where id=$1',[first]),2400);
});
await test('oversell and malformed quantities rejected atomically',async()=>{
 for(const qty of [99,-1,1.2,'1',null]){
  await assert.rejects(asUser(1,()=>scalar('select public.triunfo_create_order($1,gen_random_uuid())',[JSON.stringify([{id:product,qty}])])));
 }
 assert.equal(await scalar('select stock from public.triunfo_products where id=$1',[product]),8);
});
const order=await scalar('select id from public.triunfo_orders limit 1');
await test('order ownership and financial fields protected',async()=>{
 assert.equal(await asUser(1,()=>scalar('select count(*)::int from public.triunfo_orders')),0);
 await assert.rejects(asUser(1,()=>db.query("update public.triunfo_orders set status='confirmed'")),/permission denied/);
 await assert.rejects(asUser(1,()=>db.query('select public.triunfo_cancel_order($1)',[order])),/indisponível/);
 await assert.rejects(asUser(0,()=>db.query("select public.triunfo_register_receipt(gen_random_uuid(),$1,$2,repeat('a',64),'x.png','image/png')",[order,uid[0]])),/permission denied/);
});
const rid=['40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002'];
async function register(i,hash){await db.query("select public.triunfo_register_receipt($1,$2,$3,$4,'test.png','image/png')",[rid[i],order,uid[0],hash.repeat(64)])}
await register(0,'a');
await test('private storage and duplicate receipt rejected',async()=>{
 await assert.rejects(register(1,'a'),/duplicate key/);
 await db.query("insert into storage.objects(bucket_id,name) values('triunfo-receipts',$1)",[uid[0]+'/'+rid[0]]);
 assert.equal(await asUser(1,()=>scalar('select count(*)::int from public.triunfo_receipts')),0);
 assert.equal(await asUser(1,()=>scalar('select count(*)::int from storage.objects')),0);
 assert.equal(await asUser(0,()=>scalar('select count(*)::int from storage.objects')),1);
 assert.equal(await asUser(2,()=>scalar('select count(*)::int from storage.objects')),1);
 assert.equal(await scalar("select public from storage.buckets where id='triunfo-receipts'"),false);
});
await test('partial payment calculates pending balance',async()=>{
 await db.query('select public.triunfo_record_receipt_reading($1,1000,$2)',[rid[0],'Valor R$ 10,00']);
 assert.equal(await scalar('select status from public.triunfo_orders where id=$1',[order]),'amount_pending');
 assert.equal(await scalar('select total_cents-recognized_cents from public.triunfo_orders where id=$1',[order]),1400);
});
await register(1,'b');
await test('complementary exact amount still needs bank confirmation',async()=>{
 await db.query('select public.triunfo_record_receipt_reading($1,1400,$2)',[rid[1],'Valor R$ 14,00']);
 assert.equal(await scalar('select status from public.triunfo_orders where id=$1',[order]),'amount_matches');
 await assert.rejects(asUser(0,()=>db.query('select public.triunfo_confirm_payment($1,true)',[order])),/Confira/);
 await assert.rejects(asUser(2,()=>db.query('select public.triunfo_confirm_payment($1,false)',[order])),/Confira/);
});
await test('unreadable and excessive amounts require manual review',async()=>{
 await db.query("select public.triunfo_record_receipt_reading($1,null,'ilegível')",[rid[1]]);
 assert.equal(await scalar('select status from public.triunfo_orders where id=$1',[order]),'manual_review');
 await db.query("select public.triunfo_record_receipt_reading($1,1500,'R$ 15,00')",[rid[1]]);
 assert.equal(await scalar('select status from public.triunfo_orders where id=$1',[order]),'manual_review');
});
await test('verified administrator may confirm exact amount with audit',async()=>{
 await asUser(2,()=>db.query('select public.triunfo_admin_read_receipt($1,1400)',[rid[1]]));
 await asUser(2,()=>db.query('select public.triunfo_confirm_payment($1,true)',[order]));
 assert.equal(await scalar('select status from public.triunfo_orders where id=$1',[order]),'confirmed');
 assert.equal(await scalar("select count(*)::int from public.triunfo_audit_events where action='payment.bank_confirmed'"),1);
});
await test('cancel restores stock once; confirmed payment cannot be cancelled',async()=>{
 await assert.rejects(asUser(2,()=>db.query('select public.triunfo_cancel_order($1)',[order])),/reembolso/);
 const next=await asUser(1,()=>scalar('select public.triunfo_create_order($1,gen_random_uuid())',[JSON.stringify([{id:product,qty:3}])]));
 await asUser(1,()=>db.query('select public.triunfo_cancel_order($1)',[next]));
 await asUser(1,()=>db.query('select public.triunfo_cancel_order($1)',[next]));
 assert.equal(await scalar('select stock from public.triunfo_products where id=$1',[product]),8);
});
await test('cart isolation and product writes blocked for customers',async()=>{
 await asUser(0,()=>db.query('insert into public.triunfo_cart_items(product_id,qty) values($1,1)',[product]));
 assert.equal(await asUser(1,()=>scalar('select count(*)::int from public.triunfo_cart_items')),0);
 await assert.rejects(asUser(1,()=>db.query('insert into public.triunfo_cart_items(user_id,product_id,qty) values($1,$2,1)',[uid[0],product])),/row-level security/);
 const result=await asUser(1,()=>db.query("update public.triunfo_products set stock=999 where id=$1 returning id",[product]));
 assert.equal(result.rows.length,0);
});
await test('suggestion approval is restricted and cannot create duplicate products',async()=>{
 const suggestion=await asUser(0,()=>scalar("insert into public.triunfo_suggestions(name) values('Bolo') returning id"));
 await assert.rejects(asUser(1,()=>db.query('select public.triunfo_review_suggestion($1,true)',[suggestion])),/restrito/);
 await asUser(2,()=>db.query('select public.triunfo_review_suggestion($1,true)',[suggestion]));
 await assert.rejects(asUser(2,()=>db.query('select public.triunfo_review_suggestion($1,true)',[suggestion])),/analisada/);
 assert.equal(await scalar("select count(*)::int from public.triunfo_products where name='Bolo'"),1);
});
await test('server ingestion accessible only to service role and not customers',async()=>{
 const next=await asUser(1,()=>scalar('select public.triunfo_create_order($1,gen_random_uuid())',[JSON.stringify([{id:product,qty:1}])]));
 await asUser(null,()=>db.query("select public.triunfo_register_receipt(gen_random_uuid(),$1,$2,repeat('c',64),'c.png','image/png')",[next,uid[1]]),'service_role');
 assert.equal(await scalar('select status from public.triunfo_orders where id=$1',[next]),'under_review');
 await assert.rejects(asUser(1,()=>db.query("select public.triunfo_record_receipt_reading($1,2400,'texto falso')",[rid[0]])),/permission denied/);
});
await test('transaction identifier cannot be reused for a different receipt',async()=>{
 const nextReceipt=await scalar("select id from public.triunfo_receipts where sha256=repeat('c',64)");
 await db.query('update public.triunfo_receipts set transaction_id=$1 where id=$2',['E12345678901234567890123456789012',rid[0]]);
 await assert.rejects(db.query('select public.triunfo_record_receipt_reading($1,1200,$2,$3)',[nextReceipt,'texto','E12345678901234567890123456789012']),/duplicate key/);
});
await test('stored images reject attribute injection and unsafe data URLs',async()=>{
 for(const image of ['" onerror="alert(1)','javascript:alert(1)','data:image/svg+xml,<svg>']){
  await assert.rejects(asUser(0,()=>db.query('insert into public.triunfo_suggestions(name,image) values($1,$2)',['Teste',image])),/check constraint/);
 }
 await asUser(0,()=>db.query('insert into public.triunfo_suggestions(name,image) values($1,$2)',['Teste','data:image/png;base64,aGVsbG8=']));
});
console.log(passed+' database checks passed. Hosted Auth, Storage and Realtime remain untested.');
await db.close();
