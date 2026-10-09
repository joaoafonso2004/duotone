# Duotone: análise e melhorias (iPhone e PC)

9/10/2026, sobre a 4.7.3. Feita com base no código, nas auditorias que já existem em `docs/` e em clientes de música open-source (fontes no fim). Não inclui o que já foi feito nem o que recusaste antes. Os pontos que mexem no leitor do iPhone estão marcados com **(precisa do teu OK)**.

**Nota** = impacto na experiência, de 0 a 10. **Onde** = iPhone, PC ou Ambos.

**Verificado no código a 9/10.** ◐ = já existe uma parte, e o ponto é só o que falta. Retirados por já existirem: a fonte AltStore/SideStore (gerada pelo Portfolio, `portfolio-sync-releases.mjs`). O tempo até ao som também já está no Painel de saúde (K1 passou a ◐).

---

## 1. O que se está a trabalhar agora

- **4.7.x**: playlists colaborativas ao vivo, Radio que fica ligado (e Radio no Jam), "O teu mês", painel de saúde, Spotify pela conta no iPhone.
- **Consistência PC ↔ iPhone**: fases 1 a 3 feitas a 5/10 (menus no sítio do gesto, destinos partilhados, uma pilha por separador). Falta confirmar no iPhone.
- **iPhone mais leve**: download do áudio em Swift, folhas nativas desligadas (cortavam conteúdo), menos trabalho com o ecrã apagado, 120 Hz só nas animações.
- **Supabase**: cortes de egress e de logs. O prazo de graça do egress acaba a **22/10**: qualquer ideia abaixo que faça pedidos tem de dizer quanto custa.
- **Limites que não mudam**: assinatura grátis da Apple (7 dias, sem push, sem CarPlay), fonte de áudio do YouTube (sem lossless), Spotify com 5 contas no máximo.

## 2. Onde já ganhas ao Spotify, e onde ele ainda ganha

**Já ganhas:** EQ de 10 bandas com memória por faixa; velocidade com o tom (slowed/nightcore); Jam com Radio, Listen along e Connect entre iPhone e PC; Library check; estatísticas sempre à mão; mini leitor por cima de jogos e modo limpo no PC; Discord; sem anúncios.

**Ele ainda ganha:** começar uma música que não está no telemóvel (o Duotone descarrega o ficheiro inteiro antes de tocar); offline de uma playlist inteira; a fila ("Add to queue" vai para o fim); novos lançamentos; seleção múltipla e arrastar no PC; e a app não deixa de abrir ao fim de 7 dias.

## 3. Top 10 (por onde começar)

| # | Ideia | Onde | Nota |
|---|---|---|---|
| 1 | "Add to queue" logo a seguir à atual, com a secção "Next in queue" (A1) | Ambos | 9 |
| 2 | Descarregar uma playlist inteira e as Liked Songs (E1) | iPhone | 9 |
| 3 | Aviso de que a assinatura vai expirar (J1) | iPhone | 9 |
| 4 | Saltar as partes que não são música (A2) | Ambos | 8 |
| 5 | Novos lançamentos dos teus artistas (C1) | Ambos | 8 |
| 6 | Seleção múltipla e arrastar no PC (F1) | PC | 8 |
| 7 | "Playing from …" no topo do leitor (G1) | iPhone | 8 |
| 8 | Partir o CLAUDE.md (L1) | Dev | 8 |
| 9 | Temporizador com "End of track" (A3) | Ambos | 7 |
| 10 | Segunda fonte de letras (B1) | Ambos | 7 |

---

## A. Reprodução e fila

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| A1 | "Add to queue" entra logo a seguir à atual (depois das outras que puseste), com "Next in queue" separado de "Next from <lista>" | Ambos | Hoje vai para o **fim** da fila (`state/player.ts:1380`): numa playlist de 500, a música que puseste toca daqui a 500 faixas. | 9 |
| A2 | Saltar as partes que não são música (SponsorBlock, categoria `music_offtopic`), ligado por omissão | Ambos | Muitos uploads são videoclipes com intros e skits. A base é comunitária, grátis e sem chave, e o SimpMusic já a usa. | 8 |
| A3 | ◐ Temporizador com "End of track", 90 e 120 min, e um fade de 20 s antes de parar, à mão no "…" do leitor | Ambos | Hoje são 15 a 60 min e só nas Definições; adormecer a meio de uma música é o caso mais comum. **(precisa do teu OK)** | 7 |
| A4 | EQ por aparelho: muda sozinho ao ligar os AirPods, o carro ou uma coluna, com perfis do AutoEq | iPhone | A app já lê o nome da saída de áudio (`lib/interrupcaoDeAudio.ts`). O AutoEq (16k ★, MIT) tem curvas medidas para milhares de auscultadores, e o Spotify não faz nada disto. | 7 |

