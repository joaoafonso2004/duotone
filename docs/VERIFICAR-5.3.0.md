# O que verificar no Duotone 5.3.0 (iPhone e Windows)

Passaram os 259 testes, também numa cópia com os finais de linha do Windows. Não há SQL novo.

## Windows: primeiro a Jam (mexe no motor do PC)

O arranque calado da Jam voltou ao motor do PC. A regra de 16/10 é que nada no motor do PC sai sem ser ouvido no Electron, por isso é a primeira coisa a confirmar.

- **Uma Jam com alguém:** a cada música nova, o início ouve-se limpo, sem estalo e sem o salto de um segundo uns segundos depois. Pode haver um instante de silêncio no arranque, que é o tempo de acertar com a sala.
- **Nunca fica calado:** com rede lenta, a música ouve-se no máximo 10 s depois de começar. Sair da Jam a meio de um arranque devolve o som logo.
- **Fora da Jam** nada muda: as músicas começam do início, como antes.
- **No relatório** (fila de reprodução) aparece "Jam aligned on first sound (PC, muted)" quando houve acerto, e quase nunca "Jam drift seek".

## Windows: o resto

- **Now Playing:** aberto, carrega em Liked Songs na lateral. O leitor apaga-se, a cor da capa sai da janela devagar e a página entra. O mesmo com o ← do leitor. Abrir e fechar depressa não deixa nada preso.
- **Pinned:** com muitos atalhos fixados, a lista rola até ao último.
- **Estados:** o shuffle e o repeat ligados distinguem-se de um botão com o rato por cima; as abas Queue/Lyrics também. "Loading…" no Mix de um artista e "Saving…" ao guardar um álbum mostram a roda e ficam acesos.
- **Teclado:** o Tab pelo leitor mostra o anel em cada botão, incluindo o Play de uma playlist (de metal). Em "New playlist", o foco vai para o nome, o Tab dá a volta e o Escape fecha só o diálogo. O volume e a barra da música andam com as setas.
- **Legendas:** passar o rato pelos ícones da barra do leitor mostra o nome e o atalho.
- **Pesquisa:** sem rede, pesquisar uma música guardada mostra-a em "In your library", com "Couldn't search online" e "Try again" por baixo.
- **New releases:** o botão direito num lançamento abre o menu dele. As pesquisas recentes só aparecem com a caixa de pesquisa em foco.
- **Mini leitor:** com as cores e a letra da janela principal.
- **Acabamento:** os menus de contexto e do Radio, as Definições e a janela "Pin to sidebar" sem texto cortado (alguns textos cresceram meio ponto).

## iPhone

- **Pesquisa sem rede:** pesquisar uma música guardada mostra-a em "In your library", e por baixo "Couldn't search online" com "Try again". Com rede, "Try again" traz os resultados.
- **A carregar:** um botão que já começou (Library check, "Connect Spotify", importar) mostra a roda ao lado do texto e não apaga.
- **Radio na Jam (convidado sem controlo):** tocar na pastilha apagada mostra "Only the host can change the Jam Radio" e como passa a poder.
- **Pesquisa:** o Mix do artista em destaque acerta-se bem com o dedo.
- **Acabamento:** as capas pequenas (menu de uma música, partilha, chat) com o mesmo canto das listas.

Releases: [iOS 5.3.0](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.3.0) · [Windows 5.3.0](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.3.0).
