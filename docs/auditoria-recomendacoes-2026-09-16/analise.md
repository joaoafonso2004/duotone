# Auditoria das recomendações — Search e Smart Shuffle

16 de setembro de 2026 · código analisado: `01a354e`, branch `windows-version`, versão 3.4.1.

**O feedback é compatível com problemas concretos da implementação.** O motor tem alguma personalização, mas perde contexto, favorece exploração distante e, nas misturas, aceita uma fonte alternativa sem validar afinidade musical. Há também erros de integração que os testes existentes não apanham. Não é possível atribuir cada má recomendação dos amigos a uma causa sem exemplos dessas sessões.

A auditoria inicial não alterou o algoritmo. As correções seguintes são feitas uma a uma, por indicação do utilizador, e registadas abaixo. As experiências usam dados sintéticos e módulos reais, com rede, armazenamento e serviços nativos substituídos. Não foram consultadas contas dos amigos nem o estado de produção do Supabase.

**Estado das correções — 16/09/2026**

| Ponto | Estado |
| --- | --- |
| 1 — Contexto real do Smart Shuffle | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| 2 — Exclusão de artistas conhecidos | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| 3 — Afastamento pelas playlists e peso do contexto | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| 4 — Preenchimento por playlists do YouTube | **Resolvido no código local**, incluindo o alinhamento das âncoras com a página. Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| 5 — Perda do perfil Spotify/sementes | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| 6 — Vantagem da primeira âncora | **Resolvido no código local**: âncoras intercaladas, pontuação e proveniência até à escolha final, e limiar mínimo para inserir. Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| 7 — Aprendizagem com skips e recência | **Resolvido no código local**, incluindo a aprendizagem entre aparelhos e a idade do gosto do Spotify. Regressões, `npm run typecheck` e `npm test` passaram. A função SQL já foi corrida no Supabase (confirmado pelo João a 16/9). Sem publicação de versão. |
| 8 — Resultados atrasados de listas anteriores | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem publicação de versão. |
| Outros — cache de afinidade por conta e paginação | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem SQL. |
| Outros — perfil parcial da biblioteca e pouco catálogo por tentativa | **Resolvido no código local.** Regressões, `npm run typecheck` e `npm test` passaram. Sem SQL. |
| Outros — isolamento do `yt_cache` por conta | **Confirmado em produção** (16/9, verificação do João no SQL Editor). |
| Outros — rádio automático confundido com o Smart Shuffle | Por verificar: é uma nota, não um defeito reproduzido. |

O detalhe abaixo conserva o diagnóstico inicial e identifica as correções dos oito pontos.

**Como funciona atualmente**

O Deezer é usado como catálogo de artistas relacionados e músicas populares. Este código não consulta uma conta Deezer do utilizador nem o seu Flow personalizado. A personalização é construída pela Duotone, antes e depois das consultas públicas ao catálogo.

| Superfície | Dados e percurso |
| --- | --- |
| Search — Discover weekly | Biblioteca inteira (as 60 gostadas mais recentes a peso 1, as restantes a 0,25; antes eram só as primeiras 60); cada artista contribui com as primeiras 5 do seu top 15 que a pessoa ainda não tem nem viu nas semanas anteriores (antes, as 5 de topo); até 20 artistas do histórico, Spotify importado e escolhas iniciais; relações entre artistas nas playlists; sorteia até 4 artistas de partida; consulta artistas relacionados no Deezer; escolhe até 10 artistas; procura os vídeos correspondentes no YouTube; devolve até 30 e guarda a lista da semana. |
| Search — misturas de artista/estilo e rádios | A página pede até 12 artistas; após o alinhamento do ponto 4, o mapa de descobertas parte das primeiras 6 de confiança pela rotação do dia, com três artistas e até 8 faixas por âncora. Após a correção do ponto 5, usa o mesmo perfil de histórico, Spotify e escolhas iniciais que Weekly e Smart Shuffle. Para cada artista com menos de 8 faixas no mapa, pode pesquisar uma playlist no YouTube; após a correção do ponto 4, só acrescenta vídeos cuja afinidade, faixa e duração sejam confirmadas pelo Deezer e pelo resolvedor de identidade. |
| Smart Shuffle | Usa o mesmo `candidatasParaDescoberta`. Após a correção do ponto 1, forma contexto com a faixa atual e as últimas reproduções confirmadas da sessão, até 3 faixas distintas; acrescenta o histórico global e pede até 30 candidatas a partir de 4 âncoras. Após a segunda correção do ponto 6, ordena-as pela proveniência (âncora da música atual primeiro, âncoras alternadas, rondas e pontos) e descarta as que não são da própria âncora nem dos 10 primeiros semelhantes; ao preparar a fila escolhe as primeiras até 3 dessa ordem, nas inserções seguintes a primeira, e sem nenhuma não insere. O intervalo configurado é 4 faixas. |
| Outras prateleiras | Favoritas dos amigos são sociais; Rare finds tem o percurso próprio de músicas não lançadas; géneros/décadas reorganizam a biblioteca. Não devem ser avaliadas como se fossem o mesmo recomendador do Deezer. O Daily flow do Windows mistura favoritas com a descoberta acima. |

