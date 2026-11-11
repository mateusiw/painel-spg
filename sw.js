const CACHE = 'sistema-v129';

// Arquivos do próprio app. Este service worker fica na raiz e atende todos os projetos.
const ARQUIVOS_APP = [
  './',
  './index.html',
  './manifest.json',
  './supabase-config.js',
  './supabase-api.js',
  './lista-moderna.js',
  './trava-fundo.js',
  './barra-abas.js',
  './catalogo-colheita.js',
  './logo.png',
  './favicon.png',
  './icone-app.png',
  './projetos/irrigacao/',
  './projetos/irrigacao/index.html',
  './projetos/resumo-colheita-oasis/',
  './projetos/resumo-colheita-oasis/index.html',
  './projetos/resumo-colheita-oasis/lancamentos.js',
  './projetos/resumo-colheita-oasis/icon.svg',
  './projetos/resumo-colheita-oasis/icon-192.png',
  './projetos/resumo-colheita-oasis/icon-512.png',
  './projetos/resumo-colheita-oasis/logo-spg-oasis.png',
  './projetos/resumo-colheita-oasis/logo-spg-sede.png',
  './projetos/producao-oasis/',
  './projetos/producao-oasis/index.html',
  './projetos/producao-oasis/logo-oasis.png',
  './projetos/producao-oasis/icone.png',
  './projetos/programacao/',
  './projetos/programacao/index.html',
  './projetos/programacao/backend.js',
  './projetos/checklist/',
  './projetos/checklist/index.html',
  './projetos/aplicacoes-fitossanitarias/index.html',
  './projetos/aplicacoes-fitossanitarias/dashboard.html',
  './projetos/aplicacoes-fitossanitarias/backend.js',
  './projetos/aplicacoes-fitossanitarias/logo.png',
  './projetos/checklist/checklists.js',
  './projetos/checklist/listas/banco.js',
  './projetos/checklist/listas/tema-irrigacao.css',
  './projetos/checklist/listas/geral.html',
  './projetos/checklist/listas/embarque.html',
  './projetos/checklist/listas/limpeza-diaria.html',
  './projetos/checklist/listas/cronograma-limpeza.html',
  './projetos/checklist/listas/pop.html',
  './projetos/checklist/listas/logo-geral.png',
  './projetos/checklist/listas/logo-embarque.png',
  './projetos/checklist/listas/logo-limpeza.png',
  './projetos/checklist/listas/logo-pop.png',
  './projetos/programacao/icone.png',
  './notificacoes.js',
  './projetos/culturas/index.html',
  './projetos/culturas/culturas.js',
  './projetos/notificacoes/index.html',
  './projetos/notificacoes/notificacoes.js',
  './projetos/online/index.html',
  './projetos/online/online.js',
  './projetos/log/index.html',
  './projetos/log/log.js',
  './projetos/organograma/index.html',
  './projetos/producao-estufa/index.html',
  './projetos/producao-estufa/logo-estufa.png',
  './projetos/resumo-colheita-estufa/index.html',
  './projetos/estoque/index.html',
  './projetos/estoque/icon.png',
  './projetos/resumo-colheita-estufa/lancamentos.js',
  './projetos/resumo-colheita-estufa/icon-192.png',
  './projetos/resumo-colheita-estufa/logo-spg-oasis.png',
  './projetos/resumo-colheita-estufa/logo-spg-sede.png',
  './projetos/organograma/fundo.jpg',
  './cartao-aniversario.js',
  './projetos/usuarios/',
  './projetos/usuarios/index.html',
  './projetos/usuarios/usuarios.js'
];

// Bibliotecas externas (CDNs). Alguns CDNs não liberam CORS, então são guardadas
// como resposta "opaca" (no-cors) — funcionam normalmente em <script>.
const ARQUIVOS_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

// Guarda cada arquivo separadamente: se um falhar, os outros continuam
async function guardar(cache, url, opcoes) {
  try {
    const resp = await fetch(new Request(url, opcoes));
    if (resp.ok || resp.type === 'opaque') await cache.put(url, resp);
  } catch (e) {
    console.warn('Não foi possível guardar no cache:', url, e);
  }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      ...ARQUIVOS_APP.map(url => guardar(cache, url, { cache: 'reload' })),
      ...ARQUIVOS_CDN.map(url => guardar(cache, url, { mode: 'no-cors' }))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Chamadas ao banco (Supabase) sempre vão direto para a rede
  if (url.hostname.endsWith('.supabase.co')) return;

  // Consulta de IP/provedor (usuários online): sempre da rede, nunca guardada
  if (url.hostname === 'ipwho.is' || url.hostname === 'ipapi.co') return;

  // Arquivos do app: primeiro a internet (sempre a versão mais nova publicada);
  // sem conexão, usa a cópia guardada
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        // no-cache: confere sempre com o servidor, para nunca juntar um index.html novo
        // com um supabase-api.js velho guardado pelo navegador
        const resp = e.request.mode === 'navigate'
          ? await fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
          : await fetch(e.request, { cache: 'no-cache' });
        if (resp.ok) cache.put(e.request, resp.clone());
        return resp;
      } catch (err) {
        const copia = await cache.match(e.request, { ignoreSearch: true });
        if (copia) return copia;
        if (e.request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  // Bibliotecas externas: primeiro a cópia guardada (não mudam de versão)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const copia = await cache.match(e.request.url);
    if (copia) return copia;
    try {
      const resp = await fetch(e.request);
      if (resp.ok || resp.type === 'opaque') cache.put(e.request.url, resp.clone());
      return resp;
    } catch (err) {
      return Response.error();
    }
  })());
});

// Notificações no celular (enviadas pela Edge Function "notificacoes")
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Painel SPG', {
    body: d.corpo || '',
    icon: './icone-app.png',
    badge: './icone-app.png',
    tag: d.tag || undefined,
    data: { url: d.url || './index.html' }
  }));
});

// Tocar na notificação abre o Painel na tela do aviso (ou usa a janela que já está aberta)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || './index.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const principal = janelas.find(c => c.frameType !== 'nested' && c.url.startsWith(self.registration.scope));
    if (principal) {
      if (principal.url !== alvo && 'navigate' in principal) { try { await principal.navigate(alvo); } catch (err) { /* só traz para a frente */ } }
      return principal.focus();
    }
    return self.clients.openWindow(alvo);
  })());
});
