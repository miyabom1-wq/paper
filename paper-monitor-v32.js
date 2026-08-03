(()=>{
'use strict';

const PATCH='paper-monitor-v32-mobile-20260729';
if(window.__paperMonitorPatch===PATCH)return;
window.__paperMonitorPatch=PATCH;

const VANTAGE_API='https://cockpit-backend.miyab.workers.dev';
const VANTAGE_APP='https://cockpit-backend.miyab.workers.dev/';
const stageCache={jp:null,us:null};
const stageFetchedAt={jp:0,us:0};
let resolveTimer=null;
let closeRefreshBusy=false;
let decorateQueued=false;
let lastCloseMessage='終値を確認中…';

function addStyle(){
  if(document.getElementById('paper-monitor-v31-style'))return;
  const style=document.createElement('style');
  style.id='paper-monitor-v32-style';
  style.textContent=`
    .paper-symbol-note{font-size:10px;color:var(--muted);margin:6px 2px 0;line-height:1.45}
    .paper-symbol-note.ok{color:var(--vantage)}
    .paper-symbol-note.warn{color:#9a6b16}
    .paper-close-note{font-size:10px;color:var(--muted);margin-top:5px;line-height:1.35}
    .paper-close-note.ok{color:var(--vantage)}
    .paper-close-status{display:flex;align-items:center;gap:7px;margin:-3px 2px 12px;font-size:11px;color:var(--muted)}
    .paper-close-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#a9a39a;flex:none}
    .paper-close-status.ok::before{background:var(--vantage)}
    .paper-close-status.warn::before{background:#d69a28}
    .paper-history-tools{display:flex;align-items:center;gap:8px}
    .paper-history-delete,.paper-history-clear{border:1px solid #e3c6c6;background:#fff8f8;color:#a23f3f;border-radius:12px;padding:8px 10px;font-size:11px;font-weight:800;cursor:pointer}
    .paper-history-actions{display:flex;justify-content:flex-end;margin-top:12px}
    .curInput[readonly]{
      border:0!important;
      padding:0!important;
      background:transparent!important;
      box-shadow:none!important;
      color:var(--text);
      font-weight:800;
      pointer-events:none
    }
    .position .pos-title-wrap>div:last-child{min-width:0}
    .position .pos-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:620px){
      .position{padding:16px}
      .position .pos-top{align-items:center}
      .position .pos-title-wrap{gap:12px;min-width:0}
      .position .badge-coin{width:50px;height:50px;font-size:13px}
      .position .pos-name{font-size:17px}
      .position .side-pill{padding:6px 11px;font-size:12px;flex:none}
      .position .grid4{gap:6px!important}
      .position .grid4 .metric{min-width:0;padding:6px 2px}
      .position .grid4 .mv{font-size:16px!important;line-height:1.35;overflow-wrap:anywhere}
      .position .grid4 input.curInput{font-size:16px!important}
      .position .grid3{
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:8px 12px!important
      }
      .position .grid3>.metric{padding:6px 2px}
      .position .grid3>.metric:first-child{grid-column:1/-1}
      .position .grid3 .mv{font-size:15px!important;line-height:1.35}
      .position .rr-row{
        grid-template-columns:minmax(0,1fr) auto!important;
        gap:7px 12px!important;
        margin:12px 0 18px
      }
      .position .rr-row>.k{grid-column:1;grid-row:1}
      .position .rr-row>.mv{grid-column:2;grid-row:1;white-space:nowrap}
      .position .rr-row>.rr-bar{grid-column:1/-1;grid-row:2}
      .totalbar{
        display:grid!important;
        grid-template-columns:52px minmax(0,1fr) minmax(0,1fr)!important;
        grid-template-rows:auto auto!important;
        gap:0 14px!important;
        padding:16px!important;
        align-items:center!important
      }
      .totalbar>.donut{grid-column:1;grid-row:1;width:46px;height:46px}
      .totalbar>.totalitem{
        min-width:0;
        border-right:0!important;
        border-top:0!important;
        padding:4px 0!important
      }
      .totalbar>.totalitem:nth-child(2){grid-column:2/4;grid-row:1}
      .totalbar>.totalitem:nth-child(3){
        grid-column:1/3;
        grid-row:2;
        border-top:1px solid var(--line2)!important;
        padding-top:12px!important;
        margin-top:10px
      }
      .totalbar>.totalitem:nth-child(4){
        grid-column:3;
        grid-row:2;
        border-top:1px solid var(--line2)!important;
        padding-top:12px!important;
        margin-top:10px
      }
      .totalbar .k{margin-bottom:4px}
      .totalbar .mv{font-size:17px!important;line-height:1.3;white-space:nowrap}
      .totalbar>.chev{display:none!important}
    }
    @media(max-width:390px){
      .totalbar{grid-template-columns:46px minmax(0,1.15fr) minmax(0,.85fr)!important;gap:0 10px!important}
      .totalbar .mv{font-size:15px!important}
      .position .grid4 .mv{font-size:15px!important}
    }
  `;
  document.head.appendChild(style);
}

function normalizeSymbol(raw,market){
  let symbol=String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!symbol)return'';
  if(market==='jp'){
    symbol=symbol.replace(/\.T$/,'');
    return symbol+'.T';
  }
  return symbol;
}

function stageRows(stage){
  if(!stage)return[];
  if(stage.stocks&&typeof stage.stocks==='object')return Object.values(stage.stocks);
  if(Array.isArray(stage.rows))return stage.rows;
  return[];
}

async function getStage(market,{force=false}={}){
  const age=Date.now()-stageFetchedAt[market];
  if(!force&&stageCache[market]&&age<10*60*1000)return stageCache[market];
  const response=await fetch(`${VANTAGE_API}/api/stage?market=${market}&_=${Date.now()}`,{
    cache:'no-store',
    headers:{'Accept':'application/json'}
  });
  if(!response.ok)throw new Error(`VANTAGE ${market.toUpperCase()} ${response.status}`);
  const stage=await response.json();
  stageCache[market]=stage;
  stageFetchedAt[market]=Date.now();
  return stage;
}

function findRow(stage,symbol,market){
  const key=normalizeSymbol(symbol,market);
  return stageRows(stage).find(row=>normalizeSymbol(row?.symbol,market)===key)||null;
}

function localName(symbol,market){
  const key=normalizeSymbol(symbol,market);
  const rows=[...(db.positions||[]),...(db.history||[])];
  const found=rows.find(row=>normalizeSymbol(row?.symbol,row?.market||market)===key&&String(row?.name||'').trim());
  return found?.name||'';
}

function symbolNote(){
  const name=$('name');
  if(!name)return null;
  let note=document.getElementById('paperSymbolResolveNote');
  if(!note){
    note=document.createElement('div');
    note.id='paperSymbolResolveNote';
    note.className='paper-symbol-note';
    name.closest('.field')?.appendChild(note);
  }
  return note;
}

function setSymbolNote(text,kind=''){
  const note=symbolNote();
  if(!note)return;
  note.textContent=text;
  note.className='paper-symbol-note '+kind;
}

async function resolveSymbolName({force=false}={}){
  const symbolInput=$('symbol'),nameInput=$('name'),marketInput=$('market');
  if(!symbolInput||!nameInput||!marketInput)return;
  const market=marketInput.value==='us'?'us':'jp';
  const raw=symbolInput.value.trim();
  if(!raw){setSymbolNote('銘柄コードを入力すると名称を自動取得します。');return}
  const normalized=normalizeSymbol(raw,market);
  const previous=nameInput.dataset.paperResolvedSymbol||'';
  if(previous&&previous!==normalized&&nameInput.dataset.paperAutoName==='1'){
    nameInput.value='';
    delete nameInput.dataset.paperAutoName;
  }
  const saved=localName(raw,market);
  if(saved&&!force){
    nameInput.value=saved;
    nameInput.dataset.paperAutoName='1';
    nameInput.dataset.paperResolvedSymbol=normalized;
    setSymbolNote('保存済みの日本語名を反映しました。','ok');
    return;
  }
  setSymbolNote('VANTAGEから銘柄名を確認中…');
  try{
    const stage=await getStage(market,{force});
    const row=findRow(stage,raw,market);
    if(!row?.name){
      setSymbolNote('VANTAGE登録銘柄外です。銘柄名は手入力してください。','warn');
      return;
    }
    nameInput.value=String(row.name).trim();
    nameInput.dataset.paperAutoName='1';
    nameInput.dataset.paperResolvedSymbol=normalized;
    setSymbolNote('VANTAGEの登録名を自動反映しました。','ok');
  }catch(error){
    setSymbolNote('銘柄名を取得できません。手入力は可能です。','warn');
  }
}

function closeDateText(position){
  const date=position.current_date||'';
  if(!date)return'終値未取得';
  return `終値 ${date}${position.current_source?' · '+position.current_source:''}`;
}

function decoratePositions(){
  const root=$('positions');
  if(!root)return;
  root.querySelectorAll('.menu-dot,.chev').forEach(element=>element.remove());
  let status=document.getElementById('paperCloseStatus');
  const inline=root.querySelector('.inline-meta');
  if(inline&&!status){
    status=document.createElement('div');
    status.id='paperCloseStatus';
    status.className='paper-close-status';
    inline.insertAdjacentElement('afterend',status);
  }
  if(status){
    if(status.textContent!==lastCloseMessage)status.textContent=lastCloseMessage;
    status.className='paper-close-status '+(lastCloseMessage.includes('更新')||lastCloseMessage.includes('反映')?'ok':lastCloseMessage.includes('取得でき')?'warn':'');
  }
  const inputs=[...root.querySelectorAll('.curInput')];
  inputs.forEach(input=>{
    const position=(db.positions||[]).find(item=>item.id===input.dataset.id);
    input.readOnly=true;
    input.inputMode='none';
    const metric=input.closest('.metric');
    const label=metric?.querySelector('.k');
    if(label&&label.textContent!=='現在値（終値）')label.textContent='現在値（終値）';
    let note=metric?.querySelector('.paper-close-note');
    if(!note&&metric){
      note=document.createElement('div');
      note.className='paper-close-note';
      metric.appendChild(note);
    }
    if(note&&position){
      const text=closeDateText(position);
      if(note.textContent!==text)note.textContent=text;
      note.className='paper-close-note '+(position.current_date?'ok':'');
    }
  });
}

function decorateHistory(){
  const root=$('history');
  if(!root)return;
  const head=root.querySelector('.section-head');
  if(head&&db.history?.length&&!head.querySelector('.paper-history-clear')){
    const count=head.querySelector('.count');
    const tools=document.createElement('div');
    tools.className='paper-history-tools';
    const clear=document.createElement('button');
    clear.type='button';
    clear.className='paper-history-clear';
    clear.textContent='履歴を全消去';
    clear.dataset.paperClearHistory='1';
    if(count)tools.appendChild(count);
    tools.appendChild(clear);
    head.appendChild(tools);
  }
  const cards=[...root.querySelectorAll('.h-card')];
  cards.forEach((card,index)=>{
    if(card.querySelector('.paper-history-delete'))return;
    const originalIndex=(db.history?.length||0)-1-index;
    const actions=document.createElement('div');
    actions.className='paper-history-actions';
    const button=document.createElement('button');
    button.type='button';
    button.className='paper-history-delete';
    button.textContent='この履歴を削除';
    button.dataset.paperHistoryIndex=String(originalIndex);
    actions.appendChild(button);
    card.appendChild(actions);
  });
}

function decorateLinks(){
  const shortcut=document.querySelector('a.shortcut');
  if(shortcut)shortcut.href=VANTAGE_APP;
  const button=$('openVantage');
  if(button)button.onclick=()=>window.open(VANTAGE_APP,'_blank','noopener');
}

function decorateAll(){
  addStyle();
  symbolNote();
  decoratePositions();
  decorateHistory();
  decorateLinks();
}

function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  queueMicrotask(()=>{
    decorateQueued=false;
    decorateAll();
  });
}