Referências: [Search/loja](C:/Users/Utilizador/Desktop/duotone-main/src/state/recomendacoes.ts:261), [descoberta](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:411), [catálogo Deezer](C:/Users/Utilizador/Desktop/duotone-main/src/api/catalogo.ts:175), [Smart Shuffle](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1545).

**1. RESOLVIDO NO CÓDIGO — contexto real do Smart Shuffle.**

Na versão auditada, ambos os caminhos de inserção usavam `radioSeeds(queue, queueIndex)`, que devolve uma fatia da fila original, invertida. Não recebe `shuffleOrder` nem um histórico real das últimas faixas.

Experiência: fila original `A,B,C,D,E,F`; percurso ouvido `B → F → D`. A função devolve `D,C,B`, embora `C` não tenha sido ouvida e `F` tenha. Numa lista variada, a sugestão parte do contexto errado.

A correção guarda em memória até três faixas distintas com reprodução confirmada pelo motor, pela ordem em que tocaram. `semearSugestoes` e `intercalarSugestao` usam a atual mais esse histórico. Ao começar, a faixa escolhida é a única semente disponível; nunca se inventam faixas anteriores pela posição na fila. Faixas saltadas antes de arrancar não entram na memória, e pausar/retomar não duplica a faixa.

A memória é limitada à lista/sessão e conta atuais, recomeça em lista nova, handoff, restauro ou fecho do leitor e não é persistida. Reordenar a fila e fazer saltos manuais dentro dela preserva o percurso realmente ouvido. As contagens de gosto e os limiares de escuta existentes não foram alterados.

Validação antes/depois: seis regressões na store falharam antes da alteração e passaram depois. Cobrem os dois caminhos de inserção, reordenação, salto sem som, pausa/retoma, lista nova e handoff. Foram ainda acrescentadas verificações de troca de conta e limpeza ao fechar. O script desta auditoria também confirma que os dois caminhos recebem `D,F,B`. A proteção contra a chegada tardia de uma recomendação foi corrigida depois, no ponto 8.

Referências: [contexto corrigido](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:613), [primeiras inserções](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1567), [inserções seguintes](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1662), [regressões integradas](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-player-store.ts:266). O `radioSeeds` continua a existir no percurso separado do rádio automático; esta alteração ficou limitada ao Smart Shuffle.

**2. RESOLVIDO NO CÓDIGO — permitir faixas novas de artistas conhecidos.**

Na versão auditada, `faixasParaProcurar` excluía todos os artistas das âncoras e do contexto. Assim, uma música desconhecida de um artista de que a pessoa gosta nem chegava a ser candidata. O filtro atuava sobre o artista, além das exclusões posteriores por faixa.

Experiência antes da correção: artista presente no contexto com afinidade 100, devolvido como relacionado pelo catálogo; o seu top nem era consultado. A regressão integrada confirmou o mesmo no percurso completo: a própria âncora não chegava a `topDoArtista`.

A correção põe o artista confirmado da âncora ao lado dos semelhantes do Deezer. Deixou de excluir nomes conhecidos na seleção do catálogo e no top de cada artista. A novidade passa a ser decidida depois pela faixa concreta: fila, biblioteca, sugestões anteriores, preferências, duplicados e validação do vídeo continuam no mesmo lugar. Assim, o Smart Shuffle pode sugerir outra música do artista atual sem voltar a sugerir a que já está a tocar.

O fallback de playlists corrigido no ponto 4 segue a mesma decisão: aceita a própria âncora ou um semelhante, mas só quando o catálogo e o `pickBest` confirmam a faixa e a versão. Não voltou a aceitar vídeos apenas pelo nome do artista.

Validação antes/depois: o teste integrado falhou primeiro porque o catálogo da âncora não era consultado. Depois passou com uma faixa nova de `Aurora Azul` e uma de `Banda Próxima`, mantendo fora a faixa atual, uma guardada e outra já sugerida. O script reproduzível foi invertido para exigir que o artista conhecido chegue às candidatas.

Referências: [seleção por faixa](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:174), [regressão integrada](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-api-regressions.mjs:604), [reprodução da auditoria](C:/Users/Utilizador/Desktop/duotone-main/docs/auditoria-recomendacoes-2026-09-16/reproduzir.cjs:70).

**3. RESOLVIDO NO CÓDIGO — limitar o afastamento pelas playlists e dar prioridade ao contexto da sessão.**

Todos os artistas de uma mesma playlist ficam ligados entre si, desde que a lista tenha entre 2 e 60 artistas distintos. Não há validação de género, idioma ou coerência da playlist. O peso por ligação desce com o tamanho, mas existem cada vez mais ligações.

O sorteio favorece estes vizinhos; os artistas do próprio contexto entram com metade do seu peso. Depois, a descoberta consulta os relacionados do Deezer **do vizinho sorteado**, podendo dar dois passos de afastamento: artista ouvido → artista da playlist → relacionado no Deezer.

Experiência antes da correção: um artista no contexto e uma playlist com 60 artistas distintos. A probabilidade de a primeira âncora ser um dos outros 59 era **95,2%**. Isto não demonstrava que todos esses artistas fossem incompatíveis; demonstrava que a simples presença conjunta dominava o artista em reprodução.

