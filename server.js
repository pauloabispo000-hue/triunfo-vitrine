import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import pg from 'pg';
import PgSession from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

for(const key of ['DATABASE_URL','SESSION_SECRET','APP_ORIGIN']){
  if(!process.env[key])throw Error('Configure '+key);
}
if(process.env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET precisa ter 32+ caracteres');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:true}});
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet());
app.use(cors({origin:process.env.APP_ORIGIN,credentials:true}));
app.use(express.json({limit:'64kb'}));
app.use(session({store:new (PgSession(session))({pool,tableName:'user_sessions',createTableIfMissing:true}),name:'triunfo.sid',secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:process.env.NODE_ENV==='production'?'none':'lax',maxAge:604800000}}));
const authLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
const safeUser=u=>({id:u.id,username:u.username,role:u.role});
const validName=s=>typeof s==='string'&&/^[a-zA-Z0-9_.-]{3,40}$/.test(s);
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const auth=asyncRoute(async(req,res,next)=>{if(!req.session.userId)return res.status(401).json({error:'Entre para continuar'});const q=await pool.query('SELECT id,username,role FROM users WHERE id=$1 AND active=true',[req.session.userId]);if(!q.rowCount)return res.status(401).json({error:'Sessão inválida'});req.user=q.rows[0];next()});
const admin=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Acesso restrito'});
async function audit(actor,action,target){await pool.query('INSERT INTO audit_events(actor_id,action,target_id) VALUES($1,$2,$3)',[actor,action,String(target||'')])}
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.post('/api/auth/register',authLimit,asyncRoute(async(req,res)=>{
 const {username,password}=req.body||{};
 if(!validName(username)||typeof password!=='string'||password.length<6||password.length>72)return res.status(400).json({error:'Nome inválido ou senha fora do limite de 6 a 72 caracteres'});
 const hash=await bcrypt.hash(password,12);
 const q=await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,$2,'customer') ON CONFLICT(username) DO NOTHING RETURNING id,username,role",[username,hash]);
 if(!q.rowCount)return res.status(409).json({error:'Nome de usuário já cadastrado'});
 req.session.regenerate(e=>{if(e)return res.status(500).json({error:'Erro na sessão'});req.session.userId=q.rows[0].id;req.session.save(err=>err?res.status(500).json({error:'Erro na sessão'}):res.status(201).json({user:safeUser(q.rows[0])}))});
}));
app.post('/api/auth/login',authLimit,asyncRoute(async(req,res)=>{
 const {username,password}=req.body||{};
 if(!validName(username)||typeof password!=='string')return res.status(400).json({error:'Credenciais inválidas'});
 const q=await pool.query('SELECT id,username,role,password_hash FROM users WHERE lower(username)=lower($1) AND active=true',[username]);
 const u=q.rows[0];
 if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'Usuário ou senha incorretos'});
 req.session.regenerate(e=>{if(e)return res.status(500).json({error:'Erro na sessão'});req.session.userId=u.id;req.session.save(err=>err?res.status(500).json({error:'Erro na sessão'}):res.json({user:safeUser(u)}))});
}));
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.post('/api/auth/logout',auth,(req,res)=>req.session.destroy(()=>res.clearCookie('triunfo.sid').status(204).end()));
app.get('/api/products',asyncRoute(async(_req,res)=>{
 const q=await pool.query("SELECT p.*,coalesce(v.yes,0)::int AS yes,coalesce(v.no,0)::int AS no FROM products p LEFT JOIN (SELECT product_id,count(*) FILTER(WHERE favorable) yes,count(*) FILTER(WHERE NOT favorable) no FROM votes GROUP BY product_id) v ON v.product_id=p.id WHERE p.status IN ('available','voting') ORDER BY p.created_at DESC");
 res.json({products:q.rows});
}));
app.get('/api/admin/products',auth,admin,asyncRoute(async(_req,res)=>res.json({products:(await pool.query('SELECT * FROM products ORDER BY created_at DESC')).rows})));
app.post('/api/admin/products',auth,admin,asyncRoute(async(req,res)=>{
 const {name,price_cents,status}=req.body||{};
 if(typeof name!=='string'||!name.trim()||name.length>120||!Number.isInteger(price_cents)||price_cents<0||!['available','voting','viability','production','archived'].includes(status))return res.status(400).json({error:'Dados inválidos'});
 const q=await pool.query('INSERT INTO products(name,price_cents,status) VALUES($1,$2,$3) RETURNING *',[name.trim(),price_cents,status]);await audit(req.user.id,'product.create',q.rows[0].id);res.status(201).json({product:q.rows[0]});
}));
app.patch('/api/admin/products/:id',auth,admin,asyncRoute(async(req,res)=>{
 if(!['available','voting','viability','production','archived'].includes(req.body?.status))return res.status(400).json({error:'Classificação inválida'});
 const q=await pool.query('UPDATE products SET status=$1 WHERE id=$2 RETURNING *',[req.body.status,req.params.id]);if(!q.rowCount)return res.sendStatus(404);await audit(req.user.id,'product.status',req.params.id);res.json({product:q.rows[0]});
}));
app.post('/api/votes',auth,asyncRoute(async(req,res)=>{
 const {product_id,favorable}=req.body||{};if(typeof favorable!=='boolean')return res.sendStatus(400);
 const p=await pool.query("SELECT id FROM products WHERE id=$1 AND status='voting'",[product_id]);if(!p.rowCount)return res.status(400).json({error:'Produto fora de votação'});
 const q=await pool.query('INSERT INTO votes(user_id,product_id,favorable) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING product_id',[req.user.id,product_id,favorable]);if(!q.rowCount)return res.status(409).json({error:'Você já votou'});res.status(201).json({ok:true});
}));
app.get('/api/admin/summary',auth,admin,asyncRoute(async(_req,res)=>{
 const q=await pool.query("SELECT (SELECT count(*) FROM users WHERE role='customer')::int AS users,(SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM suggestions WHERE status='pending')::int AS suggestions");
 res.json(q.rows[0]);
}));
app.get('/api/settings/pix',asyncRoute(async(_req,res)=>{
 const q=await pool.query("SELECT value FROM settings WHERE key='pix'");res.json({pix:q.rows[0]?.value||''});
}));
app.put('/api/admin/settings/pix',auth,admin,asyncRoute(async(req,res)=>{
 const pix=req.body?.pix;if(typeof pix!=='string'||pix.length>140)return res.sendStatus(400);
 await pool.query("INSERT INTO settings(key,value) VALUES('pix',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[pix.trim()]);await audit(req.user.id,'settings.pix','pix');res.json({ok:true});
}));
app.post('/api/orders',auth,asyncRoute(async(req,res)=>{
 const items=req.body?.items;if(!Array.isArray(items)||!items.length||items.length>30)return res.sendStatus(400);
 const client=await pool.connect();
 try{await client.query('BEGIN');let total=0;const entries=[];
 for(const item of items){if(!Number.isInteger(item.qty)||item.qty<1||item.qty>99)throw Object.assign(Error('Quantidade inválida'),{status:400});
 const q=await client.query("SELECT id,price_cents FROM products WHERE id=$1 AND status='available'",[item.id]);if(!q.rowCount)throw Object.assign(Error('Produto indisponível'),{status:400});
 const price=q.rows[0].price_cents;total+=price*item.qty;entries.push({id:item.id,qty:item.qty,price});}
 if(total<=0||total>100000000)throw Object.assign(Error('Total inválido'),{status:400});
 const q=await client.query('INSERT INTO orders(user_id,total_cents) VALUES($1,$2) RETURNING *',[req.user.id,total]);
 for(const i of entries)await client.query('INSERT INTO order_items(order_id,product_id,qty,unit_price_cents) VALUES($1,$2,$3,$4)',[q.rows[0].id,i.id,i.qty,i.price]);
 await client.query('COMMIT');res.status(201).json({order:q.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
app.get('/api/orders',auth,asyncRoute(async(req,res)=>{
 const q=req.user.role==='admin'?await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200'):await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);res.json({orders:q.rows});
}));
const receiptDir=path.resolve(process.env.RECEIPT_DIR||'./private-receipts');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
function amountFromText(text){
 const candidates=[...text.matchAll(/(?:valor\s*(?:total|pago|transferido|da\s*transferência)?|total\s*pago|r\$)\s*[:\-]?\s*(?:r\$\s*)?([0-9]{1,6}(?:\.[0-9]{3})*,[0-9]{2})/gi)];
 const values=[...new Set(candidates.map(m=>Math.round(Number(m[1].replace(/\./g,'').replace(',','.'))*100)))];
 return values.length===1?values[0]:null;
}
app.post('/api/orders/:id/receipts',auth,upload.single('receipt'),asyncRoute(async(req,res)=>{
 const q=await pool.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
 if(!q.rowCount)return res.sendStatus(404);
 if(!req.file||!['image/jpeg','image/png','image/webp'].includes(req.file.mimetype))return res.status(400).json({error:'Envie imagem JPEG, PNG ou WebP até 5 MB'});
 const signature=req.file.buffer.subarray(0,12);
 const valid=signature[0]===255&&signature[1]===216||signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71||signature.toString('ascii',0,4)==='RIFF'&&signature.toString('ascii',8,12)==='WEBP';
 if(!valid)return res.status(400).json({error:'Formato do arquivo não corresponde à imagem'});
 await fs.mkdir(receiptDir,{recursive:true,mode:0o700});
 const hash=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
 const filename=crypto.randomUUID()+'.bin',file=path.join(receiptDir,filename);
 await fs.writeFile(file,req.file.buffer,{mode:0o600});
 const receipt=await pool.query('INSERT INTO receipts(order_id,user_id,file_path,original_name,mime_type,sha256) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[req.params.id,req.user.id,file,req.file.originalname.slice(0,200),req.file.mimetype,hash]);
 let text='',amount=null;
 try{const worker=await createWorker('por');try{const o=await worker.recognize(req.file.buffer);text=o.data.text;amount=amountFromText(text)}finally{await worker.terminate()}}catch(e){console.error('OCR error:',e.message)}
 const total=q.rows[0].total_cents;
 // OCR checks the declared amount only. It does NOT prove the Pix was received.
 const status=amount===null?'manual_review':amount<total?'amount_pending':'amount_matches';
 await pool.query('UPDATE receipts SET recognized_cents=$1,ocr_text=$2,status=$3 WHERE id=$4',[amount,text.slice(0,10000),status,receipt.rows[0].id]);
 await pool.query('UPDATE orders SET recognized_cents=$1,status=$2,updated_at=now() WHERE id=$3',[amount,status,req.params.id]);
 res.status(201).json({receipt_id:receipt.rows[0].id,recognized_cents:amount,total_cents:total,pending_cents:amount===null?null:Math.max(0,total-amount),status,warning:'Valor lido do documento; não confirma recebimento bancário.'});
}));
app.post('/api/admin/orders/:id/confirm',auth,admin,asyncRoute(async(req,res)=>{
 const q=await pool.query("UPDATE orders SET status='confirmed',updated_at=now() WHERE id=$1 AND status IN ('amount_matches','amount_pending','manual_review') RETURNING id",[req.params.id]);
 if(!q.rowCount)return res.status(409).json({error:'Pedido inexistente ou ainda sem comprovante'});
 await audit(req.user.id,'payment.confirm',req.params.id);res.json({ok:true});
}));
app.get('/api/events',auth,(req,res)=>{
 res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');
 res.write('event: connected\ndata: {}\n\n');
 const timer=setInterval(()=>res.write('event: refresh\ndata: {}\n\n'),5000);
 req.on('close',()=>clearInterval(timer));
});
app.use((err,_req,res,_next)=>{console.error(err);res.status(err.code==='LIMIT_FILE_SIZE'?413:err.status||500).json({error:err.code==='LIMIT_FILE_SIZE'?'Arquivo muito grande':err.status===400?err.message:'Erro interno'})});
app.listen(Number(process.env.PORT||3000),()=>console.log('Triunfo API started'));
