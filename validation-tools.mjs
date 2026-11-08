let panel,report;
export function attachValidationTools(client,isAdmin){
 if(!location.pathname.endsWith('/validacao.html')||!isAdmin){panel?.remove();panel=null;return}
 if(panel?.isConnected)return;
 panel=document.createElement('section');panel.id='validation-tools';panel.className='panel';panel.style.margin='24px';
 panel.innerHTML='<h2>Validação técnica restrita</h2><p>Usa duas contas e documentos fictícios. Não transfere dinheiro nem altera dados legítimos.</p><button class="btn" id="run-hosted-validation">Executar testes fictícios</button> <button class="btn secondary" id="cleanup-hosted-validation" disabled>Remover dados desta execução</button><pre id="hosted-validation-result" style="white-space:pre-wrap;overflow-wrap:anywhere" aria-live="polite"></pre>';
 document.querySelector('#app').after(panel);
 const output=panel.querySelector('pre'),run=panel.querySelector('#run-hosted-validation'),cleanup=panel.querySelector('#cleanup-hosted-validation');
 run.addEventListener('click',async()=>{
  run.disabled=true;cleanup.disabled=true;output.textContent='Executando validação no Supabase…';
  try{
   const {data,error}=await client.functions.invoke('triunfo-validation',{body:{action:'run'}});
   if(error)throw error;report=data;output.textContent=JSON.stringify(data,null,2);cleanup.disabled=!data.run_id;
  }catch(e){output.textContent='Falha na rotina de validação: '+e.message}
  finally{run.disabled=false}
 });
 cleanup.addEventListener('click',async()=>{
  if(!report?.run_id)return;cleanup.disabled=true;output.textContent+='\nRemovendo apenas os dados fictícios desta execução…';
  try{
   const {data,error}=await client.functions.invoke('triunfo-validation',{body:{action:'cleanup',run_id:report.run_id}});
   if(error)throw error;output.textContent+='\n'+JSON.stringify(data,null,2);report=null;
  }catch(e){output.textContent+='\n'+e.message;cleanup.disabled=false}
 });
}