## B. Letras

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| B1 | Segunda fonte de letras: as do YouTube Music (InnerTube, que a app já usa) quando o lrclib não tem | Ambos | "No lyrics found" com "Try again" na mesma fonte não resolve nada. O Better Lyrics junta 16 fontes por ordem. | 7 |
| B2 | Letras sincronizadas em versões slowed/sped up, pela razão entre as durações | Ambos | Hoje uma versão com outra duração perde o tempo (`api/lyrics.ts`, `timingAvailable`). Numa edição slowed simples, essa razão é o fator de tempo. | 6 |
| B3 | Tradução das letras no próprio aparelho (framework Translation da Apple, iOS 18+) | iPhone | É grátis e não usa a rede depois de descarregar a língua. O Apple Music só a trouxe no iOS 26, e ouve-se muito rap em espanhol e francês. | 6 |
| B4 | Letras em ecrã inteiro | iPhone | Hoje vivem no quadrado da capa, que é pouco para uma letra longa. **(precisa do teu OK)** | 5 |

## C. Descoberta e controlo das recomendações

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| C1 | "New releases": uma prateleira e um ponto nos artistas com lançamento novo | Ambos | É das maiores razões para abrir o Spotify (Release Radar, os feeds de 2025). A app já lê o canal e o "Latest release" de cada artista (`lib/albunsDoArtista.ts`). Verificar os favoritos uma vez por dia, sem usar o Supabase. | 8 |
| C2 | ◐ "Hide song" numa playlist e "Don't play this artist" que valha também nas playlists e no shuffle | Ambos | Já há "Do not suggest this song again" e "Suggest less of this artist", mas só mexem nas sugestões; numa playlist colaborativa, a música que detestas toca na mesma. | 6 |
| C3 | Mistura que muda com a hora do dia, feita do que ouves a essa hora | Ambos | O histórico já está no aparelho (sincronização incremental), por isso não custa pedidos. É o daylist do Spotify, sem IA. | 6 |
| C4 | "Don't use for recommendations" numa playlist | Ambos | O Spotify lançou-o em 2025: uma playlist de festa ou de dormir estraga o Discover. | 5 |
| C5 | Esconder e reordenar as prateleiras da Home | Ambos | Não é redesenhar a Home (isso já recusaste): cada um tira o que não usa. | 4 |

## D. Biblioteca e playlists

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| D1 | Ordenar e procurar nas Playlists (Recents, A–Z, Recently added), e pastas | Ambos | Com dezenas de playlists importadas, uma grelha sem ordem nem pesquisa fica lenta de usar. | 6 |
| D2 | Smart playlists com regras (ex.: "gostadas este mês com menos de 3 escutas") | Ambos | O Spotify não as tem; o Feishin, o Navidrome e o iTunes têm, e os dados já estão no aparelho. | 6 |
| D3 | Capa e descrição próprias numa playlist | Ambos | O Spotify trouxe-o em 2025, e a app já sobe imagens do perfil (`lib/profileMedia.ts`). Usar WebP pequeno (~600 px) por causa do egress. | 5 |
| D4 | Histórico das playlists colaborativas e "Recently removed" durante 30 dias | Ambos | Estava no plano (`docs/plano-proximas-funcionalidades.md` §4) e não entrou. Com várias pessoas a mexer, é a rede de segurança. | 5 |
| D5 | Guardar a ordenação escolhida nas Liked Songs | iPhone | Volta sempre a "Recent", porque é um `useState` (`SongsScreen.tsx:87`). | 3 |

## E. Offline (iPhone)

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| E1 | ◐ "Download" numa playlist e nas Liked Songs, que mantém tudo descarregado (também as novas), só em Wi-Fi | iPhone | Hoje é música a música, e este é o gesto principal do offline no Spotify. A fila de downloads e a proteção já existem (`lib/downloadsExplicitos.ts`). | 9 |
| E2 | Espaço ocupado e livre nos Downloads, com "remover as que não ouves há 60 dias" | iPhone | Sem esse número, não se sabe quando parar de descarregar. | 5 |

