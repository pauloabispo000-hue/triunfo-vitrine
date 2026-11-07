import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
const {Pool}=pg;
for(const k of ['DATABASE_URL','SESSION_SECRET'])if(!process.env[k]){console.error('Missing '+k);process.exit(1)}
if(process.env.SESSION_SECRET.length<32){console.error('SESSION_SECRET must be 32+ chars');process.exit(1)}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:false}});
const app=express(),PgStore=connectPgSimple(session);
app.set('trust proxy',1);app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'32kb'}));
app.use(cors({origin:process.env.APP_ORIGIN?.split(',').map(x=>x.trim())||false,credentials:true}));
app.use(session({store:new PgStore({pool,tableName:'user_sessions',createTableIfMissing:true}),name:'triunfo.sid',secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:604800000}}));
const limiter=rateLimit({windowMs:900000,limit:8,standardHeaders:true,legacyHeaders:false});
const validEmail=e=>typeof e==='string'&&e.length<=254&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(e);
async function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:'Autenticação necessária.'});try{const q=await pool.query('SELECT id,email,role FROM users WHERE id=$1 AND active=true',[req.session.userId]);if(!q.rows[0]){req.session.destroy(()=>{});return res.status(401).json({error:'Sessão inválida.'})}req.user=q.rows[0];next()}catch(e){next(e)}}
function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Acesso restrito ao administrador.'});next()}
app.get('/api/health',(_q,s)=>s.json({ok:true,service:'triunfo-api'}));
app.post('/api/auth/register',limiter,async(req,res,next)=>{try{const email=String(req.body?.email||'').trim().toLowerCase(),pw=req.body?.password;if(!validEmail(email)||typeof pw!=='string'||pw.length<10||pw.length>72)return res.status(400).json({error:'E-mail válido e senha de 10 a 72 caracteres necessários.'});const hash=await bcrypt.hash(pw,12),q=await pool.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'customer') RETURNING id,email,role",[email,hash]);req.session.regenerate(err=>{if(err)return next(err);req.session.userId=q.rows[0].id;req.session.save(e=>e?next(e):res.status(201).json({user:q.rows[0]}))})}catch(e){if(e.code==='23505')return res.status(409).json({error:'E-mail já cadastrado.'});next(e)}});
app.post('/api/auth/login',limiter,async(req,res,next)=>{try{const email=String(req.body?.email||'').trim().toLowerCase(),pw=req.body?.password;if(!validEmail(email)||typeof pw!=='string')return res.status(400).json({error:'Credenciais inválidas.'});const q=await pool.query('SELECT id,email,password_hash,role FROM users WHERE email=$1 AND active=true',[email]),u=q.rows[0];if(!u||!await bcrypt.compare(pw,u.password_hash))return res.status(401).json({error:'E-mail ou senha incorretos.'});req.session.regenerate(err=>{if(err)return next(err);req.session.userId=u.id;req.session.save(e=>e?next(e):res.json({user:{id:u.id,email:u.email,role:u.role}}))})}catch(e){next(e)}});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));
app.post('/api/auth/logout',auth,(req,res)=>req.session.destroy(e=>{if(e)return res.status(500).json({error:'Falha ao encerrar sessão.'});res.clearCookie('triunfo.sid',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'});res.status(204).end()}));
app.get('/api/admin/session-check',auth,admin,(_q,s)=>s.json({authorized:true}));
app.post('/api/internal/bootstrap-admin',async(req,res,next)=>{if(!process.env.ADMIN_BOOTSTRAP_TOKEN||req.get('x-bootstrap-token')!==process.env.ADMIN_BOOTSTRAP_TOKEN)return res.status(404).json({error:'Not found'});try{const email=String(req.body?.email||'').trim().toLowerCase();if(!validEmail(email))return res.status(400).json({error:'E-mail inválido.'});const q=await pool.query("UPDATE users SET role='admin' WHERE email=$1",[email]);if(!q.rowCount)return res.status(404).json({error:'Cadastre a conta primeiro.'});res.json({promoted:true})}catch(e){next(e)}});
app.use(express.static('public'));app.use((e,_q,s,_n)=>{console.error(e);s.status(500).json({error:'Erro interno.'})});
app.listen(Number(process.env.PORT||3000),()=>console.log('Triunfo API running'));