A correção tem duas proteções. No sorteio geral, o peso agregado de todos os vizinhos de playlists fica limitado a metade do peso do retrato. No mesmo cenário sintético, a probabilidade agregada dos 59 vizinhos desceu para **33,3%**, pelo que o contexto conserva pelo menos dois terços do peso inicial.

No Smart Shuffle e na fila automática de uma sessão partilhada, a proteção é mais forte: apenas os artistas do contexto realmente ouvido fornecem âncoras. O perfil global, as escolhas importadas e a coocorrência nas playlists continuam no mapa de afinidade, onde reordenam os semelhantes devolvidos pelo Deezer. Assim ajudam sem trocar o ambiente atual por outro artista nem provocar o segundo salto `contexto → playlist → relacionados do vizinho`. A Search conserva o perfil global como fonte de âncoras e mantém alguma exploração por playlists, já com o limite agregado.

Validação antes/depois: a regressão pura falhou primeiro com 95,2% e passou com 33,3%. A integração falhou porque `Horizonte Global`, com peso 100 no perfil, era consultado como âncora ao lado de `Aurora Atual`; depois da correção só `Aurora Atual` é consultada como âncora e `Horizonte Global` continua a ser o primeiro semelhante consultado graças à afinidade. A store confirma que ambos os caminhos do Smart Shuffle marcam a descoberta como contexto de sessão.

Referências: [limite agregado](C:/Users/Utilizador/Desktop/duotone-main/src/lib/afinidade.ts:115), [separação entre âncoras e apoio](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:503), [Smart Shuffle](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1598), [regressão pura](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-afinidade.ts:100), [regressão integrada](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-api-regressions.mjs:672).

**4. RESOLVIDO NO CÓDIGO — validar o preenchimento das misturas pelo YouTube.**

Na versão auditada, `taparBuracosComOYouTube` pesquisava `"<artista> playlist"`, pedia um resultado e aproveitava os vídeos dessa playlist. Filtrava títulos que pareciam não ser música e preferências explícitas, mas não confirmava relação com o artista ou o gosto da pessoa. Definia a duração como `null`, pelo que o filtro de duração também não conseguia rejeitar vídeos longos sem sinais no título. Não passava pelo mesmo `pickBest` da descoberta normal.

Experiência antes da correção: a pesquisa de um artista devolve uma playlist com uma valsa de outro artista, sem qualquer ligação fornecida; a música era aceite sob a âncora pesquisada. A regressão acrescentada falhou ainda com uma versão ao vivo a entrar ao lado da gravação pretendida.

A correção usa a playlist apenas como conjunto de vídeos candidatos. Primeiro, a vizinhança do Deezer restringe os artistas à âncora e aos seus semelhantes. Depois, o top desse artista fornece título e duração concretos, e o mesmo `pickBest` da descoberta normal confirma que o vídeo é essa gravação. Uma versão ao vivo não substitui a versão de estúdio. A faixa entra com o artista e a duração do catálogo; continua sujeita aos filtros de música, preferências e duplicados.

Quando nenhuma candidata passa todas as provas, o mapa não é preenchido: as misturas continuam a aceitar as faixas válidas que já tinham e saem mais curtas. Após a correção do ponto 2, uma faixa nova da própria âncora também pode preencher a mistura, sujeita às mesmas provas.

Alinhamento das âncoras (segunda correção). `descobertasPorAncora` sorteava até 6 âncoras do perfil e das playlists, e a página pedia outros 12 artistas: metade das misturas ficava sem vizinhos e ia à pesquisa de playlists, que custa 100 unidades da Data API cada. Agora a página calcula a rotação do dia uma vez e passa esses artistas, pela mesma ordem que `misturasDaBiblioteca` usa. As âncoras passam pelo mesmo crivo de confiança (sai o `999`) e ficam limitadas ao número de misturas (6). Cada âncora recebe a própria e dois semelhantes (`ARTISTAS_POR_ANCORA`), e a resolução deixa de pesquisar para uma âncora que já tem 8 faixas (`VIZINHAS_QUE_CHEGAM`). O custo total fica perto das ~50 pesquisas anteriores. A função devolve também as âncoras aceites, e o remendo do YouTube só corre para essas e só quando ficaram curtas. As rádios escolhem entre as mesmas âncoras porque só aceitam artistas com vizinhos. A troca aceite: uma mistura do 7.º artista em diante, que só aparece quando uma das 6 primeiras não tem material, sai só com a biblioteca.

Validação do alinhamento: regressões em `test-api-regressions.mjs` para a ordem das âncoras pedidas, o crivo, o limite de misturas, os três artistas por âncora e a paragem nas 8 faixas (8 pesquisas para 8 faixas, em vez de 15). A experiência 6 do `reproduzir.cjs` documentava 12 artistas pedidos e 6 sem cobertura; agora exige que as 6 âncoras sejam as primeiras da página e que o remendo só lhes possa acudir a elas.

Validação antes/depois: o teste integrado falhou antes com três entradas (`fora-do-gosto`, `versao-errada`, `validada`) e passou depois apenas com `validada`, duração `203`. Um segundo caso confirma que uma playlist sem candidatas válidas conserva a mistura mais curta. O script da auditoria foi invertido para exigir o comportamento corrigido.

