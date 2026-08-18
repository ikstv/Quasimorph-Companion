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
const state = { mode:'story', category:'all', search:'', save:null };
let pinnedId = null;
const missionById = {};

// Faction IDs from the game save mapped to our campaign keys (for colors/icons).
const FACTION_TO_CAMPAIGN = {
  AnCom:'anc', CResistance:'civ', CivilUnity:'civ',
  Hive:'hiv', RealWare:'rwa', Tezctlan:'tez',
  Xiomara:'xio', XiomaraMasks:'xio', Urparp:'unc', UnchainedBelt:'unc'
};

function factionColor(id){
  const camp = FACTION_TO_CAMPAIGN[id];
  return (camp && CAMPAIGN_META[camp]?.color) || '#7b8493';
}
function questlineFactionCurrent(){
  // From live save: which campaign step each faction is currently on.
  const out = {};
  if(!state.save?.factions) return out;
  for(const f of state.save.factions){
    if(!f.questlineId) continue;
    const camp = FACTION_TO_CAMPAIGN[f.id];
    if(camp) out[camp] = f.questlineId;   // e.g. "AnCom_1"
  }
  return out;
}
function completedStorySet(){
  return state.save?.completedStoryIds || new Set();
}
function daysLeft(expireTicks){
  // Save time is in Unity ticks; the app doesn't hold the current game clock,
  // so we render the raw expire index as-is (relative days is a follow-up).
  return null;
}

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
function iconFor(m){
  const I = window.QM_ICONS;
  if(!I) return '';
  return m.type === 'story' ? I.campaign(m.campaignKey) : I.type(m.missionType);
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
  hideHover();
  if(state.mode === 'nav') return renderNav();
  if(state.mode === 'done') return renderDone();
  if(state.mode === 'chain') return renderChain();
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

function renderChain(){
  const content = $('#content');
  content.innerHTML = '';
  const chains = DATA.storyChains || {};
  const cats = state.category === 'all' ? CAMPAIGN_ORDER : [state.category];
  const wrap = el('div','chain');
  let count = 0;

  for(const camp of cats){
    const tiers = chains[camp];
    if(!tiers || !tiers.length) continue;
    const meta = CAMPAIGN_META[camp] || {};
    const grp = el('section','chain-camp');

    const head = el('div','cg-head');
    const bar = el('div','cg-bar'); bar.style.background = meta.color;
    const title = el('div','cg-title'); title.textContent = meta.label || camp; title.style.color = meta.color;
    const line = el('div','cg-line');
    head.append(bar, title, line);
    grp.appendChild(head);

    for(const t of tiers){
      const tier = el('div','tier'); tier.style.setProperty('--cc', meta.color);
      const spine = el('div','spine');
      const badge = el('div','tier-badge' + (t.side?' side':'')); badge.textContent = t.side ? 'S' : t.tier;
      const sline = el('div','spine-line');
      spine.append(badge, sline);

      const nodes = el('div','tier-nodes');
      if(t.missions.length > 1){
        const bh = el('div','branch-hint'); bh.textContent = 'гілка — альтернативні шляхи';
        nodes.appendChild(bh);
      }
      for(const mm of t.missions){
        count++;
        const m = missionById[mm.id];
        const node = el('div','node'); node.style.setProperty('--cc', meta.color);
        if(mm.id === pinnedId) node.classList.add('pinned');

        // save-derived overlays
        const done = completedStorySet();
        const hereByCamp = questlineFactionCurrent();
        const isDone = done.has(mm.id);
        const isHere = mm.id === hereByCamp[camp];
        if(isDone) node.classList.add('done');
        if(isHere) node.classList.add('here');

        const top = el('div','node-top');
        const nleft = el('div','nt-left');
        const nemb = el('div','node-emblem'); nemb.style.color = meta.color;
        nemb.innerHTML = window.QM_ICONS ? window.QM_ICONS.campaign(camp) : '';
        const nname = el('div','node-name'); nname.textContent = mm.name;
        nleft.append(nemb, nname);
        top.appendChild(nleft);
        if(isDone){ const dk = el('div','node-check'); dk.textContent = '✓'; top.appendChild(dk); }
        else if(isHere){ const hk = el('div','node-here'); hk.textContent = 'ТИ ТУТ'; top.appendChild(hk); }
        if(mm.branch){ const br = el('div','node-br'); br.textContent = mm.branch.toUpperCase(); top.appendChild(br); }
        node.appendChild(top);

        const idl = el('div','node-id'); idl.textContent = mm.id; node.appendChild(idl);
        if(mm.unlock && mm.unlock.length){
          const u = el('div','node-unlock');
          u.innerHTML = '<b>Умова переходу</b>' + esc(mm.unlock.join(' · '));
          node.appendChild(u);
        }
        if(m){
          node.addEventListener('mouseenter', ()=>showHover(m, node));
          node.addEventListener('mouseleave', hideHover);
          node.addEventListener('click', ()=>openDrawer(m));
        }
        nodes.appendChild(node);
      }
      tier.append(spine, nodes);
      grp.appendChild(tier);
    }
    wrap.appendChild(grp);
  }
  content.appendChild(wrap);
  $('#counter').innerHTML = `<b>${count}</b> місій у ланцюгах`;
}

function saveEmpty(msg){
  const content = $('#content');
  content.innerHTML = '';
  const e = el('div','empty save-empty');
  e.innerHTML = `<div class="se-title">ЗБЕРЕЖЕННЯ НЕ ЗНАЙДЕНО</div>
    <div class="se-body">${esc(msg)}</div>
    <div class="se-hint">Запусти Quasimorph і створи слот — Штурман підхопить його автоматично.</div>`;
  content.appendChild(e);
  $('#counter').textContent = '—';
}

function renderNav(){
  if(!state.save){ return saveEmpty('Читаю збереження…'); }
  if(!state.save.ok){
    return saveEmpty(state.save.reason==='no-save' ? 'Жодного слоту в папці збережень.' : state.save.reason);
  }
  const content = $('#content');
  content.innerHTML = '';

  // header strip: difficulty + tutorial + counts
  const s = state.save;
  const strip = el('div','nav-strip');
  const diffMap = { Easy:'ЛЕГКО', Normal:'НОРМА', Hard:'ВАЖКО' };
  strip.innerHTML = `
    <div class="nav-chip"><b>Складність:</b> ${esc(diffMap[s.difficulty] || s.difficulty)}</div>
    <div class="nav-chip">${s.tutorialFinished ? '✓ Навчання пройдено' : (s.tutorialActive ? '◐ Навчання активне' : 'Навчання вимкнено')}</div>
    <div class="nav-chip"><b>Live-пропозицій:</b> ${s.liveMissions.length}</div>
    <div class="nav-chip"><b>Пройдено сюжетних:</b> ${s.completedStoryIds.size}</div>`;
  content.appendChild(strip);

  // filter blocked; sort primary by MissionDifficulty asc, tie-breaker rewardPoints asc
  const list = s.liveMissions
    .filter(m => !m.isBlocked)
    .filter(m => {
      const q = state.search.trim().toLowerCase();
      if(!q) return true;
      const key = (m.storyId+' '+(m.benId||'')+' '+(m.vicId||'')+' '+(m.stationId||'')).toLowerCase();
      return key.includes(q);
    })
    .sort((a,b) => (a.difficulty-b.difficulty) || (a.rewardPoints-b.rewardPoints));

  $('#counter').innerHTML = `<b>${list.length}</b> / ${s.liveMissions.length} пропозицій`;

  if(!list.length){
    const e = el('div','empty'); e.textContent = 'НІЧОГО НЕ ЗНАЙДЕНО';
    content.appendChild(e); return;
  }

  const grid = el('div','nav-list');
  for(const lm of list){
    const m = missionById[lm.storyId];   // may be undefined for freshly-seeded proc missions
    const row = el('div','nav-row');
    const camp = m ? (m.type==='story' ? m.campaignKey : null) : null;
    row.style.setProperty('--fac', camp ? CAMPAIGN_META[camp].color : factionColor(lm.benId));

    // difficulty badge
    const d = el('div','nav-diff'); d.textContent = lm.difficulty || '?'; row.appendChild(d);

    // emblem
    const em = el('div','emblem');
    em.style.color = row.style.getPropertyValue('--fac');
    if(m && window.QM_ICONS){
      em.innerHTML = m.type==='story' ? window.QM_ICONS.campaign(m.campaignKey) : window.QM_ICONS.type(m.missionType);
    } else {
      em.innerHTML = window.QM_ICONS?.type(lm.procType) || '';
    }
    row.appendChild(em);

    // name + station
    const mid = el('div','nav-mid');
    const name = el('div','nav-name');
    name.textContent = m?.name || lm.storyId;
    const sub = el('div','nav-sub');
    sub.textContent = (lm.stationId ? lm.stationId : '—') + ' · ' + (lm.procType || (m?.missionTypeName || 'СЮЖЕТ'));
    mid.append(name, sub);
    row.appendChild(mid);

    // rep chips
    const rep = el('div','nav-rep');
    if(lm.benId){
      const b = el('span','rep-chip pos');
      b.style.color = factionColor(lm.benId);
      b.textContent = `${lm.benId} +${lm.benDelta.toFixed(1)}`;
      rep.appendChild(b);
    }
    if(lm.vicId){
      const v = el('span','rep-chip neg');
      v.style.color = factionColor(lm.vicId);
      v.textContent = `${lm.vicId} ${lm.vicDelta.toFixed(1)}`;
      rep.appendChild(v);
    }
    row.appendChild(rep);

    // reward items summary
    const rw = el('div','nav-rw');
    if(lm.rewardItems.length){
      const items = lm.rewardItems.slice(0,3).map(it => {
        const s = (it.count>1 ? `${it.id}×${it.count}` : it.id);
        return it.isWeapon ? `⚔ ${s}` : s;
      });
      if(lm.rewardItems.length > 3) items.push(`+${lm.rewardItems.length-3}`);
      rw.textContent = items.join(' · ');
    } else {
      rw.textContent = `${lm.rewardPoints} pts`;
    }
    row.appendChild(rw);

    if(m){
      row.addEventListener('mouseenter', ()=>showHover(m, row));
      row.addEventListener('mouseleave', hideHover);
      row.addEventListener('click', ()=>openDrawer(m));
      row.classList.add('clickable');
    }
    grid.appendChild(row);
  }
  content.appendChild(grid);
}

function renderDone(){
  if(!state.save){ return saveEmpty('Читаю збереження…'); }
  if(!state.save.ok){
    return saveEmpty(state.save.reason==='no-save' ? 'Жодного слоту в папці збережень.' : state.save.reason);
  }
  const content = $('#content');
  content.innerHTML = '';
  const done = state.save.completedStoryIds;
  const list = DATA.storyMissions.filter(m => done.has(m.id));
  $('#counter').innerHTML = `<b>${list.length}</b> / ${DATA.storyMissions.length} пройдено`;

  if(!list.length){
    const e = el('div','empty');
    e.innerHTML = '<div class="se-title">ЩЕ НІЧОГО НЕ ПРОЙДЕНО</div>' +
      '<div class="se-body">Завершені сюжетні місії зʼявляться тут автоматично.</div>';
    content.appendChild(e); return;
  }

  // reuse the same campaign-grouped grid layout as story mode
  const groups = new Map();
  for(const m of list){
    if(!groups.has(m.campaignKey)) groups.set(m.campaignKey, []);
    groups.get(m.campaignKey).push(m);
  }
  const keys = [...groups.keys()].sort((a,b)=>CAMPAIGN_ORDER.indexOf(a)-CAMPAIGN_ORDER.indexOf(b));
  for(const k of keys){
    const arr = groups.get(k);
    const meta = CAMPAIGN_META[k] || {};
    const grp = el('section','campaign-group');
    const head = el('div','cg-head');
    const bar = el('div','cg-bar'); bar.style.background = meta.color;
    const title = el('div','cg-title'); title.textContent = meta.label; title.style.color = meta.color;
    const cnt = el('div','cg-count'); cnt.textContent = arr.length;
    const line = el('div','cg-line');
    head.append(bar, title, cnt, line);
    grp.appendChild(head);
    const grid = el('div','grid');
    for(const m of arr){ const t = tile(m); t.classList.add('done'); grid.appendChild(t); }
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
  const left = el('div','tt-left');
  const emblem = el('div','emblem'); emblem.style.color = colorFor(m); emblem.innerHTML = iconFor(m);
  const nameWrap = el('div','tt-namewrap');
  const name = el('div','tile-name'); name.textContent = m.name;
  const id = el('div','tile-id'); id.textContent = m.id;
  nameWrap.append(name, id);
  left.append(emblem, nameWrap);
  top.appendChild(left);

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
    `<div class="card-titlerow"><div class="card-emblem" style="color:${colorFor(m)}">${iconFor(m)}</div>` +
    `<div class="ct-text"><div class="card-title">${esc(m.name)}</div>` +
    `<div class="card-idline">${esc(m.id)}</div></div></div></div>`;
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
  const modes = [
    ['story','Сюжетні'], ['proc','Несюжетні'], ['chain','Ланцюг'],
    ['nav','Штурман'], ['done','Пройдені']
  ];
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

  // category chips (skipped in nav mode — save-driven, category filter doesn't apply)
  if(state.mode==='nav'){
    box.style.display = 'none';
  } else {
    box.style.display = '';
  }
  if(state.mode==='story' || state.mode==='chain' || state.mode==='done'){
    for(const k of CAMPAIGN_ORDER){
      if(!DATA.storyMissions.some(m=>m.campaignKey===k)) continue;
      const meta = CAMPAIGN_META[k];
      const c = el('div','chip' + (state.category===k?' active':''));
      c.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
      c.addEventListener('click', ()=>{ state.category=k; renderFilters(); renderContent(); });
      box.appendChild(c);
    }
  } else if(state.mode==='proc') {
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

async function refreshSave(){
  if(!window.QM?.getSave || !window.QM_SAVE) return;
  try {
    const raw = await window.QM.getSave(0);
    state.save = window.QM_SAVE.normalize(raw);
  } catch (e) {
    state.save = { ok:false, reason:String(e.message||e) };
  }
}

async function boot(){
  DATA = await loadData();
  if(DATA.error){ $('#content').innerHTML = `<div class="empty">ПОМИЛКА ДАНИХ: ${esc(DATA.error)}</div>`; return; }
  buildSearchIndex();
  [...DATA.storyMissions, ...DATA.procMissions].forEach(m => { missionById[m.id] = m; });

  // Prime save (best-effort; UI works without it).
  await refreshSave();

  renderFilters();
  renderContent();

  // Live watch — debounced re-read + re-render whenever save files change.
  if(window.QM?.watchSave){
    let pending = null;
    window.QM.watchSave(async () => {
      clearTimeout(pending);
      pending = setTimeout(async () => {
        await refreshSave();
        if(state.mode==='nav' || state.mode==='done' || state.mode==='chain') renderContent();
      }, 250);
    });
  }

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
