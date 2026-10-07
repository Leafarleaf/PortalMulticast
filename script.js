const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const STORAGE = {
  theme: 'mcast-theme', quiz: 'mcast-quiz-stats'
};

const state = {
  theme: localStorage.getItem(STORAGE.theme) || 'light',
  quiz: Object.assign({ bank: [], index: 0, score: 0, answered: false, total: 10, attempts: 0, bestGrade: null, lastScore: null, lastTotal: null }, JSON.parse(localStorage.getItem(STORAGE.quiz) || '{}')),
  sim: { scenario:'same-sender', mode:'fifo', eventIndex:0, arrivals:[], received:{P1:[],P2:[],P3:[]}, delivered:{P1:[],P2:[],P3:[]}, lastEvent:null, lastDeliveries:[], auto:null, log:[] }
};

document.documentElement.dataset.theme = state.theme;

function fmt(value){
  return String(value ?? '')
    .replace(/\bP1\b/g,'P₁')
    .replace(/\bP2\b/g,'P₂')
    .replace(/\bP3\b/g,'P₃')
    .replace(/\bP4\b/g,'P₄')
    .replace(/\bP5\b/g,'P₅')
    .replace(/\bPi\b/g,'Pᵢ')
    .replace(/\bPj\b/g,'Pⱼ');
}

const orderData = {
  fifo: {
    label:'FIFO (First-In, First-Out)',
    summary:'Preserva a sequência de multicasts emitidos por cada remetente.',
    why:'A preocupação de FIFO é a ordem dentro do fluxo de um mesmo processo. Mensagens de remetentes diferentes não precisam ser colocadas numa única fila comum.',
    rule:'Se P1 faz multicast(m₁) e depois multicast(m₂), um processo não pode entregar m₂ antes de m₁.',
    example:['P1 envia m₁ para o grupo.','P1 envia m₂ para o grupo, depois de m₁.','P3 pode receber m₂ fisicamente antes de m₁ por causa dos atrasos da rede.','Mesmo assim, P3 mantém m₂ esperando até m₁ poder ser entregue.','Uma mensagem independente de P2 pode aparecer antes, entre m₁ e m₂ ou depois.'],
    mnemonic:'Pergunta-chave: “são mensagens do mesmo remetente?”'
  },
  causal: {
    label:'Causal ordering',
    summary:'Preserva as dependências entre multicasts que estão relacionados causalmente.',
    why:'A ideia é separar mensagens que têm relação de precedência das mensagens concorrentes. Se m₂ depende de m₁, o efeito não pode ser entregue antes da causa.',
    rule:'Se multicast(m₁) precede causalmente multicast(m₂), um processo que entrega m₂ deve ter entregue m₁ antes.',
    example:['P1 faz multicast de m₁.','P2 recebe m₁ e usa essa informação para produzir m₂.','m₂ chega cedo a P3, antes de m₁.','P3 guarda m₂ em espera porque a dependência m₁ ainda não foi satisfeita.','Quando m₁ é entregue, m₂ deixa de estar bloqueada.'],
    mnemonic:'Pergunta-chave: “m₂ depende de informação que veio de m₁?”'
  },
  total: {
    label:'Total ordering',
    summary:'Faz com que os processos do grupo concordem sobre a mesma ordem relativa de entrega.',
    why:'Aqui a preocupação inclui mensagens de remetentes diferentes. Mesmo que a rede entregue cópias em sequências diferentes, a aplicação deve observar uma ordem comum para as mensagens dentro do escopo da ordenação.',
    rule:'Se um processo entrega m₁ antes de m₂, outro processo não pode entregar m₂ antes de m₁ quando ambos entregam as duas mensagens.',
    example:['P1 produz m₁ e P2 produz m₂.','As duas mensagens chegam aos processos em ordens diferentes.','O protocolo estabelece uma ordem comum para elas.','Cada processo pode precisar esperar uma mensagem anterior da sequência.','A ordem comum não precisa ser a mesma da ordem física observada pela rede.'],
    mnemonic:'Pergunta-chave: “todos precisam concordar na mesma sequência?”'
  }
};

function saveCore(){
  localStorage.setItem(STORAGE.theme,state.theme);
}
function saveQuizStats(){
  localStorage.setItem(STORAGE.quiz,JSON.stringify({attempts:state.quiz.attempts,bestGrade:state.quiz.bestGrade,lastScore:state.quiz.lastScore,lastTotal:state.quiz.lastTotal}));
}
function navTo(section){
  const el=document.getElementById(section); if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  const nav=$('#mobileNav'); const toggle=$('#menuToggle');
  nav.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); nav.setAttribute('aria-hidden','true');
}
$$('[data-section]').forEach(btn=>btn.addEventListener('click',()=>navTo(btn.dataset.section)));


$('#themeToggle').addEventListener('click',()=>{
  state.theme=state.theme==='light'?'dark':'light'; document.documentElement.dataset.theme=state.theme;
  $('#themeToggle').textContent=state.theme==='dark'?'🌙':'☀️'; $('#themeToggle').setAttribute('aria-label',state.theme==='dark'?'Ativar tema claro':'Ativar tema escuro');
  saveCore();
});
$('#themeToggle').textContent=state.theme==='dark'?'🌙':'☀️';
$('#themeToggle').setAttribute('aria-label',state.theme==='dark'?'Ativar tema claro':'Ativar tema escuro');

$('#menuToggle').addEventListener('click',()=>{ const nav=$('#mobileNav'); const open=nav.classList.toggle('open'); $('#menuToggle').setAttribute('aria-expanded',String(open)); nav.setAttribute('aria-hidden',String(!open)); });
$('#mobileNav').innerHTML=['fundamentos','ordenacoes','simulador','questoes','revisao'].map((s,i)=>`<button data-section="${s}">${['Fundamentos','Ordenações','Simulador','Questões','Revisão'][i]}</button>`).join('');
$$('#mobileNav [data-section]').forEach(btn=>btn.addEventListener('click',()=>navTo(btn.dataset.section)));