async function refreshClosingPrices({force=false,manual=false}={}){
  if(closeRefreshBusy)return;
  const positions=db.positions||[];
  if(!positions.length){
    lastCloseMessage='建玉はありません。';
    scheduleDecorate();
    return;
  }
  closeRefreshBusy=true;
  lastCloseMessage='確定終値を確認中…';
  scheduleDecorate();
  try{
    const markets=[...new Set(positions.map(position=>position.market==='us'?'us':'jp'))];
    const stages=Object.fromEntries(await Promise.all(markets.map(async market=>[market,await getStage(market,{force})])));
    let updated=0,unavailable=0,pending=0;
    for(const position of positions){
      const market=position.market==='us'?'us':'jp';
      const stage=stages[market];
      if(stage?.kind!=='confirmed'){
        pending+=1;
        continue;
      }
      const row=findRow(stage,position.symbol,market);
      const price=Number(row?.price);
      if(!Number.isFinite(price)||price<=0){
        unavailable+=1;
        continue;
      }
      if(Number(position.current)!==price||position.current_date!==(stage.trade_date||row.date)){
        position.current=price;
        position.current_date=stage.trade_date||row.date||'';
        position.current_price_time=row.price_time||stage.price_time||'';
        position.current_source='VANTAGE確定終値';
        if((!position.name||position.name===position.symbol)&&row.name)position.name=row.name;
        updated+=1;
      }
    }
    if(updated)save();
    if(updated)lastCloseMessage=`確定終値を${updated}件更新しました。`;
    else if(pending)lastCloseMessage='本日の確定終値を待っています。';
    else if(unavailable)lastCloseMessage=`終値を取得できない建玉が${unavailable}件あります。`;
    else lastCloseMessage='確定終値は最新です。';
    renderAll();
    scheduleDecorate();
  }catch(error){
    lastCloseMessage='終値を取得できませんでした。次回起動時に再試行します。';
    scheduleDecorate();
  }finally{
    closeRefreshBusy=false;
  }
}