Referências: [12 candidatos](C:/Users/Utilizador/Desktop/duotone-main/src/lib/misturas.ts:35), [âncoras da página](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:752), [chamada da página](C:/Users/Utilizador/Desktop/duotone-main/src/state/recomendacoes.ts:271), [fallback validado](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:819), [regressão do alinhamento](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-api-regressions.mjs:991).

**5. RESOLVIDO NO CÓDIGO — preservar o perfil Spotify e as escolhas iniciais.**

Na versão auditada, `artistasParaRecomendacoes` já identificava artistas externos confirmados pelo Spotify ou pelas escolhas iniciais. O Discover weekly passava esses nomes e a sua proveniência para a descoberta. O Smart Shuffle convertia tudo num mapa de contagens e perdia `externo` e o nome original.

Mais à frente, havendo nomes fiáveis no contexto/playlists, o crivo de confiança eliminava artistas externos que não aparecessem nessas fontes. Experiência: um artista externo com peso 100 desaparecia sem `externos`; o mesmo artista passava quando a proveniência era preservada. A variante `descobertasPorAncora` usava apenas `getTopArtists`, sem o mesmo agregador do perfil.

A correção introduz `lerPerfilDeRecomendacoes`, usado por Weekly, misturas por âncora e ambos os caminhos do Smart Shuffle. Devolve juntos os pesos por identidade canónica e os nomes externos confirmados. As misturas passam a incluir o Spotify e as escolhas iniciais através do mesmo agregador. Uma falha de leitura permite continuar pelo contexto, sem reutilizar o perfil de outra leitura.

O crivo de nomes extraídos do YouTube permanece intacto. Apenas a origem externa já confirmada dispensa esse crivo; um nome suspeito com muitas reproduções continua sujeito à validação. Os pesos de Spotify/sementes, a regra de completar o histórico e a ausência de decaimento por recência não foram alterados: a recência continua no ponto 7.

Validação antes/depois: quatro verificações falharam no Smart Shuffle por perderem nome/confiança do Spotify e da escolha inicial; o teste integrado das misturas falhou porque o artista do Spotify nunca chegava ao catálogo. Depois da correção passaram. Os testes exercitam o agregador real de histórico + Spotify + sementes, o crivo real e a resolução até ao mapa de faixas. Cobrem também uma conta nova sem biblioteca/histórico, a rejeição de `999` sem origem externa e a falha de leitura do perfil.

Validação final do ponto 5: `npm run typecheck`, `npm test` completo e `node docs/auditoria-recomendacoes-2026-09-16/reproduzir.cjs` passaram. O trabalho parou nesse ponto até à indicação seguinte do utilizador, que autorizou depois o ponto 8.

Referências: [perfil comum](C:/Users/Utilizador/Desktop/duotone-main/src/api/perfilDeRecomendacoes.ts:13), [perfil agregado](C:/Users/Utilizador/Desktop/duotone-main/src/api/plays.ts:271), [Smart Shuffle](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1553), [misturas](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:648), [regressões do player](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-player-store.ts:325), [regressões da descoberta](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-api-regressions.mjs:534).

**6. RESOLVIDO NO CÓDIGO — intercalar as âncoras, levar a pontuação até à escolha e exigir um mínimo de confiança.**

Há quotas por âncora, mas os artistas escolhidos são concatenados pela ordem das âncoras. A intercalação posterior é por artista, não entre âncoras. A ordem inicial das âncoras vem de um sorteio ponderado.

Experiência antes da correção: duas âncoras com igual peso e material suficiente. Cada uma recebia cinco artistas, mas as três primeiras candidatas pertenciam todas à primeira âncora. O Smart Shuffle inicial escolhe precisamente as primeiras até três elegíveis; a inserção seguinte escolhe a primeira.

A correção ordena primeiro os artistas dentro de cada âncora, como antes, e depois retira um artista de cada lista por ronda. Só volta à primeira âncora depois de dar lugar às restantes. As quotas proporcionais calculadas por `repartir` permanecem iguais, tal como a exclusão global de artistas repetidos e a ordem das faixas populares de cada artista.

Com duas âncoras de igual peso, a sequência inicial mudou de `A,A,A` para `A,B,A`; por isso as três sugestões iniciais já incluem os dois lados do contexto. Quando uma âncora tem uma quota maior, recebe mais lugares no total, mas deixou de ocupar o início inteiro só por ter sido sorteada primeiro.

O score continua a ser `posição na lista Deezer + afinidade normalizada`. Não há score de faixa por género, idioma, energia ou recência; essa limitação não é necessária para corrigir a vantagem estrutural da primeira âncora e fica ligada à aprendizagem do ponto 7.

Validação antes/depois: a integração falhou primeiro porque as três candidatas iniciais tinham a mesma proveniência. Depois da montagem por rondas, as primeiras três incluem ambas as âncoras. O script reproduzível exige agora `A,B,A`, em vez de documentar `A,A,A` como defeito.

Segunda correção — pontuação até à escolha e mínimo de confiança. O `ordenarPorGosto` calculava os pontos (posição no Deezer + gosto) mas devolvia só os artistas, e o Smart Shuffle metia as primeiras candidatas que serviam, sem mínimo nenhum. Agora `pontuarPorGosto` devolve as parcelas, e cada faixa desejada leva uma proveniência (`lib/escolhaDaSugestao.ts`): a âncora que a trouxe, se é da própria âncora, a posição na lista do Deezer, os pontos e a ronda (a posição no top do artista). `candidatasParaDescoberta` entrega-a ao leitor por parâmetro, pela `trackKey`.

