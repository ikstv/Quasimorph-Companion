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
let WEAPONS = null;   // { weapons, factionDrops, topByFaction, topByFactionRanged, ... }
let WORLD = null;     // { spaceObjects, stations }
const state = {
  mode:'story', category:'all', search:'', save:null,
  target: { factionId:null, weaponId:null, rangedOnly:false, metric:'dmg' },
  showedWelcome: false
};

// ---- welcome + persistence -------------------------------------------------
const LS = {
  seen:   'qmSeenWelcome',
  mode:   'qmLastMode',
  metric: 'qmLastMetric'
};
function saveLastMode(){
  try {
    localStorage.setItem(LS.mode, state.mode);
    localStorage.setItem(LS.metric, state.target.metric);
  } catch {}
}
function restoreLastMode(){
  try {
    const m = localStorage.getItem(LS.mode);
    const met = localStorage.getItem(LS.metric);
    if (m) state.mode = m;
    if (met === 'dps' || met === 'dmg') state.target.metric = met;
  } catch {}
}

// Localization helper for space object / station names.
function locationChain(stationId){
  if(!WORLD || !stationId) return [];
  const st = WORLD.stations[stationId];
  if(!st) return [stationId];
  const parts = [st.name];
  let cur = st.spaceObjectId;
  while(cur && WORLD.spaceObjects[cur]){
    const so = WORLD.spaceObjects[cur];
    parts.unshift(so.name);
    cur = so.parentId;
  }
  return parts;
}
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

function currentTopTables(){
  const t = state.target;
  if(t.metric === 'dps'){
    return t.rangedOnly ? WEAPONS.topByFactionDpsRanged : WEAPONS.topByFactionDps;
  }
  return t.rangedOnly ? WEAPONS.topByFactionRanged : WEAPONS.topByFaction;
}