function bindEvents(){
  const symbol=$('symbol');
  const market=$('market');
  const name=$('name');
  if(symbol){
    symbol.addEventListener('input',()=>{
      clearTimeout(resolveTimer);
      const normalized=normalizeSymbol(symbol.value,market?.value==='us'?'us':'jp');
      if(name?.dataset.paperResolvedSymbol&&name.dataset.paperResolvedSymbol!==normalized&&name.dataset.paperAutoName==='1'){
        name.value='';
        delete name.dataset.paperAutoName;
      }
      resolveTimer=setTimeout(()=>resolveSymbolName(),450);
    });
    symbol.addEventListener('blur',()=>resolveSymbolName());
  }
  name?.addEventListener('input',()=>{delete name.dataset.paperAutoName;});
  market?.addEventListener('change',()=>resolveSymbolName({force:true}));

  document.addEventListener('click',event=>{
    const refresh=event.target.closest('.refresh');
    if(refresh){
      event.preventDefault();
      event.stopImmediatePropagation();
      refreshClosingPrices({force:true,manual:true});
      return;
    }
    const deleteButton=event.target.closest('[data-paper-history-index]');
    if(deleteButton){
      event.preventDefault();
      const index=Number(deleteButton.dataset.paperHistoryIndex);
      const item=db.history?.[index];
      if(!item)return;
      if(!confirm(`${item.name||item.symbol} の履歴を削除しますか？`))return;
      db.history.splice(index,1);
      save();
      renderAll();
      scheduleDecorate();
      return;
    }
    const clearButton=event.target.closest('[data-paper-clear-history]');
    if(clearButton){
      event.preventDefault();
      const count=db.history?.length||0;
      if(!count)return;
      if(!confirm(`決済履歴 ${count}件をすべて削除します。建玉は削除されません。よろしいですか？`))return;
      db.history=[];
      save();
      renderAll();
      scheduleDecorate();
    }
  },true);

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)refreshClosingPrices({force:true});
  });
  setInterval(()=>{
    if(!document.hidden)refreshClosingPrices({force:true});
  },30*60*1000);

  const observer=new MutationObserver(scheduleDecorate);
  observer.observe(document.body,{childList:true,subtree:true});
}