## F. PC

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| F1 | Seleção múltipla (Ctrl/Shift+clique, Ctrl+A) e arrastar músicas para as playlists da lateral e para a fila | PC | É assim que se usa uma biblioteca no PC; hoje é um menu por música. | 8 |
| F2 | Painel à direita com a fila e as letras, sem sair da página | PC | Para ver a fila é preciso abrir o Now Playing e perder a página onde se estava. O Spotify tem este painel desde 2023. | 6 |
| F3 | Botões na miniatura da barra de tarefas (anterior, tocar, seguinte) e jump list (Resume, Daily mix, Shuffle Liked Songs) | PC | O Electron dá isto (`setThumbarButtons`, `setUserTasks`), e são os mesmos três atalhos que o ícone do iPhone já tem. | 5 |
| F4 | Roda do rato no volume e na barra de progresso | PC | Pequeno, mas é o reflexo de quem usa rato. | 4 |
| F5 | "Home" em vez de "Search" na lateral (N1 da auditoria) | PC | A mesma página tem outro nome no iPhone. **(precisa do teu OK)** | 4 |
| F6 | O campo de pesquisa diz "or videos" (`BibliotecaPages.web.tsx:139`) | PC | Contraria a regra de não falar do YouTube; o iPhone diz "Songs, artists, playlists…". | 3 |

## G. Leitor do iPhone (precisa do teu OK)

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| G1 | "Playing from Liked Songs" no topo, no lugar do logo | iPhone | O PC já mostra a origem, e é clicável. No iPhone, o sítio mais valioso do ecrã mostra a marca (A3 da auditoria, pendente). | 8 |
| G2 | Botão de aparelhos (Connect) no rodapé, aceso quando outro aparelho está a tocar | iPhone | O Connect é das funções mais fortes da app e está escondido no "…". | 7 |

## H. Consistência e bugs pequenos

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| H1 | O "+" dos resultados da pesquisa abre o menu (`SearchScreen.tsx:921`) | iPhone | Um "+" tem de adicionar: ou guarda nas Liked Songs e passa a ✓, como no Spotify, ou volta a ser "…". | 6 |
| H2 | Barra da seleção diz "Add to Playlist" e "Delete" (`SongsScreen.tsx:430`, `:449`) | iPhone | "Delete" parece que apaga a música, e o certo é "Remove". Faltam também "Select all", "Add to queue" e "Download". | 5 |
| H3 | Logótipo do YouTube no "More results" e no ecrã vazio da pesquisa (`SearchScreen.tsx:839`, `:883`) | iPhone | Contraria a regra de 27/9, e o PC não o faz. O teste só apanha frases, não ícones. | 4 |
| H4 | VoiceOver: os pontos da capa dizem "Ver as letras/Ver a capa" (`PlayerRoot.tsx:1503`), e o "…" das linhas não tem nome (`TrackRow.tsx:246`) | iPhone | A regra é VoiceOver em inglês, com todos os botões a dizer o que são. | 4 |
| H5 | Importar: dois botões no PC (YouTube e Spotify), um só no iPhone (A8 da auditoria) | Ambos | Um "Import" que aceite qualquer link, nos dois. | 4 |
| H6 | O leitor diz "Save to Library" (`PlayerRoot.tsx:1558`, `:1871`) | iPhone | O resto da app diz "Liked Songs". | 3 |

## I. Social

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| I1 | ◐ Blend a sério: a mistura dos dois como playlist que se atualiza todos os dias, com a % de gosto em comum | Ambos | Hoje é uma fila tocada uma vez (`lib/misturaDosDois.ts`). Guardada e renovada todos os dias, dá um motivo para voltar. | 6 |
| I2 | Adicionar um amigo por link ou QR (`duotone://add/<username>`), na folha de nova conversa (não no perfil) | Ambos | Hoje só pela pesquisa do username, e é pelos amigos que a app cresce. | 5 |
| I3 | Reagir com um emoji à música que um amigo está a ouvir (vai para o chat) | Ambos | Os cartões de quem está a ouvir e o chat já existem; ligá-los cria conversa sem escrever. | 5 |

## J. Instalar e manter (iPhone)

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| J1 | Aviso dentro da app quando faltam 2 dias para deixar de abrir | iPhone | A assinatura grátis expira aos 7 dias, e o `embedded.mobileprovision` dentro da app tem a data (`ExpirationDate`): um módulo Swift pequeno lê-a. Hoje só se descobre quando a app já não abre. | 9 |