function renderOrder(order='fifo'){
  const d=orderData[order];
  $('#orderPanel').innerHTML=`
    <article class="order-content" role="tabpanel">
      <div>
        <span class="eyebrow">${d.label}</span>
        <h3>${fmt(d.summary)}</h3>
        <p>${fmt(d.why)}</p>
        <div class="rule-box">${fmt(d.rule)}</div>
        <p class="note" style="margin-top:16px"><strong>${fmt(d.mnemonic)}</strong></p>
      </div>
      <div>
        <strong>Exemplo passo a passo</strong>
        <div class="example-steps">${d.example.map((x,i)=>`<div class="example-step"><span class="step-num">${i+1}</span><div>${fmt(x)}</div></div>`).join('')}</div>
      </div>
    </article>`;
}
$$('.ordering-tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.ordering-tab').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false');});
  btn.classList.add('active');btn.setAttribute('aria-selected','true');renderOrder(btn.dataset.order);
}));
renderOrder();

// ----------------------------- SIMULADOR -----------------------------
const scenarioData = {
  'same-sender': {
    name:'A · Mesmo remetente',
    description:'P₁ faz multicast de m₁ e, depois, de m₂. P₂ produz m₃ de forma independente. A rede pode entregar m₂ antes de m₁, mas FIFO impede que isso vire a ordem de entrega.',
    totalOrder:['m₁','m₂','m₃'],
    messages:[
      {id:'m₁',sender:'P1',deps:[],text:'primeira mensagem de P₁'},
      {id:'m₂',sender:'P1',deps:[],text:'segunda mensagem de P₁'},
      {id:'m₃',sender:'P2',deps:[],text:'mensagem independente de P₂'}
    ],
    arrivals:[
      ['P2','m₂'],['P3','m₁'],['P1','m₁'],['P1','m₂'],['P3','m₃'],['P2','m₁'],['P2','m₃'],['P3','m₂'],['P1','m₃']
    ]
  },
  'causal-chain': {
    name:'B · Dependência causal',
    description:'P₁ envia m₁. P₂ usa a informação de m₁ para produzir m₂. m₃ é independente. O ponto central é ver m₂ chegar antes de sua causa e ficar esperando.',
    totalOrder:['m₁','m₂','m₃'],
    messages:[
      {id:'m₁',sender:'P1',deps:[],text:'mensagem que inicia a dependência'},
      {id:'m₂',sender:'P2',deps:['m₁'],text:'resposta de P₂ baseada em m₁'},
      {id:'m₃',sender:'P3',deps:[],text:'mensagem independente de P₃'}
    ],
    arrivals:[
      ['P3','m₂'],['P3','m₁'],['P1','m₂'],['P2','m₂'],['P1','m₁'],['P2','m₁'],['P3','m₃'],['P2','m₃'],['P1','m₃']
    ]
  },
  'concurrent': {
    name:'C · Mensagens concorrentes',
    description:'P₁, P₂ e P₃ produzem mensagens sem dependência entre si. Causal pode aceitar ordens diferentes; total impõe uma mesma ordem relativa: m₂ → m₁ → m₃.',
    totalOrder:['m₂','m₁','m₃'],
    messages:[
      {id:'m₁',sender:'P1',deps:[],text:'mensagem independente de P₁'},
      {id:'m₂',sender:'P2',deps:[],text:'mensagem independente de P₂'},
      {id:'m₃',sender:'P3',deps:[],text:'mensagem independente de P₃'}
    ],
    arrivals:[
      ['P1','m₁'],['P2','m₂'],['P3','m₃'],['P1','m₂'],['P2','m₁'],['P3','m₂'],['P1','m₃'],['P2','m₃'],['P3','m₁']
    ]
  }
};

function messageById(id){
  const s=scenarioData[state.sim.scenario];
  return s.messages.find(m=>m.id===id);
}
function modeLabel(mode){
  return {fifo:'FIFO',causal:'Causal',total:'Total',none:'Sem ordenação'}[mode] || mode;
}
function freshSimState(){
  return {eventIndex:0,received:{P1:[],P2:[],P3:[]},delivered:{P1:[],P2:[],P3:[]},lastEvent:null,log:[],auto:null};
}
state.sim = Object.assign(state.sim,freshSimState());

function hasReceived(process,id){ return state.sim.received[process].includes(id); }
function hasDelivered(process,id){ return state.sim.delivered[process].includes(id); }

function canDeliver(process,id,mode,deliveredMap=state.sim.delivered,receivedMap=state.sim.received,scenario=scenarioData[state.sim.scenario]){
  const msg=scenario.messages.find(m=>m.id===id);
  if(!msg || !receivedMap[process].includes(id) || deliveredMap[process].includes(id)) return false;
  if(mode==='none') return true;
  if(mode==='fifo'){
    const sameSender=scenario.messages.filter(m=>m.sender===msg.sender);
    const index=sameSender.findIndex(m=>m.id===id);
    return sameSender.slice(0,index).every(m=>deliveredMap[process].includes(m.id));
  }
  if(mode==='causal') return msg.deps.every(dep=>deliveredMap[process].includes(dep));
  if(mode==='total'){
    const index=scenario.totalOrder.indexOf(id);
    if(index<0) return true;
    return scenario.totalOrder.slice(0,index).every(prev=>deliveredMap[process].includes(prev));
  }
  return true;
}