No leitor, `ordenarParaInserir` decide a ordem nos dois caminhos (`semearSugestoes` e `intercalarSugestao`):

- **Mínimo de confiança:** só entram faixas da própria âncora ou dos dez primeiros semelhantes do Deezer (`POSICAO_MAXIMA_NO_CATALOGO`, decisão do João a 16/9). Uma candidata sem proveniência também fica de fora. Se nenhuma passar, a fila fica só com a lista.
- **Contexto:** a âncora da música que está a tocar vem primeiro, depois as das últimas ouvidas.
- **Diversidade:** as âncoras continuam a alternar.
- **Dentro de cada âncora:** uma faixa por artista antes da segunda, e em cada ronda o artista com mais pontos primeiro. Ordenar só por pontos punha o melhor artista a dar as cinco sugestões seguintes.
- **Preferências explícitas:** o `filterSuggestions` corre por cima e continua a mandar.
- **Analítica:** o `recomendacao_mostrada` passou a levar a origem (`propria`/`semelhante`) e os pontos em intervalos (`baixo`/`medio`/`alto`), sem conteúdo pessoal.

Validação da segunda correção: `scripts/test-escolha-da-sugestao.ts` (mínimo, lista vazia, contexto primeiro, alternância, rondas e pontos). Em `test-player-store.ts`, um semelhante na 15.ª posição não entra por nenhum dos dois caminhos, e a sugestão da âncora que está a tocar entra antes de uma com mais pontos; estes casos falharam com a escolha antiga (quatro falhas) e passam agora. Em `test-api-regressions.mjs`, a descoberta real entrega a proveniência de cada sugestão (âncora, própria na posição 0, semelhantes com posição, rondas 0 a 4).

Referências: [escolha](C:/Users/Utilizador/Desktop/duotone-main/src/lib/escolhaDaSugestao.ts:58), [no leitor](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:662), [proveniência na descoberta](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:213), [regressões do leitor](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-player-store.ts:307), [seleção intercalada](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:225), [regressão integrada](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-api-regressions.mjs:733), [reprodução da auditoria](C:/Users/Utilizador/Desktop/duotone-main/docs/auditoria-recomendacoes-2026-09-16/reproduzir.cjs:70), [primeiras três](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1616), [primeira elegível](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1712).

**7. RESOLVIDO NO CÓDIGO — os skips corrigem o gosto aprendido e o histórico distingue passado de presente.**

Saltar uma recomendação gera `recomendacao_saltada`, com posição e indicação de salto antes dos 30 segundos. Não encontrei um leitor desses eventos a atualizar o perfil ou a pontuação das candidatas. Existe resposta a feedback **explícito**: ocultar uma faixa, reduzir um artista a 0,25 do peso ou aumentar para 2,5. Não é correto dizer que não existe personalização; falta o ciclo de aprendizagem com rejeições durante a escuta.

A função SQL `get_top_artists` presente no repositório soma reproduções de todo o histórico, sem janela ou decaimento temporal. As contagens positivas podem mudar o perfil, mas saltar repetidamente uma família de recomendações não a penaliza. O snapshot importado do Spotify também não perde peso por idade no agregador analisado.

Proposta: combinar sinais explícitos com escutas concluídas e rejeições repetidas. Não tratar um skip isolado ou uma falha de reprodução como aversão musical. Distinguir gosto recente, gosto de longo prazo e contexto da sessão. A definição SQL efetivamente instalada em produção não foi consultada nesta auditoria.

Correção — rejeições implícitas. O `recomendacao_saltada` continua anónimo; a aprendizagem vive à parte, no estado privado da conta (`recommendation-learning:v2:<user-id>` no AsyncStorage e `recomendacoes:aprendizagem:v2` no `yt_cache` da conta). Um skip só ensina alguma coisa se a faixa era uma recomendação, se houve primeiro som confirmado, se o gesto foi manual e se aconteceu antes dos 30 s. Falhas, fins automáticos e faixas que não foram recomendadas ficam de fora. Um skip isolado não chega, nem repetir o mesmo upload: só três músicas distintas do mesmo artista, dentro de 30 dias, reduzem esse artista para metade do peso (a redução explícita continua a ser 0,25 e ganha sempre ao que foi inferido). As candidatas desse artista passam para trás das normais, sem desaparecer. Uma recomendação desse artista ouvida até ao limiar de escuta retira a rejeição mais antiga.

Correção — recência. `get_top_artists` continua a somar todo o histórico, mas cada escuta dos últimos 30 dias vale 4, dos 150 dias seguintes 2, e as mais antigas 1. Duas escutas recentes (8) ultrapassam cinco com dois anos (5), e o artista antigo continua no perfil. O `play_count` passa a ser um peso: só é usado para ordenar os Artists e para as recomendações, não é mostrado como número de escutas em lado nenhum. A migração é o próprio `supabase/top-artists.sql` (mesma assinatura, `create or replace`), a correr à mão.

