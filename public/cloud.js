/* Rumo — cloud login and sync (independent of Base44; Supabase Auth + RLS REST API).
   No secret keys here: ONLY the public/publishable/anon key can be configured. */
(()=>{'use strict';
  const SETUP_KEY='rumo-cloud-settings-v1';
  const AUTH_KEY='rumo-auth-session-v1';
  const OLD_KEY='rumo-financas-v1';
  const box=document.getElementById('authCard');
  let setup=read(SETUP_KEY)||{};
  let session=null,user=null,revision=-1,exists=false,pending=null,syncing=false,conflict=false;
  let mode='pending',remoteData=null;
  let done;
  const ready=new Promise(resolve=>{done=resolve});
  const bridge=window.RumoCloud={ready,mode,remoteData,queueSave,logout,openHistory,retrySync:()=>sync()};
  const $=id=>document.getElementById(id);
  function read(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
  function set(key,v){localStorage.setItem(key,JSON.stringify(v))}
  function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function setMessage(message,isError=false){const m=$('authMessage');if(m){m.textContent=message;m.className='msg'+(isError?' err':'');m.hidden=false;}}
  function authButton(text,onclick){const b=document.createElement('button');b.type='button';b.className='btn btn-block';b.textContent=text;b.addEventListener('click',onclick);return b;}
  function status(label,type=''){const el=$('cloudState');if(el){el.textContent=label;el.className='cloud-status '+type;el.title=type==='error'?'Carrega para voltar a tentar sincronizar':'Estado de sincronização';}}
  async function api(path,{method='GET',body=null,headers={},authenticate=false,retry=true}={}){
    if(!setup.url||!setup.key)throw new Error('A base de dados não está configurada.');
    if(authenticate && session?.expires_at && session.expires_at*1000<Date.now()+60000)await refresh();
    const opts={method,headers:{'apikey':setup.key,'Content-Type':'application/json',...headers}};
    if(authenticate && session?.access_token)opts.headers.Authorization='Bearer '+session.access_token;
    if(body!==null)opts.body=JSON.stringify(body);
    let response;
    try{response=await fetch(setup.url+path,opts)}catch{throw new Error('Sem ligação à base de dados. Verifica a Internet e tenta novamente.')}
    if(response.status===401&&authenticate&&retry){await refresh();return api(path,{method,body,headers,authenticate,retry:false});}
    const payload=await response.text();let data;try{data=payload?JSON.parse(payload):null}catch{data=null}
    if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||`Erro de ligação (${response.status})`);
    return data;
  }
  function recordSession(s){if(!s?.access_token||!s?.refresh_token)return false;session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};set(AUTH_KEY,session);return true;}
  async function refresh(){const old=session?.refresh_token;if(!old)throw new Error('Sessão terminada. Volta a entrar.');const data=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:old}});if(!recordSession(data))throw new Error('Não foi possível renovar a sessão.');return data}
  async function validate(){if(!session)return false;try{if(session.expires_at*1000 < Date.now()+60000)await refresh();const result=await api('/auth/v1/user',{authenticate:true});if(!result?.id)throw new Error('Sessão inválida.');user=result;return true}catch{localStorage.removeItem(AUTH_KEY);session=null;return false}}
  function publicUrl(value){const u=new URL(value.trim());if(u.protocol!=='https:')throw new Error('A URL da base de dados tem de começar por https://');if(!u.hostname)throw new Error('URL inválida.');return u.origin;}
  function showSetup(){
    box.innerHTML=`<div class="authbrand">↗ rumo<span style="color:#5ca88f">.</span></div><h1>Configurar a tua nuvem</h1><p class="sub">Esta versão é independente da Base44. Para guardares dados privados online, associa um projeto gratuito Supabase.</p><form id="setupForm"><label for="supabaseUrl">URL do projeto Supabase</label><input id="supabaseUrl" type="url" placeholder="https://xxxx.supabase.co" required autocomplete="off"><label for="supabaseKey">Chave pública / publishable (não a secret)</label><input id="supabaseKey" type="text" placeholder="sb_publishable_… ou anon public" required autocomplete="off"><button class="btn btn-primary btn-block" type="submit">Associar a minha base de dados</button></form><p class="msg" id="authMessage" hidden></p><div class="authfooter">Antes de associar: cria um projeto em <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a> e executa o ficheiro <strong>supabase/schema.sql</strong> no SQL Editor. Nunca coloques uma chave <em>service_role</em> ou <em>secret</em> neste formulário.<div id="demoButtonWrap"></div></div>`;
    $('supabaseUrl').value=setup.url||'';$('supabaseKey').value=setup.key||'';
    $('setupForm').addEventListener('submit',e=>{e.preventDefault();try{const url=publicUrl($('supabaseUrl').value),key=$('supabaseKey').value.trim();if(!key||key.toLowerCase().includes('secret')||key.toLowerCase().includes('service_role'))throw new Error('Usa apenas a chave pública / publishable.');setup={url,key};set(SETUP_KEY,setup);showLogin()}catch(err){setMessage(err.message,true)}});
    $('demoButtonWrap').appendChild(authButton('Experimentar sem nuvem (apenas neste dispositivo)',()=>{if(!confirm('Neste modo NÃO tens conta privada nem sincronização online. Queres continuar só para testar?'))return;start('local',null)}));
  }
  function showLogin(tab='login'){
    const labels={login:'Entrar na minha conta',signup:'Criar conta privada',recovery:'Recuperar palavra-passe',reset:'Definir nova palavra-passe'};
    const pwd=tab!=='recovery'; const email=tab!=='reset';
    box.innerHTML=`<div class="authbrand">↗ rumo<span style="color:#5ca88f">.</span></div><h1>${labels[tab]}</h1><p class="sub">Renda dia 8 · Carro dia 25 · Comissões e dívidas organizadas.</p><form id="authForm">${email?'<label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" required placeholder="o-teu@email.pt">':''}${pwd?`<label for="authPassword">${tab==='reset'?'Nova palavra-passe':'Palavra-passe'}</label><input id="authPassword" type="password" minlength="8" autocomplete="${tab==='login'?'current-password':'new-password'}" required placeholder="Pelo menos 8 caracteres">`:''}<button id="authSubmit" class="btn btn-primary btn-block" type="submit">${labels[tab]}</button></form><p class="msg" id="authMessage" hidden></p><div class="authlayout" id="authActions"></div><div class="authfooter">Os teus dados financeiros só ficam acessíveis com a tua sessão e as regras de segurança da base de dados. Não ligamos à Revolut nem movimentamos dinheiro.</div>`;
    const acts=$('authActions');
    if(tab==='login'){acts.append(authButton('Criar conta',()=>showLogin('signup')),authButton('Esqueci a palavra-passe',()=>showLogin('recovery')))}
    else if(tab!=='reset')acts.append(authButton('Já tenho conta',()=>showLogin('login')));
    acts.append(authButton('Configurar outra base de dados',()=>showSetup()));
    $('authForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('authSubmit');b.disabled=true;b.textContent='A verificar…';try{
      const email=$('authEmail')?.value.trim(),password=$('authPassword')?.value;
      if(tab==='login'){
        const data=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(!recordSession(data))throw new Error('Resposta de sessão inválida.');user=data.user||null;await loginReady();
      } else if(tab==='signup') {
        const data=await api('/auth/v1/signup',{method:'POST',body:{email,password}});
        if(data?.access_token&&recordSession(data)){user=data.user;await loginReady()}else{showLogin('login');setMessage('Conta criada. Confirma o email recebido antes de iniciar sessão.');}
      } else if(tab==='recovery') {
        await api('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:{email}});setMessage('Se o endereço estiver registado, receberás um email de recuperação. Consulta também o spam.');
      } else if(tab==='reset') {
        await api('/auth/v1/user',{method:'PUT',body:{password},authenticate:true});history.replaceState({},'',location.pathname+location.search);setMessage('Palavra-passe atualizada. A abrir a conta…');await loginReady();
      }
    }catch(err){setMessage(err.message,true)}finally{if(document.contains(b)){b.disabled=false;b.textContent=labels[tab]}}});
  }
  async function getRows(){const data=await api('/rest/v1/rumo_data?select=payload,revision&limit=1',{authenticate:true});return Array.isArray(data)?data:[]}
  function unsyncedKey(){return 'rumo-unsynced-'+(user?.id||'unknown')}
  async function loginReady(){
    try{if(!user?.id){if(!await validate())throw new Error('Sessão inválida.');}
      const rows=await getRows();exists=rows.length>0;revision=exists?Number(rows[0].revision): -1;remoteData=exists?rows[0].payload:null;
      const local=read(unsyncedKey());
      if(local?.data){if(Number(local.revision)===revision){remoteData=local.data;pending=local.data;}
      else {const blob=new Blob([JSON.stringify(local.data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);if(confirm('Existem dados por sincronizar neste iPhone, mas a nuvem foi alterada noutro dispositivo. Descarregar uma cópia para não os perder?')){const a=document.createElement('a');a.href=u;a.download='rumo-conflito-backup.json';a.click()}setTimeout(()=>URL.revokeObjectURL(u),2000);}}
      start('cloud',remoteData);if(pending)sync();
    }catch(err){showLogin('login');setMessage('Não foi possível aceder aos dados privados. Confirma que executaste schema.sql no Supabase. Detalhe: '+err.message,true)}
  }
  function start(kind,data){mode=kind;remoteData=data;bridge.mode=mode;bridge.remoteData=remoteData;
    $('authLayer').hidden=true;document.body.classList.add('rumo-ready');
    if(kind==='cloud'){
      status(pending?'A sincronizar…':'🔒 Na nuvem · Guardado',pending?'pending':'');
      const logoutBtn=$('logoutButton');logoutBtn.hidden=false;logoutBtn.addEventListener('click',logout);
      $('cloudState').style.cursor='pointer';$('cloudState').addEventListener('click',()=>sync());
      const old=localStorage.getItem(OLD_KEY);
      if(old&&!remoteData){status('🔒 Na nuvem · Novo registo');}
    }else status('⚠ Só neste dispositivo','pending');
    done();
  }
  function queueSave(data){
    if(mode!=='cloud'||!user)return;
    if(conflict){status('Conflito: exporta backup','error');return;}
    const snapshot=JSON.parse(JSON.stringify(data));pending=snapshot;
    try{set(unsyncedKey(),{revision,data:snapshot})}catch{status('Armazenamento cheio','error')}
    status('A guardar na nuvem…','pending');sync();
  }
  async function sync(){
    if(mode!=='cloud'||syncing||!pending||conflict)return;
    syncing=true;
    try{while(pending){const next=pending;pending=null;let rows;
      if(exists){
        rows=await api('/rest/v1/rumo_data?user_id=eq.'+encodeURIComponent(user.id)+'&revision=eq.'+revision+'&select=revision',{method:'PATCH',body:{payload:next,revision:revision+1,updated_at:new Date().toISOString()},headers:{'Prefer':'return=representation'},authenticate:true});
        if(!Array.isArray(rows)||rows.length!==1){conflict=true;throw new Error('Há dados mais recentes noutro dispositivo. Exporta o teu backup antes de atualizar a página.');}
        revision=Number(rows[0].revision);
      }else{
        rows=await api('/rest/v1/rumo_data?select=revision',{method:'POST',body:{user_id:user.id,payload:next,revision:0},headers:{'Prefer':'return=representation'},authenticate:true});
        if(!Array.isArray(rows)||rows.length!==1)throw new Error('Não foi possível criar o registo.');
        exists=true;revision=Number(rows[0].revision);
      }
      if(!pending){localStorage.removeItem(unsyncedKey());status('🔒 Na nuvem · Guardado');window.dispatchEvent(new CustomEvent('rumo:sync-saved'))}
      else set(unsyncedKey(),{revision,data:pending});
    }}catch(err){pending=pending||read(unsyncedKey())?.data||null;
      if(!conflict)status('⚠ Por sincronizar','error');else status('⚠ Conflito entre dispositivos','error');
      window.dispatchEvent(new CustomEvent('rumo:sync-error',{detail:{message:String(err.message||'Falha na gravação')}}));
      alert('Atenção: ainda não foi possível guardar na nuvem. '+err.message+'\nNão feches a aplicação sem exportar um backup JSON se o problema continuar.');
    }finally{syncing=false;}
  }
  async function openHistory(){
    if(mode!=='cloud')return alert('O histórico de versões só está disponível com conta online.');
    if(pending)return alert('Primeiro sincroniza as alterações pendentes.');
    const dlg=document.createElement('dialog');dlg.className='dialog';dlg.setAttribute('aria-label','Histórico de versões');
    const wrapper=document.createElement('div');wrapper.style.cssText='padding:25px;max-width:530px;max-height:80vh;overflow:auto';
    const h=document.createElement('h2');h.textContent='Histórico de versões na nuvem';wrapper.append(h);
    const intro=document.createElement('p');intro.textContent='A base de dados guarda até 30 versões. Podes regressar a uma versão anterior se tiveres feito um registo por engano.';intro.className='muted small mt8';wrapper.append(intro);
    const close=document.createElement('button');close.type='button';close.className='btn';close.textContent='Fechar';close.addEventListener('click',()=>dlg.close());wrapper.append(close);
    const list=document.createElement('div');list.className='list mt14';list.textContent='A carregar…';wrapper.append(list);
    dlg.append(wrapper);document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove());dlg.showModal();
    try{const rows=await api('/rest/v1/rumo_snapshots?select=id,created_at,data_revision&order=id.desc&limit=30',{authenticate:true});
      list.textContent='';if(!rows?.length){list.textContent='Ainda não existem versões guardadas.';return}
      for(const row of rows){const line=document.createElement('div');line.className='row';line.style.cssText='border-bottom:1px solid #e0e8e6;padding:10px 0';
        const d=document.createElement('div');d.style.flex='1';const strong=document.createElement('strong');strong.textContent=new Date(row.created_at).toLocaleString('pt-PT');d.append(strong);
        const sub=document.createElement('div');sub.className='tiny muted';sub.textContent='Versão '+row.data_revision;d.append(sub);line.append(d);
        const restore=document.createElement('button');restore.className='btn btn-sm';restore.textContent='Restaurar';
        restore.addEventListener('click',async()=>{if(!confirm('Restaurar este registo? A versão atual ficará no histórico antes da alteração.'))return;
          restore.disabled=true;try{const snap=await api('/rest/v1/rumo_snapshots?id=eq.'+encodeURIComponent(row.id)+'&select=payload&limit=1',{authenticate:true});
            if(!snap?.length)throw new Error('Versão não encontrada.');
            const next=await api('/rest/v1/rumo_data?user_id=eq.'+encodeURIComponent(user.id)+'&revision=eq.'+revision+'&select=revision',{method:'PATCH',body:{payload:snap[0].payload,revision:revision+1,updated_at:new Date().toISOString()},headers:{'Prefer':'return=representation'},authenticate:true});
            if(!next?.length)throw new Error('Os dados mudaram noutro dispositivo. Atualiza antes de restaurar.');
            localStorage.removeItem(unsyncedKey());location.reload();
          }catch(err){restore.disabled=false;alert('Falha na recuperação: '+err.message)}});
        line.append(restore);list.append(line);
      }
    }catch(err){list.textContent='Não foi possível consultar as versões: '+err.message}
  }
  async function logout(){
    if(pending&&!confirm('Há alterações por sincronizar. Sair agora pode deixar esses dados apenas neste dispositivo. Queres continuar?'))return;
    const old=session;try{await api('/auth/v1/logout',{method:'POST',authenticate:true})}catch{}
    if(old){localStorage.removeItem(AUTH_KEY)}session=null;user=null;localStorage.removeItem(OLD_KEY);location.reload();
  }
  async function init(){
    if(!setup.url||!setup.key){showSetup();return}
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    if(hash.get('access_token')&&hash.get('refresh_token')){
      recordSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600});
      if(hash.get('type')==='recovery'){try{await validate();showLogin('reset');return}catch{showLogin('login');return}}
      history.replaceState({},'',location.pathname+location.search);
    }
    session=read(AUTH_KEY);if(session&&await validate())await loginReady();else showLogin('login');
  }
  window.addEventListener('online',()=>{if(mode==='cloud'&&pending)sync()});
  init().catch(err=>{showSetup();setMessage('Erro de inicialização: '+err.message,true)});
})();