function blockedReason(process,id,mode){
  const scenario=scenarioData[state.sim.scenario];
  const msg=messageById(id);
  if(mode==='fifo'){
    const sequence=scenario.messages.filter(m=>m.sender===msg.sender);
    const i=sequence.findIndex(m=>m.id===id);
    const missing=sequence.slice(0,i).filter(m=>!hasDelivered(process,m.id));
    return missing.length ? `FIFO exige que ${missing.map(m=>m.id).join(' e ')} seja(m) entregue(s) antes de ${id}, porque vêm do mesmo remetente (${fmt(msg.sender)}).` : 'A condição FIFO está satisfeita.';
  }
  if(mode==='causal'){
    const missing=msg.deps.filter(dep=>!hasDelivered(process,dep));
    return missing.length ? `${fmt(id)} depende de ${missing.map(x=>fmt(x)).join(' e ')}. Como essa(s) mensagem(ns) ainda não foi(ram) entregue(s) a ${fmt(process)}, ${fmt(id)} permanece na fila.` : 'Todas as dependências causais já foram satisfeitas.';
  }
  if(mode==='total'){
    const i=scenario.totalOrder.indexOf(id);
    const missing=scenario.totalOrder.slice(0,i).filter(prev=>!hasDelivered(process,prev));
    return missing.length ? `A sequência comum deste experimento é ${scenario.totalOrder.map(fmt).join(' → ')}. Antes de ${fmt(id)}, ainda falta(m) ${missing.map(fmt).join(' → ')}.` : 'A posição de entrega está liberada.';
  }
  return 'Sem ordenação: não existe uma condição adicional de espera.';
}

function drainProcess(process){
  const released=[];
  let changed=true;
  while(changed){
    changed=false;
    const waiting=state.sim.received[process].filter(id=>!hasDelivered(process,id));
    for(const id of waiting){
      if(canDeliver(process,id,state.sim.mode)){
        state.sim.delivered[process].push(id);
        released.push(id);
        changed=true;
      }
    }
  }
  return released;
}

function renderScenarioDescription(){
  const s=scenarioData[$('#scenarioSelect').value];
  $('#scenarioDescription').innerHTML=`<div><span class="eyebrow">CENÁRIO</span><strong>${s.name}</strong><p>${s.description}</p></div><div class="scenario-order"><small>Para total, este cenário usa:</small><strong>${s.totalOrder.map(fmt).join(' → ')}</strong></div>`;
}

function messageStatus(process,id){
  if(hasDelivered(process,id)) return 'delivered';
  if(hasReceived(process,id)) return canDeliver(process,id,state.sim.mode) ? 'arrived' : 'waiting';
  return 'not-yet';
}

function statusLabel(status){
  return {delivered:'entregue',arrived:'chegou',waiting:'aguarda', 'not-yet':'não chegou'}[status];
}

function renderProcess(process){
  const scenario=scenarioData[state.sim.scenario];
  const active=state.sim.lastEvent?.process===process;
  const statuses=scenario.messages.map(msg=>({msg,status:messageStatus(process,msg.id)}));
  const waiting=statuses.filter(x=>x.status==='waiting');
  const deliveredIds=state.sim.delivered[process];
  const arrivalIds=state.sim.received[process];
  const explanation=waiting.length ? blockedReason(process,waiting[0].msg.id,state.sim.mode) : 'Nenhuma mensagem está bloqueada neste momento.';
  const chips=statuses.map(({msg,status})=>{
    const deps=msg.deps.length ? `<small>depende de ${msg.deps.map(fmt).join(', ')}</small>` : `<small>${fmt(msg.sender)}</small>`;
    return `<div class="message-card ${status}"><div class="message-main"><span class="message-id">${fmt(msg.id)}</span><span class="message-status">${statusLabel(status)}</span></div>${deps}</div>`;
  }).join('');
  return `<article class="process-card ${active?'active-process':''}">
    <header class="process-head"><div><span class="process-title">${fmt(process)}</span><span class="process-subtitle">processo do grupo</span></div><span class="process-badge">${deliveredIds.length}/${scenario.messages.length} entregues</span></header>
    <div class="process-snapshot"><div><small>cópias que chegaram</small><strong>${arrivalIds.length}/${scenario.messages.length}</strong></div><div><small>na fila</small><strong>${waiting.length}</strong></div><div><small>na aplicação</small><strong>${deliveredIds.length}</strong></div></div>
    <div class="message-grid">${chips}</div>
    <div class="queue-explanation ${waiting.length?'has-waiting':''}"><strong>${waiting.length?'Por que há espera?':'Estado da fila'}</strong><p>${explanation}</p></div>
    <div class="app-delivery"><span>APLICAÇÃO</span><div>${deliveredIds.length ? deliveredIds.map(id=>`<span class="delivery-chip">${fmt(id)}</span>`).join('<b>→</b>') : '<em>Nenhuma mensagem entregue ainda</em>'}</div></div>
  </article>`;
}

function renderNetworkStrip(){
  const scenario=scenarioData[state.sim.scenario];
  const visible=scenario.arrivals.slice(state.sim.eventIndex,Math.min(state.sim.eventIndex+5,scenario.arrivals.length));
  let track='';
  if(visible.length){
    for(let i=0;i<visible.length;i++){
      const item=visible[i];
      const cls=i===0?'next-arrival':'';
      track += `<span class="arrival-token ${cls}"><b>${fmt(item[1])}</b><small>→ ${fmt(item[0])}</small></span>`;
      if(i<visible.length-1) track += '<i>→</i>';
    }
  } else {
    track='<span class="arrival-complete">Todas as chegadas deste cenário já foram processadas.</span>';
  }
  $('#networkStrip').innerHTML=`<div class="network-strip-head"><span class="eyebrow">TRÂNSITO DA REDE</span><span>${state.sim.eventIndex}/${scenario.arrivals.length} eventos executados</span></div><div class="arrival-track">${track}</div>`;
}

