const CACHE='paper-entry-flow-v31';
const ENHANCEMENT='./paper-monitor-v31.js?v=31';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./paper-monitor-v31.js'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

async function injectEnhancement(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('paper-monitor-v31.js')){
    html=html.replace('</body>',`<script src="${ENHANCEMENT}"></script></body>`);
  }
  const headers=new Headers(response.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function navigationResponse(request){
  try{
    const network=await fetch(request,{cache:'no-store'});
    const enhanced=await injectEnhancement(network);
    const cache=await caches.open(CACHE);
    cache.put(request,enhanced.clone());
    return enhanced;
  }catch(error){
    const cached=await caches.match(request)||await caches.match('./index.html')||await caches.match('./');
    if(cached)return injectEnhancement(cached);
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const isNavigation=event.request.mode==='navigate'||url.pathname.endsWith('/paper/')||url.pathname.endsWith('/paper/index.html');
  if(isNavigation){
    event.respondWith(navigationResponse(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request))
  );
});