Correção — entre aparelhos. A aprendizagem viaja pela conta (`yt_cache`, uma linha por pessoa com RLS), como a memória de 30 dias do Smart Shuffle: envio em fila, sempre a juntar com o que está na conta antes de escrever, leitura ao carregar e no máximo de 10 em 10 minutos a cada descoberta, e sem rede fica no aparelho e segue no envio seguinte. Para isto o modelo mudou de rejeições para **eventos** (saltos e escutas). Com rejeições, a junção por união ressuscitava a rejeição que uma escuta tinha apagado no outro aparelho: reproduzido com o modelo anterior (PC 1,0 depois da escuta, iPhone de volta a 0,5 depois de juntar). Com eventos, o peso sai de os repassar por ordem e é o mesmo em qualquer aparelho e em qualquer ordem de junção. Uma escuta só fica registada quando há uma rejeição para perdoar, para não encher a lista. Os eventos guardam-se 60 dias (o dobro da janela), com teto de 400.

Correção — idade do gosto do Spotify. `envelhecerGosto` aplica o peso pela idade da leitura: inteiro durante 30 dias, depois metade a cada 90 dias, com mínimo de um quarto e de uma escuta por artista (continua a ser `externo` e a dispensar o crivo dos títulos). Um gosto lido há um ano passa de 20 para cerca de 5 escutas, e o que se ouve agora passa-lhe à frente mais cedo. O valor guardado não muda; atualizar continua a ser importar outra vez.

Validação: `test-preferencias.ts` (junção nos dois sentidos, escuta anterior a um skip, escutas sem nada para perdoar, prazo), `test-personalization-offline.mjs` (dois aparelhos reais com a mesma conta, sem rede, outra conta; falhou com o envio desligado) e `test-gosto-do-spotify.ts` (idade e ultrapassagem).

Validação antes/depois: a prova SQL em PGlite falhou antes da mudança (o antigo ficava à frente) e passou depois. As regressões puras cobrem skip isolado, upload repetido, três músicas distintas, alívio por escuta e expiração; as da store cobrem som confirmado, gesto manual, 30 s, faixa não recomendada e o sinal positivo no limiar.

Referências: [aprendizagem](C:/Users/Utilizador/Desktop/duotone-main/src/lib/aprendizagemDeRecomendacoes.ts:1), [estado da conta](C:/Users/Utilizador/Desktop/duotone-main/src/state/recommendationFeedback.ts:139), [idade do gosto](C:/Users/Utilizador/Desktop/duotone-main/src/lib/gostoDoSpotify.ts:68), [prova SQL](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-top-artists-recency.mjs:1), [registo de skip](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:134), [eventos](C:/Users/Utilizador/Desktop/duotone-main/src/lib/eventos.ts:64), [feedback explícito](C:/Users/Utilizador/Desktop/duotone-main/src/lib/recommendationFeedback.ts:43), [histórico SQL](C:/Users/Utilizador/Desktop/duotone-main/supabase/top-artists.sql:6).

**8. RESOLVIDO NO CÓDIGO — descartar resultados de listas anteriores.**

Na versão auditada, `semearSugestoes` verificava se a referência da fila mudara enquanto esperava. `intercalarSugestao` verificava a conta, conectividade e modo, mas não a identidade da sessão/lista. Reutilizava a fila atual para inserir uma sugestão calculada com a fila anterior. Uma simples comparação de referências também rejeitava resultados válidos após avançar ou reordenar na mesma lista.

Experiência com a store real: iniciar uma descoberta na lista calma, manter a resposta pendente, mudar para outra lista com `playTrack` e libertar a resposta. Antes da correção a sugestão da lista calma entrava na nova lista; agora o pedido devolve `false` e a fila nova fica intacta.

A correção atribui geração e conta aos pedidos dos dois caminhos do Smart Shuffle. Uma lista nova invalida os pedidos no gesto e quando é instalada, cobrindo também a espera pela resolução da fonte. Handoff, fecho, esvaziar a fila, restauro e desligar o shuffle invalidam igualmente. Avançar e reordenar dentro da mesma lista conservam a geração e aceitam sugestões válidas, sem interromper a reprodução.

A validade é verificada depois de carregar o perfil/histórico e depois da descoberta. A lista nova pode iniciar a sua procura imediatamente; quando o pedido antigo termina, só pode libertar o seu próprio registo, não o pedido novo. As inserções voltam a verificar a fila atual e as identidades acrescentadas entretanto, para não duplicar músicas.

O temporizador de 2 segundos do `next` também pertence à sessão que o criou. Um timer antigo não inicia descoberta na lista nova, e uma conclusão tardia não põe a zero o contador dessa lista. As chamadas de rede já iniciadas podem terminar; os seus resultados são descartados. Não se alteraram o download nem a seleção musical.

Validação antes/depois: 25 verificações falharam antes da correção. As regressões com promessas suspensas passaram depois, cobrindo lista nova, handoff, fechar/reabrir, desligar/religar shuffle, avanço/reordenação na mesma lista, dois pedidos de sessões diferentes e timers antigos. Acrescentaram-se casos para mudança de lista durante a resolução da fonte e outra cópia da mesma música acrescentada enquanto a descoberta esperava. O script de auditoria passou a exigir o descarte do resultado antigo.

Validação final do ponto 8: `npm run typecheck`, `npm test` completo e o script da auditoria passaram. Nesse momento estavam resolvidos localmente os pontos 1, 5 e 8; o ponto 4 foi corrigido na etapa seguinte descrita acima.