function renderSimulator(){
  const scenario=scenarioData[state.sim.scenario];
  $('#simMode').value=state.sim.mode;
  $('#simNetwork').innerHTML=['P1','P2','P3'].map(renderProcess).join('');
  $('#simStep').textContent=`evento ${state.sim.eventIndex}`;
  $('#simProgress').textContent=`${state.sim.eventIndex}/${scenario.arrivals.length} eventos`;
  renderNetworkStrip();

  const sequences=['P1','P2','P3'].map(p=>({p,seq:state.sim.delivered[p]}));
  $('#deliverySequences').innerHTML=sequences.map(x=>`<div class="sequence-card"><span>${fmt(x.p)}</span><div>${x.seq.length?x.seq.map(id=>`<span>${fmt(id)}</span>`).join('<b>→</b>'):'<em>—</em>'}</div></div>`).join('');
  const complete=sequences.every(x=>x.seq.length===scenario.messages.length);
  const agree=complete && sequences.every(x=>x.seq.join('|')===sequences[0].seq.join('|'));
  const el=$('#deliveryAgreement');
  el.className=`agreement-badge ${agree?'yes':complete?'partial':'incomplete'}`;
  el.textContent=agree?'✓ mesma sequência':complete?'⚠ sequências diferentes':'… experimento em andamento';

  const ev=state.sim.lastEvent;
  if(!ev){
    $('#eventFocus').innerHTML=`<span class="event-number">0</span><div><strong>Pronto para observar a rede</strong><p>Clique em “Próximo evento” para fazer uma cópia de ${fmt(scenario.arrivals[0][1])} chegar a ${fmt(scenario.arrivals[0][0])}.</p></div>`;
    $('#simStatus').textContent='Aguardando o primeiro evento';
  }else{
    const outcome=ev.released.length ? `entregou ${ev.released.map(fmt).join(' → ')} à aplicação` : 'colocou a mensagem na fila de espera';
    $('#eventFocus').innerHTML=`<span class="event-number">${ev.number}</span><div><strong>${fmt(ev.msg)} chegou a ${fmt(ev.process)} → ${outcome}</strong><p>${fmt(ev.explanation)}</p></div>`;
    $('#simStatus').textContent=ev.released.length ? 'A entrega foi liberada' : 'A mensagem precisa esperar';
  }
}

function updateSimLog(){
  const el=$('#deliveryLog');
  if(!state.sim.log.length){
    el.innerHTML='<li class="empty-log">Nenhum evento processado ainda.</li>';
    return;
  }
  el.innerHTML=state.sim.log.map((entry,i)=>`<li class="${entry.kind}"><span class="log-index">${i+1}</span><div><strong>${entry.title}</strong><p>${entry.text}</p>${entry.release?`<small>Entrega liberada: ${entry.release.map(fmt).join(' → ')}</small>`:''}</div></li>`).join('');
}

function renderExplanation(type){
  const box=$('#simExplanation');
  if(type==='start'){
    box.innerHTML=`<span class="explain-title">Comece pela pergunta certa</span><p>Quando uma cópia chega, a pergunta não é apenas “ela chegou?”. O ponto do multicast ordenado é descobrir <strong>em que momento essa cópia pode ser entregue à aplicação sem quebrar a regra escolhida</strong>.</p><div class="explain-grid"><div><small>1 · REDE</small><p>A cópia chega a um processo.</p></div><div><small>2 · REGRA</small><p>O processo verifica a ordenação.</p></div><div><small>3 · DECISÃO</small><p>Entrega agora ou mantém na fila.</p></div><div><small>4 · EFEITO</small><p>A aplicação observa uma sequência.</p></div></div>`;
    return;
  }
  if(type==='complete'){
    box.innerHTML=`<span class="explain-title">Experimento concluído</span><p>Agora olhe para as três sequências de entrega. A diferença entre FIFO, causal e total está justamente em <strong>quais relações o protocolo é obrigado a preservar</strong>.</p>`;
    return;
  }
  const ev=state.sim.lastEvent;
  if(!ev) return renderExplanation('start');
  box.innerHTML=`<span class="explain-title">${fmt(ev.title)}</span><p>${fmt(ev.explanation)}</p><div class="explain-grid"><div><small>1 · CHEGADA</small><p><strong>${fmt(ev.msg)}</strong> chegou a <strong>${fmt(ev.process)}</strong>.</p></div><div><small>2 · VERIFICAÇÃO</small><p>${fmt(ev.ruleCheck)}</p></div><div><small>3 · DECISÃO</small><p>${fmt(ev.decision)}</p></div><div><small>4 · APLICAÇÃO</small><p>${ev.released.length ? `Agora: ${ev.released.map(fmt).join(' → ')}.` : 'Nenhuma entrega nesta etapa.'}</p></div></div>`;
}

function addLog(entry){
  state.sim.log.push(entry);
  updateSimLog();
}

function buildEventExplanation(process,id){
  const msg=messageById(id);
  const mode=state.sim.mode;
  if(mode==='none'){
    return {
      title:`${fmt(id)} chegou e foi liberada imediatamente`,
      explanation:`Como o experimento está sem ordenação, ${fmt(process)} não precisa esperar outra mensagem para entregar ${fmt(id)}. A sequência depende do momento em que cada cópia chega.`,
      ruleCheck:'Nenhuma restrição adicional está sendo aplicada.',
      decision:'Pode entregar agora.'
    };
  }
  if(canDeliver(process,id,mode)){
    const reason=mode==='fifo' ? 'A sequência anterior do mesmo remetente já está entregue neste processo.' : mode==='causal' ? 'As dependências causais necessárias já foram entregues neste processo.' : 'Todas as mensagens que ocupam posições anteriores na ordem comum já foram entregues neste processo.';
    return {
      title:`${fmt(id)} pode ser entregue`,
      explanation:`${fmt(id)} chegou a ${fmt(process)}. O processo verificou ${modeLabel(mode)} e a condição está satisfeita. ${reason}`,
      ruleCheck:reason,
      decision:'A cópia passa da fila para a aplicação.'
    };
  }
  return {
    title:`${fmt(id)} precisa esperar`,
    explanation:`${fmt(id)} já está em ${fmt(process)}, mas entregá-la agora violaria a regra de ${modeLabel(mode)}. ${blockedReason(process,id,mode)}`,
    ruleCheck:blockedReason(process,id,mode),
    decision:'A cópia fica retida até que a condição seja satisfeita.'
  };
}

