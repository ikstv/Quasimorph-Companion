/* Quasimorph Companion — renderer (UI language: Ukrainian; mission text: Russian) */

// ---- colors & labels -------------------------------------------------------
const CAMPAIGN_ORDER = ['tutorial','xio','anc','civ','hiv','rwa','tez','unc'];
const CAMPAIGN_META = {
  tutorial:{label:'Навчання',          color:'#7b8493'},
  xio:     {label:'Xiomara Masks',     color:'#b463c9'},
  anc:     {label:'AnCom',             color:'#d64b3f'},
  civ:     {label:'Civil Resistance',  color:'#e0a73c'},
  hiv:     {label:'Hive',              color:'#7fae4b'},
  rwa:     {label:'RealWare',          color:'#4d90d6'},
  tez:     {label:'Tezctlan',          color:'#2fa89a'},
  unc:     {label:'Unchained Belt',    color:'#d46a8f'}
};
const PROC_TYPE_ORDER = ['RaiderCapture','Defense','Elimination','Sabotage','Espionage',
  'Robbery','Ritual','Escort','Infiltration','Control','Counterattack','Security',
  'BramfaturaInvasion','CEO_Eilimination'];
const PROC_TYPE_COLOR = {
  RaiderCapture:'#d98c34', Defense:'#4d90d6', Elimination:'#d64b3f', Sabotage:'#c9772e',
  Espionage:'#8f7de0', Robbery:'#c9a227', Ritual:'#b04ad6', Escort:'#69b8b3',
  Infiltration:'#4db38a', Control:'#7b8493', Counterattack:'#e0673c', Security:'#5aa9c9',
  BramfaturaInvasion:'#9b59b6', CEO_Eilimination:'#d64b3f'
};

// ---- state -----------------------------------------------------------------
let DATA = null;
const state = { mode:'story', category:'all', search:'' };
let pinnedId = null;

