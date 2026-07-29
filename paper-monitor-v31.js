(()=>{
'use strict';

const PATCH='paper-monitor-v31-20260729';
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
  style.id='paper-monitor-v31-style';
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
    .curInput[readonly]{background:#f7f3eb!important;color:var(--text);font-weight:800}
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