function processOneEvent(){
  const scenario=scenarioData[state.sim.scenario];
  if(state.sim.eventIndex>=scenario.arrivals.length){
    clearInterval(state.sim.auto);state.sim.auto=null;$('#autoSim').textContent='▶ Reproduzir';
    renderExplanation('complete');
    renderSimulator();
    return;
  }
  const [process,id]=scenario.arrivals[state.sim.eventIndex];
  state.sim.eventIndex += 1;
  state.sim.received[process].push(id);
  const base=buildEventExplanation(process,id);
  const released=drainProcess(process);
  const waiting=!released.includes(id);
  const note=waiting ? `A cópia chegou, mas ${fmt(id)} permaneceu aguardando.` : `${fmt(id)} foi liberada${released.length>1?` junto com ${released.slice(1).map(fmt).join(' e ')}`:''}.`;
  state.sim.lastEvent={number:state.sim.eventIndex,process,msg:id,released,title:waiting?`${fmt(id)} chegou → espera`:base.title,explanation:`${base.explanation} ${note}`,ruleCheck:base.ruleCheck,decision:released.length ? `Entrega realizada: ${released.map(fmt).join(' → ')}.` : base.decision};
  addLog({kind:released.length?'delivery':'wait',title:`${fmt(id)} chegou a ${fmt(process)}`,text:`${fmt(state.sim.lastEvent.explanation)}`,release:released});
  renderSimulator();
  renderExplanation('event');
  if(state.sim.eventIndex>=scenario.arrivals.length){
    setTimeout(()=>{ if(state.sim.eventIndex>=scenario.arrivals.length) renderExplanation('complete'); },50);
    clearInterval(state.sim.auto);state.sim.auto=null;$('#autoSim').textContent='▶ Reproduzir';
  }
}

function resetSimState(){
  clearInterval(state.sim.auto);state.sim.auto=null;
  const fresh=freshSimState();
  Object.assign(state.sim,fresh);
  state.sim.scenario=$('#scenarioSelect').value;
  state.sim.mode=$('#simMode').value;
  $('#autoSim').textContent='▶ Reproduzir';
  renderScenarioDescription();
  renderSimulator();
  updateSimLog();
  renderExplanation('start');
}

function startAuto(){
  if(state.sim.auto){
    clearInterval(state.sim.auto);state.sim.auto=null;$('#autoSim').textContent='▶ Reproduzir';return;
  }
  $('#autoSim').textContent='❚❚ Pausar';
  state.sim.auto=setInterval(()=>processOneEvent(),Number($('#simSpeed').value));
}

function simulateMode(scenarioName,mode){
  const s=scenarioData[scenarioName];
  const rec={P1:[],P2:[],P3:[]};
  const del={P1:[],P2:[],P3:[]};
  const can=(p,id)=>canDeliver(p,id,mode,del,rec,s);
  const drain=(p)=>{ let changed=true; while(changed){ changed=false; for(const id of rec[p]){ if(!del[p].includes(id)&&can(p,id)){del[p].push(id);changed=true;} } } };
  for(const [p,id] of s.arrivals){rec[p].push(id);drain(p);}
  return {rec,del};
}

function runComparison(){
  const scenarioName=$('#scenarioSelect').value;
  const s=scenarioData[scenarioName];
  const modes=['none','fifo','causal','total'];
  const labels={none:'Sem ordenação',fifo:'FIFO',causal:'Causal',total:'Total'};
  const descriptions={
    none:'Cada processo entrega conforme as cópias chegam. Processos podem observar ordens diferentes.',
    fifo:'Cada processo preserva a ordem das mensagens do mesmo remetente. Mensagens de outros remetentes podem ser intercaladas.',
    causal:'Dependências são preservadas. Mensagens concorrentes não precisam receber a mesma posição.',
    total:`Todos os processos seguem a mesma ordem relativa escolhida para este cenário: ${s.totalOrder.map(fmt).join(' → ')}.`
  };
  $('#compareGrid').innerHTML=modes.map(mode=>{
    const result=simulateMode(scenarioName,mode);
    const rows=['P1','P2','P3'].map(p=>({p,seq:result.del[p]}));
    const allComplete=rows.every(r=>r.seq.length===s.messages.length);
    const same=allComplete && rows.every(r=>r.seq.join('|')===rows[0].seq.join('|'));
    return `<article class="compare-card mode-${mode}"><div class="compare-card-head"><strong>${labels[mode]}</strong><span>${same?'✓ mesma ordem':mode==='causal'?'ordens podem variar':'ordem local'}</span></div><div class="compare-sequence-large">${rows[0].seq.map((id,i)=>`<span>${fmt(id)}</span>${i<rows[0].seq.length-1?'<b>→</b>':''}`).join('')||'—'}</div><div class="compare-processes">${rows.map(r=>`<div><strong>${fmt(r.p)}</strong><span>${r.seq.map(fmt).join(' → ')||'—'}</span></div>`).join('')}</div><p>${descriptions[mode]}</p></article>`;
  }).join('');
}

$('#loadScenario').addEventListener('click',resetSimState);
$('#resetSim').addEventListener('click',resetSimState);
$('#stepSim').addEventListener('click',processOneEvent);
$('#autoSim').addEventListener('click',startAuto);
$('#simMode').addEventListener('change',resetSimState);
$('#scenarioSelect').addEventListener('change',resetSimState);
$('#simSpeed').addEventListener('change',()=>{if(state.sim.auto){clearInterval(state.sim.auto);state.sim.auto=null;startAuto();}});
$('#clearLog').addEventListener('click',()=>{state.sim.log=[];updateSimLog();});
$('#runComparison').addEventListener('click',runComparison);

