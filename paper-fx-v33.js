(()=>{
'use strict';

const PATCH='paper-fx-v33-current-usdjpy-20260730';
if(window.__paperFxPatch===PATCH)return;
window.__paperFxPatch=PATCH;

const VANTAGE_API='https://cockpit-backend.miyab.workers.dev';
let usdJpy=NaN;
let fxPriceTime='';
let fxBusy=false;
let decorateQueued=false;
let lastFxMessage='USD/JPYを取得中…';

const nf0=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:0});
const nf2=new Intl.NumberFormat('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2});

function finite(value){return Number.isFinite(Number(value))}
function num(value){return Number(value||0)}
function marketOf(item){
  if(item?.market==='us')return'us';
  if(item?.market==='jp')return'jp';
  const symbol=String(item?.symbol||'').trim().toUpperCase();
  if(/\.T$/.test(symbol)||/^\d{4}[A-Z]?$/.test(symbol))return'jp';
  return'us';
}
function fxReady(){return finite(usdJpy)&&usdJpy>0}
function toJpy(value,market){
  const amount=Number(value);
  if(!Number.isFinite(amount))return NaN;
  if(market==='jp')return amount;
  return fxReady()?amount*usdJpy:NaN;
}
function quote(value,market){
  const amount=Number(value);
  if(!Number.isFinite(amount))return'—';
  return market==='us'?'$'+nf2.format(amount):nf0.format(amount)+'円';
}
function signedQuote(value,market){
  const amount=Number(value);
  if(!Number.isFinite(amount))return'—';
  const sign=amount>0?'+':'';
  return sign+quote(amount,market);
}
function yenValue(value){
  const amount=Number(value);
  if(!Number.isFinite(amount))return'—';
  const sign=amount>0?'+':'';
  return sign+nf0.format(amount)+'円';
}
function setText(element,text){
  if(element&&element.textContent!==text)element.textContent=text;
}
function setHtml(element,html){
  if(element&&element.innerHTML!==html)element.innerHTML=html;
}
function setTone(element,value){
  if(!element)return;
  element.classList.toggle('good',Number(value)>=0);
  element.classList.toggle('bad',Number(value)<0);
}
function historyJpy(item){
  return toJpy(num(item?.pnl),marketOf(item));
}
function openStatsJpy(){
  let totalQty=0,totalPnl=0,totalCost=0,complete=true;
  for(const position of db.positions||[]){
    const market=marketOf(position);
    const factor=market==='us'?(fxReady()?usdJpy:NaN):1;
    if(!Number.isFinite(factor)){complete=false;continue}
    const qty=num(position.qty),avg=num(position.avg),cur=num(position.current||position.avg);
    totalQty+=qty;
    totalPnl+=(cur-avg)*qty*factor;
    totalCost+=avg*qty*factor;
  }
  return{
    totalQty,
    totalPnl:complete?totalPnl:NaN,
    rate:complete&&totalCost?totalPnl/totalCost*100:NaN,
    count:(db.positions||[]).length,
    complete
  };
}
function historyStatsJpy(){
  const history=db.history||[];
  const converted=history.map(item=>({item,value:historyJpy(item)}));
  const complete=converted.every(row=>Number.isFinite(row.value));
  const total=complete?converted.reduce((sum,row)=>sum+row.value,0):NaN;
  const wins=converted.filter(row=>num(row.item.pnl)>0);
  const losses=converted.filter(row=>num(row.item.pnl)<0);
  const grossProfit=complete?wins.reduce((sum,row)=>sum+Math.max(0,row.value),0):NaN;
  const grossLoss=complete?Math.abs(losses.reduce((sum,row)=>sum+Math.min(0,row.value),0)):NaN;
  const winRate=history.length?wins.length/history.length*100:0;
  const pf=complete?(grossLoss?grossProfit/grossLoss:(grossProfit?99:0)):NaN;
  return{total,winRate,pf,count:history.length,complete};
}

function addStyle(){
  const monitorStyles=[...document.querySelectorAll('style#paper-monitor-v32-style')];
  monitorStyles.slice(1).forEach(style=>style.remove());
  if(!document.getElementById('paper-monitor-v31-style')){
    const marker=document.createElement('style');
    marker.id='paper-monitor-v31-style';
    document.head.appendChild(marker);
  }
  if(document.getElementById('paper-fx-v33-style'))return;
  const style=document.createElement('style');
  style.id='paper-fx-v33-style';
  style.textContent=`
    .paper-fx-status{
      display:flex;align-items:center;gap:7px;margin:-5px 2px 13px;
      font-size:11px;color:var(--muted);line-height:1.45
    }
    .paper-fx-status::before{
      content:"";width:7px;height:7px;border-radius:50%;background:#aaa49b;flex:none
    }
    .paper-fx-status.ok{color:var(--vantage)}
    .paper-fx-status.ok::before{background:var(--vantage)}
    .paper-fx-status.warn{color:#9a6b16}
    .paper-fx-status.warn::before{background:#d69a28}
    .paper-fx-sub{
      display:block;font-size:10px;font-weight:600;color:var(--muted);
      margin-top:3px;line-height:1.35
    }
    .paper-usd-value{font-variant-numeric:tabular-nums}
    .position .grid4 .mv,.position .grid3 .mv,.h-card .mv{overflow-wrap:anywhere}
    @media(max-width:620px){
      .position .grid4{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .position .grid4 .metric{min-width:0}
      .position .grid4 .metric .mv{white-space:normal!important}
      .paper-fx-sub{font-size:9px}
    }
  `;
  document.head.appendChild(style);
}

function extractUsdJpy(stage){
  const macro=stage?.macro||stage?.macros||{};
  const exact=['ドル円','USD/JPY','USDJPY','USDJPY=X'];
  for(const key of exact){
    const row=macro?.[key];
    const rate=Number(row?.price??row?.value??row?.close);
    if(Number.isFinite(rate)&&rate>0)return{rate,time:row?.price_time||row?.updated_at||stage?.updated_at||''};
  }
  for(const [key,row] of Object.entries(macro||{})){
    const normalized=String(key).toUpperCase().replace(/[\s/_-]/g,'');
    if(!normalized.includes('ドル円')&&!normalized.includes('USDJPY'))continue;
    const rate=Number(row?.price??row?.value??row?.close);
    if(Number.isFinite(rate)&&rate>0)return{rate,time:row?.price_time||row?.updated_at||stage?.updated_at||''};
  }
  const fallback=Number(stage?.usd_jpy??stage?.fx?.usd_jpy??stage?.fx?.USDJPY);
  if(Number.isFinite(fallback)&&fallback>0)return{rate:fallback,time:stage?.updated_at||''};
  return null;
}

async function refreshFx({force=false}={}){
  if(fxBusy)return;
  fxBusy=true;
  lastFxMessage='USD/JPYを取得中…';
  scheduleDecorate();
  try{
    const response=await fetch(`${VANTAGE_API}/api/stage?market=jp&_=${Date.now()}`,{
      cache:'no-store',
      headers:{Accept:'application/json'}
    });
    if(!response.ok)throw new Error(`VANTAGE ${response.status}`);
    const stage=await response.json();
    const found=extractUsdJpy(stage);
    if(!found)throw new Error('USDJPY not found');
    usdJpy=found.rate;
    fxPriceTime=found.time||'';
    lastFxMessage=`USD/JPY ${nf2.format(usdJpy)} · 現在レートで円換算（為替履歴は保存しません）`;
    renderAll();
    scheduleDecorate();
  }catch(error){
    lastFxMessage=fxReady()
      ?`USD/JPY ${nf2.format(usdJpy)} · 再取得に失敗したため画面内の直近値を使用`
      :'USD/JPYを取得できないため、米国株の円換算損益は表示保留です。';
    scheduleDecorate();
  }finally{
    fxBusy=false;
  }
}

function decorateFxStatus(){
  const positions=$('positions');
  if(!positions)return;
  let status=document.getElementById('paperFxStatus');
  const closeStatus=document.getElementById('paperCloseStatus');
  const inline=positions.querySelector('.inline-meta');
  if(!status){
    status=document.createElement('div');
    status.id='paperFxStatus';
    status.className='paper-fx-status';
    if(closeStatus)closeStatus.insertAdjacentElement('afterend',status);
    else inline?.insertAdjacentElement('afterend',status);
  }
  setText(status,lastFxMessage);
  status.className='paper-fx-status '+(fxReady()?'ok':lastFxMessage.includes('取得でき')?'warn':'');
}

function decorateEntry(){
  const market=$('market')?.value==='us'?'us':'jp';
  const suffix=market==='us'?'（USD）':'（円）';
  const fields=[
    ['price','約定価格'+suffix],
    ['stop','損切価格'+suffix],
    ['target','目標価格'+suffix],
    ['amountPreset','想定投資額'+suffix],
    ['riskPreset','許容損失'+suffix]
  ];
  for(const [id,labelText] of fields){
    const input=$(id);
    const label=input?.closest('.field')?.querySelector('label');
    setText(label,labelText);
  }
}

function decoratePositionCards(){
  const cards=[...document.querySelectorAll('#positions .position')];
  cards.forEach((card,index)=>{
    const input=card.querySelector('.curInput');
    const position=input
      ?(db.positions||[]).find(item=>item.id===input.dataset.id)
      :(db.positions||[])[index];
    if(!position)return;
    const market=marketOf(position);
    const qty=num(position.qty),avg=num(position.avg),cur=num(position.current||position.avg);
    const pnlQuote=(cur-avg)*qty;
    const pnlJpy=toJpy(pnlQuote,market);
    const rate=avg?(cur/avg-1)*100:0;
    const metrics=[...card.querySelectorAll('.grid4>.metric')];
    if(metrics[1]){
      setText(metrics[1].querySelector('.k'),market==='us'?'平均価格（USD）':'平均価格（円）');
      setText(metrics[1].querySelector('.mv'),quote(avg,market));
    }
    if(metrics[2]){
      const currentInput=metrics[2].querySelector('.curInput');
      if(currentInput){
        currentInput.type='text';
        currentInput.value=quote(cur,market);
        currentInput.classList.add('paper-usd-value');
      }
    }
    if(metrics[3]){
      setText(metrics[3].querySelector('.k'),'評価損益（円換算）');
      const detail=market==='us'
        ?`<span class="paper-fx-sub">${signedQuote(pnlQuote,'us')} · USD/JPY ${fxReady()?nf2.format(usdJpy):'取得待ち'} · ${rate>=0?'+':''}${rate.toFixed(2)}%</span>`
        :`<span class="paper-fx-sub">${rate>=0?'+':''}${rate.toFixed(2)}%</span>`;
      setHtml(metrics[3].querySelector('.mv'),`${yenValue(pnlJpy)}${detail}`);
      setTone(metrics[3].querySelector('.mv'),pnlJpy);
    }
    const secondary=[...card.querySelectorAll('.grid3>.metric')];
    if(secondary[1]){
      setText(secondary[1].querySelector('.k'),market==='us'?'ストップロス（USD）':'ストップロス（円）');
      setText(secondary[1].querySelector('.mv'),quote(position.stop,market));
    }
    if(secondary[2]){
      setText(secondary[2].querySelector('.k'),market==='us'?'ターゲット（USD）':'ターゲット（円）');
      setText(secondary[2].querySelector('.mv'),quote(position.target,market));
    }
  });
}

function decorateTotalBar(){
  const bar=document.querySelector('#positions .totalbar');
  if(!bar)return;
  const stats=openStatsJpy();
  const items=[...bar.querySelectorAll('.totalitem')];
  if(items[0]){
    setText(items[0].querySelector('.k'),'総保有株数');
    setText(items[0].querySelector('.mv'),nf0.format(stats.totalQty)+' 株');
  }
  if(items[1]){
    setText(items[1].querySelector('.k'),'評価損益（円換算）');
    setText(items[1].querySelector('.mv'),yenValue(stats.totalPnl));
    setTone(items[1].querySelector('.mv'),stats.totalPnl);
  }
  if(items[2]){
    setText(items[2].querySelector('.k'),'含み損益率');
    const rate=Number.isFinite(stats.rate)?`${stats.rate>=0?'+':''}${stats.rate.toFixed(2)}%`:'—';
    setText(items[2].querySelector('.mv'),rate);
    setTone(items[2].querySelector('.mv'),stats.rate);
  }
}

function decorateSummaryCards(){
  const stats=historyStatsJpy();
  document.querySelectorAll('.summary').forEach(summary=>{
    const cells=[...summary.querySelectorAll('.cell')];
    if(cells[0]){
      setText(cells[0].querySelector('.k'),'確定損益（円換算）');
      setText(cells[0].querySelector('.v'),yenValue(stats.total));
      setTone(cells[0].querySelector('.v'),stats.total);
    }
    if(cells[1])setText(cells[1].querySelector('.v'),stats.winRate.toFixed(1)+'%');
    if(cells[2])setText(cells[2].querySelector('.v'),Number.isFinite(stats.pf)?stats.pf.toFixed(2):'—');
    if(cells[3])setText(cells[3].querySelector('.v'),String(stats.count));
  });
}

function decorateHistoryCards(){
  const cards=[...document.querySelectorAll('#history .h-card')];
  cards.forEach((card,index)=>{
    const item=(db.history||[])[(db.history?.length||0)-1-index];
    if(!item)return;
    const market=marketOf(item);
    const pnlQuote=num(item.pnl);
    const pnlJpy=toJpy(pnlQuote,market);
    const pnl=card.querySelector('.h-pnl');
    if(pnl){
      const detail=market==='us'
        ?`<span class="paper-fx-sub">${signedQuote(pnlQuote,'us')} · USD/JPY ${fxReady()?nf2.format(usdJpy):'取得待ち'}</span>`
        :'';
      setHtml(pnl,`${yenValue(pnlJpy)}${detail}`);
      setTone(pnl,pnlJpy);
    }
    const metrics=[...card.querySelectorAll('.grid2>.metric')];
    if(metrics[0]){
      setText(metrics[0].querySelector('.k'),market==='us'?'約定（USD）':'約定（円）');
      setText(metrics[0].querySelector('.mv'),`${quote(item.entry,market)} → ${quote(item.exit,market)}`);
    }
  });
}

function decorateStats(){
  const history=historyStatsJpy();
  const open=openStatsJpy();
  const cards=[...document.querySelectorAll('#stats .stats-grid .stats-card')];
  if(cards[0]){
    setText(cards[0].querySelector('.subk'),'確定損益（円換算）');
    setText(cards[0].querySelector('.big'),yenValue(history.total));
    setTone(cards[0].querySelector('.big'),history.total);
  }
  if(cards[1])setText(cards[1].querySelector('.big'),history.winRate.toFixed(1)+'%');
  if(cards[2])setText(cards[2].querySelector('.big'),Number.isFinite(history.pf)?history.pf.toFixed(2):'—');
  if(cards[3])setText(cards[3].querySelector('.big'),String(open.count));
  const summaryMetrics=[...document.querySelectorAll('#stats .card.pad .metric')];
  if(summaryMetrics[0]){
    setText(summaryMetrics[0].querySelector('.k'),'総保有株数');
    setText(summaryMetrics[0].querySelector('.mv'),nf0.format(open.totalQty)+' 株');
  }
  if(summaryMetrics[1]){
    setText(summaryMetrics[1].querySelector('.k'),'含み損益（円換算）');
    setText(summaryMetrics[1].querySelector('.mv'),yenValue(open.totalPnl));
    setTone(summaryMetrics[1].querySelector('.mv'),open.totalPnl);
  }
  if(summaryMetrics[2]){
    const rate=Number.isFinite(open.rate)?`${open.rate>=0?'+':''}${open.rate.toFixed(2)}%`:'—';
    setText(summaryMetrics[2].querySelector('.mv'),rate);
    setTone(summaryMetrics[2].querySelector('.mv'),open.rate);
  }
  if(summaryMetrics[3])setText(summaryMetrics[3].querySelector('.mv'),String(history.count));
}

function decorateAll(){
  addStyle();
  decorateFxStatus();
  decorateEntry();
  decoratePositionCards();
  decorateTotalBar();
  decorateSummaryCards();
  decorateHistoryCards();
  decorateStats();
}

function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  requestAnimationFrame(()=>{
    decorateQueued=false;
    decorateAll();
  });
}