function renderTargetPicker(container){
  if(!WEAPONS) return;
  const t = state.target;
  const top = currentTopTables() || {};
  const factionOrder = Object.keys(top).sort();
  const row = el('div','nav-target');

  // Current metric is shown as a static label; mode chips are the metric selector.
  const label = el('div','nav-metric-label');
  label.textContent = t.metric === 'dps' ? '⚡ Ціль за DPS' : '⚔ Ціль за уроном';
  row.appendChild(label);

  // Faction dropdown
  const facSel = el('select','nav-sel');
  facSel.innerHTML = '<option value="">— ціль-фракція —</option>' +
    factionOrder.map(f => `<option value="${esc(f)}"${f===t.factionId?' selected':''}>${esc(f)}</option>`).join('');
  facSel.addEventListener('change', ()=>{
    state.target.factionId = facSel.value || null;
    state.target.weaponId = null;   // reset weapon choice
    renderContent();
  });
  row.appendChild(facSel);

  // Weapon dropdown (depends on selected faction)
  const wSel = el('select','nav-sel');
  const opts = t.factionId ? (top[t.factionId] || []) : [];
  const unit = t.metric === 'dps' ? 'DPS' : 'dmg';
  const val  = (w) => t.metric === 'dps' ? w.dps : w.dmgMax;
  wSel.innerHTML = '<option value="">— ціль-зброя —</option>' +
    opts.map(w => `<option value="${esc(w.id)}"${w.id===t.weaponId?' selected':''}>${esc(w.name)} · ${val(w)} ${unit} · TL${w.tech}</option>`).join('');
  wSel.disabled = !t.factionId;
  wSel.addEventListener('change', ()=>{
    state.target.weaponId = wSel.value || null;
    renderContent();
  });
  row.appendChild(wSel);

  // Ranged-only toggle
  const toggle = el('label','nav-toggle');
  toggle.innerHTML = `<input type="checkbox"${t.rangedOnly?' checked':''}> тільки стрілецька`;
  toggle.querySelector('input').addEventListener('change', (e)=>{
    state.target.rangedOnly = e.target.checked;
    state.target.weaponId = null;   // weapon list changed — reset
    renderContent();
  });
  row.appendChild(toggle);

  if(t.weaponId){
    const clear = el('button','nav-clear'); clear.textContent = 'скинути ціль ✕';
    clear.addEventListener('click', ()=>{
      state.target = { factionId:null, weaponId:null, rangedOnly:t.rangedOnly, metric:t.metric };
      renderContent();
    });
    row.appendChild(clear);
  }

  container.appendChild(row);
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

  // Target-weapon picker row
  renderTargetPicker(content);

  const hasTarget = !!state.target.weaponId;

  // filter blocked + search; sort depends on whether a target is set
  const rows = s.liveMissions
    .filter(m => !m.isBlocked)
    .filter(m => {
      const q = state.search.trim().toLowerCase();
      if(!q) return true;
      const key = (m.storyId+' '+(m.benId||'')+' '+(m.vicId||'')+' '+(m.stationId||'')).toLowerCase();
      return key.includes(q);
    })
    .map(m => ({ m, score: scoreForTarget(m) }));

  if(hasTarget){
    rows.sort((a,b) =>
      (Number(a.score.blocks) - Number(b.score.blocks)) ||
      (a.score.weight - b.score.weight) ||
      (a.m.difficulty - b.m.difficulty)
    );
  } else {
    rows.sort((a,b) => (a.m.difficulty - b.m.difficulty) || (a.m.rewardPoints - b.m.rewardPoints));
  }
  const list = rows.map(r => r.m);
  const scoreOf = new Map(rows.map(r => [r.m, r.score]));

  $('#counter').innerHTML = `<b>${list.length}</b> / ${s.liveMissions.length} пропозицій`;

  if(!list.length){
    const e = el('div','empty'); e.textContent = 'НІЧОГО НЕ ЗНАЙДЕНО';
    content.appendChild(e); return;
  }

  // Three-tier layout: hero (1), normal (next up to 4), compact (rest).
  const heroWrap    = el('div','nav-hero');
  const normalWrap  = el('div','nav-list');
  const compactWrap = el('div','nav-compact');

  const NORMAL_COUNT = 4;

  list.forEach((lm, i) => {
    const tier = i === 0 ? 'hero' : (i <= NORMAL_COUNT ? 'normal' : 'compact');
    const m = missionById[lm.storyId];
    const sc = scoreOf.get(lm) || {leadsTo:false, blocks:false};
    const row = navRow(lm, m, sc, tier);
    (tier==='hero' ? heroWrap : tier==='compact' ? compactWrap : normalWrap).appendChild(row);
  });

  content.appendChild(heroWrap);
  if(normalWrap.childNodes.length){
    const h = el('div','nav-section-title'); h.textContent = 'НАСТУПНІ ВАРІАНТИ';
    content.appendChild(h);
    content.appendChild(normalWrap);
  }
  if(compactWrap.childNodes.length){
    const h = el('div','nav-section-title'); h.textContent = 'РЕШТА ПРОПОЗИЦІЙ';
    content.appendChild(h);
    content.appendChild(compactWrap);
  }
}