Referências: [gerações e validade](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:604), [timer do next](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1282), [preparação](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1581), [inserção](C:/Users/Utilizador/Desktop/duotone-main/src/state/player.ts:1676), [regressões](C:/Users/Utilizador/Desktop/duotone-main/scripts/test-player-store.ts:348).

**Outros problemas confirmados ou limitações a verificar**

- **Cache de afinidade sem utilizador:** vale 30 minutos e é devolvida antes de ler a conta atual. `esquecerAfinidade` existe, mas a pesquisa no repositório não encontrou chamadas. Trocar de A para B no teste devolve os pares de A. Corrigir isolamento e invalidar quando se alteram playlists. Isto não explica por si só resultados de amigos em aparelhos separados. [Fonte](C:/Users/Utilizador/Desktop/duotone-main/src/api/afinidade.ts:33). **RESOLVIDO NO CÓDIGO:** a cache guarda a conta (lida da sessão local, sem ida à rede) e só serve essa conta. `esquecerAfinidade` é chamada pelas mutações de `api/playlists.ts` (adicionar/tirar faixas, lotes e importações, apagar, guardar/tirar cópia), pela folha de adicionar a playlist (que passou a remover pela API) e pela junção/desfazer do Library check. Uma geração impede que uma leitura anterior à mudança fique guardada. Regressão em `scripts/test-api-regressions.mjs` (falhava antes, passa depois); a experiência 8 do `reproduzir.cjs` exige agora a correção.
- **Consulta de afinidade sem paginação:** pode ler apenas a primeira página de `playlist_tracks`, ao contrário de outras leituras já paginadas na app. O limite efetivo do servidor não foi verificado. [Fonte](C:/Users/Utilizador/Desktop/duotone-main/src/api/afinidade.ts:39). **RESOLVIDO NO CÓDIGO:** páginas de 1000 com ordem estável (`playlist_id`, `track_id`) e teto de 20 páginas; o teste lê 1001 linhas em duas páginas.
- **Perfil parcial da biblioteca:** as primeiras 60 faixas são uma amostra dependente da ordem de inserção; os likes entram primeiro. Playlists entram também pelo mapa de afinidade, mas favoritos antigos fora dos 60 não têm essa garantia se não estiverem em playlists. [Biblioteca](C:/Users/Utilizador/Desktop/duotone-main/src/api/library.ts:171), [corte](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:425). **RESOLVIDO NO CÓDIGO:** a descoberta (Weekly, Daily flow e misturas) recebe a biblioteca inteira. `retratoDoContexto` conta as 60 primeiras (as gostadas mais recentes) a peso 1 e as restantes a 0,25 (`PESO_DAS_ANTIGAS`): um favorito antigo volta ao retrato, e duas recentes continuam a pesar mais do que quatro antigas. A confiança nos nomes lê sempre a biblioteca inteira, também no Smart Shuffle (pela cache partilhada `lerFaixas(getLibrary)`). Antes, um artista só das gostadas, fora das playlists e com um canal não oficial nunca passava o crivo, e a música que estava a tocar deixava de servir de âncora. Regressões em `test-afinidade.ts` e `test-api-regressions.mjs`; falharam com o código anterior.
- **Pouco catálogo por tentativa:** até 10 artistas × 5 músicas antes das exclusões. A memória do Smart Shuffle evita repetir durante 30 dias, mas procurar sempre os tops reduz o universo útil. O Deezer fica em cache até 30 dias; a weekly conserva a lista da semana salvo refresh. Uma escolha pouco adequada pode persistir visualmente. [Top](C:/Users/Utilizador/Desktop/duotone-main/src/api/catalogo.ts:256), [weekly](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:380). **RESOLVIDO NO CÓDIGO:** o top de cada artista é lido até 15 faixas (`TOP_DO_CATALOGO`), e das que a pessoa ainda não tem nem recebeu procuram-se as 5 primeiras. O salto é feito ANTES da pesquisa no YouTube, pelas chaves da música (`chavesDoCatalogo`): contra a biblioteca inteira, contra a memória de 30 dias do Smart Shuffle e contra as semanas anteriores do Weekly. O Weekly passou a guardar também as chaves da música (teto de 200 por semana), por isso a semana seguinte desce no top em vez de gastar pesquisas nas mesmas faixas e depois as deitar fora. O número de pesquisas por artista não aumenta. As chaves da biblioteca são calculadas uma vez por lista (`chavesDeTodas`), partilhadas com o leitor. Regressão em `test-api-regressions.mjs`: 5 pesquisas no Smart Shuffle começam no Tema 6 (0–4 guardados, 5 já recebido), a primeira semana procura 5–9 e a seguinte 10–14. Com o código anterior procurava 0–4.
- **O rádio automático é outro caminho:** `api/radio.ts`, quando a fila termina, ainda consulta `getFlowMix`. Não atribuir esse percurso ao Smart Shuffle: ambos podem surgir numa mesma sessão e ser confundidos no feedback. O Daily flow da Search já usa a descoberta local. [Rádio](C:/Users/Utilizador/Desktop/duotone-main/src/api/radio.ts), [Daily flow](C:/Users/Utilizador/Desktop/duotone-main/src/api/descoberta.ts:457).
- **Isolamento do cache remoto depende da migração:** `security-hardening.sql` define RLS por utilizador para `yt_cache`; o schema inicial tinha cache global. Não confirmei qual está instalado e não concluo que as recomendações remotas estejam a ser partilhadas entre contas. O erro reproduzido acima é a cache de afinidade em memória. [Migração](C:/Users/Utilizador/Desktop/duotone-main/supabase/security-hardening.sql:53). ✅ **CONFIRMADO (16/09/2026):** a migração está instalada em produção. O João correu a verificação no SQL Editor: `yt_cache` tem `user_id`, RLS ligado, chave primária `(user_id, cache_key)` e políticas de leitura, inserção e atualização com `auth.uid() = user_id`. A cache remota não é partilhada entre contas.

