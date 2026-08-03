(()=>{
'use strict';

const PATCH='paper-monitor-v34-latest-close-20260803';
if(window.__paperMonitorPatch===PATCH)return;
window.__paperMonitorPatch=PATCH;

const VANTAGE_API='https://cockpit-backend.miyab.workers.dev';
const VANTAGE_APP='https://cockpit-backend.miyab.workers.dev/';
const stageCache={jp:null,us:null};
const stageFetchedAt={jp:0,us:0};
let resolveTimer=null;
let closeRefreshBusy=false;
let decorateQueued=false;
let lastCloseMessage='VANTAGEの最新終値を確認中…';

function finite(value){return Number.isFinite(Number(value))}
function dateKey(value){return (String(value||'').match(/^\d{4}-\d{2}-\d{2}/)||[])[0]||''}
function latestDate(values){return values.map(dateKey).filter(Boolean).sort().at(-1)||''}

function addStyle(){
  if(document.getElementById('paper-monitor-v32-style'))return;
  const marker=document.createElement('style');
  marker.id='paper-monitor-v31-style';
  document.head.appendChild(marker);
  const style=document.createElement('style');
  style.id='paper-monitor-v32-style';
  style.textContent=`
    .paper-symbol-note{font-size:10px;color:var(--muted);margin:6px 2px 0;line-height:1.45}
    .paper-symbol-note.ok{color:var(--vantage)}
    .paper-symbol-note.warn{color:#9a6b16}
    .paper-close-note{font-size:10px;color:var(--muted);margin-top:5px;line-height:1.35}
    .paper-close-note.ok{color:var(--vantage)}
    .paper-close-status{display:flex;align-items:center;gap:7px;margin:-3px 2px 12px;font-size:11px;color:var(--muted);line-height:1.45}
    .paper-close-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#a9a39a;flex:none}
    .paper-close-status.ok{color:var(--vantage)}
    .paper-close-status.ok::before{background:var(--vantage)}
    .paper-close-status.warn{color:#9a6b16}
    .paper-close-status.warn::before{background:#d69a28}
    .paper-history-tools{display:flex;align-items:center;gap:8px}
    .paper-history-delete,.paper-history-clear{border:1px solid #e3c6c6;background:#fff8f8;color:#a23f3f;border-radius:12px;padding:8px 10px;font-size:11px;font-weight:800;cursor:pointer}
    .paper-history-actions{display:flex;justify-content:flex-end;margin-top:12px}
    .curInput[readonly]{border:0!important;padding:0!important;background:transparent!important;box-shadow:none!important;color:var(--text);font-weight:800;pointer-events:none}
    .position .pos-title-wrap>div:last-child{min-width:0}
    .position .pos-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:620px){
      .position{padding:16px}
      .position .pos-top{align-items:center}
      .position .pos-title-wrap{gap:12px;min-width:0}
      .position .badge-coin{width:50px;height:50px;font-size:13px}
      .position .pos-name{font-size:17px}
      .position .side-pill{padding:6px 11px;font-size:12px;flex:none}
      .position .grid4{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}
      .position .grid4 .metric{min-width:0;padding:6px 2px}
      .position .grid4 .mv{font-size:16px!important;line-height:1.35;overflow-wrap:anywhere}
      .position .grid4 input.curInput{font-size:16px!important}
      .position .grid3{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px 12px!important}
      .position .grid3>.metric:first-child{grid-column:1/-1}
      .position .rr-row{grid-template-columns:minmax(0,1fr) auto!important;gap:7px 12px!important;margin:12px 0 18px}
      .position .rr-row>.k{grid-column:1;grid-row:1}
      .position .rr-row>.mv{grid-column:2;grid-row:1;white-space:nowrap}
      .position .rr-row>.rr-bar{grid-column:1/-1;grid-row:2}
      .totalbar{display:grid!important;grid-template-columns:52px minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:auto auto!important;gap:0 14px!important;padding:16px!important;align-items:center!important}
      .totalbar>.donut{grid-column:1;grid-row:1;width:46px;height:46px}
      .totalbar>.totalitem{min-width:0;border-right:0!important;border-top:0!important;padding:4px 0!important}
      .totalbar>.totalitem:nth-child(2){grid-column:2/4;grid-row:1}
      .totalbar>.totalitem:nth-child(3){grid-column:1/3;grid-row:2;border-top:1px solid var(--line2)!important;padding-top:12px!important;margin-top:10px}
      .totalbar>.totalitem:nth-child(4){grid-column:3;grid-row:2;border-top:1px solid var(--line2)!important;padding-top:12px!important;margin-top:10px}
      .totalbar>.chev{display:none!important}
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
  if(!force&&stageCache[market]&&age<2*60*1000)return stageCache[market];
  const response=await fetch(`${VANTAGE_API}/api/stage?market=${market}&_=${Date.now()}`,{
    cache:'no-store',
    headers:{Accept:'application/json','Cache-Control':'no-cache'}
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

function usableClose(stage,row){
  if(!stage?.complete||!row)return null;
  const kind=String(stage.kind||'').toLowerCase();
  if(!['confirmed','provisional'].includes(kind))return null;
  const tradeDate=dateKey(stage.trade_date||row.date);
  const rowDate=dateKey(row.date||stage.trade_date);
  if(!tradeDate||rowDate!==tradeDate)return null;
  if(row?.data_quality?.data_valid===false)return null;

  if(kind==='confirmed'){
    if(row?.data_quality?.close_confirmed===false)return null;
    const ratio=Number(stage?.close_verification?.ratio);
    if(Number.isFinite(ratio)&&ratio<80)return null;
  }else{
    const ratio=Number(stage?.session_verification?.ratio??stage?.global_freshness?.session_ratio);
    if(Number.isFinite(ratio)&&ratio<90)return null;
  }

  const price=[row.price,row.close,row.current_price].map(Number).find(value=>Number.isFinite(value)&&value>0);
  if(!price)return null;
  return{
    price,
    date:tradeDate,
    priceTime:row.price_time||stage.price_time||stage.updated_at||'',
    source:kind==='confirmed'?'VANTAGE確定終値':'VANTAGE最新終値（大引け速報）',
    kind
  };
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
    setSymbolNote('保存済みの銘柄名を反映しました。','ok');
    return;
  }
  setSymbolNote('VANTAGEから銘柄名を確認中…');
  try{
    const stage=await getStage(market,{force});
    const row=findRow(stage,raw,market);
    if(!row?.name){setSymbolNote('VANTAGE登録銘柄外です。銘柄名は手入力してください。','warn');return}
    nameInput.value=String(row.name).trim();
    nameInput.dataset.paperAutoName='1';
    nameInput.dataset.paperResolvedSymbol=normalized;
    setSymbolNote('VANTAGEの登録名を自動反映しました。','ok');
  }catch{
    setSymbolNote('銘柄名を取得できません。手入力は可能です。','warn');
  }
}

function closeDateText(position){
  const date=dateKey(position.current_date);
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
    status.textContent=lastCloseMessage;
    const warn=/取得でき|対象外|待っています/.test(lastCloseMessage);
    status.className='paper-close-status '+(warn?'warn':/最新|更新|反映/.test(lastCloseMessage)?'ok':'');
  }
  root.querySelectorAll('.curInput').forEach(input=>{
    const position=(db.positions||[]).find(item=>item.id===input.dataset.id);
    input.readOnly=true;
    input.inputMode='none';
    const metric=input.closest('.metric');
    const label=metric?.querySelector('.k');
    if(label)label.textContent='現在値（最新終値）';
    let note=metric?.querySelector('.paper-close-note');
    if(!note&&metric){note=document.createElement('div');note.className='paper-close-note';metric.appendChild(note)}
    if(note&&position){
      note.textContent=closeDateText(position);
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
    clear.type='button';clear.className='paper-history-clear';clear.textContent='履歴を全消去';clear.dataset.paperClearHistory='1';
    if(count)tools.appendChild(count);tools.appendChild(clear);head.appendChild(tools);
  }
  [...root.querySelectorAll('.h-card')].forEach((card,index)=>{
    if(card.querySelector('.paper-history-delete'))return;
    const originalIndex=(db.history?.length||0)-1-index;
    const actions=document.createElement('div');actions.className='paper-history-actions';
    const button=document.createElement('button');button.type='button';button.className='paper-history-delete';button.textContent='この履歴を削除';button.dataset.paperHistoryIndex=String(originalIndex);
    actions.appendChild(button);card.appendChild(actions);
  });
}

function decorateLinks(){
  const shortcut=document.querySelector('a.shortcut');
  if(shortcut)shortcut.href=VANTAGE_APP;
  const button=$('openVantage');
  if(button)button.onclick=()=>window.open(VANTAGE_APP,'_blank','noopener');
}

function decorateAll(){addStyle();symbolNote();decoratePositions();decorateHistory();decorateLinks()}
function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  queueMicrotask(()=>{decorateQueued=false;decorateAll()});
}

async function refreshClosingPrices({force=false}={}){
  if(closeRefreshBusy)return;
  const positions=db.positions||[];
  if(!positions.length){lastCloseMessage='建玉はありません。';scheduleDecorate();return}
  closeRefreshBusy=true;
  lastCloseMessage='VANTAGEの最新終値を確認中…';
  scheduleDecorate();
  try{
    const markets=[...new Set(positions.map(position=>position.market==='us'?'us':'jp'))];
    const stages=Object.fromEntries(await Promise.all(markets.map(async market=>[market,await getStage(market,{force})])));
    let updated=0,unchanged=0,unavailable=0,pending=0,preventedRegression=0;
    const usedDates=[];
    for(const position of positions){
      const market=position.market==='us'?'us':'jp';
      const stage=stages[market];
      const row=findRow(stage,position.symbol,market);
      const quote=usableClose(stage,row);
      if(!quote){
        if(stage?.kind==='intraday')pending+=1;else unavailable+=1;
        continue;
      }
      const previousDate=dateKey(position.current_date);
      if(previousDate&&quote.date<previousDate){preventedRegression+=1;continue}
      usedDates.push(quote.date);
      const changed=Number(position.current)!==quote.price||previousDate!==quote.date||position.current_source!==quote.source;
      if(changed){
        position.current=quote.price;
        position.current_date=quote.date;
        position.current_price_time=quote.priceTime;
        position.current_source=quote.source;
        if((!position.name||position.name===position.symbol)&&row?.name)position.name=row.name;
        updated+=1;
      }else unchanged+=1;
    }
    if(updated)save();
    const date=latestDate(usedDates.length?usedDates:positions.map(position=>position.current_date));
    if(updated)lastCloseMessage=`最新終値を${updated}件更新しました${date?'（'+date+'）':''}。`;
    else if(unchanged&&date)lastCloseMessage=`建玉の最新終値は${date}です。`;
    else if(pending)lastCloseMessage='取引時間中のため、直近の確定済み終値を表示しています。';
    else if(preventedRegression)lastCloseMessage='古いVANTAGEスナップショットは反映せず、より新しい終値を維持しました。';
    else if(unavailable)lastCloseMessage=`最新終値を取得できない建玉が${unavailable}件あります。`;
    else lastCloseMessage='VANTAGEの最新終値を待っています。';
    renderAll();
    scheduleDecorate();
  }catch(error){
    console.error('[PAPER latest close]',error);
    lastCloseMessage='VANTAGEから最新終値を取得できませんでした。次回起動時に再試行します。';
    scheduleDecorate();
  }finally{
    closeRefreshBusy=false;
  }
}

function bindEvents(){
  const symbol=$('symbol'),market=$('market'),name=$('name');
  if(symbol){
    symbol.addEventListener('input',()=>{
      clearTimeout(resolveTimer);
      const normalized=normalizeSymbol(symbol.value,market?.value==='us'?'us':'jp');
      if(name?.dataset.paperResolvedSymbol&&name.dataset.paperResolvedSymbol!==normalized&&name.dataset.paperAutoName==='1'){
        name.value='';delete name.dataset.paperAutoName;
      }
      resolveTimer=setTimeout(()=>resolveSymbolName(),450);
    });
    symbol.addEventListener('blur',()=>resolveSymbolName());
  }
  name?.addEventListener('input',()=>{delete name.dataset.paperAutoName});
  market?.addEventListener('change',()=>resolveSymbolName({force:true}));

  document.addEventListener('click',event=>{
    if(event.target.closest('.refresh')){
      event.preventDefault();
      event.stopImmediatePropagation();
      refreshClosingPrices({force:true});
      return;
    }
    const deleteButton=event.target.closest('[data-paper-history-index]');
    if(deleteButton){
      event.preventDefault();
      const index=Number(deleteButton.dataset.paperHistoryIndex),item=db.history?.[index];
      if(!item||!confirm(`${item.name||item.symbol} の履歴を削除しますか？`))return;
      db.history.splice(index,1);save();renderAll();scheduleDecorate();return;
    }
    const clearButton=event.target.closest('[data-paper-clear-history]');
    if(clearButton){
      event.preventDefault();
      const count=db.history?.length||0;
      if(!count||!confirm(`決済履歴 ${count}件をすべて削除します。建玉は削除されません。よろしいですか？`))return;
      db.history=[];save();renderAll();scheduleDecorate();
    }
  },true);

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshClosingPrices({force:true})});
  setInterval(()=>{if(!document.hidden)refreshClosingPrices({force:true})},5*60*1000);
  const observer=new MutationObserver(scheduleDecorate);
  observer.observe(document.body,{childList:true,subtree:true});
}

addStyle();
bindEvents();
decorateAll();
setTimeout(()=>resolveSymbolName(),300);
setTimeout(()=>refreshClosingPrices({force:true}),700);
})();