// ---- helpers ---------------------------------------------------------------
const $ = (s, r=document) => r.querySelector(s);
const el = (t, c) => { const e=document.createElement(t); if(c) e.className=c; return e; };

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/** Convert in-game rich-text tags to safe HTML. */
function fmt(text){
  if(!text) return '';
  let s = esc(text);
  s = s.replace(/&lt;color=#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?&gt;/g, '<span style="color:#$1">');
  s = s.replace(/&lt;\/color&gt;/g, '</span>');
  s = s.replace(/&lt;br\s*\/?&gt;/g, '<br>');
  s = s.replace(/&lt;(\/?)(b|i|u)&gt;/g, '<$1$2>');
  s = s.replace(/%([A-Z_]+)%/g, '<span class="ph">$1</span>');
  return s;
}

function colorFor(m){
  return m.type==='story'
    ? (CAMPAIGN_META[m.campaignKey]?.color || '#4a5160')
    : (PROC_TYPE_COLOR[m.missionType] || '#4a5160');
}
function groupKeyFor(m){ return m.type==='story' ? m.campaignKey : m.missionType; }
function groupLabelFor(m){
  return m.type==='story'
    ? (CAMPAIGN_META[m.campaignKey]?.label || m.campaign || m.campaignKey)
    : (m.missionTypeName || m.missionType);
}

function missions(){ return state.mode==='story' ? DATA.storyMissions : DATA.procMissions; }

function buildSearchIndex(){
  for(const m of [...DATA.storyMissions, ...DATA.procMissions]){
    const bits = [m.id, m.name, m.desc, m.briefing,
      m.station?.name, m.beneficiaryFaction?.name, m.victimFaction?.name,
      m.missionTypeName, m.giverName, m.victimName];
    m._s = bits.filter(Boolean).join(' ').toLowerCase();
  }
}

// ---- filtering + rendering grid --------------------------------------------
function currentList(){
  const q = state.search.trim().toLowerCase();
  return missions().filter(m=>{
    if(state.category!=='all' && groupKeyFor(m)!==state.category) return false;
    if(q && !m._s.includes(q)) return false;
    return true;
  });
}

function renderContent(){
  const content = $('#content');
  content.innerHTML = '';
  const list = currentList();

  // update counter
  const total = missions().length;
  $('#counter').innerHTML = `<b>${list.length}</b> / ${total} місій`;

  if(!list.length){
    const e = el('div','empty'); e.textContent = 'НІЧОГО НЕ ЗНАЙДЕНО';
    content.appendChild(e); return;
  }

  // group
  const order = state.mode==='story' ? CAMPAIGN_ORDER : PROC_TYPE_ORDER;
  const groups = new Map();
  for(const m of list){
    const k = groupKeyFor(m);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const keys = [...groups.keys()].sort((a,b)=>{
    const ia=order.indexOf(a), ib=order.indexOf(b);
    return (ia<0?999:ia)-(ib<0?999:ib);
  });

  for(const k of keys){
    const arr = groups.get(k);
    const sample = arr[0];
    const color = colorFor(sample);
    const label = groupLabelFor(sample);

    const grp = el('section','campaign-group');
    const head = el('div','cg-head');
    const bar = el('div','cg-bar'); bar.style.background = color;
    const title = el('div','cg-title'); title.textContent = label; title.style.color = color;
    const cnt = el('div','cg-count'); cnt.textContent = arr.length;
    const line = el('div','cg-line');
    head.append(bar, title, cnt, line);
    grp.appendChild(head);

    const grid = el('div','grid');
    for(const m of arr) grid.appendChild(tile(m));
    grp.appendChild(grid);
    content.appendChild(grp);
  }
}

function diffText(m){
  if(m.type!=='story') return '';
  const d = m.shownDifficulty;
  return d ? d : '';
}

function tile(m){
  const t = el('div','tile');
  t.style.setProperty('--fac', colorFor(m));
  if(m.id===pinnedId) t.classList.add('pinned');

  const top = el('div','tile-top');
  const nameWrap = el('div');
  const name = el('div','tile-name'); name.textContent = m.name;
  const id = el('div','tile-id'); id.textContent = m.id;
  nameWrap.append(name, id);
  top.appendChild(nameWrap);

  if(m.type==='story' && diffText(m)){
    const diff = el('div','tile-diff'); diff.textContent = '☠ ' + diffText(m);
    top.appendChild(diff);
  } else if(m.type==='proc'){
    const v = el('div','tile-diff'); v.textContent = '#' + (m.variant||1);
    top.appendChild(v);
  }
  t.appendChild(top);

  const meta = el('div','tile-meta');
  if(m.type==='story'){
    const fac = el('span','tile-fac'); fac.textContent = m.beneficiaryFaction?.name || '—';
    fac.style.color = colorFor(m);
    const sep = el('span','sep'); sep.textContent = '•';
    const st = el('span','tile-station'); st.textContent = m.station?.name || '—';
    meta.append(fac, sep, st);
  } else {
    const g = el('span','tile-fac'); g.textContent = m.giverName || '—'; g.style.color = colorFor(m);
    const arr = el('span','sep'); arr.textContent = '→';
    const v = el('span','tile-station'); v.textContent = m.victimName || '—';
    meta.append(g, arr, v);
  }
  t.appendChild(meta);

  t.addEventListener('mouseenter', ()=>showHover(m, t));
  t.addEventListener('mouseleave', hideHover);
  t.addEventListener('click', ()=>openDrawer(m));
  return t;
}

// ---- rich mission card (shared markup) -------------------------------------
function badges(m){
  let html = '<div class="card-badges">';
  const c = colorFor(m);
  if(m.type==='story'){
    html += `<span class="badge fac" style="background:${c}">${esc(CAMPAIGN_META[m.campaignKey]?.label||m.campaign)}</span>`;
    html += `<span class="badge">Сюжетна</span>`;
    if(m.shownDifficulty) html += `<span class="badge diff">☠ Загроза ${esc(m.shownDifficulty)}</span>`;
  } else {
    html += `<span class="badge fac" style="background:${c}">${esc(m.missionTypeName)}</span>`;
    html += `<span class="badge">Несюжетна</span>`;
    html += `<span class="badge">Варіант #${esc(m.variant||1)}</span>`;
  }
  html += '</div>';
  return html;
}

function kvGrid(m){
  const rows = [];
  if(m.type==='story'){
    if(m.station) rows.push(['Станція', esc(m.station.name)]);
    if(m.beneficiaryFaction) rows.push(['Замовник', esc(m.beneficiaryFaction.name)]);
    if(m.victimFaction) rows.push(['Ціль', esc(m.victimFaction.name)]);
    if(m.minTechLevel) rows.push(['Тех-рівень', esc(m.minTechLevel)]);
  } else {
    if(m.giverName) rows.push(['Замовник', esc(m.giverName)]);
    if(m.victimName) rows.push(['Ціль', esc(m.victimName)]);
    rows.push(['Тип', esc(m.missionTypeName)]);
  }
  if(!rows.length) return '';
  return '<div class="card-grid">' + rows.map(([k,v])=>
    `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('') + '</div>';
}

function sect(title, inner){
  if(!inner) return '';
  return `<div class="sect"><div class="sect-h">${title}</div>${inner}</div>`;
}
function objectivesHtml(m){
  if(!m.objectives?.length) return '';
  return '<ul class="obj-list">' + m.objectives.map(o=>`<li>${fmt(o)}</li>`).join('') + '</ul>';
}
function stagesHtml(m){
  if(!m.stages?.length) return '';
  return '<div class="stage-list">' + m.stages.map((s,i)=>
    `<div class="stage-row"><span class="stage-n">${i+1}</span><span>${fmt(s)}</span></div>`).join('') + '</div>';
}
function rewardsHtml(m){
  if(!m.prizeItems?.length) return '';
  return '<div class="rewards">' + m.prizeItems.map(it=>
    `<span class="reward"><span class="ri">◆</span>${esc(it.name)}</span>`).join('') + '</div>';
}

/** Compact card for hover. */
function cardCompact(m){
  let h = '<div class="card-head">' + badges(m) +
    `<div class="card-title">${esc(m.name)}</div>` +
    `<div class="card-idline">${esc(m.id)}</div></div>`;
  h += kvGrid(m);
  h += sect('Задача', m.desc ? `<div class="prose">${fmt(m.desc)}</div>` : '');
  h += sect('Цілі', objectivesHtml(m));
  if(m.type==='story') h += sect('Нагороди', rewardsHtml(m));
  h += '<div class="hc-hint">клік — детальніше</div>';
  return h;
}

/** Full card for drawer. */
function cardFull(m){
  let h = '<button class="drawer-close" id="drawer-close">✕</button>';
  h += '<div class="card-head">' + badges(m) +
    `<div class="card-title">${esc(m.name)}</div>` +
    `<div class="card-idline">${esc(m.id)}</div></div>`;
  h += kvGrid(m);
  h += sect('Задача', m.desc ? `<div class="prose">${fmt(m.desc)}</div>` : '');
  h += sect('Брифінг', m.briefing ? `<div class="prose">${fmt(m.briefing)}</div>` : '');
  h += sect('Деталі', m.details ? `<div class="prose">${fmt(m.details)}</div>` : '');
  h += sect('Цілі', objectivesHtml(m));
  h += sect('Стадії', stagesHtml(m));
  if(m.type==='story') h += sect('Нагороди', rewardsHtml(m));
  h += sect('Підсумок', m.after ? `<div class="prose">${fmt(m.after)}</div>` : '');
  return h;
}

// ---- hover card ------------------------------------------------------------
function showHover(m, tileEl){
  const hc = $('#hovercard');
  hc.innerHTML = cardCompact(m);
  hc.style.setProperty('--fac', colorFor(m));
  hc.classList.add('show'); hc.setAttribute('aria-hidden','false');
  const r = tileEl.getBoundingClientRect();
  const cw = hc.offsetWidth, ch = hc.offsetHeight;
  let x = r.right + 12, y = r.top;
  if(x + cw > window.innerWidth - 8) x = r.left - cw - 12;
  if(x < 8) x = Math.max(8, Math.min(window.innerWidth - cw - 8, r.left));
  if(y + ch > window.innerHeight - 8) y = window.innerHeight - ch - 8;
  if(y < 52) y = 52;
  hc.style.left = x + 'px'; hc.style.top = y + 'px';
}
function hideHover(){
  const hc = $('#hovercard');
  hc.classList.remove('show'); hc.setAttribute('aria-hidden','true');
}

// ---- drawer ----------------------------------------------------------------
function openDrawer(m){
  pinnedId = m.id;
  hideHover();
  $('#drawer-inner').innerHTML = cardFull(m);
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden','false');
  $('#drawer-scrim').classList.add('open');
  $('#drawer-inner').scrollTop = 0;
  $('#drawer-close').addEventListener('click', closeDrawer);
  // refresh pinned highlight
  document.querySelectorAll('.tile').forEach(t=>t.classList.remove('pinned'));
  renderContent();
}
function closeDrawer(){
  pinnedId = null;
  $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden','true');
  $('#drawer-scrim').classList.remove('open');
  document.querySelectorAll('.tile.pinned').forEach(t=>t.classList.remove('pinned'));
}

// ---- filters (mode + category chips) ---------------------------------------
function renderFilters(){
  const seg = $('#mode-seg');
  const box = $('#cat-filters');
  seg.innerHTML = '';
  box.innerHTML = '';

  // mode segmented (always visible)
  const modes = [['story','Сюжетні'],['proc','Несюжетні']];
  for(const [val,label] of modes){
    const c = el('div','chip' + (state.mode===val?' active':''));
    c.textContent = label;
    c.addEventListener('click', ()=>{ state.mode=val; state.category='all'; renderFilters(); renderContent(); });
    seg.appendChild(c);
  }

  // "all" chip (in scrollable category row)
  const all = el('div','chip' + (state.category==='all'?' active':''));
  all.textContent = 'Усі';
  all.addEventListener('click', ()=>{ state.category='all'; renderFilters(); renderContent(); });
  box.appendChild(all);

  // category chips
  if(state.mode==='story'){
    for(const k of CAMPAIGN_ORDER){
      if(!DATA.storyMissions.some(m=>m.campaignKey===k)) continue;
      const meta = CAMPAIGN_META[k];
      const c = el('div','chip' + (state.category===k?' active':''));
      c.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
      c.addEventListener('click', ()=>{ state.category=k; renderFilters(); renderContent(); });
      box.appendChild(c);
    }
  } else {
    const seen = new Set();
    for(const k of PROC_TYPE_ORDER){
      const one = DATA.procMissions.find(m=>m.missionType===k);
      if(!one || seen.has(k)) continue; seen.add(k);
      const color = PROC_TYPE_COLOR[k] || '#4a5160';
      const c = el('div','chip' + (state.category===k?' active':''));
      c.innerHTML = `<span class="dot" style="background:${color}"></span>${esc(one.missionTypeName)}`;
      c.addEventListener('click', ()=>{ state.category=k; renderFilters(); renderContent(); });
      box.appendChild(c);
    }
  }
}

// ---- boot ------------------------------------------------------------------
async function loadData(){
  if(window.QM?.getData) return window.QM.getData();
  const r = await fetch('../data/missions.json'); // fallback for browser testing
  return r.json();
}

async function boot(){
  DATA = await loadData();
  if(DATA.error){ $('#content').innerHTML = `<div class="empty">ПОМИЛКА ДАНИХ: ${esc(DATA.error)}</div>`; return; }
  buildSearchIndex();
  renderFilters();
  renderContent();

  // search
  $('#search').addEventListener('input', e=>{ state.search = e.target.value; renderContent(); });

  // window controls
  $('#btn-min').addEventListener('click', ()=>window.QM?.minimize());
  $('#btn-max').addEventListener('click', ()=>window.QM?.maximize());
  $('#btn-close').addEventListener('click', ()=>window.QM?.close());

  // drawer close interactions
  $('#drawer-scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });
}

boot();