**O que manter**

A resolução normal de uma faixa concreta através de título, artista e duração, os filtros de vídeos que não são música, a identificação de artistas e a memória de duplicados têm valor. Os problemas encontrados não exigem mexer no download, PO Token, Smart Cache, token VISIONOS ou cascata de reprodução. A mudança principal deve ocorrer antes de escolher a faixa a reproduzir.

**Ordem recomendada de trabalho**

1. Contexto real, respostas atrasadas, proveniência Spotify/sementes e cache de afinidade por conta estão corrigidos.
2. O preenchimento por playlists já valida afinidade e identidade, e as âncoras das misturas são as da página.
3. O afastamento por playlists, a prioridade do contexto da sessão, a diversidade inicial das âncoras, a aprendizagem gradual com skips e a recência estão corrigidos. Falta levar a aprendizagem entre aparelhos. Medir resultados antes de prometer melhoria geral: skips precoces, escutas substanciais e guardados por superfície, origem da candidata e versão do algoritmo. Conservar a regra de analytics sem conteúdo pessoal; score em intervalos e tipo de origem bastam para grande parte do diagnóstico.

**Validação efetuada**

Executar `node docs/auditoria-recomendacoes-2026-09-16/reproduzir.cjs` confirma agora as correções do contexto, novidade por faixa, peso das playlists, perfil, diversidade das âncoras, preenchimento da Search, resultados atrasados e cache de afinidade por conta, e as âncoras das misturas alinhadas com a página. Já não há experiências a documentar defeitos. A numeração das nove experiências do script é independente dos oito pontos deste relatório. As asserções dos pontos pendentes documentam o estado defeituoso: deverão ser invertidas/adaptadas à medida que forem corrigidos. As regressões dos oito pontos estão também na suite habitual, em `scripts/test-afinidade.ts`, `scripts/test-player-store.ts`, `scripts/test-api-regressions.mjs`, `scripts/test-preferencias.ts`, `scripts/test-personalization-offline.mjs` e `scripts/test-top-artists-recency.mjs`.

Na auditoria inicial passaram as suites existentes `test-afinidade.ts`, `test-catalogo.ts`, `test-alvos.ts`, `test-smart-shuffle.ts` e `test-player-store.ts`. Na correção do ponto 1 passaram `npm run typecheck`, a suite completa `npm test` (incluindo as oito novas verificações na store) e o script de auditoria atualizado. As seis regressões centrais foram executadas antes da correção e falharam com o contexto incorreto; depois passaram. Os outros dois casos verificam o isolamento por conta e a limpeza ao fechar.

Na correção do ponto 4, a regressão integrada falhou primeiro ao aceitar uma faixa sem afinidade e uma versão errada. Depois da validação por vizinhança, catálogo e `pickBest`, passaram `npm run typecheck`, `npm test` completo, `test-api-regressions.mjs` e o script reproduzível da auditoria.

Na correção do ponto 2, a regressão integrada falhou primeiro porque o top do artista conhecido não era consultado. Depois da mudança para novidade por faixa, passaram `npm run typecheck`, `npm test` completo, `test-api-regressions.mjs` e o script reproduzível da auditoria.

Na correção do ponto 3, a regressão da afinidade falhou primeiro com 95,2% do peso entregue ao conjunto de vizinhos e a integração mostrou o perfil global a substituir o contexto como âncora. Depois do limite agregado e da separação do modo de sessão, passaram os testes focados, `npm run typecheck`, `npm test` completo e o script reproduzível da auditoria.

Na correção do ponto 6, a regressão integrada falhou primeiro porque as três candidatas iniciais vinham da primeira âncora. Depois de intercalar a seleção por rondas passou, mantendo quotas, deduplicação e ordem dentro de cada âncora. Passaram também `npm run typecheck`, `npm test` completo e o script reproduzível da auditoria.

Uma lacuna específica: o teste da store que aceita outra música do mesmo artista substitui o motor de descoberta por um duplo. Por isso passa mesmo quando o motor real exclui esse artista. O teste puro de ordenação compara duas listas em conjunto, mas a integração ordena cada lista separadamente e concatena os resultados. É necessário testar o percurso integrado, além das funções isoladas.

Para validar satisfação, será necessário um pequeno conjunto de exemplos reais consentidos: música/contexto anterior, recomendação recebida e superfície onde apareceu. As reproduções desta auditoria demonstram erros e escolhas arriscadas; não medem ainda a sua frequência nem o gosto de cada amigo.
