// Mensagem de início de expediente: na primeira vez que cada usuário abre o Painel no dia, aparece uma
// saudação com uma frase motivacional. As frases ficam aqui mesmo (funciona sem internet e não envia
// nada para fora); a frase do dia evita repetir as últimas que a pessoa já viu.
//
// MotivacaoSPG.mostrarSeForOPrimeiroDoDia({ id, nome, aoFechar })  -> true se mostrou
// MotivacaoSPG.mostrar({ nome, aoFechar })                        -> mostra agora (ex.: botão "frase do dia")
(function () {
    'use strict';
    if (window.MotivacaoSPG) return;

    const FRASES = [
        ['O sucesso é a soma de pequenos esforços repetidos dia após dia.', 'Robert Collier'],
        ['Quem planta com cuidado, colhe com alegria.', ''],
        ['Feito é melhor que perfeito. Comece, depois melhore.', ''],
        ['A disciplina é a ponte entre metas e conquistas.', 'Jim Rohn'],
        ['Grandes colheitas começam com pequenas sementes bem cuidadas.', ''],
        ['Não espere por oportunidades extraordinárias. Agarre ocasiões comuns e faça-as grandes.', 'Orison Swett Marden'],
        ['O trabalho em equipe divide as tarefas e multiplica o sucesso.', ''],
        ['Cada dia é uma nova chance de fazer melhor do que ontem.', ''],
        ['A persistência realiza o impossível.', 'Provérbio chinês'],
        ['A terra é generosa com quem trabalha com dedicação.', ''],
        ['Você não precisa ser grande para começar, mas precisa começar para ser grande.', 'Zig Ziglar'],
        ['Qualidade não é um ato, é um hábito.', 'Aristóteles'],
        ['Sozinhos vamos mais rápido; juntos vamos mais longe.', 'Provérbio africano'],
        ['O segredo de progredir é começar.', 'Mark Twain'],
        ['Faça hoje o que o seu eu de amanhã vai agradecer.', ''],
        ['Pequenos detalhes fazem uma grande diferença na colheita.', ''],
        ['Acredite em você e tudo será possível.', ''],
        ['O otimismo é a fé em ação. Nada se pode levar a efeito sem esperança.', 'Helen Keller'],
        ['A excelência não é um destino, é uma caminhada contínua.', ''],
        ['Quem cuida da raiz não precisa se preocupar com os frutos.', ''],
        ['Tudo o que um sonho precisa para ser realizado é alguém que acredite que ele possa ser realizado.', 'Roberto Shinyashiki'],
        ['A diferença entre o comum e o extraordinário é aquele pequeno extra.', 'Jimmy Johnson'],
        ['Trabalho bem feito é a melhor assinatura que existe.', ''],
        ['O futuro pertence àqueles que acreditam na beleza de seus sonhos.', 'Eleanor Roosevelt'],
        ['Organização hoje é tranquilidade amanhã.', ''],
        ['A chuva não pede licença para cair, e a gente não pede licença para vencer.', ''],
        ['Comece onde você está. Use o que você tem. Faça o que você pode.', 'Arthur Ashe'],
        ['Um dia produtivo começa com um bom planejamento e um sorriso no rosto.', ''],
        ['Nenhum vento sopra a favor de quem não sabe para onde ir.', 'Sêneca'],
        ['Seja a energia que você quer atrair para o seu dia.', ''],
        ['Errar faz parte; o importante é aprender e seguir em frente.', ''],
        ['A semente do sucesso é a vontade de fazer acontecer.', ''],
        ['Talento vence jogos, mas trabalho em equipe vence campeonatos.', 'Michael Jordan'],
        ['O êxito da vida não se mede pelo caminho que você conquistou, mas sim pelas dificuldades que superou.', 'Abraham Lincoln'],
        ['Cuide bem do que é seu: o campo responde ao carinho de quem cuida.', ''],
        ['A força não vem da capacidade física, mas de uma vontade indomável.', 'Mahatma Gandhi'],
        ['Hoje é um ótimo dia para fazer um ótimo trabalho.', ''],
        ['Só se pode alcançar um grande êxito quando nos mantemos fiéis a nós mesmos.', 'Friedrich Nietzsche'],
        ['Cada caixa bem embalada leva o nosso nome mais longe.', ''],
        ['Quem tem um porquê enfrenta qualquer como.', 'Viktor Frankl'],
        ['A gentileza é a linguagem que todos entendem. Comece o dia com ela.', ''],
        ['Paciência e perseverança têm o efeito mágico de fazer as dificuldades desaparecerem.', 'John Quincy Adams'],
        ['Planeje o trabalho e trabalhe o plano.', ''],
        ['O melhor momento para plantar uma árvore foi há 20 anos. O segundo melhor é agora.', 'Provérbio chinês'],
        ['Segurança em primeiro lugar: o melhor trabalho é aquele em que todos voltam bem para casa.', ''],
        ['Não conte os dias, faça os dias contarem.', 'Muhammad Ali'],
        ['Juntos somos mais fortes do que qualquer desafio.', ''],
        ['A sorte favorece a mente preparada.', 'Louis Pasteur'],
        ['O que você faz hoje pode melhorar todos os seus amanhãs.', 'Ralph Marston'],
        ['Água na medida certa, cuidado na hora certa, colheita no tempo certo.', ''],
        ['Grandes coisas nunca vêm de zonas de conforto.', ''],
        ['Vencer a si mesmo é a maior das vitórias.', 'Platão'],
        ['Um time unido transforma o difícil em possível.', ''],
        ['Determinação, coragem e autoconfiança são fatores decisivos para o sucesso.', 'Dalai Lama'],
        ['Faça o seu melhor, nas condições que você tem, enquanto não tem condições melhores para fazer melhor ainda.', 'Mario Sergio Cortella'],
        ['Cada registro bem feito hoje é uma decisão mais certa amanhã.', ''],
        ['Ninguém é tão grande que não possa aprender, nem tão pequeno que não possa ensinar.', 'Esopo'],
        ['A atitude é uma pequena coisa que faz uma grande diferença.', 'Winston Churchill'],
        ['Valorize quem trabalha ao seu lado: ninguém colhe sozinho.', ''],
        ['Sonhos não funcionam a menos que você trabalhe por eles.', 'John C. Maxwell'],
        ['O sol nasce para todos, mas a colheita é de quem trabalha.', ''],
        ['Coragem não é a ausência do medo, mas a decisão de que algo é mais importante.', 'Ambrose Redmoon'],
        ['Um passo de cada vez também leva longe.', ''],
        ['Quem faz com amor faz melhor.', ''],
        ['Não é o mais forte que sobrevive, nem o mais inteligente, mas o que melhor se adapta às mudanças.', 'Leon C. Megginson'],
        ['Ordem e limpeza também são produtividade.', ''],
        ['A melhor maneira de prever o futuro é criá-lo.', 'Peter Drucker'],
        ['Seu esforço de hoje é o resultado que todos vão ver amanhã.', ''],
        ['Tudo parece impossível até que seja feito.', 'Nelson Mandela'],
        ['Respeito, união e trabalho: a receita de um bom dia.', ''],
        ['Insista, persista e nunca desista.', ''],
        ['A natureza não tem pressa, e mesmo assim tudo se realiza.', 'Lao Tsé'],
        ['Fazer bem feito da primeira vez economiza tempo de todo mundo.', ''],
        ['O homem que move montanhas começa carregando pequenas pedras.', 'Confúcio'],
        ['Um sorriso no início do expediente contagia a equipe inteira.', ''],
        ['Bons resultados não caem do céu: são cultivados.', ''],
        ['Agradeça pelo dia de hoje e faça dele um dia que valha a pena.', ''],
        ['Escolha um trabalho que você ame e não terá que trabalhar um único dia em sua vida.', 'Confúcio'],
        ['Cada folha cuidada, cada bloco irrigado, cada caixa pesada: tudo conta.', ''],
        ['Você é mais capaz do que imagina. Bom trabalho hoje!', '']
    ];

    const estilo = document.createElement('style');
    estilo.textContent = `
        .motiv-fundo { position: fixed; inset: 0; z-index: 2147482000; display: flex; align-items: center; justify-content: center; padding: 16px;
            background: rgba(15,23,42,.45); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: motivFade .25s ease-out; }
        .motiv-card { width: min(100%, 420px); background: #fff; border-radius: 28px; overflow: hidden; box-shadow: 0 30px 60px -20px rgba(15,23,42,.45);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; animation: motivSobe .35s cubic-bezier(.32,.72,0,1); }
        .motiv-topo { position: relative; padding: 26px 24px 22px; color: #fff; background: linear-gradient(135deg, var(--m1), var(--m2)); overflow: hidden; }
        .motiv-topo::after { content: ''; position: absolute; right: -40px; top: -40px; width: 170px; height: 170px; border-radius: 999px; background: rgba(255,255,255,.14); }
        .motiv-icone { font-size: 40px; line-height: 1; margin-bottom: 10px; position: relative; z-index: 1; }
        .motiv-ola { font-size: 22px; font-weight: 900; letter-spacing: -.02em; position: relative; z-index: 1; }
        .motiv-data { font-size: 12px; font-weight: 600; opacity: .9; margin-top: 2px; position: relative; z-index: 1; }
        .motiv-corpo { padding: 22px 24px 20px; }
        .motiv-rotulo { font-size: 10px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; color: #94a3b8; }
        .motiv-frase { margin-top: 8px; font-size: 18px; font-weight: 700; line-height: 1.45; color: #0f172a; }
        .motiv-frase::before { content: '“'; color: var(--m2); font-size: 28px; line-height: 0; vertical-align: -6px; margin-right: 2px; }
        .motiv-frase::after { content: '”'; color: var(--m2); font-size: 28px; line-height: 0; vertical-align: -6px; margin-left: 2px; }
        .motiv-autor { margin-top: 8px; font-size: 13px; font-weight: 700; color: #64748b; }
        .motiv-acoes { display: flex; gap: 10px; padding: 0 24px 22px; }
        .motiv-btn { flex: 1; min-height: 46px; border: 0; border-radius: 14px; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; transition: transform .1s; }
        .motiv-btn:active { transform: scale(.97); }
        .motiv-btn:focus { outline: none; }
        .motiv-btn:focus-visible { outline: 3px solid rgba(16,185,129,.35); outline-offset: 2px; }
        .motiv-ok { color: #fff; background: linear-gradient(180deg, #10b981, #059669); box-shadow: 0 8px 18px -8px rgba(5,150,105,.7); }
        .motiv-outra { flex: none; padding: 0 16px; color: #475569; background: #f1f5f9; }
        @keyframes motivFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes motivSobe { from { opacity: 0; transform: translateY(24px) scale(.97); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .motiv-fundo, .motiv-card { animation: none; } }
    `;
    (document.head || document.documentElement).appendChild(estilo);

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: segue */ } };

    // Sorteia evitando as últimas 30 frases já vistas neste aparelho
    function sortear() {
        let vistas = [];
        try { vistas = JSON.parse(ler('spg_motivacao_vistas') || '[]'); } catch (e) { vistas = []; }
        const livres = FRASES.map((_, i) => i).filter(i => !vistas.includes(i));
        const lista = livres.length ? livres : FRASES.map((_, i) => i);
        const i = lista[Math.floor(Math.random() * lista.length)];
        vistas = [...vistas.filter(v => v !== i), i].slice(-30);
        gravar('spg_motivacao_vistas', JSON.stringify(vistas));
        return FRASES[i];
    }

    function mostrar(opcoes) {
        opcoes = opcoes || {};
        if (document.querySelector('.motiv-fundo')) return;
        const hora = new Date().getHours();
        const periodo = hora < 12 ? { ola: 'Bom dia', icone: '☀️', m1: '#f59e0b', m2: '#ea580c' }
            : hora < 18 ? { ola: 'Boa tarde', icone: '🌤️', m1: '#10b981', m2: '#0d9488' }
            : { ola: 'Boa noite', icone: '🌙', m1: '#6366f1', m2: '#4338ca' };
        const primeiroNome = String(opcoes.nome || '').trim().split(/\s+/)[0] || '';
        const dataTxt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
        const data = dataTxt.charAt(0).toUpperCase() + dataTxt.slice(1);

        const fundo = document.createElement('div');
        fundo.className = 'motiv-fundo';
        fundo.setAttribute('role', 'dialog');
        fundo.setAttribute('aria-modal', 'true');
        fundo.setAttribute('aria-label', 'Mensagem de início de expediente');
        fundo.innerHTML = `<div class="motiv-card" style="--m1:${periodo.m1};--m2:${periodo.m2}">
            <div class="motiv-topo">
                <div class="motiv-icone">${periodo.icone}</div>
                <div class="motiv-ola">${periodo.ola}${primeiroNome ? ', ' + esc(primeiroNome) : ''}!</div>
                <div class="motiv-data">${esc(data)} · bom expediente</div>
            </div>
            <div class="motiv-corpo">
                <div class="motiv-rotulo">Frase do dia</div>
                <p class="motiv-frase"></p>
                <p class="motiv-autor"></p>
            </div>
            <div class="motiv-acoes">
                <button type="button" class="motiv-btn motiv-outra" data-outra title="Ver outra frase">Outra</button>
                <button type="button" class="motiv-btn motiv-ok" data-ok>Começar o dia</button>
            </div>
        </div>`;
        const pintar = () => {
            const [frase, autor] = sortear();
            fundo.querySelector('.motiv-frase').textContent = frase;
            const a = fundo.querySelector('.motiv-autor');
            a.textContent = autor ? '— ' + autor : '';
            a.style.display = autor ? '' : 'none';
        };
        pintar();
        const fechar = () => {
            fundo.remove();
            document.removeEventListener('keydown', tecla);
            if (typeof opcoes.aoFechar === 'function') opcoes.aoFechar();
        };
        const tecla = e => { if (e.key === 'Escape' || e.key === 'Enter') fechar(); };
        fundo.querySelector('[data-ok]').addEventListener('click', fechar);
        fundo.querySelector('[data-outra]').addEventListener('click', pintar);
        fundo.addEventListener('click', e => { if (e.target === fundo) fechar(); });
        document.addEventListener('keydown', tecla);
        document.body.appendChild(fundo);
        setTimeout(() => fundo.querySelector('[data-ok]').focus(), 50);
    }

    function mostrarSeForOPrimeiroDoDia(opcoes) {
        opcoes = opcoes || {};
        const chave = 'spg_motivacao_dia_' + (opcoes.id || 'anon');
        if (ler(chave) === hojeIso()) return false;
        gravar(chave, hojeIso());
        mostrar(opcoes);
        return true;
    }

    window.MotivacaoSPG = { mostrar, mostrarSeForOPrimeiroDoDia, frases: FRASES };
})();