## K. Medir para provar que é melhor

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| K1 | ◐ No "Time to first sound" do Painel de saúde: separar com e sem cache, e pôr o alvo do Spotify ao lado | Ambos | A mediana e o p90 já lá estão. O Spotify publicou 265 ms de mediana e 1047 ms no p90, e é o "sem cache" que diz se a app compete. | 6 |
| K2 | Uma pergunta na app, ao fim de 2 semanas: "Comparado com o Spotify, o Duotone é…" (1 a 5 e uma frase) | Ambos | "Os amigos sentem que é" passa a ser um número, numa só linha do `app_events`. | 7 |
| K3 | Voltar ao "tocar enquanto descarrega" só se o K1 mostrar que o download é o lento | iPhone | Está desligado por decisão tua ("nunca encrava"), mas, se o p95 sem cache for o download, é o maior ganho que falta. | 6 |

## L. Código e processo

| # | Ideia | Onde | Porquê | Nota |
|---|---|---|---|---|
| L1 | Partir o CLAUDE.md (287 KB, ~70 mil tokens em cada sessão) num índice curto e em `docs/decisoes/*.md` | Dev | Cada sessão começa com uma grande parte do contexto gasta, e as regras importantes perdem-se no meio. | 8 |
| L2 | Dividir os ficheiros enormes: `PlayerRoot.tsx` (2594 linhas), `PlaylistDetailScreen.tsx` (1370), `SearchScreen.tsx` (1247) | Dev | Menos re-renders por acidente e mudanças mais seguras. | 5 |
| L3 | Correr os testes em paralelo (`scripts/correr-testes.mjs` corre 252 scripts um a um, ~3,5 min) | Dev | Com 4 a 6 processos ao mesmo tempo, deve ficar abaixo de 1 minuto. | 5 |
| L4 | Código numa linha só, como se estivesse minificado (`api/lyrics.ts`, `PlaylistPages.web.tsx`, `ImportPage.web.tsx`) | Dev | Fica ilegível nos diffs e nas revisões. | 3 |

## M. O que não recomendo agora

- **Offline no PC**: obrigava a trocar o IFrame pela extração no Windows, e perdia-se o EQ e a estabilidade de hoje.
- **CarPlay, notificações push, widget**: precisam de conta paga de programador ou de App Group (o widget já saiu por isso).
- **DJ com IA, podcasts, Canvas**: são caros e estão longe do que os teus amigos usam.
- **Lossless**: a fonte é o YouTube.
- **Deslizar o mini-player para mudar de faixa**: choca com o deslizar para fechar, que foi decisão tua.

---

## Fontes

- [Metrolist](https://github.com/mostafaalagamy/Metrolist) (13k ★): saltar silêncio, normalização, letras traduzidas, ouvir em conjunto, Last.fm.
- [Spotube](https://github.com/KRTirtho/spotube) (50k ★): letras sincronizadas do LRCLib, Last.fm e ListenBrainz.
- [Harmony Music](https://github.com/anandnet/Harmony-Music): saltar silêncio, temporizador, EQ, rádio, cache enquanto toca.
- [Better Lyrics](https://github.com/better-lyrics/better-lyrics): 16 fontes de letras por ordem, tradução e romanização.
- [Feishin](https://github.com/jeffvli/feishin) (10k ★): editor de smart playlists.
- [AutoEq](https://github.com/jaakkopasanen/AutoEq) (16k ★, MIT): EQ medido por auscultador.
- [SponsorBlock: Non-Music Section](https://wiki.sponsor.ajay.app/w/Music:_Non-Music_Section/Draft) e [SimpMusic](https://simpmusic.org/docs/guide/sponsorblock).
- [Spicetify, extensões](https://spicetify.app/docs/advanced-usage/extensions): Trash Bin (nunca mais tocar uma música ou um artista), Shuffle+ e Full App Display.
- [Spotify, 25 novidades de 2025](https://newsroom.spotify.com/2025-12-29/year-in-features) e [exclusão do perfil de gosto](https://techcrunch.com/2025/10/01/spotify-now-lets-you-exclude-tracks-from-your-taste-profile).
- [Apple Music no iOS 26](https://www.techradar.com/audio/apple-music/apple-music-is-getting-automix-and-music-pins-plus-lyrics-translation-pronunciation-and-your-iphone-can-become-a-mic-in-sing-on-tvos) (tradução de letras, AutoMix, pins) e [TranslationSession](https://developer.apple.com/documentation/translation/translationsession).
- [SideStore](https://github.com/SideStore/SideStore) e [AltStore: criar uma source](https://faq.altstore.io/developers/make-a-source).
- [Kreitz e Niemelä, "Spotify: Large Scale, Low Latency, P2P Music-on-Demand Streaming" (IEEE P2P 2010)](https://www.csc.kth.se/~gkreitz/spotify-p2p10): 265 ms de mediana até começar a tocar.