addStyle();
bindEvents();
decorateAll();
setTimeout(()=>resolveSymbolName(),300);
setTimeout(()=>refreshClosingPrices({force:true}),700);
})();

/* PAPER mobile UI / merge / close速報 v35 */
(()=>{
'use strict';
const PATCH='paper-ui-v35-20260803';
if(window.__paperUiPatch===PATCH)return;
window.__paperUiPatch=PATCH;

const API='https://cockpit-backend.miyab.workers.dev';
const EXPAND_KEY='paper-expanded-position-v1';
const BACKUP_KEY='paper-trades-v1-backup-before-merge-20260803';
let expanded=localStorage.getItem(EXPAND_KEY)||'';
let busy=false,queued=false,message='終値を確認中…',toastTimer=null;

const norm=(raw,market)=>{
  let s=String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
  if(market==='jp')s=s.replace(/\.T$/,'')+'.T';
  return s;
};
const keyOf=p=>`${p?.market==='us'?'us':'jp'}|${norm(p?.symbol,p?.market==='us'?'us':'jp')}`;
const dkey=v=>(String(v||'').match(/^\d{4}-\d{2}-\d{2}/)||[])[0]||'';
const money=(v,m='jp')=>m==='us'?'$'+Number(v||0).toLocaleString('ja-JP',{maximumFractionDigits:2}):Number(v||0).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';

function style(){
  if(document.getElementById('paper-ui-v35-style'))return;
  const s=document.createElement('style');
  s.id='paper-ui-v35-style';
  s.textContent=`
  .paper-position-card{padding:0!important;overflow:hidden;margin-top:9px;box-shadow:0 4px 16px rgba(30,40,55,.055)}
  .paper-position-card .pos-top{padding:13px 14px 8px;align-items:center;cursor:pointer;user-select:none}
  .paper-position-card .pos-title-wrap{min-width:0;align-items:center}
  .paper-position-card .badge-coin{width:46px;height:46px;font-size:12px}
  .paper-position-card .pos-name{font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .paper-position-card .pos-sub{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56vw}
  .paper-pos-side{display:flex;align-items:center;gap:7px;flex:none}
  .paper-pnl-pill{padding:6px 9px;border-radius:999px;background:#f3eee5;color:var(--text);font-size:12px;font-weight:900;white-space:nowrap}
  .paper-pnl-pill.good{background:#fff2df;color:var(--good)}.paper-pnl-pill.bad{background:#fff0f0;color:var(--bad)}
  .paper-pos-toggle{width:32px;height:32px;border:0;border-radius:50%;background:var(--card2);display:grid;place-items:center;color:var(--muted);font-size:18px;line-height:1;transition:transform .18s ease}
  .paper-expanded .paper-pos-toggle{transform:rotate(180deg)}
  .paper-pos-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:0 12px 12px;cursor:pointer}
  .paper-pos-quick>div{min-width:0;background:var(--card2);border:1px solid var(--line2);border-radius:13px;padding:8px 9px}
  .paper-pos-quick span{display:block;color:var(--muted);font-size:9px;margin-bottom:3px}.paper-pos-quick b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .paper-pos-hint{text-align:center;color:var(--muted);font-size:9px;margin:-5px 0 8px}.paper-expanded .paper-pos-hint{display:none}
  .paper-collapsed .paper-pos-detail{display:none!important}.paper-expanded .paper-pos-detail{animation:paperOpen .16s ease}
  .paper-expanded>.grid4{margin:0 12px;padding-top:11px;border-top:1px solid var(--line2)}.paper-expanded>.hr{margin:12px}.paper-expanded>.grid3{margin:0 12px}.paper-expanded>.rr-row{margin:12px}.paper-expanded>.actions{margin:0 12px 14px}
  @keyframes paperOpen{from{opacity:.35;transform:translateY(-3px)}to{opacity:1;transform:none}}
  .paper-lots{margin:0 12px 12px;border:1px solid var(--line2);border-radius:14px;overflow:hidden;background:var(--card2)}
  .paper-lots-title{padding:9px 11px;font-size:11px;font-weight:900;color:#625f59;border-bottom:1px solid var(--line2)}
  .paper-lot{display:grid;grid-template-columns:42px 1fr 1fr;gap:8px;padding:8px 11px;font-size:11px;align-items:center}.paper-lot+.paper-lot{border-top:1px solid var(--line2)}.paper-lot span{color:var(--muted)}.paper-lot b{text-align:right}
  .paper-entry-note{font-size:10px;color:var(--muted);text-align:center;margin:8px 0 0;line-height:1.5}
  .paper-toast{position:fixed;left:50%;bottom:calc(82px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;max-width:calc(100vw - 28px);background:#1f2430;color:#fff;border-radius:999px;padding:10px 16px;font-size:12px;font-weight:800;box-shadow:0 12px 30px rgba(0,0,0,.22);opacity:0;pointer-events:none;transition:.18s}.paper-toast.show{opacity:1;transform:translate(-50%,-4px)}
  @media(max-width:620px){
    body{padding:10px 10px 88px!important}.wrap{max-width:none}.topbar{align-items:center;margin-bottom:8px}.brand{gap:10px;align-items:center}.appicon{width:44px!important;height:44px!important;border-radius:13px!important}.title{font-size:21px!important;margin-top:0!important}.sub{font-size:10px!important;margin-top:5px!important}.shortcut{width:42px!important;height:42px!important;border-radius:13px!important}
    #topTabs{display:none!important}.section-head{margin:10px 2px 7px}.section-title{font-size:16px}.card{border-radius:18px}
    #positions>.summary,#history>.summary,#stats>.summary{display:none!important}#history>.inline-meta,#stats>.inline-meta{display:none!important}.inline-meta{margin:8px 2px 7px;font-size:10px}.paper-close-status{margin:0 2px 8px}
    .position .grid4{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px!important}.position .grid4 .metric{min-width:0;padding:5px 2px}.position .grid4 .mv{font-size:15px!important;line-height:1.3}.position .grid3{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px 10px!important}.position .grid3>.metric:first-child{grid-column:1/-1}.position .grid3 .mv{font-size:14px!important}.position .actions{grid-template-columns:1fr 1fr!important;gap:8px!important}.position .btn{padding:12px 8px!important;border-radius:14px!important;font-size:13px}
    .totalbar{display:grid!important;grid-template-columns:42px minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:auto auto!important;gap:0 10px!important;padding:12px!important;margin-top:10px!important}.totalbar>.donut{grid-column:1;grid-row:1;width:38px;height:38px}.totalbar>.totalitem{min-width:0;border-right:0!important;border-top:0!important;padding:2px 0!important}.totalbar>.totalitem:nth-child(2){grid-column:2/4;grid-row:1}.totalbar>.totalitem:nth-child(3){grid-column:1/3;grid-row:2;border-top:1px solid var(--line2)!important;padding-top:9px!important;margin-top:8px}.totalbar>.totalitem:nth-child(4){grid-column:3;grid-row:2;border-top:1px solid var(--line2)!important;padding-top:9px!important;margin-top:8px}.totalbar .k{font-size:9px;margin-bottom:3px}.totalbar .mv{font-size:14px!important}.totalbar>.chev{display:none!important}
    .entry-card{padding:13px!important}.entry-card .section-head{margin-bottom:9px!important}.form-section{margin-top:12px!important;padding-top:12px!important}.form-section-title{margin-bottom:8px!important;font-size:11px!important}.compact-form{gap:9px!important}.field label{font-size:10px!important;margin-bottom:4px!important}.field input,.field select,.field textarea{border-radius:13px!important;padding:12px!important}.sizing-box{padding:11px!important;border-radius:15px!important}.trade-preview{margin-top:12px!important;border-radius:15px!important}.trade-preview .pv{padding:11px 9px!important}.trade-preview b{font-size:14px!important}.primarywide{margin-top:12px!important;padding:14px!important;border-radius:15px!important}.quick-link-row{display:grid!important;grid-template-columns:repeat(3,1fr);gap:6px!important}.quick-link{padding:10px 5px!important;border-radius:12px!important;font-size:11px!important}
    .h-card{padding:13px!important}.h-card+.h-card{margin-top:8px!important}.h-pnl{font-size:15px!important;white-space:nowrap}.stats-grid{gap:8px!important}.stats-card{padding:14px!important}.stats-card .big{font-size:23px!important}
    .bottomnav{padding:6px 10px calc(6px + env(safe-area-inset-bottom))!important}.bottomnav .inner{gap:4px!important}.bottomnav button{padding:8px 4px!important;font-size:10px!important}.bottomnav button .ic{font-size:16px!important;margin-bottom:2px!important}
  }
  @media(max-width:380px){.paper-position-card .pos-top{padding:11px 10px 7px}.paper-position-card .badge-coin{width:40px;height:40px;font-size:11px}.paper-position-card .pos-title-wrap{gap:9px}.paper-position-card .pos-name{font-size:15px}.paper-position-card .pos-sub{max-width:45vw}.paper-pnl-pill{font-size:11px;padding:5px 7px}.paper-pos-quick{padding:0 9px 9px;gap:4px}.paper-pos-quick>div{padding:7px}.paper-pos-quick b{font-size:12px}}
  `;
  document.head.appendChild(s);
}

function toast(text){
  let el=document.getElementById('paperToast');
  if(!el){el=document.createElement('div');el.id='paperToast';el.className='paper-toast';document.body.appendChild(el)}
  el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);
}
function lotsOf(p){
  if(Array.isArray(p.lots)&&p.lots.length)return p.lots;
  p.lots=[{id:crypto.randomUUID(),qty:Number(p.qty||0),price:Number(p.avg||0),opened:p.opened||new Date().toISOString(),entry_type:p.entry_type||'standard',source:p.source||'manual'}];
  return p.lots;
}
function combine(a,b){
  const aq=Number(a.qty||0),bq=Number(b.qty||0),q=aq+bq;if(!(q>0))return;
  a.lots=[...lotsOf(a),...lotsOf(b)];a.avg=(Number(a.avg||0)*aq+Number(b.avg||0)*bq)/q;a.qty=q;
  ['name','frame','entry_type','lane','regime','thesis','invalid','source','source_context'].forEach(k=>{if(b[k])a[k]=b[k]});
  if(Number(b.stop)>0)a.stop=Number(b.stop);if(Number(b.target)>0)a.target=Number(b.target);a.last_added_at=b.opened||new Date().toISOString();
  const ad=dkey(a.current_date),bd=dkey(b.current_date);if(bd&&(!ad||bd>=ad)){['current','current_date','current_price_time','current_source'].forEach(k=>a[k]=b[k])}
}
function mergeDuplicates(){
  const map=new Map(),out=[];let changed=false;
  for(const p of db.positions||[]){const k=keyOf(p),x=map.get(k);if(x){if(!changed)localStorage.setItem(BACKUP_KEY,JSON.stringify(db));combine(x,p);changed=true}else{map.set(k,p);out.push(p)}}
  if(changed){db.positions=out;save();toast('同じ銘柄の建玉を1枚に統合しました')}
}
function pnlOf(p){const cur=Number(p.current||p.avg||0),avg=Number(p.avg||0),qty=Number(p.qty||0),pnl=(cur-avg)*qty;return{cur,pnl,rate:avg?(cur/avg-1)*100:0}}
function applyExpanded(){
  const cards=[...document.querySelectorAll('.paper-position-card')];if(expanded&&!cards.some(c=>c.dataset.pid===expanded)){expanded='';localStorage.removeItem(EXPAND_KEY)}
  cards.forEach(c=>{const open=c.dataset.pid===expanded;c.classList.toggle('paper-expanded',open);c.classList.toggle('paper-collapsed',!open);c.querySelectorAll('[data-paper-toggle]').forEach(x=>x.setAttribute('aria-expanded',String(open)))})
}
function lotHtml(p){
  const lots=Array.isArray(p.lots)?p.lots:[];if(lots.length<2)return'';
  return '<div class="paper-lots-title">エントリー履歴</div>'+lots.slice().reverse().map((x,i)=>`<div class="paper-lot"><span>${i===lots.length-1?'初回':'追加'}</span><b>${Number(x.qty||0).toLocaleString('ja-JP')}株</b><b>${money(x.price,p.market)}</b></div>`).join('');
}
function decoratePositions(){
  const root=$('positions');if(!root)return;
  let st=document.getElementById('paperCloseStatus');const meta=root.querySelector('.inline-meta');
  if(meta&&!st){st=document.createElement('div');st.id='paperCloseStatus';st.className='paper-close-status';meta.insertAdjacentElement('afterend',st)}
  if(st){st.textContent=message;st.className='paper-close-status '+(/取得でき|待っています/.test(message)?'warn':/更新|速報|最新/.test(message)?'ok':'')}
  root.querySelectorAll('.card.position').forEach((card,i)=>{
    const input=card.querySelector('.curInput'),p=(db.positions||[]).find(x=>x.id===input?.dataset.id)||(db.positions||[])[i];if(!p)return;
    card.classList.add('paper-position-card');card.dataset.pid=p.id;
    const top=card.querySelector('.pos-top');if(top){top.dataset.paperToggle=p.id;top.tabIndex=0;top.setAttribute('role','button')}
    const {cur,pnl,rate}=pnlOf(p);const right=top?.children[1];
    if(right){const sig=`${pnl}|${rate}`;if(right.dataset.sig!==sig){right.dataset.sig=sig;right.className='paper-pos-side';right.innerHTML=`<div class="paper-pnl-pill ${pnl>=0?'good':'bad'}">${pnl>=0?'+':''}${rate.toFixed(2)}%</div><button type="button" class="paper-pos-toggle" data-paper-toggle="${p.id}" aria-label="建玉詳細を開閉">⌄</button>`}}
    let quick=card.querySelector('.paper-pos-quick');if(!quick){quick=document.createElement('div');quick.className='paper-pos-quick';top?.insertAdjacentElement('afterend',quick)}
    quick.dataset.paperToggle=p.id;const qsig=`${p.qty}|${p.avg}|${cur}|${pnl}`;
    if(quick.dataset.sig!==qsig){quick.dataset.sig=qsig;quick.innerHTML=`<div><span>数量</span><b>${Number(p.qty||0).toLocaleString('ja-JP')}株</b></div><div><span>平均 → 現在</span><b>${money(p.avg,p.market)} → ${money(cur,p.market)}</b></div><div><span>評価損益</span><b class="${pnl>=0?'good':'bad'}">${pnl>=0?'+':''}${money(pnl,p.market)}</b></div>`}
    let hint=card.querySelector('.paper-pos-hint');if(!hint){hint=document.createElement('div');hint.className='paper-pos-hint';hint.textContent='タップして詳細・EXITを表示';quick.insertAdjacentElement('afterend',hint)}
    card.querySelectorAll(':scope>.grid4,:scope>.hr,:scope>.grid3,:scope>.rr-row,:scope>.actions').forEach(x=>x.classList.add('paper-pos-detail'));
    if(input){input.readOnly=true;input.inputMode='none'}
    const html=lotHtml(p);let box=card.querySelector('.paper-lots');if(html&&!box){box=document.createElement('div');box.className='paper-lots paper-pos-detail';const actions=card.querySelector(':scope>.actions');actions?card.insertBefore(box,actions):card.appendChild(box)}if(box&&box.dataset.sig!==html){box.dataset.sig=html;box.innerHTML=html}if(!html&&box)box.remove();
  });applyExpanded();
}
function decorateEntry(){
  const add=$('add');if(!add)return;let note=document.getElementById('paperEntryMergeNote');if(!note){note=document.createElement('div');note.id='paperEntryMergeNote';note.className='paper-entry-note';note.textContent='同じ市場・同じ銘柄は別カードにせず、平均取得価格へ統合します。';add.insertAdjacentElement('afterend',note)}updateAddLabel();
}
function decorate(){style();decoratePositions();decorateEntry()}
function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate()})}
function updateAddLabel(){const add=$('add'),sym=$('symbol'),m=$('market');if(!add||!sym||!m)return;const k=`${m.value==='us'?'us':'jp'}|${norm(sym.value,m.value==='us'?'us':'jp')}`;add.textContent=sym.value.trim()&&(db.positions||[]).some(x=>keyOf(x)===k)?'既存建玉へ買い増し':'この内容でデモエントリー'}
function entry(){
  syncPresetsToMemo();return{id:crypto.randomUUID(),market:$('market').value,symbol:$('symbol').value.trim().toUpperCase(),name:$('name').value.trim(),frame:$('frame').value,entry_type:$('entryType').value,avg:n($('price').value),qty:n($('qty').value),stop:n($('stop').value),target:n($('target').value),lane:$('lane').value,regime:$('regime').value,thesis:$('thesis').value.trim(),invalid:$('invalid').value.trim(),source:entryContext.source||'manual',source_context:{...entryContext},opened:new Date().toISOString()};
}
function addTradeMerged(){
  const p=entry();if(!p.symbol||p.avg<=0||p.qty<=0){alert('銘柄・約定価格・数量を確認してください。');return}if(p.stop<=0||p.stop>=p.avg){alert('損切価格は約定価格より下に設定してください。');return}if(p.target<=p.avg){alert('目標価格は約定価格より上に設定してください。');return}
  p.lots=[{id:crypto.randomUUID(),qty:p.qty,price:p.avg,opened:p.opened,entry_type:p.entry_type,source:p.source}];const x=(db.positions||[]).find(v=>keyOf(v)===keyOf(p));
  if(x){combine(x,p);expanded=x.id;localStorage.setItem(EXPAND_KEY,expanded);toast(`${p.name||p.symbol}を既存建玉へ統合しました`)}else{db.positions.push(p);toast(`${p.name||p.symbol}を登録しました`)}
  save();rememberEntrySymbol(p);clearEntryForm(false);setActiveTab('positions');renderAll();queue();
}
function rows(stage){if(stage?.stocks&&typeof stage.stocks==='object')return Object.values(stage.stocks);return Array.isArray(stage?.rows)?stage.rows:[]}
function rowFor(stage,p){const m=p.market==='us'?'us':'jp',k=norm(p.symbol,m);return rows(stage).find(r=>norm(r?.symbol,m)===k)}
function tokyo(){const a=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value]));return{date:`${a.year}-${a.month}-${a.day}`,minute:Number(a.hour)*60+Number(a.minute)}}
function closeOf(stage,row,market){
  const kind=String(stage?.kind||'').toLowerCase();if(!['confirmed','provisional'].includes(kind)||!row||stage?.complete===false)return null;
  const date=dkey(stage.trade_date||row.date),rd=dkey(row.date||stage.trade_date);if(!date||date!==rd||row?.data_quality?.data_valid===false)return null;
  const now=tokyo();if(market==='jp'&&kind==='provisional'&&date===now.date&&now.minute<930)return null;
  if(kind==='confirmed'){if(row?.data_quality?.close_confirmed===false)return null;const ratio=Number(stage?.close_verification?.ratio);if(Number.isFinite(ratio)&&ratio<80)return null}else{const ratio=Number(stage?.session_verification?.ratio??stage?.global_freshness?.session_ratio);if(Number.isFinite(ratio)&&ratio<85)return null}
  const price=[row.price,row.close,row.current_price].map(Number).find(x=>Number.isFinite(x)&&x>0);if(!price)return null;
  return{price,date,kind,time:row.price_time||stage.price_time||stage.updated_at||'',source:kind==='confirmed'?'VANTAGE確定終値':'VANTAGE大引け速報'};
}
async function refresh(){
  if(busy)return;const ps=db.positions||[];if(!ps.length){message='建玉はありません。';queue();return}busy=true;message='VANTAGEの終値を確認中…';queue();
  try{const ms=[...new Set(ps.map(p=>p.market==='us'?'us':'jp'))],st={};await Promise.all(ms.map(async m=>{const r=await fetch(`${API}/api/stage?market=${m}&_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});if(!r.ok)throw Error(String(r.status));st[m]=await r.json()}));let up=0,pro=0,miss=0;
    for(const p of ps){const m=p.market==='us'?'us':'jp',row=rowFor(st[m],p),c=closeOf(st[m],row,m);if(!c){miss++;continue}const old=dkey(p.current_date);if(old&&c.date<old)continue;if(Number(p.current)!==c.price||old!==c.date||p.current_source!==c.source){p.current=c.price;p.current_date=c.date;p.current_price_time=c.time;p.current_source=c.source;if((!p.name||p.name===p.symbol)&&row?.name)p.name=row.name;up++;if(c.kind==='provisional')pro++}}
    if(up)save();message=up&&pro?`大引け速報を${pro}件反映しました。確定後に自動更新します。`:up?`確定終値を${up}件更新しました。`:miss?`終値を取得できない建玉が${miss}件あります。`:'終値は最新です。';renderAll();queue();
  }catch{message='終値を取得できませんでした。次回起動時に再試行します。';queue()}finally{busy=false}
}
function bind(){
  const add=$('add'),sym=$('symbol'),market=$('market');if(add)add.onclick=addTradeMerged;sym?.addEventListener('input',updateAddLabel);market?.addEventListener('change',updateAddLabel);
  window.addEventListener('click',e=>{const t=e.target.closest?.('[data-paper-toggle]');if(t){e.preventDefault();e.stopImmediatePropagation();const id=t.dataset.paperToggle;expanded=expanded===id?'':id;expanded?localStorage.setItem(EXPAND_KEY,expanded):localStorage.removeItem(EXPAND_KEY);applyExpanded();return}const r=e.target.closest?.('.refresh');if(r){e.preventDefault();e.stopImmediatePropagation();refresh()}},true);
  document.addEventListener('keydown',e=>{const t=e.target.closest?.('[data-paper-toggle]');if(t&&(e.key==='Enter'||e.key===' ')){e.preventDefault();t.click()}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(()=>{if(!document.hidden)refresh()},5*60*1000);
  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
}
style();mergeDuplicates();bind();decorate();setTimeout(refresh,1100);
})();