function navRow(lm, m, sc, tier){
  const row = el('div', 'nav-row nav-' + tier);
  if(sc.leadsTo) row.classList.add('to-target');
  if(sc.blocks) row.classList.add('blocks-target');
  const camp = m ? (m.type==='story' ? m.campaignKey : null) : null;
  row.style.setProperty('--fac', camp ? CAMPAIGN_META[camp].color : factionColor(lm.benId));

  // difficulty
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

  // center column
  const mid = el('div','nav-mid');
  const nameRow = el('div','nav-nameRow');
  const name = el('div','nav-name');
  name.textContent = m?.name || lm.storyId;
  nameRow.appendChild(name);
  if(sc.leadsTo){ const b = el('span','target-badge to'); b.textContent = '→ ЦІЛЬ'; nameRow.appendChild(b); }
  if(sc.blocks){ const b = el('span','target-badge block'); b.textContent = '⚠ ЗАКРИЄ ЦІЛЬ'; nameRow.appendChild(b); }
  mid.appendChild(nameRow);

  // Location chain + mission-type sub-line
  const sub = el('div','nav-sub');
  const chain = locationChain(lm.stationId);
  const typeLabel = lm.procType || (m?.missionTypeName || 'СЮЖЕТ');
  sub.innerHTML = `<span class="nav-chain">${chain.map(esc).join('<span class="nav-sep">›</span>')}</span>`
    + `<span class="nav-typedot"> · </span><span class="nav-type">${esc(typeLabel)}</span>`;
  mid.appendChild(sub);

  // Detail chips (skulls, floors, threat, mapWH, days) — for hero + normal
  if(tier !== 'compact'){
    const chips = el('div','nav-details');
    chips.appendChild(chip('💀', '×' + (lm.difficulty || 0), 'складність'));
    if(lm.floors)    chips.appendChild(chip('🏢', String(lm.floors) + ' пов.', 'поверхів'));
    if(lm.threat)    chips.appendChild(chip('⚡', 'бюджет ' + lm.threat, 'бюджет загрози'));
    if(lm.mapW && lm.mapH) chips.appendChild(chip('📏', `${lm.mapW}×${lm.mapH}`, 'розмір карти'));
    if(lm.daysLeft!=null) chips.appendChild(chip('⏳', lm.daysLeft.toFixed(1) + ' дн.', 'до експірації'));
    mid.appendChild(chips);
  }

  row.appendChild(mid);

  // right column: rep + rewards
  const right = el('div','nav-right');
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
  right.appendChild(rep);

  if(tier !== 'compact'){
    const rw = el('div','nav-rw');
    if(lm.rewardItems.length){
      const maxItems = tier === 'hero' ? 6 : 3;
      const items = lm.rewardItems.slice(0,maxItems).map(it => {
        const s = (it.count>1 ? `${it.id}×${it.count}` : it.id);
        return it.isWeapon ? `⚔ ${s}` : s;
      });
      if(lm.rewardItems.length > maxItems) items.push(`+${lm.rewardItems.length-maxItems}`);
      rw.textContent = items.join(' · ');
    } else {
      rw.textContent = `${lm.rewardPoints} pts`;
    }
    right.appendChild(rw);
  }
  row.appendChild(right);

  if(m){
    row.addEventListener('mouseenter', ()=>showHover(m, row));
    row.addEventListener('mouseleave', hideHover);
    row.addEventListener('click', ()=>openDrawer(m));
    row.classList.add('clickable');
  }
  return row;
}