// ----------------------------- QUIZ -----------------------------
const questionBank = [
  {q:'O que caracteriza um multicast?',o:['Envio exclusivamente para um processo','Envio de uma mensagem para um grupo de processos','Envio para todos os computadores da Internet','Envio sem qualquer destinatário'],a:1,e:'Multicast é comunicação direcionada a um grupo definido de processos.'},
  {q:'Em FIFO, qual relação é preservada?',o:['A mesma ordem global para todas as mensagens','A ordem de emissão por um mesmo remetente','A ordem física dos cabos da rede','A ordem alfabética das mensagens'],a:1,e:'FIFO preserva a sequência de multicasts feitos pelo mesmo processo.'},
  {q:'P1 envia m₁ e depois m₂. Em FIFO, qual entrega é proibida?',o:['m₁ antes de m₂','m₂ antes de m₁','m₁ e depois uma mensagem de P2','m₂ depois de uma mensagem de P3'],a:1,e:'Para o mesmo remetente, uma entrega de m₂ exige que m₁ já tenha sido entregue.'},
  {q:'O que significa “entregar” uma mensagem neste portal?',o:['Entregá-la à camada de aplicação do processo','Necessariamente transmiti-la pela Internet','Criptografá-la','Gerar uma cópia no remetente'],a:0,e:'A propriedade de ordenação é observada na ordem em que os processos entregam mensagens à aplicação.'},
  {q:'Uma mensagem pode chegar a um processo e ainda não ser entregue à aplicação?',o:['Sim','Não','Somente em unicast','Somente em total'],a:0,e:'Sim. O protocolo pode manter a mensagem em uma fila de espera até que a condição de ordenação seja satisfeita.'},
  {q:'Por que mensagens do mesmo multicast podem chegar em ordens diferentes?',o:['Porque atrasos de comunicação podem variar','Porque multicast força uma ordem aleatória','Porque todos os processos usam relógios diferentes','Porque a aplicação sempre reordena'],a:0,e:'O multicast básico pode observar atrasos diferentes nas comunicações subjacentes.'},
  {q:'Em FIFO, mensagens de remetentes diferentes:',o:['Precisam sempre da mesma ordem','Podem ser intercaladas em ordens diferentes','Nunca podem coexistir','Devem ser descartadas'],a:1,e:'FIFO restringe a sequência de cada remetente, não cria por si só uma ordem global entre remetentes diferentes.'},
  {q:'Se m₂ depende de m₁, qual ideia causal deve ser preservada?',o:['m₂ antes de m₁','m₁ antes de m₂','A ordem alfabética','A ordem de tamanho'],a:1,e:'Na relação causal, a causa precisa preceder o efeito na entrega.'},
  {q:'Duas mensagens concorrentes sem dependência precisam de uma ordem causal?',o:['Sim, obrigatoriamente','Não','Somente se forem de P1','Somente em broadcast'],a:1,e:'Causalidade não precisa ordenar mensagens que não possuem relação causal entre si.'},
  {q:'Qual é a meta central da ordenação total?',o:['Todos observarem a mesma ordem relativa de entrega','Eliminar atrasos da rede','Garantir mensagens confiáveis','Usar um único processo'],a:0,e:'Total exige consistência da ordem de entrega entre os processos do grupo.'},
  {q:'A ordenação total, isoladamente, implica causalidade?',o:['Sempre','Não necessariamente','Somente em três processos','Somente em FIFO'],a:1,e:'Total garante uma ordem comum, mas essa definição não inclui automaticamente a preservação da relação causal.'},
  {q:'A ordenação causal implica FIFO?',o:['Sim, no sentido de preservar a sequência de multicasts do mesmo processo','Não','Somente com broadcast','Somente se o grupo tiver dois processos'],a:0,e:'Os multicasts sucessivos de um mesmo processo fazem parte da precedência causal; por isso causal preserva FIFO.'},
  {q:'FIFO implica causal?',o:['Sempre','Não necessariamente','Somente em redes rápidas','Somente em P2P'],a:1,e:'FIFO não captura, sozinho, dependências que atravessam processos diferentes.'},
  {q:'Total exige necessariamente a ordem física em que os pacotes foram enviados?',o:['Sim','Não','Somente no remetente','Somente no último processo'],a:1,e:'A ordem total é uma ordem de entrega comum estabelecida pela comunicação ordenada; ela não é simplesmente a leitura da ordem física dos pacotes.'},
  {q:'O que é uma ordem parcial?',o:['Toda dupla precisa ser comparada','Apenas certas relações precisam ser preservadas; outras podem ficar sem ordem obrigatória','Nenhuma mensagem possui ordem','Só existe um processo'],a:1,e:'Em uma ordem parcial, relações necessárias são preservadas, enquanto elementos concorrentes podem permanecer incomparáveis.'},
  {q:'O que é uma ordem total?',o:['Toda mensagem é entregue instantaneamente','Todo par relevante fica comparável e os processos concordam sobre a ordem relativa','Só uma mensagem é entregue','Apenas o remetente decide localmente'],a:1,e:'Uma ordem total elimina a possibilidade de processos discordarem sobre a ordem relativa das mensagens consideradas.'},
  {q:'Se m₂ chega antes de m₁, FIFO permite entregar m₂ quando m₁ é a anterior do mesmo remetente?',o:['Sim, sem restrição','Não, precisa esperar m₁','Somente em total','Somente se m₂ for menor'],a:1,e:'A chegada física pode ser antecipada, mas FIFO restringe a entrega.'},
  {q:'Qual cenário demonstra uma dependência causal?',o:['P1 e P2 enviam mensagens sem relação','P2 recebe m₁ e, por causa dessa informação, produz m₂','P1 envia m₁ duas vezes','Todos recebem ao mesmo tempo'],a:1,e:'A segunda mensagem nasce de uma informação recebida na primeira, formando uma dependência.'},
  {q:'Qual cenário demonstra melhor uma necessidade de ordem total?',o:['Mensagens independentes de remetentes diferentes devem ser observadas na mesma sequência por todos','P1 envia m₁ e m₂','P2 responde a m₁','Uma mensagem é enviada para um só processo'],a:0,e:'Total é especialmente útil quando diferentes processos precisam observar a mesma sequência de operações.'},
  {q:'Por que a fila de espera aparece em protocolos de ordenação?',o:['Para esconder mensagens','Para impedir que uma entrega viole a garantia de ordenação','Para diminuir o tamanho dos pacotes','Para transformar multicast em unicast'],a:1,e:'A fila permite receber mensagens cedo demais sem entregá-las à aplicação antes da condição correta.'},
  {q:'Qual frase resume FIFO?',o:['Causa antes do efeito','Mesmo remetente, preserve a sequência','Todos escolhem a mesma ordem','Nenhuma restrição'],a:1,e:'FIFO é a preservação da ordem dos multicasts de cada remetente.'},
  {q:'Qual frase resume causal?',o:['Mesmo remetente apenas','Causa antes do efeito','Tudo deve ter uma ordem total','Sem entrega'],a:1,e:'Causal preserva dependências entre mensagens relacionadas.'},
  {q:'Qual frase resume total?',o:['Somente o remetente importa','Todos observam a mesma ordem','Só causa importa','Mensagens concorrentes ficam sempre livres'],a:1,e:'Total busca uma sequência relativa comum de entrega entre os processos.'},
  {q:'Qual afirmação é mais precisa sobre causal e mensagens concorrentes?',o:['Elas precisam ser ordenadas em uma mesma sequência','Elas podem permanecer em ordens relativas diferentes','Elas precisam ser descartadas','Uma sempre vira causa da outra'],a:1,e:'Mensagens concorrentes não têm dependência causal; causalidade não precisa impor uma ordem entre elas.'},
  {q:'O objetivo do simulador é separar quais eventos?',o:['Envio, criptografia e armazenamento','Chegada, verificação, espera e entrega','CPU, memória e disco','Unicast, broadcast e DNS'],a:1,e:'Essa separação ajuda a visualizar por que chegar ao processo não significa automaticamente entregar à aplicação.'},
  {q:'O que FIFO não garante por si só?',o:['Que m₂ não passe m₁ do mesmo remetente','Uma ordem global única entre remetentes diferentes','A sequência do mesmo remetente','A ordem de emissão do próprio processo'],a:1,e:'A ordem global é uma propriedade adicional, relacionada à ordenação total.'},
  {q:'O que causal acrescenta em relação a FIFO?',o:['A preservação de dependências causais entre processos','A eliminação de mensagens','A garantia de ordem total','A transmissão instantânea'],a:0,e:'Causal leva em conta relações que podem atravessar processos diferentes.'},
  {q:'O que total acrescenta em relação a causal, quando usado isoladamente?',o:['A mesma ordem relativa para mensagens que precisam de posição comum','Mais mensagens','Menos processos','Relógios físicos'],a:0,e:'Total obriga concordância de ordem, inclusive para mensagens concorrentes dentro do escopo definido.'},
  {q:'A ordenação, sozinha, garante que toda mensagem será entregue?',o:['Sim','Não necessariamente','Somente em FIFO','Somente em causal'],a:1,e:'Ordenação e confiabilidade são propriedades diferentes; uma não implica automaticamente a outra.'},
  {q:'Se dois processos entregam m₁ e m₂ em ordens opostas, qual garantia é violada?',o:['Total','FIFO em todos os casos','Unicast','Broadcast'],a:0,e:'Se ambos entregam as duas mensagens, uma ordem total não permite que um veja m₁→m₂ e outro m₂→m₁.'},
  {q:'Uma ordem parcial pode deixar duas mensagens concorrentes sem relação de ordem?',o:['Sim','Não','Só com broadcast','Só com três processos'],a:0,e:'Essa é justamente a característica de não exigir uma relação entre todos os pares.'},
  {q:'Se P1 faz multicast de m₁ e depois m₂, causal preserva m₁ antes de m₂?',o:['Sim','Não necessariamente','Somente em total','Somente em unicast'],a:0,e:'A sequência de multicasts do mesmo processo faz parte da relação causal.'},
  {q:'Em total, por que um processo pode esperar mesmo depois de receber uma mensagem?',o:['Porque a mensagem pode estar depois de outra na ordem comum escolhida','Porque recebeu duas vezes','Porque FIFO sempre vence','Porque toda mensagem demora exatamente o mesmo tempo'],a:0,e:'A ordem de entrega pode exigir que uma mensagem anterior seja entregue primeiro.'},
  {q:'No cenário de mensagens concorrentes, o que causal permite?',o:['Manter a ordem relativa diferente entre processos, desde que não haja dependências violadas','Obrigar todos à mesma sequência','Bloquear todas as mensagens','Ordenar por nome'],a:0,e:'Sem dependência causal, a propriedade não exige uma ordem comum.'},
  {q:'Por que a ordem total não precisa ser igual à ordem física de chegada?',o:['Porque ela é uma regra de entrega, não uma leitura direta do atraso da rede','Porque mensagens não chegam','Porque só existe um receptor','Porque total não considera mensagens'],a:0,e:'A rede pode entregar cópias em sequências diferentes; a ordenação total cria uma sequência comum para a entrega.'},
  {q:'Qual situação pode ser tratada por uma combinação FIFO-total?',o:['Preservar FIFO e também exigir uma ordem comum entre processos','Eliminar causalidade','Usar apenas unicast','Ignorar remetentes'],a:0,e:'Combinações híbridas podem reunir restrições de ordenação.'},
  {q:'Qual situação pode ser tratada por causal-total?',o:['Preservar dependências causais e ainda exigir uma ordem comum','Entregar tudo sem ordem','Eliminar mensagens concorrentes','Usar somente broadcast'],a:0,e:'O híbrido causal-total soma as duas exigências.'},
  {q:'Neste portal, por que relógios lógicos não são o primeiro passo?',o:['Porque a propriedade pode ser entendida primeiro pelas dependências e pelo comportamento de entrega','Porque relógios não existem','Porque FIFO depende do relógio físico','Porque total é impossível sem eles'],a:0,e:'Mecanismos de implementação são uma etapa posterior; primeiro importa entender qual comportamento a garantia deve produzir.'},
  {q:'Qual é a diferença mais importante entre “receber” e “entregar”?',o:['Receber é tornar a mensagem disponível ao processo; entregar é passá-la à aplicação obedecendo a regra','São sempre sinônimos','Entregar é reenviar','Receber acontece só no remetente'],a:0,e:'A separação permite que a ordenação mantenha uma mensagem recebida em espera.'},
  {q:'Se m₂ depende de m₁ e m₁ ainda não foi entregue a P3, o que causal faz com m₂ se ela já chegou?',o:['Entrega m₂ imediatamente','Mantém m₂ aguardando','Descarta m₂','Muda para FIFO'],a:1,e:'A mensagem chegou, mas sua dependência ainda não foi satisfeita.'}
];

