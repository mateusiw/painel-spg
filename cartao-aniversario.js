// Cartão de aniversário do colaborador (estilo das artes do Sítio Pedra Grande).
// Montado na hora com o nome de quem faz aniversário; dá para baixar como imagem (PNG) ou compartilhar.
// Uso: CartaoAniversario.abrir([{ nome, cargo, empresa }], indiceInicial)
(function () {
    'use strict';

    const LARGURA = 1080, ALTURA = 1440;
    const VERDE = '#2f5e2a', VERDE_ESCURO = '#234a20', LIMAO = '#8cb43c', CREME = '#f8f2e2';
    const URL_FONTES = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Montserrat:wght@500;600;700;800&family=Oswald:wght@600;700&display=swap';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Fontes do cartão (carregadas só quando o cartão é aberto)
    function carregarFontes() {
        if (!document.getElementById('fontesCartaoNiver')) {
            const link = document.createElement('link');
            link.id = 'fontesCartaoNiver';
            link.rel = 'stylesheet';
            link.href = URL_FONTES;
            document.head.appendChild(link);
        }
        if (!document.getElementById('estiloCartaoNiver')) {
            const estilo = document.createElement('style');
            estilo.id = 'estiloCartaoNiver';
            estilo.textContent = `
                .cn { position: relative; width: ${LARGURA}px; height: ${ALTURA}px; overflow: hidden; font-family: 'Montserrat', 'Segoe UI', sans-serif; color: ${VERDE};
                      background: radial-gradient(circle at 82% 16%, #fffdf6 0%, #fbf6e8 28%, #f3ecd8 70%, #eee5cd 100%); }
                .cn * { box-sizing: border-box; }
                .cn-abs { position: absolute; }
                .cn-titulo { font-family: 'Oswald', 'Arial Narrow', sans-serif; font-weight: 700; letter-spacing: 3px; line-height: 1; color: ${VERDE}; }
                .cn-cursiva { font-family: 'Great Vibes', cursive; font-weight: 400; color: ${VERDE}; line-height: 1; }
                .cn-texto { font-size: 29px; line-height: 1.4; font-weight: 600; color: #34502c; }
                .cn-caixa { border: 2.5px solid ${VERDE}; border-radius: 22px; display: flex; align-items: center; gap: 22px; padding: 22px 28px; }
                .cn-caixa p { margin: 0; font-size: 21px; font-weight: 800; letter-spacing: .5px; line-height: 1.3; text-transform: uppercase; color: ${VERDE}; }
                .cn-icone { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 150px; color: #fff; font-size: 19px; font-weight: 800; letter-spacing: 1px; }
                .cn-icone svg { width: 64px; height: 64px; stroke-width: 1.4; }
            `;
            document.head.appendChild(estilo);
        }
    }

    // Ramo de folhas em traço (canto de cima)
    const ramo = (cor) => `<svg viewBox="0 0 300 330" width="300" height="330" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linecap="round">
        <path d="M-10 40 C 70 70, 150 150, 205 300"/>
        ${[[30, 52, -35], [62, 70, 20], [88, 96, -40], [112, 120, 25], [132, 150, -45], [152, 176, 22], [168, 210, -50], [184, 242, 18], [196, 274, -40]]
            .map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0 C 18 -16, 46 -18, 62 -6 C 44 8, 18 12, 0 0 Z" fill="${cor}" fill-opacity=".13"/><path d="M4 -1 L 54 -7" stroke-width="1.4"/></g>`).join('')}
    </svg>`;

    // Folhas desfocadas (canto direito, como na arte)
    const folhasDesfocadas = `<svg viewBox="0 0 260 520" width="260" height="520">
        <defs><filter id="cnDesfoque" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter></defs>
        <g filter="url(#cnDesfoque)" fill="#6f8f4e" fill-opacity=".55">
            <ellipse cx="190" cy="40" rx="34" ry="70" transform="rotate(-30 190 40)"/>
            <ellipse cx="235" cy="160" rx="30" ry="64" transform="rotate(20 235 160)"/>
            <ellipse cx="200" cy="330" rx="36" ry="72" transform="rotate(-15 200 330)"/>
            <ellipse cx="250" cy="470" rx="28" ry="60" transform="rotate(25 250 470)"/>
        </g>
    </svg>`;

    // Cena da direita: campo com fileiras ao pôr do sol, balões e bolo
    const cena = `<svg viewBox="0 0 560 980" width="560" height="980">
        <defs>
            <linearGradient id="cnCeu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf6e3" stop-opacity="0"/><stop offset=".35" stop-color="#fbe9c2"/><stop offset=".62" stop-color="#f4dca8"/></linearGradient>
            <radialGradient id="cnSol" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe9"/><stop offset=".45" stop-color="#fff1c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff1c4" stop-opacity="0"/></radialGradient>
            <linearGradient id="cnCobrirLado" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3ecd8" stop-opacity="1"/><stop offset=".12" stop-color="#f3ecd8" stop-opacity=".85"/><stop offset=".34" stop-color="#f3ecd8" stop-opacity="0"/></linearGradient>
            <linearGradient id="cnCobrirTopo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6e8" stop-opacity="1"/><stop offset=".2" stop-color="#fbf6e8" stop-opacity="0"/></linearGradient>
            <linearGradient id="cnTerra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d9a4a"/><stop offset="1" stop-color="#3f6b2a"/></linearGradient>
        </defs>
        <g>
            <rect width="560" height="560" fill="url(#cnCeu)"/>
            <circle cx="360" cy="430" r="190" fill="url(#cnSol)"/>
            <path d="M0 470 C 90 440, 170 455, 260 445 C 360 432, 460 450, 560 438 L 560 560 L 0 560 Z" fill="#b9c79a" opacity=".55"/>
            <path d="M0 500 C 120 480, 240 492, 380 478 C 460 470, 520 476, 560 472 L 560 980 L 0 980 Z" fill="url(#cnTerra)"/>
            ${Array.from({ length: 15 }, (_, i) => {
                const xBase = -420 + i * 100, xTopo = 300 + (i - 7) * 14;
                return `<path d="M${xTopo} 492 L ${xBase} 980" stroke="#2f5420" stroke-width="${10 + Math.abs(i - 7) * 1.6}" stroke-linecap="round" opacity=".55"/>
                        <path d="M${xTopo} 492 L ${xBase} 980" stroke="#9cc25a" stroke-width="${4 + Math.abs(i - 7)}" stroke-dasharray="3 ${9 + Math.abs(i - 7)}" stroke-linecap="round" opacity=".8"/>`;
            }).join('')}
            <path d="M120 470 C 160 430, 200 432, 230 468 Z M330 462 C 350 440, 380 440, 398 460 Z" fill="#6f8a48" opacity=".5"/>
            <rect width="560" height="980" fill="url(#cnCobrirTopo)"/>
            <rect width="560" height="980" fill="url(#cnCobrirLado)"/>
        </g>
        <!-- Balões -->
        <g>
            <path d="M300 300 C 310 380, 290 440, 330 560" stroke="#8a7a5a" stroke-width="2" fill="none"/>
            <path d="M395 250 C 380 360, 360 430, 340 560" stroke="#8a7a5a" stroke-width="2" fill="none"/>
            <path d="M470 330 C 430 420, 380 480, 345 560" stroke="#8a7a5a" stroke-width="2" fill="none"/>
            <ellipse cx="300" cy="235" rx="62" ry="74" fill="${VERDE}"/><path d="M292 307 l8 14 l8 -14 z" fill="${VERDE}"/>
            <ellipse cx="282" cy="205" rx="14" ry="24" fill="#fff" opacity=".25" transform="rotate(20 282 205)"/>
            <ellipse cx="398" cy="180" rx="66" ry="78" fill="${LIMAO}"/><path d="M390 256 l8 14 l8 -14 z" fill="${LIMAO}"/>
            <ellipse cx="378" cy="148" rx="15" ry="26" fill="#fff" opacity=".3" transform="rotate(20 378 148)"/>
            <ellipse cx="478" cy="268" rx="56" ry="66" fill="#e3b341"/><path d="M470 332 l8 13 l8 -13 z" fill="#e3b341"/>
            <ellipse cx="461" cy="240" rx="13" ry="22" fill="#fff" opacity=".3" transform="rotate(20 461 240)"/>
        </g>
    </svg>`;

    // Bolo na frente, sobre a faixa verde
    const bolo = `<svg viewBox="0 0 360 330" width="360" height="330">
        <ellipse cx="180" cy="312" rx="170" ry="16" fill="#000" opacity=".15"/>
        <rect x="20" y="290" width="320" height="18" rx="9" fill="#e8dcc0"/>
        <rect x="40" y="200" width="280" height="96" rx="16" fill="${VERDE}"/>
        <path d="M40 222 C 70 250, 100 214, 130 240 C 160 266, 190 222, 220 246 C 250 268, 290 226, 320 244 L 320 216 Q 320 200 304 200 L 56 200 Q 40 200 40 216 Z" fill="${CREME}"/>
        <rect x="80" y="118" width="200" height="88" rx="14" fill="${LIMAO}"/>
        <path d="M80 136 C 104 160, 128 126, 152 150 C 176 172, 204 134, 228 156 C 248 172, 268 140, 280 150 L 280 132 Q 280 118 266 118 L 94 118 Q 80 118 80 132 Z" fill="${CREME}"/>
        ${[120, 160, 200, 240].map((x, i) => `<rect x="${x - 6}" y="66" width="12" height="54" rx="5" fill="${['#f5f0dc', '#e3b341', '#f5f0dc', '#e3b341'][i]}"/>
            <path d="M${x} 40 C ${x + 12} 54, ${x + 8} 66, ${x} 68 C ${x - 8} 66, ${x - 12} 54, ${x} 40 Z" fill="#f59e0b"/>
            <path d="M${x} 50 C ${x + 5} 58, ${x + 4} 64, ${x} 65 C ${x - 4} 64, ${x - 5} 58, ${x} 50 Z" fill="#fde68a"/>`).join('')}
        ${[[70, 250], [130, 268], [200, 252], [270, 270], [110, 168], [170, 182], [240, 166]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#fff" opacity=".85"/>`).join('')}
    </svg>`;

    // Ícones da faixa (traço, no estilo da arte)
    const ICONES = [
        ['ALEGRIA', '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'],
        ['GRATIDÃO', '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/>'],
        ['SAÚDE', '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>'],
        ['CONQUISTAS', '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>']
    ];
    const iconeSvg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

    // Tamanho do nome em cursiva para caber na largura
    function tamanhoNome(nome) {
        const n = String(nome).length;
        return Math.max(92, Math.min(170, Math.round(560 / Math.max(1, n * 0.36))));
    }

    function cartaoHtml(p) {
        const partes = String(p.nome || '').trim().split(/\s+/).filter(Boolean);
        const primeiro = partes[0] || 'Colaborador';
        const detalhe = [p.cargo, p.empresa].filter(Boolean).join(' · ');
        return `<div class="cn" data-cartao>
            <div class="cn-abs" style="left:-20px;top:-10px">${ramo('#4f6f3c')}</div>
            <div class="cn-abs" style="right:-70px;top:-40px">${folhasDesfocadas}</div>
            <svg class="cn-abs" style="left:520px;top:-260px" width="900" height="900" viewBox="0 0 900 900" fill="none"><circle cx="450" cy="450" r="420" stroke="#fff" stroke-width="3" opacity=".75"/></svg>

            <div class="cn-abs" style="left:520px;top:450px">${cena}</div>

            <!-- Coração com a frase -->
            <div class="cn-abs" style="left:760px;top:175px;width:230px;height:210px">
                <svg viewBox="0 0 230 210" width="230" height="210" fill="none" stroke="#e7cdb4" stroke-width="2.5"><path d="M115 196 C 40 150, 6 108, 8 66 C 10 30, 40 8, 70 10 C 92 12, 106 24, 115 40 C 124 24, 138 12, 160 10 C 190 8, 220 30, 222 66 C 224 108, 190 150, 115 196 Z"/></svg>
                <p class="cn-abs" style="left:0;right:0;top:56px;margin:0;text-align:center;font-size:17px;font-weight:800;line-height:1.25;color:${VERDE}">UM NOVO CICLO,<br>NOVAS<br>COLHEITAS.</p>
            </div>

            <img class="cn-abs" src="./logo.png" alt="" style="left:255px;top:52px;width:250px;height:250px;border-radius:50%;box-shadow:0 10px 30px -12px rgba(35,74,32,.45)">

            <div class="cn-abs" style="left:70px;top:322px;width:620px;text-align:center">
                <div class="cn-titulo" style="font-size:150px">PARABÉNS</div>
                <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin-top:12px">
                    <span style="height:2px;width:120px;background:${VERDE}"></span>
                    <span class="cn-titulo" style="font-size:46px;font-weight:600">PARA VOCÊ</span>
                    <span style="height:2px;width:120px;background:${VERDE}"></span>
                </div>
                <div class="cn-cursiva" style="font-size:${tamanhoNome(primeiro)}px;margin-top:8px;padding:0 10px">${esc(primeiro)}</div>
                <div style="font-size:24px;font-weight:800;letter-spacing:3px;text-transform:uppercase;margin-top:6px">${esc(partes.join(' '))}</div>
                ${detalhe ? `<div style="font-size:20px;font-weight:600;color:#5b7350;margin-top:6px">${esc(detalhe)}</div>` : ''}
                <div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-top:14px;color:${VERDE}">
                    <svg width="34" height="30" viewBox="0 0 24 22"><path d="M12 21 C 4 15, 1 11, 1 7 A 5 5 0 0 1 12 4 A 5 5 0 0 1 23 7 C 23 11, 20 15, 12 21 Z" fill="currentColor"/></svg>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>
                    <svg width="34" height="30" viewBox="0 0 24 22"><path d="M12 21 C 4 15, 1 11, 1 7 A 5 5 0 0 1 12 4 A 5 5 0 0 1 23 7 C 23 11, 20 15, 12 21 Z" fill="currentColor"/></svg>
                </div>
            </div>

            <p class="cn-abs cn-texto" style="left:110px;top:872px;width:500px;margin:0">
                Que o seu novo ano seja como a terra bem cuidada: cheio de crescimento, boas colheitas e muitas alegrias.
            </p>

            <div class="cn-abs cn-caixa" style="left:110px;top:1044px;width:500px">
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="${VERDE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>
                <p>Obrigado por fazer parte da família Sítio Pedra Grande.</p>
            </div>

            <!-- Faixa verde de baixo, com borda "rasgada" -->
            <svg class="cn-abs" style="left:0;bottom:0" width="${LARGURA}" height="200" viewBox="0 0 ${LARGURA} 200" preserveAspectRatio="none">
                <path d="M0 30 L 40 22 L 80 34 L 130 20 L 175 30 L 230 18 L 280 32 L 330 22 L 390 34 L 440 20 L 500 30 L 560 18 L 610 30 L 670 22 L 720 34 L 780 20 L 840 30 L 900 18 L 960 32 L 1020 22 L 1080 30 L 1080 200 L 0 200 Z" fill="${VERDE_ESCURO}"/>
                <path d="M0 30 L 40 22 L 80 34 L 130 20 L 175 30 L 230 18 L 280 32 L 330 22 L 390 34 L 440 20 L 500 30 L 560 18 L 610 30 L 670 22 L 720 34 L 780 20 L 840 30 L 900 18 L 960 32 L 1020 22 L 1080 30" stroke="#4d7a3c" stroke-width="5" fill="none"/>
            </svg>
            <div class="cn-abs" style="left:40px;bottom:30px;display:flex;gap:6px">
                ${ICONES.map(([rotulo, d]) => `<div class="cn-icone">${iconeSvg(d)}<span>${rotulo}</span></div>`).join('')}
            </div>

            <div class="cn-abs" style="right:30px;bottom:24px">${bolo}</div>

            <div class="cn-abs cn-cursiva" style="left:118px;top:1164px;font-size:72px;display:flex;align-items:center;gap:14px">Feliz Aniversário!
                <svg width="40" height="36" viewBox="0 0 24 22" fill="none" stroke="${VERDE}" stroke-width="1.4"><path d="M12 21 C 4 15, 1 11, 1 7 A 5 5 0 0 1 12 4 A 5 5 0 0 1 23 7 C 23 11, 20 15, 12 21 Z"/></svg></div>
        </div>`;
    }

    let caixa = null, lista = [], indice = 0;

    function escalaQueCabe() {
        const larg = Math.min(window.innerWidth - 24, 760);
        const alt = window.innerHeight - 150;
        return Math.max(0.2, Math.min(larg / LARGURA, alt / ALTURA));
    }

    function desenhar() {
        const p = lista[indice];
        const k = escalaQueCabe();
        const palco = caixa.querySelector('[data-palco]');
        palco.style.width = LARGURA * k + 'px';
        palco.style.height = ALTURA * k + 'px';
        palco.innerHTML = `<div style="transform:scale(${k});transform-origin:0 0;width:${LARGURA}px;height:${ALTURA}px">${cartaoHtml(p)}</div>`;
        caixa.querySelector('[data-contador]').textContent = lista.length > 1 ? `${indice + 1} de ${lista.length}` : '';
        caixa.querySelectorAll('[data-anterior],[data-proximo]').forEach(b => b.classList.toggle('hidden', lista.length < 2));
    }

    function carregarScript(src) {
        return new Promise((ok, erro) => {
            if (window.htmlToImage) return ok();
            const s = document.createElement('script');
            s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar o gerador de imagem (sem internet?).'));
            document.head.appendChild(s);
        });
    }

    // CSS das fontes com os arquivos dentro (data:), para a imagem sair com as mesmas letras da tela
    let cssFontesEmbutidas = null;
    async function cssFontes() {
        if (cssFontesEmbutidas !== null) return cssFontesEmbutidas;
        try {
            const css = await (await fetch(URL_FONTES)).text();
            let saida = css.split('/* ').slice(1).map(b => '/* ' + b).filter(b => /^\/\* (latin|latin-ext) \*\//.test(b)).join('\n');
            const urls = [...new Set([...saida.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
            const dados = await Promise.all(urls.map(async u => {
                const blob = await (await fetch(u)).blob();
                return new Promise(ok => { const leitor = new FileReader(); leitor.onload = () => ok(leitor.result); leitor.readAsDataURL(blob); });
            }));
            urls.forEach((u, i) => { saida = saida.split(u).join(dados[i]); });
            cssFontesEmbutidas = saida;
        } catch (e) {
            cssFontesEmbutidas = '';   // sem internet: sai com as fontes do aparelho
        }
        return cssFontesEmbutidas;
    }

    async function gerarImagem() {
        await carregarScript('https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js');
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        // Gera numa cópia fora da tela, sem a redução de tamanho da prévia
        const fora = document.createElement('div');
        fora.style.cssText = `position:fixed;left:-${LARGURA + 100}px;top:0;width:${LARGURA}px;height:${ALTURA}px;pointer-events:none`;
        fora.innerHTML = cartaoHtml(lista[indice]);
        document.body.appendChild(fora);
        try {
            const no = fora.firstElementChild;
            await new Promise(r => { const img = no.querySelector('img'); if (!img || img.complete) r(); else { img.onload = r; img.onerror = r; } });
            const fontEmbedCSS = await cssFontes();
            return await window.htmlToImage.toBlob(no, Object.assign({ width: LARGURA, height: ALTURA, pixelRatio: 1, cacheBust: true }, fontEmbedCSS ? { fontEmbedCSS } : {}));
        } finally {
            fora.remove();
        }
    }

    const nomeArquivo = () => 'parabens-' + String(lista[indice].nome || 'colaborador').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';

    async function comBotao(botao, rotulo, fazer) {
        const original = botao.innerHTML;
        botao.disabled = true;
        botao.textContent = rotulo;
        try { await fazer(); }
        catch (e) { if (e && e.name !== 'AbortError') (window.Dialogo ? Dialogo.avisar(e.message || 'Não foi possível gerar a imagem.', { tipo: 'erro', titulo: 'Imagem não gerada' }) : alert(e.message || 'Não foi possível gerar a imagem.')); }
        finally { botao.disabled = false; botao.innerHTML = original; }
    }

    function baixar(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nomeArquivo();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async function compartilhar() {
        const blob = await gerarImagem();
        const p = lista[indice];
        const arquivo = new File([blob], nomeArquivo(), { type: 'image/png' });
        const texto = `Parabéns, ${String(p.nome).split(/\s+/)[0]}! 🎉 Feliz aniversário! Que o seu novo ano seja cheio de crescimento, boas colheitas e muitas alegrias. — Sítio Pedra Grande`;
        if (navigator.canShare && navigator.canShare({ files: [arquivo] })) await navigator.share({ files: [arquivo], text: texto });
        else baixar(blob);
    }

    function fechar() {
        if (caixa) { caixa.remove(); caixa = null; }
        window.removeEventListener('resize', desenhar);
    }

    function abrir(pessoas, inicial) {
        lista = (pessoas || []).filter(Boolean);
        if (!lista.length) return;
        indice = Math.min(Math.max(0, inicial || 0), lista.length - 1);
        carregarFontes();
        fechar();
        caixa = document.createElement('div');
        caixa.className = 'fixed inset-0 z-[90] bg-slate-950/80 flex flex-col items-center justify-center gap-3 p-3';
        caixa.setAttribute('role', 'dialog');
        caixa.setAttribute('aria-modal', 'true');
        caixa.setAttribute('aria-label', 'Cartão de aniversário');
        const botao = 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60';
        caixa.innerHTML = `
            <div class="relative">
                <div data-palco class="rounded-2xl overflow-hidden shadow-2xl bg-white"></div>
                <button type="button" data-anterior title="Anterior" aria-label="Aniversariante anterior" class="hidden absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/55 text-white hover:bg-slate-900/75 flex items-center justify-center"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                <button type="button" data-proximo title="Próximo" aria-label="Próximo aniversariante" class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/55 text-white hover:bg-slate-900/75 flex items-center justify-center"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-2">
                <span data-contador class="text-xs font-bold text-white/70"></span>
                <button type="button" data-compartilhar class="${botao} bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md"><i data-lucide="share-2" class="w-4 h-4"></i>Compartilhar</button>
                <button type="button" data-baixar class="${botao} bg-white text-slate-700"><i data-lucide="download" class="w-4 h-4"></i>Baixar imagem</button>
                <button type="button" data-fechar class="${botao} bg-white/15 text-white hover:bg-white/25"><i data-lucide="x" class="w-4 h-4"></i>Fechar</button>
            </div>`;
        document.body.appendChild(caixa);
        desenhar();
        if (window.lucide) lucide.createIcons();
        // As fontes chegam depois: redesenha para o nome ficar na letra certa
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (caixa) desenhar(); });
        window.addEventListener('resize', desenhar);
        caixa.addEventListener('click', e => {
            if (e.target === caixa || e.target.closest('[data-fechar]')) { fechar(); return; }
            if (e.target.closest('[data-anterior]')) { indice = (indice - 1 + lista.length) % lista.length; desenhar(); return; }
            if (e.target.closest('[data-proximo]')) { indice = (indice + 1) % lista.length; desenhar(); return; }
            const b = e.target.closest('[data-baixar]');
            if (b) { comBotao(b, 'Gerando...', async () => baixar(await gerarImagem())); return; }
            const c = e.target.closest('[data-compartilhar]');
            if (c) comBotao(c, 'Gerando...', compartilhar);
        });
        caixa.addEventListener('keydown', e => {
            if (e.key === 'Escape') fechar();
            if (e.key === 'ArrowLeft' && lista.length > 1) { indice = (indice - 1 + lista.length) % lista.length; desenhar(); }
            if (e.key === 'ArrowRight' && lista.length > 1) { indice = (indice + 1) % lista.length; desenhar(); }
        });
        caixa.tabIndex = -1;
        caixa.focus();
    }

    // Gera só a imagem (PNG) do cartão de uma pessoa, sem abrir a janela
    async function imagem(pessoa) {
        const antes = [lista, indice];
        lista = [pessoa]; indice = 0;
        carregarFontes();
        try { return await gerarImagem(); } finally { [lista, indice] = antes; }
    }

    window.CartaoAniversario = { abrir, fechar, imagem };
})();