function installExitHandler(){
  if(window.__paperFxExitInstalled)return;
  window.__paperFxExitInstalled=true;
  window.exitTrade=(id,partial)=>{
    const position=(db.positions||[]).find(item=>item.id===id);
    if(!position)return;
    const market=marketOf(position);
    const defaultQty=partial?Math.max(1,Math.floor(num(position.qty)/2)):num(position.qty);
    const qty=num(prompt('決済数量',defaultQty));
    if(!qty||qty>num(position.qty))return;
    const exitPrice=num(prompt(`EXIT価格（${market==='us'?'USD':'円'}）`,num(position.current||position.avg)));
    if(!exitPrice)return;
    const reason=prompt('EXIT理由','5日線終値割れ')||'未記入';
    db.history.push({
      id:crypto.randomUUID(),
      market,
      currency:market==='us'?'USD':'JPY',
      symbol:position.symbol,
      name:position.name,
      qty,
      entry:num(position.avg),
      exit:exitPrice,
      pnl:(exitPrice-num(position.avg))*qty,
      reason,
      opened:position.opened,
      closed:new Date().toISOString(),
      lane:position.lane,
      regime:position.regime,
      frame:position.frame
    });
    position.qty=num(position.qty)-qty;
    if(position.qty<=0)db.positions=db.positions.filter(item=>item.id!==id);
    save();
    renderAll();
    scheduleDecorate();
  };
}

function bindEvents(){
  $('market')?.addEventListener('change',scheduleDecorate);
  window.addEventListener('click',event=>{
    if(event.target?.closest?.('.refresh'))refreshFx({force:true});
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)refreshFx({force:true});
  });
  setInterval(()=>{
    if(!document.hidden)refreshFx({force:true});
  },10*60*1000);
  const observer=new MutationObserver(scheduleDecorate);
  observer.observe(document.body,{childList:true,subtree:true});
}

addStyle();
installExitHandler();
bindEvents();
decorateAll();
setTimeout(()=>refreshFx({force:true}),350);
})();
