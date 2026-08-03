(()=>{
'use strict';

const DISABLE_KEY='paper-ui-v36-disabled';
const params=new URLSearchParams(location.search);
if(params.get('safe')==='1'){localStorage.setItem(DISABLE_KEY,'1');return;}
if(params.get('ui')==='on')localStorage.removeItem(DISABLE_KEY);
if(localStorage.getItem(DISABLE_KEY)==='1')return;

const BUILD='paper-ui-v36-20260803';
if(window.__paperUiBuild===BUILD)return;
window.__paperUiBuild=BUILD;

const API='https://cockpit-backend.miyab.workers.dev';
const EXPANDED_KEY='paper-expanded-position-v36';
const MERGE_BACKUP_KEY='paper-trades-v1-backup-before-v36-merge';
let expandedId=sessionStorage.getItem(EXPANDED_KEY)||'';
let quoteBusy=false;

function num(value){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:0;
}

function normalizeSymbol(raw,market){
  let symbol=String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!symbol)return'';
  if(market==='jp')return symbol.replace(/\.T$/,'')+'.T';
  return symbol;
}

function positionKey(position){
  const market=position?.market==='us'?'us':'jp';
  return `${market}|${normalizeSymbol(position?.symbol,market)}`;
}

function lotFrom(position){
  return {
    price:num(position?.avg),
    qty:num(position?.qty),
    opened:position?.opened||'',
    entry_type:position?.entry_type||'standard'
  };
}

function lotsOf(position){
  const lots=Array.isArray(position?.lots)?position.lots.filter(lot=>num(lot?.qty)>0&&num(lot?.price)>0):[];
  return lots.length?lots:[lotFrom(position)];
}

function mergeInto(base,incoming){
  const baseQty=num(base.qty),incomingQty=num(incoming.qty),totalQty=baseQty+incomingQty;
  if(totalQty<=0)return;
  base.lots=[...lotsOf(base),...lotsOf(incoming)];
  base.avg=((num(base.avg)*baseQty)+(num(incoming.avg)*incomingQty))/totalQty;
  base.qty=totalQty;
  base.opened=base.opened||incoming.opened;
  base.last_added_at=incoming.opened||new Date().toISOString();
  ['name','frame','entry_type','lane','regime','thesis','invalid','source','source_context'].forEach(key=>{
    if(incoming[key])base[key]=incoming[key];
  });
  if(num(incoming.stop)>0)base.stop=num(incoming.stop);
  if(num(incoming.target)>0)base.target=num(incoming.target);
  const baseDate=String(base.current_date||'');
  const incomingDate=String(incoming.current_date||'');
  if(incomingDate&&(!baseDate||incomingDate>=baseDate)){
    ['current','current_date','current_price_time','current_source'].forEach(key=>{
      if(incoming[key]!==undefined)base[key]=incoming[key];
    });
  }
}

function mergeDuplicatePositions(){
  if(typeof db==='undefined'||!Array.isArray(db.positions))return false;
  const map=new Map(),merged=[];
  let changed=false;
  for(const position of db.positions){
    const key=positionKey(position);
    const existing=map.get(key);
    if(existing&&key.split('|')[1]){
      if(!changed&&!localStorage.getItem(MERGE_BACKUP_KEY)){
        localStorage.setItem(MERGE_BACKUP_KEY,JSON.stringify(db));
      }
      mergeInto(existing,position);
      changed=true;
    }else{
      map.set(key,position);
      merged.push(position);
    }
  }
  if(changed){
    db.positions=merged;
    save();
  }
  return changed;
}

function addStyles(){
  if(document.getElementById('paper-ui-v36-style'))return;
  const style=document.createElement('style');
  style.id='paper-ui-v36-style';
  style.textContent=`
    .paper-quote-status{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 2px 10px;padding:9px 11px;border:1px solid var(--line2);border-radius:13px;background:rgba(255,253,249,.72);font-size:11px;color:var(--muted)}
    .paper-quote-status[data-kind="ok"]{color:var(--vantage);border-color:#cfe7df;background:#f3fbf8}
    .paper-quote-status[data-kind="warn"]{color:#946319;border-color:#ecd9b4;background:#fffaf0}
    .paper-quote-refresh{flex:none;min-height:36px;border:1px solid var(--line);border-radius:11px;background:#fff;padding:7px 10px;color:var(--text);font-size:11px;font-weight:800;cursor:pointer}
    .position+.position{margin-top:10px}
    .position .pos-top{cursor:pointer}
    .paper-expand{width:40px;height:40px;display:grid;place-items:center;flex:none;border:1px solid var(--line);border-radius:12px;background:var(--card2);color:var(--muted);font-size:20px;line-height:1;cursor:pointer;transition:transform .18s ease}
    .position.paper-open .paper-expand{transform:rotate(180deg)}
    .position:not(.paper-open)>.hr,
    .position:not(.paper-open)>.grid3,
    .position:not(.paper-open)>.rr-row,
    .position:not(.paper-open)>.actions,
    .position:not(.paper-open)>.paper-lots{display:none!important}
    .paper-lots{margin:0 0 14px;padding:12px;border:1px solid var(--line2);border-radius:14px;background:var(--card2)}
    .paper-lots-title{font-size:11px;color:var(--muted);font-weight:800;margin-bottom:7px}
    .paper-lot{display:grid;grid-template-columns:1fr auto;gap:8px;padding:6px 0;font-size:12px;border-top:1px solid var(--line2)}
    .paper-lot:first-of-type{border-top:0}
    .paper-lot b{font-size:12px}
    .paper-source-chip{display:inline-flex;margin-top:5px;padding:3px 7px;border-radius:999px;background:#edf8f4;color:var(--vantage);font-size:9px;font-weight:850}
    @media(max-width:700px){
      body{padding:10px 10px 88px}
      .wrap{max-width:none}
      #topTabs{display:none!important}
      .topbar{align-items:center;margin:0 2px 10px}
      .brand{gap:10px;align-items:center}
      .appicon{width:44px;height:44px;border-radius:13px}
      .title{font-size:23px;margin:0}
      .sub{font-size:10px;margin-top:5px}
      .shortcut{width:44px;height:44px;border-radius:13px}
      #positions>.summary,#history>.summary,#stats>.summary{display:none!important}
      .inline-meta{margin:8px 2px 7px;font-size:10px}
      .section-head{margin:8px 2px 8px}
      .section-title{font-size:16px}
      .card{border-radius:18px;box-shadow:0 5px 18px rgba(30,40,55,.05)}
      .position{padding:12px}
      .position .pos-top{align-items:center}
      .position .pos-title-wrap{gap:10px;min-width:0;align-items:center}
      .position .badge-coin{width:42px;height:42px;font-size:11px}
      .position .pos-name{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .position .pos-sub{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw}
      .position .side-pill{display:none}
      .position .menu-dot{display:none}
      .position .grid4{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:2px 8px!important;margin-top:9px!important;padding-top:7px;border-top:1px solid var(--line2)}
      .position .metric{min-width:0;padding:5px 2px}
      .position .metric .k{font-size:10px;margin-bottom:3px}
      .position .metric .mv{font-size:15px!important;line-height:1.25;overflow-wrap:anywhere}
      .position .curInput{font-size:15px!important}
      .position>.hr{margin:10px 0}
      .position .grid3{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px 8px!important;margin-top:0!important}
      .position .grid3>.metric:first-child{grid-column:1/-1}
      .position .grid3 .mv{font-size:13px!important}
      .position .rr-row{grid-template-columns:1fr auto!important;gap:6px 8px!important;margin:9px 0 12px!important}
      .position .rr-row>.rr-bar{grid-column:1/-1}
      .position .actions{grid-template-columns:1fr 1fr!important;gap:8px!important}
      .position .btn{min-height:44px;padding:10px!important;border-radius:13px!important;font-size:13px}
      .totalbar{grid-template-columns:1fr 1fr!important;gap:0 10px!important;padding:12px!important;margin-top:10px!important}
      .totalbar .donut,.totalbar .chev{display:none!important}
      .totalbar .totalitem{border:0!important;padding:7px 2px!important}
      .totalbar .totalitem:nth-child(2){grid-column:1/-1;border-bottom:1px solid var(--line2)!important}
      .totalbar .k{font-size:10px;margin-bottom:3px}
      .totalbar .mv{font-size:15px!important}
      .entry-card{padding:14px}
      .form-section{margin-top:13px;padding-top:13px}
      .field input,.field select,.field textarea{padding:12px;border-radius:13px}
      .primarywide{min-height:48px;border-radius:14px;padding:13px}
      .quick-link-row{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
      .quick-link{padding:10px 5px;font-size:11px}
      .h-card{padding:13px 14px}
      .h-pnl{font-size:15px}
      .stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px}
      .stats-card{padding:13px}
      .stats-card .big{font-size:20px}
      .bottomnav{padding:7px 8px calc(7px + env(safe-area-inset-bottom))}
      .bottomnav .inner{gap:2px}
      .bottomnav button{min-height:52px;padding:6px 2px;font-size:10px}
      .bottomnav button .ic{font-size:17px;margin-bottom:2px}
    }
    @media(max-width:370px){
      .position .pos-sub{max-width:45vw}
      .position .metric .mv{font-size:14px!important}
      .quick-link-row{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);
}

function formatDateTime(iso){
  if(!iso)return'';
  const date=new Date(iso);
  if(Number.isNaN(date.getTime()))return'';
  return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}

function lotsMarkup(position){
  const lots=lotsOf(position);
  if(lots.length<2)return'';
  const rows=lots.map(lot=>{
    const date=formatDateTime(lot.opened)||'日時不明';
    const price=num(lot.price).toLocaleString('ja-JP',{maximumFractionDigits:2});
    const qty=num(lot.qty).toLocaleString('ja-JP',{maximumFractionDigits:2});
    return `<div class="paper-lot"><span>${date} · ${lot.entry_type==='add'?'追加':'買付'}</span><b>${qty}株 @ ${price}</b></div>`;
  }).join('');
  return `<div class="paper-lots"><div class="paper-lots-title">買付履歴</div>${rows}</div>`;
}

function statusNode(){
  const root=document.getElementById('positions');
  if(!root)return null;
  let node=document.getElementById('paperQuoteStatusV36');
  if(!node){
    node=document.createElement('div');
    node.id='paperQuoteStatusV36';
    node.className='paper-quote-status';
    node.innerHTML='<span>終値を確認中…</span><button type="button" class="paper-quote-refresh">速報更新</button>';
    const anchor=document.getElementById('paperCloseStatus')||root.querySelector('.inline-meta');
    anchor?.insertAdjacentElement('afterend',node);
  }
  return node;
}

function setStatus(text,kind=''){
  const node=statusNode();
  if(!node)return;
  node.dataset.kind=kind;
  const label=node.querySelector('span');
  if(label)label.textContent=text;
}

function decoratePositions(){
  const root=document.getElementById('positions');
  if(!root||typeof db==='undefined')return;
  statusNode();
  root.querySelectorAll('.position').forEach(card=>{
    const input=card.querySelector('.curInput');
    const id=input?.dataset.id||'';
    const position=db.positions.find(item=>item.id===id);
    if(!id||!position)return;
    card.dataset.paperPositionId=id;
    card.classList.toggle('paper-open',expandedId===id);
    const right=card.querySelector('.pos-top>div:last-child');
    if(right&&!right.querySelector('.paper-expand')){
      const button=document.createElement('button');
      button.type='button';
      button.className='paper-expand';
      button.dataset.paperToggleV36=id;
      button.setAttribute('aria-label','建玉詳細を開閉');
      button.textContent='⌄';
      right.appendChild(button);
    }
    const oldLots=card.querySelector('.paper-lots');
    if(oldLots)oldLots.remove();
    const markup=lotsMarkup(position);
    if(markup){
      const actions=card.querySelector('.actions');
      actions?.insertAdjacentHTML('beforebegin',markup);
    }
    const note=card.querySelector('.paper-close-note');
    if(note&&position.current_source){
      note.classList.add('ok');
    }
  });
}

function decorateAll(){
  addStyles();
  decoratePositions();
}

function wrapRender(){
  if(window.__paperRenderWrappedV36||typeof window.renderAll!=='function')return;
  window.__paperRenderWrappedV36=true;
  const original=window.renderAll;
  window.renderAll=function(...args){
    const result=original.apply(this,args);
    requestAnimationFrame(decorateAll);
    return result;
  };
}

function bindCardToggle(){
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-paper-toggle-v36]');
    const header=event.target.closest?.('.position .pos-top');
    const card=event.target.closest?.('.position');
    if(!button&&!header)return;
    if(event.target.closest?.('a,input,select,textarea,.btn,.paper-quote-refresh'))return;
    const id=button?.dataset.paperToggleV36||card?.dataset.paperPositionId||'';
    if(!id)return;
    event.preventDefault();
    expandedId=expandedId===id?'':id;
    if(expandedId)sessionStorage.setItem(EXPANDED_KEY,expandedId);else sessionStorage.removeItem(EXPANDED_KEY);
    decoratePositions();
  });
}

function bindAddMerge(){
  const add=document.getElementById('add');
  if(!add||add.dataset.paperMergeV36==='1')return;
  const original=add.onclick;
  if(typeof original!=='function')return;
  add.dataset.paperMergeV36='1';
  add.onclick=function(event){
    const result=original.call(this,event);
    if(mergeDuplicatePositions()){
      expandedId='';
      rerender();
    }
    return result;
  };
}

function jstParts(timestamp){
  const date=new Date(timestamp+9*60*60*1000);
  return {
    date:date.toISOString().slice(0,10),
    minutes:date.getUTCHours()*60+date.getUTCMinutes()
  };
}

function nowJst(){
  return jstParts(Date.now());
}

function rerender(){
  if(typeof window.renderAll==='function')window.renderAll();
  else if(typeof renderAll==='function')renderAll();
}

function stageRows(stage){
  if(stage?.stocks&&typeof stage.stocks==='object')return Object.values(stage.stocks);
  if(Array.isArray(stage?.rows))return stage.rows;
  return [];
}

function stageRow(stage,position){
  const market=position.market==='us'?'us':'jp';
  const symbol=normalizeSymbol(position.symbol,market);
  return stageRows(stage).find(row=>normalizeSymbol(row?.symbol,market)===symbol)||null;
}

async function fetchJson(url){
  const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refreshPrices(){
  if(quoteBusy||typeof db==='undefined')return;
  const positions=db.positions||[];
  if(!positions.length){setStatus('建玉はありません');return}
  quoteBusy=true;
  setStatus('終値を確認中…');
  try{
    const markets=[...new Set(positions.map(position=>position.market==='us'?'us':'jp'))];
    const stageEntries=await Promise.all(markets.map(async market=>{
      try{return [market,await fetchJson(`${API}/api/stage?market=${market}&_=${Date.now()}`)]}catch{return [market,null]}
    }));
    const stages=Object.fromEntries(stageEntries);
    const quoteMap=new Map();
    const jpPositions=positions.filter(position=>position.market!=='us');
    await Promise.all(jpPositions.map(async position=>{
      const symbol=normalizeSymbol(position.symbol,'jp');
      if(quoteMap.has(symbol))return;
      try{
        const quote=await fetchJson(`${API}/api/lookup?symbol=${encodeURIComponent(symbol)}&_=${Date.now()}`);
        quoteMap.set(symbol,quote);
      }catch{
        quoteMap.set(symbol,null);
      }
    }));

    let confirmed=0,flash=0,pending=0,changed=false;
    const now=nowJst();
    const today=now.date;
    const weekday=new Date(`${today}T00:00:00Z`).getUTCDay();
    const jpAfterClose=weekday>=1&&weekday<=5&&now.minutes>=15*60+30;
    for(const position of positions){
      const market=position.market==='us'?'us':'jp';
      const stage=stages[market];
      const row=stageRow(stage,position);
      const confirmedPrice=num(row?.price);
      const confirmedDate=String(stage?.trade_date||row?.date||'');
      const stageFresh=market!=='jp'||!jpAfterClose||confirmedDate===today;
      if(stage?.kind==='confirmed'&&confirmedPrice>0&&confirmedDate&&stageFresh){
        if(num(position.current)!==confirmedPrice||position.current_date!==confirmedDate||position.current_source!=='VANTAGE確定終値'){
          position.current=confirmedPrice;
          position.current_date=confirmedDate;
          position.current_price_time=row?.price_time||stage?.price_time||'';
          position.current_source='VANTAGE確定終値';
          changed=true;
        }
        confirmed+=1;
        continue;
      }
      if(market!=='jp'){pending+=1;continue}
      const symbol=normalizeSymbol(position.symbol,'jp');
      const quote=quoteMap.get(symbol);
      const price=num(quote?.price);
      const timestamp=num(quote?.regular_market_time)*1000;
      if(!(price>0&&timestamp>0)){pending+=1;continue}
      const parts=jstParts(timestamp);
      const isCloseQuote=parts.date===today&&parts.minutes>=15*60+30;
      if(!isCloseQuote){pending+=1;continue}
      if(num(position.current)!==price||position.current_date!==parts.date||position.current_source!=='大引け速報'){
        position.current=price;
        position.current_date=parts.date;
        position.current_price_time=new Date(timestamp).toISOString();
        position.current_source='大引け速報';
        changed=true;
      }
      flash+=1;
    }
    if(changed){save();rerender()}
    if(confirmed)setStatus(`確定終値 ${confirmed}件${flash?`・大引け速報 ${flash}件`:''}`,'ok');
    else if(flash)setStatus(`大引け速報 ${flash}件を反映`,'ok');
    else if(pending)setStatus('当日の大引けデータを待っています','warn');
    else setStatus('終値は最新です','ok');
  }catch(error){
    setStatus('終値を取得できませんでした。再試行できます','warn');
  }finally{
    quoteBusy=false;
  }
}

function bindPriceRefresh(){
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('.paper-quote-refresh'))return;
    event.preventDefault();
    refreshPrices();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)refreshPrices();
  });
  setInterval(()=>{
    if(!document.hidden)refreshPrices();
  },10*60*1000);
}

function init(){
  try{
    addStyles();
    wrapRender();
    bindCardToggle();
    bindAddMerge();
    bindPriceRefresh();
    const merged=mergeDuplicatePositions();
    if(merged)rerender();else decorateAll();
    setTimeout(refreshPrices,900);
  }catch(error){
    console.error('[PAPER UI v36]',error);
  }
}

if(document.readyState==='complete')init();
else window.addEventListener('load',init,{once:true});
})();
