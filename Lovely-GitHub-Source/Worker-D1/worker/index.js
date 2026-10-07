// __ASSETS__ and __CATALOG__ are injected by the deterministic build.
const files=__ASSETS__,catalog=__CATALOG__;
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const safeUser=u=>u?{id:u.id,name:u.name,email:u.email,phone:u.phone||null,role:u.role,created_at:u.created_at}:null;
function error(message,status=400){throw Object.assign(new Error(message),{status});}
function field(o,k,min=1,max=200){const v=o[k];if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)error(`Please check ${k}.`);return v.trim();}
function phoneField(o,k='phone'){const v=field(o,k,4,24).replace(/[()\s-]/g,'');if(!/^\+374\d{8}$/.test(v))error('Enter an Armenian phone number beginning with +374.');return v;}
function loginIdentifier(input){const raw=field(input,Object.prototype.hasOwnProperty.call(input,'identifier')?'identifier':'email',3,254);const compact=raw.replace(/[()\s-]/g,'');if(compact.startsWith('+374'))return{phone:phoneField({phone:raw})};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))error('Enter a valid Gmail address or Armenian phone number.');return{email:raw.toLowerCase()};}
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const one=(db,sql,...args)=>stmt(db,sql,...args).first();
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
async function passwordHash(password,salt=random()){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const h=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:100000},key,256);return JSON.stringify({salt,hash:hex(h)});}
async function verifyPassword(password,stored){try{const p=JSON.parse(stored);const h=JSON.parse(await passwordHash(password,p.salt));return equal(h.hash,p.hash);}catch{return false;}}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function sign(secret,message){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,enc.encode(message)));}
function cookies(request){return Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(s=>s.trim().split('=' )).filter(p=>p.length===2));}
async function rate(db,key,limit,seconds){const t=Date.now();const r=await one(db,`INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count`,key,t+seconds*1000,t,t);if(r.count>limit)error('Too many attempts. Please try again later.',429);}
function parseOrder(r){return {...JSON.parse(r.payload),status:r.status};}
let seedPromise;
async function seed(db){if(!seedPromise)seedPromise=db.batch(Object.values(catalog).map(p=>stmt(db,'INSERT OR IGNORE INTO products(id,payload,active) VALUES(?,?,1)',p.id,JSON.stringify(p)))).catch(e=>{seedPromise=null;throw e;});await seedPromise;}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname!=='/api.php'){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const path=url.pathname==='/'?'/index.html':url.pathname;const f=files[path];if(!f)return new Response('Not found',{status:404});
  const headers={'Content-Type':f.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':/\.(html|js|css)$/.test(path)?'no-cache':'public, max-age=86400','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"};
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)),{headers});
 }
 const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 try{
  if(!env.DB||!env.CSRF_SECRET||!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD_HASH)error('The store is being configured. Please try again shortly.',503);
  const db=env.DB;await seed(db);const secure=url.protocol==='https:';const prefix=secure?'__Host-':'';const jar=cookies(request);const cookie=(name,value,age)=>headers.append('Set-Cookie',`${prefix}${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}${age===undefined?'':`; Max-Age=${age}`}`);
  let csrf=jar[prefix+'lovely_csrf'];let valid=false;
  if(csrf){const [time,nonce,sig]=csrf.split('.');valid=Number(time)>Date.now()-86400000&&Number(time)<=Date.now()&&nonce?.length===64&&equal(sig,await sign(env.CSRF_SECRET,`${time}.${nonce}`));}
  if(!valid){const body=Date.now()+'.'+random();csrf=body+'.'+await sign(env.CSRF_SECRET,body);cookie('lovely_csrf',csrf,86400);}
  const action=url.searchParams.get('action')||'bootstrap';const write=['register','login','admin_login','logout','order','message','read','status','product'];
  if(write.includes(action)&&request.method!=='POST')error('Method not allowed.',405);
  if(!['POST','GET'].includes(request.method))error('Method not allowed.',405);
  let input={};if(request.method==='POST'){
   if(!valid||!equal(request.headers.get('X-CSRF-Token'),csrf))error('Your session refreshed. Reload the page and try again.',403);
   if(request.headers.get('Sec-Fetch-Site')==='cross-site')error('Request not allowed.',403);
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)error('Request not allowed.',403);
   if(Number(request.headers.get('Content-Length')||0)>65536)error('Request too large.',413);const body=await request.text();if(body.length>65536)error('Request too large.',413);
   try{input=JSON.parse(body);}catch{error('Invalid request.');}if(!input||typeof input!=='object'||Array.isArray(input))error('Invalid request.');
  }
  const token=jar[prefix+'lovely_session']||'';const tokenHash=token.length===64?await hash(token):'';
  const u=tokenHash?await one(db,'SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?',tokenHash,Date.now()):null;
  const needAdmin=['admin','status','product'].includes(action);
  if(!['bootstrap','register','login','admin_login','logout'].includes(action)){if(!u)error('Please sign in to continue.',401);if(needAdmin&&u.role!=='admin')error('Administrator access required.',403);}
  let out;
  if(action==='bootstrap')out={user:safeUser(u),csrf,products:(await all(db,'SELECT payload FROM products WHERE active=1')).map(r=>JSON.parse(r.payload))};
  else if(['register','login','admin_login'].includes(action)){
   let email='',phone='';if(action==='login'){const identity=loginIdentifier(input);email=identity.email||'';phone=identity.phone||'';}else{email=field(input,'email',3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))error('Enter a valid email address.');if(action==='register')phone=phoneField(input);}
   const password=input.password;if(typeof password!=='string'||password.length<10||enc.encode(password).length>72)error('Use a password between 10 and 72 bytes.');
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';await rate(db,await hash('auth:'+ip),30,900);await rate(db,await hash('auth-account:'+(email||phone)),12,900);
   let user=await one(db,email?'SELECT * FROM users WHERE email=?':'SELECT * FROM users WHERE phone=?',email||phone);
   const adminEmail=env.ADMIN_EMAIL.toLowerCase();
   if(action==='register'){
    if(email===adminEmail)error('This email is reserved. Use admin sign in.',409);
    if(user)error('An account already uses this email. Please sign in.',409);
    if(await one(db,'SELECT id FROM users WHERE phone=?',phone))error('An account already uses this phone number. Please sign in.',409);
    const name=field(input,'name',2,80);user={id:id(),name,email,phone,password:await passwordHash(password),role:'customer',created_at:now()};
    try{await stmt(db,'INSERT INTO users(id,name,email,phone,password,role,created_at) VALUES(?,?,?,?,?,?,?)',user.id,name,email,phone,user.password,user.role,user.created_at).run();}catch(e){if(String(e).includes('UNIQUE'))error('An account already uses this email or phone number. Please sign in.',409);throw e;}
   }else if(action==='admin_login'){
   if(email!==adminEmail||!await verifyPassword(password,env.ADMIN_PASSWORD_HASH))error('Admin email or password is incorrect.',401);
    await stmt(db,"INSERT INTO users(id,name,email,phone,password,role,created_at) VALUES('lovely-owner','Lovely Admin',?,NULL,?,'admin',?) ON CONFLICT(email) DO UPDATE SET role='admin',password=excluded.password",email,env.ADMIN_PASSWORD_HASH,now()).run();user=await one(db,'SELECT * FROM users WHERE email=?',email);
   }else{
    if(!user||user.role==='admin'||!await verifyPassword(password,user.password))error('Email/phone or password is incorrect. Admins should use Admin sign in.',401);
   }
   const t=random();const remember=input.remember===true;const age=remember?2592000:43200;
   await db.batch([stmt(db,'DELETE FROM sessions WHERE expires<?',Date.now()),stmt(db,'DELETE FROM rate_limits WHERE expires<?',Date.now()),stmt(db,'DELETE FROM sessions WHERE hash=?',tokenHash),stmt(db,'INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)',await hash(t),user.id,Date.now()+age*1000)]);
   cookie('lovely_session',t,remember?age:undefined);out={user:safeUser(user),csrf};
  }else if(action==='logout'){await stmt(db,'DELETE FROM sessions WHERE hash=?',tokenHash).run();cookie('lovely_session','',0);out={ok:true,csrf};}
  else if(action==='orders')out={orders:(await all(db,'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',u.id)).map(parseOrder)};
  else if(action==='order'){
   const key=field(input,'request_key',16,100);const existing=await one(db,'SELECT * FROM orders WHERE user_id=? AND request_key=?',u.id,key);
   if(existing)out={order:parseOrder(existing)};
   else{
    await rate(db,'order:'+u.id,10,3600);const items=input.items;if(!Array.isArray(items)||items.length<1||items.length>30)error('Add between 1 and 30 items to your bag.');const lines=[];let total=0;
    for(const i of items){if(!i||typeof i.id!=='string')error('Invalid item.');const r=await one(db,'SELECT payload FROM products WHERE id=? AND active=1',i.id);if(!r)error('A piece is no longer available. Please update your bag.');const p=JSON.parse(r.payload);if(!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>10||!p.colors.some(c=>c.name===i.color)||!p.sizes.includes(i.size))error('Choose a valid size, color and quantity.');lines.push({id:p.id,name:p.name,image:p.images[0],price:p.price,color:i.color,size:i.size,quantity:i.quantity});total+=p.price*i.quantity;}
    const oid=id();const o={id:oid,number:'LV-'+oid.slice(0,8).toUpperCase(),user_id:u.id,name:u.name,email:u.email,phone:u.phone||null,items:lines,total,currency:'AMD',status:'new',note:input.note?field(input,'note',0,1000):'',request_key:key,created_at:now()};
    try{await db.batch([stmt(db,'INSERT INTO orders(id,user_id,request_key,payload,status,created_at) VALUES(?,?,?,?,?,?)',oid,u.id,key,JSON.stringify(o),'new',o.created_at),stmt(db,'INSERT INTO messages(id,user_id,sender,text,created_at) VALUES(?,?,?,?,?)',id(),u.id,'system',`Request ${o.number} received. Lovely will confirm availability and delivery with you here. No payment has been taken.`,now())]);out={order:o};}catch(e){const winner=await one(db,'SELECT * FROM orders WHERE user_id=? AND request_key=?',u.id,key);if(winner)out={order:parseOrder(winner)};else throw e;}
   }
  }else if(['messages','message','read'].includes(action)){
   const target=u.role==='admin'?(input.user_id||url.searchParams.get('user_id')||u.id):u.id;const customer=await one(db,'SELECT * FROM users WHERE id=?',target);if(!customer)error('Customer not found.',404);
   if(action==='message'){const text=field(input,'text',1,2000);await rate(db,'message:'+u.id,20,60);await stmt(db,'INSERT INTO messages(id,user_id,sender,text,created_at) VALUES(?,?,?,?,?)',id(),target,u.role==='admin'?'admin':'customer',text,now()).run();}
   if(action==='read')await stmt(db,`UPDATE messages SET read_at=? WHERE user_id=? AND read_at IS NULL AND ${u.role==='admin'?"sender='customer'":"sender!='customer'"}`,now(),target).run();
   const before=url.searchParams.get('before')||'9999';const rows=await all(db,'SELECT * FROM messages WHERE user_id=? AND created_at<? ORDER BY created_at DESC LIMIT 101',target,before);out={messages:rows.slice(0,100).reverse(),has_more:rows.length>100,customer:safeUser(customer)};
  }else if(action==='admin'){
   const view=url.searchParams.get('view')||'orders',q=(url.searchParams.get('q')||'').slice(0,100),like='%'+q+'%',page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1)),offset=(page-1)*20;
   const stats=await one(db,`SELECT (SELECT count(*) FROM orders) AS requests,(SELECT count(*) FROM orders WHERE status='new') AS new,(SELECT count(*) FROM users WHERE role='customer') AS customers,(SELECT count(*) FROM messages WHERE sender='customer' AND read_at IS NULL) AS unread`);let rows,total;
   if(view==='customers'){rows=await all(db,'SELECT id,name,email,phone,role,created_at FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY created_at DESC LIMIT 20 OFFSET ?',like,like,like,offset);total=(await one(db,'SELECT count(*) AS n FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?',like,like,like)).n;}
   else if(view==='products'){rows=(await all(db,'SELECT payload FROM products WHERE payload LIKE ? LIMIT 20 OFFSET ?',like,offset)).map(r=>JSON.parse(r.payload));total=(await one(db,'SELECT count(*) AS n FROM products WHERE payload LIKE ?',like)).n;}
   else if(view==='messages'){const base=`FROM users u WHERE EXISTS(SELECT 1 FROM messages m WHERE m.user_id=u.id) AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;rows=await all(db,`SELECT u.id AS user_id,u.name,u.email,u.phone,(SELECT text FROM messages WHERE user_id=u.id ORDER BY created_at DESC LIMIT 1) AS last,(SELECT max(created_at) FROM messages WHERE user_id=u.id) AS created_at,(SELECT count(*) FROM messages WHERE user_id=u.id AND sender='customer' AND read_at IS NULL) AS unread ${base} ORDER BY created_at DESC LIMIT 20 OFFSET ?`,like,like,like,offset);total=(await one(db,`SELECT count(*) AS n ${base}`,like,like,like)).n;}
   else{rows=(await all(db,'SELECT * FROM orders WHERE payload LIKE ? OR status LIKE ? ORDER BY created_at DESC LIMIT 20 OFFSET ?',like,like,offset)).map(parseOrder);total=(await one(db,'SELECT count(*) AS n FROM orders WHERE payload LIKE ? OR status LIKE ?',like,like)).n;}
   out={rows,total,page,stats};
  }else if(action==='status'){const oid=field(input,'id'),status=input.status;if(!['new','contacted','confirmed','fulfilled','cancelled'].includes(status))error('Invalid status.');const r=await stmt(db,'UPDATE orders SET status=? WHERE id=?',status,oid).run();if(!r.meta.changes)error('Request not found.',404);out={ok:true};}
  else if(action==='product'){
   const p={id:input.id?field(input,'id'):id(),name:field(input,'name',2,100),description:field(input,'description',10,2000),category:field(input,'category',2,40),price:input.price,original_price:input.original_price,images:input.images,sizes:input.sizes,colors:input.colors,active:input.active===true,badge:input.badge?field(input,'badge',0,30):''};
   if(!Number.isInteger(p.price)||p.price<1||p.price>10000000||!Number.isInteger(p.original_price)||p.original_price<p.price)error('Check product prices.');
   if(!Array.isArray(p.images)||p.images.length<4||p.images.length>12||p.images.some(s=>typeof s!=='string'||s.length>1000||!(/^assets\/[a-zA-Z0-9_./-]+$/.test(s)||/^https:\/\//.test(s))))error('Add 4–12 valid product image URLs.');
   if(!Array.isArray(p.sizes)||!p.sizes.length||p.sizes.length>20||p.sizes.some(s=>typeof s!=='string'||!s.trim()||s.length>30))error('Check product sizes.');
   if(!Array.isArray(p.colors)||!p.colors.length||p.colors.length>20||p.colors.some(c=>!c||typeof c.name!=='string'||!c.name.trim()||c.name.length>30||!/^#[0-9a-f]{6}$/i.test(c.hex)))error('Check product colors.');
   await stmt(db,'INSERT INTO products(id,payload,active) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,active=excluded.active',p.id,JSON.stringify(p),p.active?1:0).run();out={product:p};
  }else error('Not found.',404);
  return new Response(JSON.stringify(out),{headers});
 }catch(e){if(!e.status)console.error('Lovely API:',e.message);const payload={error:e.status?e.message:'Something went wrong. Please try again shortly.'};if(e.status===403&&typeof csrf==='string'&&csrf.includes('.'))payload.csrf=csrf;return new Response(JSON.stringify(payload),{status:e.status||500,headers});}
}};