function shuffle(arr){return [...arr].sort(()=>Math.random()-.5)}
function renderQuizStats(){
  const best=state.quiz.bestGrade; const last=state.quiz.lastScore; const total=state.quiz.lastTotal;
  $('#bestGrade').textContent=best==null?'—':Number(best).toFixed(1);
  $('#lastGrade').textContent=last==null?'—':(last/total).toFixed(1);
  $('#lastPercent').textContent=last==null?'nenhuma rodada':`${Math.round(last/total*100)}% de aproveitamento`;
  $('#attemptCount').textContent=state.quiz.attempts||0;
}
function gradeFor(score,total){return Math.round((score/total)*100)/10;}
function startQuiz(){
  const total=Number($('#questionSize').value); state.quiz.bank=shuffle(questionBank).slice(0,total); state.quiz.total=total;state.quiz.index=0;state.quiz.score=0;state.quiz.answered=false;
  $('#questionCount').textContent=total;$('#quizResult').classList.add('hidden');$('#nextQuestion').disabled=true;renderQuestion();renderQuizStats();
}
function renderQuestion(){
  const item=state.quiz.bank[state.quiz.index]; const total=state.quiz.bank.length; const current=state.quiz.index+1;
  $('#quizTitle').textContent=`Questão ${current} de ${total}`;$('#quizSubtitle').textContent='Escolha uma alternativa. Depois da resposta, veja o motivo.';$('#quizScore').textContent=state.quiz.score;$('#quizProgress').style.width=`${((current-1)/total)*100}%`;$('#nextQuestion').textContent=current===total?'Ver resultado →':'Próxima questão →';$('#nextQuestion').disabled=true;state.quiz.answered=false;
  $('#quizCard').innerHTML=`<div class="question-index">Questão ${current}</div><div class="question-text">${fmt(item.q)}</div><div class="option-grid">${item.o.map((x,i)=>`<button class="option" data-index="${i}"><strong>${String.fromCharCode(65+i)}.</strong> ${fmt(x)}</button>`).join('')}</div><div id="feedback" class="feedback hidden"></div>`;
  $$('.option',$('#quizCard')).forEach(btn=>btn.addEventListener('click',()=>answerQuestion(Number(btn.dataset.index))));
}
function answerQuestion(index){
  if(state.quiz.answered)return;const item=state.quiz.bank[state.quiz.index];state.quiz.answered=true;const opts=$$('.option',$('#quizCard'));opts.forEach((btn,i)=>{btn.classList.add('disabled');if(i===item.a)btn.classList.add('correct');if(i===index&&i!==item.a)btn.classList.add('wrong');});const right=index===item.a;if(right)state.quiz.score++;const f=$('#feedback');f.classList.remove('hidden');f.innerHTML=`<strong>${right?'✓ Correto!':'✗ Quase!'}</strong> ${fmt(item.e)}`;$('#quizScore').textContent=state.quiz.score;$('#nextQuestion').disabled=false;
}
$('#nextQuestion').addEventListener('click',()=>{if(state.quiz.index===state.quiz.bank.length-1)showQuizResult();else{state.quiz.index++;renderQuestion();}});
$('#newQuiz').addEventListener('click',startQuiz);$('#questionSize').addEventListener('change',startQuiz);
function showQuizResult(){
  const total=state.quiz.bank.length,score=state.quiz.score,pct=Math.round(score/total*100),grade=gradeFor(score,total);state.quiz.attempts=(state.quiz.attempts||0)+1;state.quiz.lastScore=score;state.quiz.lastTotal=total;
  if(state.quiz.bestGrade==null || grade > Number(state.quiz.bestGrade)) state.quiz.bestGrade=grade;
  saveQuizStats();renderQuizStats();$('#quizProgress').style.width='100%';$('#quizTitle').textContent='Rodada concluída';$('#quizCard').innerHTML='';$('#nextQuestion').disabled=true;$('#quizResult').classList.remove('hidden');const message=pct>=90?'Excelente: você está distinguindo as três garantias com bastante segurança.':pct>=70?'Boa base: revise principalmente causal × total e a diferença entre chegar e entregar.':'Faça outra rodada depois de revisar o simulador; ele foi feito para consolidar exatamente essas diferenças.';
  $('#quizResult').innerHTML=`<span class="eyebrow">RESULTADO</span><h3>${score}/${total} acertos · nota ${grade.toFixed(1)}/10</h3><p>${message}</p><button class="btn primary" id="retryQuiz">Fazer outra rodada</button>`;$('#retryQuiz').addEventListener('click',startQuiz);
}


// ----------------------------- FAQ -----------------------------
$$('.faq-q').forEach(btn=>btn.addEventListener('click',()=>{const card=btn.closest('.faq');const open=card.classList.toggle('open');btn.querySelector('span').textContent=open?'−':'+';}));

// ----------------------------- INIT -----------------------------
renderQuizStats();resetSimState();runComparison();startQuiz();
