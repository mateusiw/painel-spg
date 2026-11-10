## 2026-11-07 - PWA instalável e logos locais
- O que foi decidido: adicionado `manifest.webmanifest`, ícones `icon-192.png`/`icon-512.png` e botão "Instalar app" (evento `beforeinstallprompt`); os logos do imgur viraram arquivos locais `logo-spg-oasis.png` e `logo-spg-sede.png`.
- Por quê: sem manifest o navegador não oferece instalar; os logos locais funcionam offline e no Live Server.
- Observação: os dois links do imgur (wEozr34 e f7UnnL0) entregavam a mesma imagem (Sítio Pedra Grande), então os dois arquivos locais são iguais; para trocar o logo da Pesagem basta substituir `logo-spg-sede.png`.
- Depois o usuário pediu um ícone novo: criado `icon.svg` (caixa de colheita com folhas, fundo verde, "SPG"), renderizado em `icon-192.png`/`icon-512.png`. Ele é o ícone do app e o favicon em todas as abas; os logos `logo-spg-*.png` continuam só na navbar e no login. Se mudar o `icon.svg`, regerar os PNGs.

## 2026-11-07 - Layout igual ao do Registro de Irrigação
- O que foi decidido: copiado o layout do app de irrigação: navbar de vidro com fio de cor no topo (#navbar), abas + barra de status (usuário, papel, sincronização, Atualizar, Enviar, Instalar, sair) em #navTabs. No celular (até 1023px) as abas (#mainTabContainer) viram barra flutuante no rodapé que recolhe ao rolar (botão #tabBarTopo) e some com o teclado; no computador ficam presas abaixo da navbar.
- Como funciona: executeTabSwitch continua igual, mas no fim chama spg_estiloAbas(tab), que redefine as classes dos botões (.aba-ativa); spg_renderUsuario() mostra o usuário/papel (chamado também em spg_updateSyncBadge). O botão "Instalar app" saiu do canto da tela e foi para a barra de status.

## 2026-05-30 - Migração de captura para html-to-image
- O que foi decidido: migrar completamente a exportação de imagem para `html-to-image`, com helper único (`exportReportImage`) e clone offscreen para aplicar ajustes de layout antes da renderização.
- Por quê: o fluxo anterior dependia de opções de clonagem do `html2canvas`; com clone offscreen no `html-to-image`, mantemos largura fixa, grid e overflow de forma previsível.
- O que foi rejeitado e por quê: troca mínima direta (`toPng` no elemento sem clone) foi rejeitada porque poderia alterar o resultado visual em relatórios com grid e rolagem.
