/**
 * Cloud transport for the existing storefront.
 * Not loaded by index.html until hosted integration passes acceptance checks.
 * Inject an official Supabase JS client configured with URL + publishable key only.
 */
export function createTriunfoAPI(client, { redirectTo='https://pauloabispo000-hue.github.io/triunfo-vitrine/' }={}) {
 const table=name=>client.from('triunfo_'+name);
 async function unwrap(query){const {data,error}=await query;if(error)throw error;return data}
 const rpc=(name,args)=>unwrap(client.rpc('triunfo_'+name,args));
 async function uid(){
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw Error('Entre para continuar');
  return data.user.id;
 }
 return {
  async register(email,password,displayName){
   const {data,error}=await client.auth.signUp({email,password,options:{
    data:{display_name:String(displayName).trim().slice(0,90)},
    emailRedirectTo:redirectTo
   }});
   if(error)throw error;return data;
  },
  async requestPasswordReset(email){
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
   if(error)throw error;
  },
  async changePassword(password){
   const {error}=await client.auth.updateUser({password});
   if(error)throw error;
  },
  async login(email,password){const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;return data},
  async logout(){const {error}=await client.auth.signOut();if(error)throw error},
  async account(){
   const id=await uid();
   const [profile,isAdmin]=await Promise.all([
    unwrap(table('profiles').select('id,display_name,photo').eq('id',id).single()),
    rpc('is_admin')
   ]);
   return {...profile,role:isAdmin?'admin':'customer'};
  },
  updateProfile(displayName,photo){
   return uid().then(id=>unwrap(table('profiles').update({display_name:displayName,photo}).eq('id',id)));
  },
  async products(){
   const [products,votes]=await Promise.all([
    unwrap(table('products').select('*').order('created_at',{ascending:false})),
    rpc('vote_totals')
   ]);
   const totals=new Map(votes.map(v=>[v.product_id,v]));
   return products.map(p=>({...p,price:p.price_cents/100,
    yes:Number(totals.get(p.id)?.yes||0),no:Number(totals.get(p.id)?.no||0)}));
  },
  // Update/insert may return no rows for an unauthorized user; single forces an error.
  saveProduct(product){
   const fields={name:product.name,price_cents:product.price_cents,
    status:product.status,stock:product.stock,image:product.image,emoji:product.emoji};
   for(const key of Object.keys(fields))if(fields[key]===undefined)delete fields[key];
   return unwrap((product.id?table('products').update(fields).eq('id',product.id):
    table('products').insert(fields)).select().single());
  },
  archiveProduct(id){return unwrap(table('products').update({status:'archived'}).eq('id',id).select().single())},
  async duplicateProduct(id){
   const original=await unwrap(table('products').select('*').eq('id',id).single());
   const {id:oldId,created_at,...copy}=original;
   return this.saveProduct({...copy,name:copy.name.slice(0,110)+' (cópia)',stock:0,status:'archived'});
  },
  vote(id,favorable){return rpc('cast_vote',{p_product:id,p_favorable:favorable})},
  suggestions(){return unwrap(table('suggestions').select('*').order('created_at',{ascending:false}))},
  suggest(name,image){return unwrap(table('suggestions').insert({name,image}).select().single())},
  // Reviewing a suggestion creates the voting product in a single transaction.
  reviewSuggestion(id,accepted){return rpc('review_suggestion',{p_suggestion:id,p_accept:accepted})},
  cart(){return unwrap(table('cart_items').select('product_id,qty'))},
  async setCartItem(id,qty){
   const user_id=await uid();
   if(qty===0)return unwrap(table('cart_items').delete().eq('user_id',user_id).eq('product_id',id));
   return unwrap(table('cart_items').upsert({user_id,product_id:id,qty},{onConflict:'user_id,product_id'}));
  },
  settings(){return unwrap(table('settings').select('store,pix').eq('singleton',true).single())},
  saveSettings(store,pix){return unwrap(table('settings').update({store,pix}).eq('singleton',true).select().single())},
  // Caller retains requestId across retries. No price/total is sent to the RPC.
  createOrder(items,requestId){
   if(!requestId)throw Error('Identificador da compra obrigatório');
   return rpc('create_order',{p_items:items.map(i=>({id:i.id,qty:i.qty})),p_request:requestId});
  },
  orders(){return unwrap(table('orders').select('*,triunfo_order_items(*)').order('created_at',{ascending:false}).limit(200))},
  cancelOrder(id){return rpc('cancel_order',{p_order:id})},
  receipts(orderId){return unwrap(table('receipts').select('id,order_id,object_path,original_name,mime_type,recognized_cents,status,created_at').eq('order_id',orderId).order('created_at'))},
  async sendReceipt(orderId,file){
   const body=new FormData();body.set('order_id',orderId);body.set('receipt',file);
   const {data,error}=await client.functions.invoke('submit-receipt',{body});
   if(error)throw error;return data;
  },
  async receiptFile(path){
   const {data,error}=await client.storage.from('triunfo-receipts').download(path);
   if(error)throw error;return data; // Blob; caller revokes any object URL on close.
  },
  recordReading(receiptId,cents,transactionId=null){
   return rpc('admin_read_receipt',{p_receipt:receiptId,p_amount:cents,p_transaction:transactionId});
  },
  confirmPayment(orderId,bankChecked){
   return rpc('confirm_payment',{p_order:orderId,p_bank_checked:bankChecked});
  },
  subscribe(onChange,onStatus=()=>{}){
   const channel=client.channel('triunfo-store-'+crypto.randomUUID());
   for(const name of ['products','orders','settings','cart_items','profiles','suggestions']){
    channel.on('postgres_changes',{event:'*',schema:'public',table:'triunfo_'+name},onChange);
   }
   channel.subscribe(onStatus);
   return ()=>client.removeChannel(channel);
  }
 };
}