function chip(icon, text, title){
  const c = el('span','nav-chip-detail');
  c.title = title || '';
  c.innerHTML = `<span class="ncd-ico">${icon}</span><span class="ncd-txt">${esc(text)}</span>`;
  return c;
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

  // mode segmented (always visible). Штурман is split into two: pick a metric on chip click.
  const activeMetric = state.target.metric;
  const modes = [
    { val:'story', label:'Сюжетні' },
    { val:'proc',  label:'Несюжетні' },
    { val:'chain', label:'Ланцюг' },
    { val:'nav',   label:'⚡ Макс DPS', metric:'dps',
      active: state.mode==='nav' && activeMetric==='dps' },
    { val:'nav',   label:'⚔ Макс Урон', metric:'dmg',
      active: state.mode==='nav' && activeMetric==='dmg' },
    { val:'done',  label:'Пройдені' }
  ];
  for(const m of modes){
    const isActive = m.active !== undefined ? m.active
      : (state.mode === m.val && !m.metric);
    const c = el('div','chip' + (isActive ? ' active' : ''));
    c.textContent = m.label;
    c.addEventListener('click', ()=>{
      state.mode = m.val;
      state.category = 'all';
      if(m.metric){
        state.target.metric = m.metric;
        state.target.weaponId = null;   // list contents change with metric
      }
      saveLastMode();
      renderFilters(); renderContent();
    });
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
async function loadWeapons(){
  if(window.QM?.getWeapons) return window.QM.getWeapons();
  try { const r = await fetch('../data/weapons.json'); return r.ok ? r.json() : null; }
  catch { return null; }
}
async function loadWorld(){
  if(window.QM?.getWorld) return window.QM.getWorld();
  try { const r = await fetch('../data/world.json'); return r.ok ? r.json() : null; }
  catch { return null; }
}

// ---- welcome overlay -------------------------------------------------------
function showWelcome(){
  const overlay = el('div','welcome-overlay');
  overlay.innerHTML = `
    <div class="w-inner">
      <div class="w-logo">◈ QUASIMORPH COMPANION</div>
      <div class="w-sub">Вибери, що тебе цікавить у цій сесії</div>
      <div class="w-cards">
        <button class="w-card w-dps" data-choice="dps">
          <div class="w-ico">⚡</div>
          <div class="w-title">Максимальний DPS в грі</div>
          <div class="w-desc">Сталий вихід урону: дробовики, ПП, кулемети.<br>Приклад цілі: <b>Тайга АНКМ · 2076 DPS</b></div>
        </button>
        <button class="w-card w-dmg" data-choice="dmg">
          <div class="w-ico">⚔</div>
          <div class="w-title">Максимальний Урон в грі</div>
          <div class="w-desc">Альфа-удар: снайперки, ракетниці, гвинтівки.<br>Приклад цілі: <b>Наковальня М6 · 133 dmg</b></div>
        </button>
      </div>
      <div class="w-skip"><a data-choice="story">→ Просто база місій</a></div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('[data-choice]').forEach(node => {
    node.addEventListener('click', () => {
      const c = node.dataset.choice;
      if (c === 'story') {
        state.mode = 'story';
      } else {
        state.mode = 'nav';
        state.target.metric = c;
      }
      try { localStorage.setItem(LS.seen, '1'); } catch {}
      saveLastMode();
      overlay.remove();
      renderFilters();
      renderContent();
    });
  });
}

// Score a live-mission against the current target weapon.
// Returns {leadsTo, blocks, weight}. weight: smaller = better path to target.
function scoreForTarget(lm){
  const tgt = state.target;
  if(!tgt.weaponId || !WEAPONS) return { leadsTo:false, blocks:false, weight:0 };
  const w = WEAPONS.weapons.find(x => x.id === tgt.weaponId);
  if(!w) return { leadsTo:false, blocks:false, weight:0 };
  const facId = tgt.factionId;
  const leadsTo = lm.benId === facId && lm.benDelta > 0;
  const blocks  = lm.vicId === facId && lm.vicDelta < 0;
  // Distance-to-target proxy: for the target-faction weapon, look up the
  // lowest drop-tier and subtract benDelta (bigger delta → closer).
  let unlockTier = w.tech;
  const drops = WEAPONS.factionDrops[facId] || [];
  for(const d of drops){
    if(d.id === w.id && d.tech < unlockTier) unlockTier = d.tech;
  }
  const rep = (state.save?.factions || []).find(f => f.id === facId)?.reputation || 0;
  const weight = (unlockTier - rep/10) - (leadsTo ? lm.benDelta/10 : 0) + (blocks ? 100 : 0);
  return { leadsTo, blocks, weight };
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

function wireGlobalHandlers(){
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
  $('#search').addEventListener('input', e=>{ state.search = e.target.value; renderContent(); });
  $('#btn-min').addEventListener('click', ()=>window.QM?.minimize());
  $('#btn-max').addEventListener('click', ()=>window.QM?.maximize());
  $('#btn-close').addEventListener('click', ()=>window.QM?.close());
  $('#drawer-scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });
}

async function boot(){
  DATA = await loadData();
  if(DATA.error){ $('#content').innerHTML = `<div class="empty">ПОМИЛКА ДАНИХ: ${esc(DATA.error)}</div>`; return; }
  buildSearchIndex();
  [...DATA.storyMissions, ...DATA.procMissions].forEach(m => { missionById[m.id] = m; });

  // Prime save + weapons + world (best-effort; UI works without them).
  WEAPONS = await loadWeapons();
  WORLD = await loadWorld();
  await refreshSave();

  // Wire input/window handlers unconditionally (welcome overlay doesn't affect these).
  wireGlobalHandlers();

  // Restore last mode from localStorage; show welcome on very first launch.
  const seen = (() => { try { return localStorage.getItem(LS.seen); } catch { return null; }})();
  if (!seen) {
    showWelcome();
    return;   // welcome will trigger renderFilters + renderContent after user picks
  }
  restoreLastMode();

  renderFilters();
  renderContent();
}

boot();
