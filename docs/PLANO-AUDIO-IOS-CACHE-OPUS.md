# Duotone — plano de implementação: arranque, downloads e Opus no iPhone

Data: 22/09/2026. Base analisada: `joaoafonso2004/duotone`, branch `windows-version`, commit `27a3637`, incluindo o estado local de trabalho. Este documento é um plano; não implementa alterações nem afirma validação no aparelho.

## Estado a 23/09/2026 (ramo `plano-audio`)

- **Antes de tudo:** a lista de testes saiu do `package.json` para `scripts/correr-testes.mjs` — o `npm test` estava a 53 caracteres do limite do cmd.exe, e esta entrega acrescenta três testes.
- **Entrega 1 — feita, falta o aparelho.** Pedido de download separado da cache física (`lib/downloadsExplicitos.ts`, `lib/downloadsFixados.ts`, `lib/acoesDeDownload.ts`); menus com `Download` / `Cancel download` / `Remove download`; "Download" sobre uma faixa em cache só a guarda, sem rede; lista de Downloads a partir dos pedidos, com a cache numa linha à parte; o cadeado saiu; migração com 7 dias de proteção; "Clear cache" centralizado. Testes: `test-downloads-explicitos.ts`, `test-downloads-acoes.ts`. Por fazer, e de propósito: não se impede que um adiantamento do Smart Cache já a meio publique depois de um "Clear cache" — seria mexer no caminho da reprodução, e o que ele publica é só cache.
- **Entrega 2 — preparada, falta o aparelho.** Quatro ficheiros de ensaio e um ecrã interno (ver a secção do ensaio no CLAUDE.md). O CAF é o `afconvert` do CI que o escreve.
- **Entrega 3 — não começou.** Depende do resultado da 2 no iPhone.

## Revisão de 22/09/2026, à noite (depois do trabalho no aparelho)

O plano foi escrito antes de se perceber o que se passava no iPhone. O que aconteceu nesse mesmo dia muda-lhe a ordem e corta-lhe trabalho. Nada do que está escrito abaixo foi apagado; o que deixou de valer está assinalado no sítio.

**O que se mediu e ficou provado:**

- **O corte aos ~1 MB era uma IDENTIDADE MARCADA, não falta de PO Token.** O iPhone levava 403 aos 1 012 144 bytes em todas as músicas, em Wi-Fi *e* em dados móveis, enquanto o mesmo cliente VISIONOS, do PC e com identidade nova, descarregava tudo — sem token, com um token inválido e com o User-Agent do iOS. Limpar a cache (que renova o `visitorData`) resolveu na hora. O `BotGuardMinter` está desligado de propósito desde agosto, por isso `pot=no` é o estado normal desta app e não um defeito.
- **O "tocar enquanto descarrega" funciona no aparelho.** Ficou confirmado: primeiro som com 262 KB de 2,9 MB. O que o acompanhou foram arranques longos e uma música a saltar sozinha para a seguinte, sem rasto nenhum no relatório.
- **O cliente da cascata devolve o itag 251 com URL direto.** Era uma dúvida em aberto na secção 3 deste plano; está respondida.

**O que já foi implementado e lançado, e que este plano não previa:**

- **3.7.4** — renovação do URL com identidade nova quando o CDN corta; HLS como degrau antes do embed; um 403 deixa de ser classificado como falta de rede; o estado do PO Token no relatório; EQ a ±20 dB.
- **3.7.5** — o **stream DESLIGADO** (`LIGADO`, em `lib/tocarEnquantoDescarrega.ts`), por decisão do dono: volta-se a descarregar primeiro e a tocar depois, "porque nunca encrava". E a secção **"queue decisions"** do relatório, que regista quem deu uma faixa por acabada e em que segundo.
- **3.7.6** — a velocidade deixava de responder a partir do segundo ajuste e a pausa não pausava. Nada disto vinha deste plano, mas a lição interessa-lhe: o módulo nativo e o expo-video estavam os dois a mandar na taxa do AVPlayer, e a vigia do expo-video repunha o valor anterior. **Duas coisas a escrever no mesmo sítio do leitor, e uma delas sem saber da outra, é o defeito** — vale para a velocidade, vale para o tap do EQ por item e vale para qualquer coisa que a secção 3 venha a acrescentar ao lado do expo-video.

**O que continua por explicar:** a música que saltou sozinha para a seguinte. O registo que a apanha existe desde a 3.7.5, mas ainda não houve um relatório com ela lá dentro. Enquanto isso não acontecer, não se pode dizer que foi do stream — pode ser dele, e pode ser de qualquer um dos três caminhos que dão uma faixa por acabada.

**Consequências para este plano:**

1. **O problema 1 fica EM ESPERA.** Ele assenta todo no caminho que foi desligado, e a causa que o originou (esperar pelo ficheiro inteiro ao juntar-se a um download em curso) deixou de ser o que o utilizador sente. Se o stream voltar, o desenho proposto continua a ser o certo — em particular o escritor progressivo partilhado, opção (ii).
2. **O problema 2 passa a ser o primeiro**, e a sua migração é simplificada (ver a nota na secção).
3. **O problema 3 fica MUITO mais pequeno.** Sem stream não há remux em fluxo: o ficheiro chega inteiro, converte-se em disco e o comprimento de saída é conhecido antes de o leitor lhe tocar. Todo o trabalho de transporte que a secção 3 descrevia como obrigatório deixa de existir.

## Decisão recomendada e limites

~~Implementar por esta ordem: **diagnóstico verificável → stream AAC e escritor progressivo partilhado → downloads explícitos → Opus, condicionado a provas no iPhone**. O protótipo de compatibilidade Opus pode decorrer em paralelo, mas não deve atrasar a correção do arranque.~~

**Ordem revista (22/9, à noite):** **downloads explícitos → prova de viabilidade do Opus → conversor Opus em modo ficheiro**. O arranque sai da fila: o caminho que ele corrigia está desligado, e a espera que resta é a de descarregar o ficheiro inteiro, que é o comportamento escolhido. Só se essa espera voltar a incomodar é que o problema 1 regressa — e aí a primeira coisa a ponderar não é o escritor partilhado, é o HLS a dar o arranque enquanto o ficheiro vem por trás, que já existe e já é usado como recurso.

O [CLAUDE.md](C:/Users/Utilizador/Desktop/duotone-main/CLAUDE.md) orienta as decisões históricas. O README não serve de base a este plano. Preservar:

- Áudio progressivo servido a partir de disco; expo-video continua dono da reprodução, background e lock screen.
- Cascata de clientes, PO Token, renovação, validação de ranges e tamanhos dos pedidos. Hoje há pedidos normais de **1 000 000 bytes** e o primeiro pedido de um stream novo já é **262 144 bytes**; manter também o encolhimento existente nas tentativas.
- `MAX_SIMULTANEOS = 1`. Prioridade não significa interromper um download ativo.
- `shouldAbort` em todos os call sites e `verificarCancelamentos()` sempre que as condições de cancelamento mudam. Preservar `esperarDownload`, inclusive quando fetch/corpo ignoram abort.
- Smart Cache aos 5 s, três faixas em Wi-Fi/duas em dados móveis, prioridade da seguinte e regras do crossfade/Jam/shuffle.
- Duração AAC corrigida como hoje: não voltar a escrever a duração total no `moov`.
- LRU só no arranque, com alvo de 500 MB e proteção existente. **Clear cache continua a apagar também os downloads explícitos.**
- Código, comentários e lógica nova em PT-PT. Rótulos dos menus permanecem centralizados e respeitam a UI existente.

**Divergência a registar, sem a “corrigir”:** o resumo inicial do CLAUDE e o pedido descrevem ANDROID_VR → ANDROID → IOS. O ciclo efetivo em [ytstream.ts:527](C:/Users/Utilizador/Desktop/duotone-main/src/api/ytstream.ts:527) começa em VISIONOS → IOS → ANDROID_VR → ANDROID, seguido dos recursos existentes. O plano preserva a cascata executada neste checkout. A seleção de codec deve acontecer dentro das respostas já obtidas, sem reordenar clientes para procurar 251.

Há alterações locais pré-existentes em `DuotoneEq.swift` e `equalizer.ts`. Qualquer trabalho posterior no EQ precisa de as integrar, sem as substituir.

## 1. A música só começa depois do download

> **EM ESPERA (22/9, à noite).** O stream está desligado e é isso que o dono
> quer: descarregar primeiro, tocar depois, "porque nunca encrava". Esta secção
> só volta a valer se o stream for religado, e aí vale quase toda — a causa
> confirmada abaixo é real e continua por corrigir, e a opção (ii) continua a
> ser a certa. Duas correções ao que ela supunha: o corte aos ~1 MB era uma
> identidade marcada (não falta de PO Token, ver a Revisão), e o stream **já
> ficou provado no aparelho**. O que não se sabe é porque é que uma música
> saltou sozinha para a seguinte; o registo que passou a existir para isso é a
> secção "queue decisions" do relatório.

### Causa confirmada e hipóteses

Em [youtubeCache.ts:789](C:/Users/Utilizador/Desktop/duotone-main/src/lib/youtubeCache.ts:789), `transmitirAudio` encontra `emCurso`, espera pela promessa do ficheiro final e devolve `tipo: ficheiro`. O mapa guarda promessas, sem acesso a um escritor partilhado. Isto afeta a adesão a um adiantamento, Daily mix, download explícito e até a um stream já em curso.

Continuam por confirmar no aparelho: stream auto-desligado ou módulo ausente; AVPlayer dependente de bytes do fim; espera pela única vaga. Acrescentar duas possibilidades visíveis no código: cabeça MP4 retida até ao fim pelo parser e abertura da sessão nativa recusada.

### Diagnosticar antes de alterar o transporte

Reproduzir na build instalada, anotando build/iOS/rede e exportando o relatório enquanto a faixa está presa e novamente depois de arrancar. Usar uma faixa fria, uma já completa, uma adiantada a meio e uma pedida enquanto outra ocupa a vaga. Não limpar a cache inteira para cada ensaio: isso elimina justamente o caso a investigar.

**Campos que já existem:**

| Fonte | Campos e leitura correta |
|---|---|
| Cabeçalho “play while downloading” | `on`; `on (1 recent player failure)`; `off (this build has no streaming module)`; ou `off after repeated player failures, back on <data>`. |
| Diagnóstico Swift | `pedidos`, `servidos`, `disponiveis`, `total`, `pendentes`, `fechada`. Em cada pedido: `ms` desde abertura, `info`, `havia`, `de` e `quantos`; `quantos = -1` significa pedido até ao fim. |
| `primeira_nota` | `origem: cache|stream|ficheiro|hls` no caminho nativo, `ms` desde o pedido até ao primeiro `timeUpdate > 0`. Restauro pausado não mede; medidas superiores a 120 s são descartadas. É um indicador de avanço do motor, não uma medição acústica. |
| `download_terminado` | `resultado: ok|falhou|cancelado|nao-publicado`, `modo: ficheiro|stream`, `prioridade`, `ms_na_fila`, `ms` de transferência, `bocados`, `mb` arredondados, `url_renovado`. |
| Relatório de arranque | `download.fase`, prioridade, bytes/total, tempos desde pedido/início/último bocado, tentativas/HTTP; `filaDeDownloads.vagasOcupadas`, `emEspera`, `downloads[]` com `daFaixaAtual`, fase e prioridade. Inclui estado separado do resolvedor. |

Referências: [medicoes.ts](C:/Users/Utilizador/Desktop/duotone-main/src/state/medicoes.ts), [relatorioDoArranque.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/relatorioDoArranque.ts), [DuotoneStreamSession.swift](C:/Users/Utilizador/Desktop/duotone-main/modules/duotone-stream/ios/DuotoneStreamSession.swift).

**Limitações importantes da instrumentação atual:**

- `primeira_nota` e `download_terminado` vão para a telemetria; não são incluídos automaticamente no Playback diagnostics. O segundo não tem identidade da faixa, deliberadamente. Não é rigoroso correlacioná-los apenas pela proximidade temporal.
- A secção local recebe diagnóstico nativo no primeiro som ou no fallback. Antes disso pode estar vazia. Guarda só os primeiros 12 pedidos, e o motor corta o JSON a 600 caracteres.
- `origem: stream` identifica a fonte escolhida, não prova que tocou antes do fim. O texto “first sound while downloading” pode aparecer depois da conclusão. O fallback também pode deixar a origem antiga na medição.
- Pedidos cancelados antes de obter vaga não emitem `download_terminado`. A prioridade atual do registo é a de quem criou o trabalho, não necessariamente a intenção mais urgente.
- A saúde persistida é lida de forma assíncrona; `estadoDoStream()` pode apresentar o estado inicial antes dessa leitura.

**Primeira alteração planeada: diagnóstico local estruturado e limitado.** Acrescentar identificadores efémeros de tentativa de reprodução, trabalho e sessão; motivo da escolha da fonte; prioridade inicial/efetiva; consumidores; instantes de pedido, resolução, entrada/saída da fila, primeiros bytes, cabeça pronta, entrega ao motor, primeira nota e publicação. Guardar bytes disponíveis e estado de conclusão no instante da primeira nota.

Exportar também o estado nativo atual antes do primeiro som. Guardar pedidos relevantes com cursor, bytes servidos, conclusão/cancelamento/erro e idade; limitar o registo por entradas completas, sem cortar JSON a meio. Mostrar “saúde ainda não carregada” ou aguardar a leitura ao exportar. Atualizar a origem efetiva se houver fallback antes da primeira nota.

Manter os detalhes de conteúdo no relatório local. A telemetria remota conserva etiquetas/tempos agregados, sem títulos, videoIds ou URLs. Recolher eventos nas transições e na exportação, sem acrescentar sondagens frequentes.

| Causa | Evidência que a distingue | Correção proposta |
|---|---|---|
| Adesão a download em modo ficheiro | Mesmo trabalho já iniciado; motivo `aderiu-a-ficheiro`; bytes avançam, sem sessão nativa; primeira nota após publicação. `modo: ficheiro` sozinho não distingue este caso do cooldown. | Escritor progressivo comum, com abertura tardia de sessão. |
| Auto-desligado | Saúde hidratada mostra cooldown e data; decisão da tentativa confirma esse motivo; não se abre sessão. | Corrigir a falha do motor demonstrada; manter duas falhas/três dias. Não apagar saúde em todos os arranques. Uma tentativa após mudança de versão do motor, se necessária, deve ser única e explicitamente versionada. |
| Módulo ausente | Relatório diz que o binário não contém o módulo. | Prebuild e nova build EAS com o módulo; uma atualização só de JS não o instala. |
| AVPlayer precisa de bytes futuros | Sessão existe; `disponiveis < total`; pedido com offset ainda indisponível permanece pendente e o avanço só acontece quando esse intervalo chega. | Validar ResourceLoader/cabeçalhos primeiro; se a dependência da cauda for real, experimentar satisfação de ranges dentro do mesmo trabalho/vaga. |
| Outra faixa ocupa a vaga | Atual `na-fila`, sem início; outro trabalho `a-descarregar`. `ms_na_fila` confirma a espera quando termina. | Cancelar especulativos obsoletos prontamente, promover pedidos em espera e garantir libertação da vaga. Tratar explícitos ativos separadamente, como abaixo. |
| Resolução ou cabeça ainda não prontas | Sem registo de download e resolvedor em curso; ou bytes recebidos sem cabeça corrigida disponibilizada. | Corrigir o estágio identificado; não atribuir a espera à fila nem ao AVPlayer. |

Um pedido `quantos: -1` **não prova bloqueio pela cauda**: o Swift pode fornecer bytes desse pedido progressivamente. `servidos` pode incluir releituras e não equivale a bytes únicos descarregados.

### Comparar as duas correções da causa confirmada

| Opção | Rede | Memória | Risco e decisão |
|---|---|---|---|
| (i) Abandonar e recomeçar em stream | Descarta bytes recebidos; repete o início e possivelmente resolução. Perto do fim pode demorar mais. | Libertar efetivamente o buffer antigo antes do novo trabalho; não criar dois produtores. | Mitigação limitada a trabalho exclusivamente especulativo, com propriedade comprovada. O mapa atual não permite decidir isto com segurança. Nunca cancelar indiscriminadamente quem também serve reprodução ou pedido explícito. |
| (ii) Todos escreverem progressivamente num `.part` | Aproveita o download existente, sem repetir ranges ao aderir. | Elimina a reserva habitual do ficheiro inteiro; mantém bocado, cabeça e estado do parser. | Solução recomendada. Exige controlar consumidores, publicação, sessões e corridas; resolve a mesma causa em todos os produtores. |

Hoje `descarregarAgora` reserva `new Uint8Array(total)`. A opção (ii) reduz esse custo, mas **não garante memória limitada só ao bocado**: `mp4AoVivo` pode reter o ficheiro inteiro quando não reconhece o fim da cabeça, com realocações e cópias. Definir um orçamento explícito da cabeça; ultrapassá-lo deve ativar uma recuperação limitada e diagnosticável. Para este caso raro, ponderar guardar entrada temporária em disco ou voltar controladamente ao caminho clássico. Preservar o limite atual de 256 MiB e medir memória real no aparelho.

### Passos de implementação

1. Entregar a instrumentação acima e provar o stream AAC atual numa faixa fria no iPhone. Se nem este caso tocar antes do fim, investigar o transporte antes de generalizar o escritor.
2. Substituir a promessa isolada de `emCurso` por um trabalho com identidade, estado, parcial/caminho atual, bytes corrigidos visíveis, total, conclusão/erro, promessa do ficheiro final e consumidores. Manter as APIs externas: downloads aguardam o ficheiro; reprodução pode receber uma sessão antes dele.
3. Cada consumidor mantém o seu `shouldAbort`. Cancelar um consumidor termina a sua espera e sessão; o produtor só aborta quando nenhum consumidor válido precisa dele. O abandono do Smart Cache ou da Daily mix não pode matar um trabalho já adotado pela reprodução ou por Download explícito.
4. Promover um trabalho ainda em espera à maior prioridade dos seus consumidores, conservando um único bilhete. Reutilizar a vaga quando já está ativo. Não criar uma fila paralela para streams.
5. Usar `pedirBocados` e o corretor AAC em fluxo para todos os produtores. Downloads de fundo não abrem sessões Swift desnecessárias. Ao aderir, o leitor abre o parcial existente, recebe a quantidade já escrita e só vê cabeça corrigida. Não reiniciar offsets nem mudar o tamanho do pedido que já vai em curso.
6. Dar ciclo de vida próprio a cada sessão de reprodução. Fechar uma não pode fechar a de outro consumidor. Coordenar a corrida entre abertura tardia e rename; depois da publicação, abrir o caminho final. O FileHandle nativo já aberto mantém a leitura do mesmo ficheiro.
7. Publicar uma única vez, após fechar a escrita, validar tamanho/estrutura, verificar cancelamento/geração e mover o parcial. Preservar a bandeira explícita `publicado`: `moveSync` muda o objeto para o destino, e um `finally` baseado só em `exists` pode apagar o ficheiro final.
8. Preservar `exato: false` como “não publicável”. Downloads explícitos precisam de uma recuperação que produza ficheiro válido, não de sucesso falso. Evitar ciclos de fallback; remover o trabalho falhado do mapa **antes** de acordar quem vai recuperar, verificando a identidade do trabalho.
9. Manter reconciliação do Smart Cache antes dos guards do backend, a faixa atual adotável e a diferença entre cleanup de renderização e desmontagem. Conservar crossfade, pausa, `runIdRef` e proteção do watchdog durante transferência.

**Correção da fila, sem promessas impossíveis:** a prioridade só ordena trabalhos à espera. Cancelar fundo que deixou de servir e adotar a mesma faixa resolve os bloqueios evitáveis. Um download explícito válido de outra faixa já ativo continua a poder atrasar a reprodução com a política atual. Se os relatórios mostrarem que esse caso é relevante, acrescentar uma fase própria: cedência cooperativa no limite do bocado, conservar parcial/parser/offset/intenção e voltar a enfileirar o explícito. Exige testes de pausa/retoma e renovação de URL. Não o substituir por abortar e perder o download, nem declarar latência eliminada enquanto esta política não estiver implementada.

**Se a cauda for indispensável:** primeiro corrigir offsets, `currentOffset`, informação de comprimento/tipo, entrega parcial e término/cancelamento dos pedidos. Se o AVPlayer realmente exigir um intervalo do fim, prototipar leitura fora de ordem com um mapa de intervalos válidos, pedidos serializados na mesma vaga e bocados com os limites atuais. O contador `cresceu(bytesContiguos)` não representa ficheiros esparsos. Não anunciar buracos como disponíveis, fingir EOF nem reintroduzir duração no `moov`. Só integrar esta solução se o protótipo provar coerência do fixer e arranque antecipado; caso contrário, preservar fallback completo e registar a limitação.

### Ficheiros a tocar

| Área | Ficheiros |
|---|---|
| Trabalho, escrita e publicação | [youtubeCache.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/youtubeCache.ts), [filaDeDownloads.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/filaDeDownloads.ts), [mp4AoVivo.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/mp4AoVivo.ts), [publicarDownload.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/publicarDownload.ts). Extrair um módulo puro de transições se isso tornar os testes claros. |
| Motor e consumidores | [YouTubePlayerView.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/YouTubePlayerView.tsx), [adiantarFaixas.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/adiantarFaixas.ts), [descarregarFaixa.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/descarregarFaixa.ts). |
| Diagnóstico e saúde | [playbackDiagnostics.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/playbackDiagnostics.ts), [relatorioDeReproducao.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/relatorioDeReproducao.ts), [relatorioDoArranque.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/relatorioDoArranque.ts), [tocarEnquantoDescarrega.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/tocarEnquantoDescarrega.ts), [saudeDoStream.ts](C:/Users/Utilizador/Desktop/duotone-main/src/state/saudeDoStream.ts), [medicoes.ts](C:/Users/Utilizador/Desktop/duotone-main/src/state/medicoes.ts). |
| Ponte nativa, se necessário | [index.ts](C:/Users/Utilizador/Desktop/duotone-main/modules/duotone-stream/index.ts), [DuotoneStreamModule.swift](C:/Users/Utilizador/Desktop/duotone-main/modules/duotone-stream/ios/DuotoneStreamModule.swift), [DuotoneStreamSession.swift](C:/Users/Utilizador/Desktop/duotone-main/modules/duotone-stream/ios/DuotoneStreamSession.swift). |

### Testes, aparelho e rollback

Adicionar `scripts/test-download-partilhado.mjs` e `scripts/test-diagnostico-arranque.ts`, registados no `npm test`. Seguir o harness atual de `test-transmitir-audio.mjs`: downloader real, disco/ponte/fetch controlados, promessas retidas e relógio virtual.

- Adiantamento → reprodução a meio: sessão entregue antes da última resposta, nenhum range repetido, uma vaga, ficheiro final byte a byte igual ao AAC clássico. Substituir o teste atual que consagra esperar pelo adiantamento inteiro.
- Explícito + Smart Cache + reprodução da mesma faixa; todos os ordenamentos relevantes de adesão/cancelamento; último consumidor a sair com fetch que nunca assenta; respostas tardias sem publicação.
- Promoção de prioridade sem duplicação; FIFO entre iguais; explícito ativo preservado. Se houver cedência cooperativa, retoma no offset certo, sem starvation e sem duas transferências simultâneas.
- Sessões independentes, adesão durante rename, erro antes/depois de entregar a sessão, parcial incompleto, `exato: false`, limite de memória da cabeça e final que nunca é apagado pelo cleanup.
- Primeira nota depois do fim e depois de fallback; snapshot antes de som; saúde hidratada; registos limitados válidos; telemetria sem conteúdo.

Manter os testes de esperas/cancelamento, 403/renovação, Smart Cache, fila, publicação e equivalência do `mp4Fixer`/`mp4AoVivo`. Executar `npm run typecheck` e `npm test` na implementação.

**Só no iPhone com build EAS:** faixa fria e adesão aproximadamente a 10/50/90%; Wi-Fi e dados móveis lentos; downloads concorrentes; saltos rápidos; pausa durante fallback; seek além do disponível; perda de rede; bloquear o ecrã antes de terminar a transferência; background, relançamento, duração nativa/lock screen e memória de faixa longa. JS em background e comportamento real do ResourceLoader não se provam nos mocks.

Aceitar a correção quando a primeira nota acontecer com bytes ainda por receber, sem novo download ao adotar a faixa, e sem regressões de duração/pausa/crossfade. Comparar mediana e p95 por cenário, separando resolução, fila e motor; não impor um tempo absoluto sem medir a rede.

Rollback por fases, com interruptores internos de build para escritor/leitor progressivo. Conservar caminho clássico, saúde automática, cache final válida e limpeza de parciais. Não incrementar `CACHE_VERSION` se a saída AAC continua idêntica. A opção (i) não deve ficar como fallback universal escondido.

## 2. Ouvir uma faixa deixa-a marcada como descarregada

### Causa e confirmação

`isAudioCached` mede existência física, mas é usado para o ícone e a ação “Remove download”. `alternarDownload` não fixa a faixa e até remove uma cache existente quando a pessoa pretendia pedir Download. A lista de Downloads enumera ficheiros em disco; os títulos dependem da biblioteca consultada pela rede.

Antes de mudar: ouvir uma faixa nova e verificar ícone/menu/lista; pedir Download numa faixa já em cache; reiniciar com pressão de espaço. Confirmar que a única origem atual dos pins é o cadeado manual de Downloads. **Daily mix e Smart Cache continuam a produzir cache automática**, sem intenção explícita.

### Modelo e comportamento pretendidos

| Estado | Toca sem rede | ↓ e “Remove download” de concluído | Proteção LRU |
|---|---:|---:|---|
| Cache automática completa | Sim | Não | Só proteções existentes da fila |
| Pedido explícito incompleto/falhado | Só se também existir variante completa | Não fingir concluído; mostrar estado próprio | Guardar intenção e estado |
| Pedido explícito + ficheiro completo | Sim | Sim | Sim |
| Legado sem intenção conhecida | Sim | Não | Proteção transitória de migração |

Manter `isAudioCached` como disponibilidade física completa. Criar uma decisão distinta para download explícito concluído: intenção persistida **e** ficheiro disponível. `.part` nunca conta como disponibilidade offline.

Há uma dependência que exige alteração coordenada: `TrackActionsSheet`, `SocialTrackActions`, `QueueSheet` e `PlayerRoot` usam hoje `estaDescarregada` tanto para `tocaSemRede` como para `descarregada`. Separar os dois campos em todos eles. O filtro offline de `SongsScreen` continua a incluir **toda** a música disponível no disco. A informação de qualidade em Definições também continua a reconhecer cache física.

### Passos de implementação

1. Evoluir `downloadsFixados` para uma fonte coerente de intenções explícitas, com estado e snapshot local dos metadados da faixa. Separar decisões puras de persistência/disco. Evitar dois conjuntos independentes de pins e downloads que possam divergir.
2. Implementar ações idempotentes de pedir/remover. “Download” sobre cache completa fixa o ficheiro imediatamente, inclusive offline, sem resolver nem transferir de novo. Um duplo toque não pode desfazer o pedido por acidente.
3. Persistir a intenção antes de iniciar/adotar a transferência; marcar concluído só após publicação válida. Falhas ficam identificadas como falha/pedido pendente, com recuperação explícita; um erro ao guardar a intenção não pode resultar numa promessa falsa de download permanente.
4. Usar geração por pedido e escritas serializadas. Remover durante resolução/download/persistência impede que uma conclusão antiga volte a fixar a faixa. Integrar com os consumidores do problema 1: retirar interesse explícito não aborta outro consumidor válido.
5. Para “Remove download”, remover intenção e ficheiro completo correspondente. Se o ficheiro/sessão estiver a ser usado, coordenar a eliminação com o motor e impedir publicação tardia do pedido removido; não interromper a escuta por fechar um consumidor alheio. Uma reprodução posterior pode criar cache automática novamente, sem ↓.
6. Fazer a lista de Downloads enumerar pedidos explícitos e seus estados, com uma linha separada para cache e espaço usado. Todo Download já fica fixado; o cadeado deixa de ser um segundo passo obrigatório. Guardar metadados ao pedir, para permitir títulos e Play offline de faixas vindas de pesquisa/chat ou entretanto removidas da biblioteca.
7. Tornar linhas e menus reativos à revisão da cache e das intenções. Reconciliar ambas no arranque: pin sem ficheiro não aparece como concluído; falha ao ler pins adia LRU, em vez de presumir que nada está protegido.
8. Centralizar Clear cache: invalidar a geração e cancelar trabalhos abrangidos, chamar `verificarCancelamentos()`, eliminar ficheiros, pins, catálogo e legado. Impedir repovoamento por callbacks anteriores. Manter literalmente a política de apagar **também os downloads explícitos** e atualizar o efeito nas Definições para refletir a operação real.
9. Preservar o alvo atual de 500 MB sobre o total do áudio, com exceções protegidas; não o transformar silenciosamente em 500 MB só de cache automática. Não fazer LRU durante reprodução.

### Migração dos downloads antigos

> **Simplificada a 22/9, à noite.** Os pontos 2 a 5 abaixo criavam um estado
> "legado por rever" e um passo de revisão na lista de Downloads. É demasiado
> para uma app de uma pessoa. Fica assim: os pins existentes migram (ponto 1,
> mantém-se), e **tudo o resto que já está em disco é cache**, protegida da
> limpeza durante 7 dias a contar da primeira abertura da versão nova. Quem
> quiser guardar alguma dessas faixas carrega em "Download" nesses dias —
> sobre um ficheiro que já existe, não gasta rede nenhuma. Passados os 7 dias
> a limpeza trata delas como trata da restante cache. Perde-se a garantia de
> nunca apagar um download antigo; ganha-se não construir um fluxo de revisão
> que só serve uma vez. A decisão é do dono e está tomada.

Não há dados suficientes para distinguir downloads antigos sem pin de cache de reprodução/adiantamento. Datas, tamanho, nome e pertença à biblioteca não provam intenção.

1. Migrar pins existentes para pedidos explícitos, conservando compatibilidade com o conjunto antigo.
2. Classificar os outros ficheiros existentes como **legado por rever**, sem ↓ e sem “Remove download”, mantendo reprodução offline.
3. Proteger esse conjunto antes do primeiro LRU da versão nova, separadamente dos downloads explícitos. Na linha Cache, disponibilizar revisão: “Download” confirma/fixa sem rede; “Manter como cache” retira a proteção transitória.
4. A proteção dura até essa revisão ou até Clear cache; não expira silenciosamente. Mostrar espaço pendente de revisão. Isto pode manter o total acima de 500 MB durante a migração — uma escolha deliberada para não apagar possíveis downloads antigos sem confirmação da intenção.
5. Após classificação como cache, o LRU normal só atua no próximo arranque. A migração é versionada, idempotente e tolerante a interrupção. Metadados locais conhecidos são aproveitados; se faltarem, conservar uma entrada identificável e tocável através do sourceId.

### Ficheiros a tocar

| Área | Ficheiros |
|---|---|
| Intenção e operações | [downloadsFixados.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/downloadsFixados.ts), [descarregarFaixa.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/descarregarFaixa.ts), [descarregarFaixa.web.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/descarregarFaixa.web.ts), [youtubeCache.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/youtubeCache.ts), [App.tsx](C:/Users/Utilizador/Desktop/duotone-main/App.tsx). Acrescentar módulo puro para estados/migração, se necessário. |
| Ícones, menus e disponibilidade | [TrackRow.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/TrackRow.tsx), [menuDaFaixa.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/menuDaFaixa.ts), [TrackActionsSheet.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/TrackActionsSheet.tsx), [SocialTrackActions.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/SocialTrackActions.tsx), [QueueSheet.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/QueueSheet.tsx), [PlayerRoot.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/PlayerRoot.tsx). |
| Ecrãs e efeitos | [DownloadsScreen.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/screens/DownloadsScreen.tsx), [SongsScreen.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/screens/SongsScreen.tsx), [SettingsScreen.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/screens/SettingsScreen.tsx), [efeitoDasDefinicoes.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/efeitoDasDefinicoes.ts). |

Manter rótulos/ordem dos menus, menu curto do leitor e desktop sem download. Ajustar a regra de indisponibilidade para permitir fixar uma cache existente offline.

### Testes, aparelho e rollback

Adicionar ao `npm test`, sem framework:

- `scripts/test-downloads-explicitos.ts`: tabela de estados, cache sem pin, pin sem ficheiro, promoção offline, lista/contagem corretas.
- `scripts/test-migracao-downloads.ts`: pins antigos, legado desconhecido, repetição/interrupção, metadados ausentes, proteção antes do LRU e falha de leitura persistida.
- `scripts/test-downloads-acoes.mjs`: ações reais com duplos de AsyncStorage/disco/rede; duplo toque, gravações fora de ordem, falha de persistência, remoção durante cada fase, Clear cache a meio e consumidor de reprodução sobrevivente.

Expandir os testes existentes de menus, limpeza, publicação, Daily mix e efeitos das Definições. Cobrir especificamente cache automática que continua a tocar offline sem ganhar o ícone. Executar typecheck e suite completa na implementação.

**No iPhone/EAS:** ouvir sem ↓; fixar cache sem tráfego; reiniciar e tocar offline; remover da biblioteca mantendo download; Songs offline com cache automática; Daily mix sem marcas; pressão acima de 500 MB sem perda de fixados; menus montados atualizados imediatamente; remover/limpar a meio sem reaparecimento. Confirmar também comportamento ao eliminar ficheiro aberto pelo AVPlayer. Este problema, isoladamente, não exige Swift novo, mas a validação deve ocorrer na build nativa real.

Riscos principais: booleano errado bloquear offline; persistência fora de ordem ressuscitar pins; migração inventar intenções; downloads fora da biblioteca desaparecerem da lista. Mitigações são estados separados, gerações, metadados locais e migração explícita.

Rollback conserva áudio e escolhas já feitas. Manter os IDs fixados no formato antigo como projeção compatível, com uma fonte de verdade e gravações ordenadas. Reverter UI/orquestração não deve apagar o catálogo novo nem restaurar snapshots anteriores a Remove/Clear cache. Testar rollback antes de publicar; separar esta alteração das mudanças de codec.

## 3. Opus 251 no iPhone

### Hipótese e condições para avançar

O objetivo é conservar os pacotes Opus do 251 e mudar apenas o contentor, sem recodificação. A extensão `.mp4` não acrescenta suporte a um codec que o motor não aceite.

O [Jellyfin no commit indicado](https://github.com/jellyfin/jellyfin-web/blob/79bea955572b43965e6b1931563cf85bc4c9dc46/src/scripts/browserDeviceProfile.js) combina Safari ≥17 com uma verificação `canPlayType` e admite Opus nos perfis MP4/HLS-fMP4. É um indício de navegador, não uma prova para AVPlayer + expo-video no iPhone. A [publicação oficial do Safari 17](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/) refere Opus em MP4/WebM especificamente no macOS Sonoma.

~~**São necessárias três provas independentes:**~~

1. AVPlayer toca Opus MP4 local, com temporização correta.
2. ~~Toca esse formato enquanto o ficheiro cresce.~~
3. ~~O transporte funciona quando o comprimento final do MP4 ainda não é conhecido.~~

~~Passar a primeira não autoriza assumir as outras.~~

**Revisto a 22/9, à noite: com o stream desligado, sobra a primeira prova**, e é ela que decide tudo. O ficheiro chega inteiro, é convertido em disco e só depois entregue ao leitor — exatamente como o AAC de hoje. As provas 2 e 3 só voltam se o stream voltar.

A prova 1 fica com dois critérios, e ambos têm de passar na build EAS: o AVPlayer toca o ficheiro do princípio ao fim com temporização correta, **e** o ecrã bloqueado mostra a duração certa (não o dobro, que é o defeito histórico do fMP4 do YouTube — ver `lib/mp4Fixer.ts`). Seek, pausa, velocidade 0,5-2×, equalizador e crossfade entram no mesmo ensaio.

Vale a pena preparar a fixture nos **dois contentores**: MP4 e **CAF**. O CAF é o contentor em que a Apple suporta Opus oficialmente no iOS desde o iOS 11, e não serviria para streaming (a tabela de pacotes tem de vir antes dos dados), mas em modo ficheiro isso não é limitação nenhuma. Se o MP4 falhar e o CAF passar, a funcionalidade continua de pé — muda o escritor, não o plano.

### Protótipo mínimo antes do remuxer de produção

Usar uma flag interna desligada por omissão e uma fixture curta, de origem controlada, com início/fim audíveis identificáveis. Primeiro gerar um MP4 Opus com muxer de referência fora da app; isto separa suporte do motor de erros do futuro writer JS. Não introduzir FFmpeg como dependência de runtime.

Na build EAS, reproduzir a fixture através do mesmo expo-video e módulos nativos. Confirmar `readyToPlay`, som, fim, seek início/meio/fim, pausa, 0,5–2×, varispeed, EQ, crossfade, auscultadores, background e duração no lock screen. Depois servir a mesma fixture aos bocados pelo `duotone-stream`, com comprimento já conhecido, e provar primeira nota antes do último bocado.

Só depois repetir com a saída de um remux mínimo JS. A configuração usada para aceitar a funcionalidade deve ter `mvhd/tkhd/mdhd` a zero; uma fixture convencional que toca mas duplica duração não basta. Registar resultado por versão de iOS, build e versão do pipeline. iOS ≥17 é elegibilidade para tentar, não capacidade garantida. Em iOS <17 selecionar AAC sem tentar Opus.

~~Verificar também, nas respostas reais da cascata preservada, se existe 251 direto com MIME Opus/WebM.~~ **Verificado a 22/9 a partir do PC, com as funções reais da app: o VISIONOS devolve `139, 140, 249, 250, 251`, o 251 com URL direto e sem cifra; o ANDROID_VR devolve os mesmos menos o 250.** Fica de pé o resto da regra: se a resposta utilizável só oferecer AAC/HLS, mantém-se esse caminho; não reordenar clientes nem acrescentar decifração de assinatura para obter Opus.

### Remuxer JS puro: desenho proposto

Separar parser EBML, temporização Opus e writer MP4 em módulos puros, com o mesmo núcleo usado pelo modo completo e pelo modo em fluxo.

**Leitura incremental de WebM.** Interpretar VINTs de IDs/tamanhos, Segment/Cluster de tamanho desconhecido, elementos cortados entre pedidos e limites de tamanho/profundidade/inteiros. Ler Info/TimestampScale, Tracks, `A_OPUS`, CodecPrivate/OpusHead, canais, CodecDelay e SeekPreRoll. Começar por mono/estéreo e mapping family 0; rejeitar variantes não implementadas com fallback AAC. Referência: [mapeamento de codecs Matroska](https://www.matroska.org/technical/codec_specs.html).

Extrair `SimpleBlock` e `BlockGroup/Block`, preservando os pacotes. Suportar lacing nenhum, Xiph, fixed e EBML, ou rejeitar explicitamente os modos ainda não implementados; nunca confundir vários pacotes com um só. Referência: [estrutura de blocos e lacing](https://www.matroska.org/technical/notes.html).

**Temporização.** Usar amostras inteiras a 48 kHz; calcular duração dos pacotes pelo TOC e número de frames, sem assumir 20 ms. Reconciliar Timestamp do Cluster, offset signed do Block e escala. Aplicar pre-skip/CodecDelay uma única vez; tratar `DiscardPadding` no fim e pré-roll para seek como conceitos separados. Referência temporal: [elementos Matroska](https://www.matroska.org/technical/elements.html). Usar fixtures com pacotes de durações diferentes e início/fim conhecidos.

**Saída MP4.** Construir init `ftyp + moov/mvex/trex`, sample entry `Opus` e `dOps`; converter endianness dos campos de OpusHead, preservando canais, pre-skip, taxa informativa, output gain e mapeamento suportado. Emitir `moof/mfhd/traf/tfhd/tfdt/trun + mdat` com tamanhos, offsets e durações válidos. Comparar a sinalização com a [implementação do muxer FFmpeg](https://ffmpeg.org/doxygen/trunk/movenc_8c_source.html), sem exigir igualdade binária entre muxers diferentes.

**Duração e priming.** Manter a duração dos cabeçalhos `mvhd/tkhd/mdhd` a zero, deixando a timeline nos fragmentos. O [documento Opus-in-ISOBMFF](https://opus-codec.org/docs/opus_in_isobmff.html) está marcado como incompleto e descreve edit lists e pré-roll. Validar trimming/seek com ficheiros de referência e iPhone; não assumir que `dOps` resolve tudo sozinho, nem substituir pre-skip por 80 ms.

Não passar o resultado Opus cegamente por `mp4Fixer`/`mp4AoVivo`: estes neutralizam `edts`, que pode ser necessário para priming/trimming Opus. O novo writer deve gerar diretamente o layout validado. Manter intacta a correção AAC e os seus testes. Se a combinação de priming correto e duração a zero não funcionar no AVPlayer, a condição de avanço falha; não sacrificar o lock screen para ativar o codec.

### Fluxo e o comprimento de saída: trabalho obrigatório

> **DISPENSADO em modo ficheiro (22/9, à noite).** Tudo o que esta subsecção
> descreve existe por causa do stream: anunciar ao AVPlayer um comprimento que
> só se conhece no fim. Com o download completo antes de tocar, o MP4 é escrito
> inteiro em disco e o tamanho é o tamanho do ficheiro — o `abrir(sessao,
> caminho, total)` nem entra no caminho. Fica escrito para o dia em que o
> stream voltar. Duas notas para esse dia: o remux pode ser **acabado** e só
> então publicado (o que reduz o problema a esperar pelo download, isto é, ao
> comportamento de hoje), e há uma saída que a subsecção não considerou —
> anunciar um comprimento igual ao do WebM mais uma margem, e encher o fim com
> uma caixa `free` até esse tamanho. O ficheiro passa a TER mesmo esse
> comprimento, por isso não é um total fictício; exige provar que a saída nunca
> excede a entrada mais a margem.

O contrato atual `abrir(sessao, caminho, total)` e o Swift pressupõem tamanho final conhecido. O remux altera os bytes e o overhead: **`contentLength` do WebM não é o comprimento do MP4**. Hoje `concluir()` até promove os bytes disponíveis para o total anunciado.

A [documentação Apple de contentLength](https://developer.apple.com/documentation/avfoundation/avassetresourceloadingcontentinformationrequest/contentlength) define-o como comprimento do recurso. Indicar que nem todos os dados estão imediatamente disponíveis não transforma o tamanho de entrada no tamanho de saída.

Reservar uma experiência específica de transporte, antes da integração de produção:

1. Separar no contrato `bytesEntrada`, total da entrada, `bytesSaidaDisponiveis`, `totalSaida` inicialmente desconhecido e EOF efetivo. Progresso da rede usa entrada; ranges do AVPlayer e publicação usam saída.
2. Investigar e provar no aparelho como o AVPlayer aceita fMP4 cujo comprimento só se conhece no fim. Uma proposta de API com total opcional não prova suporte nativo. Não usar total fictício/“muito grande”, não tratar crescimento como EOF e não concluir ranges além dos bytes existentes.
3. Pré-varrer o WebM inteiro permite calcular a saída, mas volta a adiar o arranque. Um transporte de segmentos finitos, por exemplo HLS local, exigiria desenho próprio e rever a limitação atual do EQ com HLS; não é uma substituição transparente do ResourceLoader.
4. Se não houver transporte provado, **Opus em fluxo permanece desligado e AAC em fluxo mantém-se como via normal**. O protótipo de Opus completo não deve ser lançado como solução para o problema 1. Esta é uma condição técnica em aberto, não uma implementação presumida.

Com o transporte aprovado: `transmitirAudio` usa o escritor comum do problema 1 e um transformador Opus incremental. Guardar só resto de elemento/pacote e um fragmento limitado; emitir init e primeiro fragmento sem esperar pelo EOF; limitar trabalho síncrono para não prender a thread JS; aplicar controlo de produção/consumo e avisar o nativo apenas após escrita. Tamanho de fragmento MP4 não é tamanho de pedido HTTP: os bocados de rede mantêm-se.

O modo ficheiro chama o mesmo parser/writer até EOF. O resultado inteiro e o resultado alimentado em partes devem ser equivalentes, idealmente byte a byte com fragmentação determinística. Publicar apenas após EOF estrutural válido, validação de temporização e tamanho **de saída**, sem igualdade obrigatória com o tamanho WebM.

### Seleção, fallback e cache

1. Acrescentar identidade explícita de representação a `YtStream`: itag, codec, contentor, qualidade e versão de transformação relevante. Alta qualidade + capacidade validada + 251 direto permite Opus; Data Saver mantém a seleção atual. Não introduzir itags premium.
2. Memo e trabalho em curso distinguem representação/política. Atualmente o memo é por vídeo/qualidade e `emCurso` por vídeo; duas variantes não podem partilhar offsets ou o mesmo parcial.
3. Renovação após 403 deve garantir a mesma representação. `renewUrl` devolve hoje só URL: isso é insuficiente se o resolver puder trocar WebM por AAC. Validar identidade e tamanho/indicadores disponíveis; se mudou, terminar o trabalho antigo e reiniciar num parcial novo, nunca concatenar bytes incompatíveis.
4. Conversão inválida, codec recusado ou transporte incompatível fazem uma única transição controlada para AAC. Preservar `runId`, cancelamento, posição quando aplicável e intenção de pausa. O pedido de AAC tem política explícita para não voltar ao 251 através do memo.
5. Se só houver HLS utilizável, seguir o caminho atual de HLS, sem tentar remux WebM. Se não houver progressivo compatível, manter HLS e depois os recursos já existentes. Conservar HLS sem EQ. Falha de codec Opus deve ser distinta de falha do transporte, para não desligar indevidamente AAC-stream durante três dias.
6. **Manter `CACHE_VERSION = 4` para AAC.** Acrescentar namespace/versão de transformação independente para Opus, por exemplo ficheiros `yt-opus-v1-<id>.m4a`, com codec/contentor explicitamente descritos. Não invalidar nem renomear em massa os AAC existentes.
7. Lookup escolhe uma variante completa compatível. Um AAC existente toca imediatamente; não fazer upgrade para Opus no caminho crítico nem iniciar redownload em massa. Falha de uma variante não elimina a outra.
8. Inventário, migração para Documents, limpeza de parciais, remoção por faixa, LRU e Clear cache reconhecem os dois namespaces. Os bytes contam ficheiros reais; a lista mostra uma faixa, não uma linha por codec. Pins continuam por faixa e protegem pelo menos a cópia compatível necessária para cumprir o pedido offline.
9. Desligar Opus impede novas seleções, mas não apaga ficheiros. Para rollback completo, incluir os novos nomes na limpeza antes de ativar o codec; um binário muito antigo pode ignorá-los e exigir recuperação AAC online. Não prometer offline em versão incompatível quando só existe Opus.

### EQ e normalização

> **A lição da 3.7.6, que vale aqui (22/9).** A velocidade partiu-se porque
> duas coisas escreviam na taxa do mesmo AVPlayer -- o módulo nativo e a vigia
> do expo-video -- e cada uma achava que mandava. Qualquer coisa que esta
> secção acrescente ao lado do expo-video (um asset diferente, um tap
> reinstalado, um item construído por nós) tem de responder à mesma pergunta
> antes de ser escrita: **quem mais mexe nisto, e o que é que essa outra parte
> faz quando encontra um valor que não reconhece?**

O EQ recebe áudio descodificado através do `MTAudioProcessingTap`, pelo que não se prevê um DSP diferente por codec. Isso não confirma o formato concreto entregue ao tap. O Swift atual lê taxa/canais e processa buffers como Float32; no protótipo, registar ASBD e validar formato, bits, interleaving e canais. Se o formato não for suportado, usar bypass seguro em vez de reinterpretar buffers. Preparar isto fora da callback de processamento, sem alocações/bloqueios em tempo real. Confirmar o efeito audível nos dois motores usados pelo crossfade e preservar os ajustes locais existentes.

Manter `loudnessDb` da mesma resposta do player, `loudnessCache` por vídeo, atenuação apenas e fades até `ceilingRef`. Preservar o output gain próprio do Opus na sinalização, sem o aplicar outra vez como loudness. Testar cache Opus offline, fallback AAC e valores ausentes; não acrescentar um pedido de normalização.

### Ficheiros a tocar

| Área | Ficheiros |
|---|---|
| Seleção e identidade | [ytstream.ts](C:/Users/Utilizador/Desktop/duotone-main/src/api/ytstream.ts); novo módulo puro de seleção/capacidades, se necessário. |
| Remux puro | Novos ficheiros propostos: `C:/Users/Utilizador/Desktop/duotone-main/src/lib/webmOpus.ts`, `opusMp4.ts` e `opusAoVivo.ts`. Fixtures e gerador de referência em `scripts/`, sem dependência FFmpeg na app. |
| Transferência e variantes | [youtubeCache.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/youtubeCache.ts), [YouTubePlayerView.tsx](C:/Users/Utilizador/Desktop/duotone-main/src/components/YouTubePlayerView.tsx), consumidores/renovações em [descarregarFaixa.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/descarregarFaixa.ts) e inventário introduzido no problema 2. |
| Transporte | Ponte e Swift de `modules/duotone-stream` identificados no problema 1, incluindo content type compatível com a variante. |
| EQ, diagnóstico e qualidade | [DuotoneEq.swift](C:/Users/Utilizador/Desktop/duotone-main/modules/duotone-audio/ios/DuotoneEq.swift), [loudness.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/loudness.ts), [loudnessCache.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/loudnessCache.ts), [efeitoDasDefinicoes.ts](C:/Users/Utilizador/Desktop/duotone-main/src/lib/efeitoDasDefinicoes.ts). Loudness só precisa de alterações se a integração revelar necessidade; preservar matemática. |

### Testes, aparelho e rollback

Scripts novos registados no `npm test`, Node puro, seguindo `.mjs` com harness ou `.ts` com strip-types/resolver do repositório:

| Script proposto | Casos essenciais |
|---|---|
| `scripts/test-webm-opus.ts` | VINTs, cortes em todas as fronteiras, tamanhos desconhecidos, seleção de track, lacing, timestamp signed, padding, truncamento, entradas inválidas e limites. |
| `scripts/test-opus-mp4.ts` | `dOps` e endianness, pacotes preservados por hash, TOC variável, offsets/tamanhos, timeline, priming uma vez, padding e pré-roll. Parser/verificação independente do writer e fixtures de referência. |
| `scripts/test-opus-ao-vivo.mjs` | Equivalência completo/fluxo, saída antes de EOF, memória limitada, backpressure, aborto, falha sem publicação e contadores entrada/saída diferentes. |
| `scripts/test-escolha-codec.ts` | iOS/capacidade, ausência de 251 direto, saver, fallback AAC/HLS, memo e renovação sem troca silenciosa de representação. |
| `scripts/test-cache-codecs.mjs` | AAC v4 intacto, variantes coexistentes, dedupe por faixa sem mistura de bytes, pin/LRU/Clear cache, publicação atómica e rollback. |

Expandir regressões de stream, publicação, loudness e EQ quando as interfaces mudarem. Não testar apenas que o próprio writer lê o que escreveu; comparar estrutura e payload com fixtures produzidas independentemente. Comparações PCM/espectrais podem ser feitas fora da suite Node, para validação, sem introduzir transcodificação na app.

**Só no iPhone/EAS:** suporte efetivo ao codec/contentor, ResourceLoader com comprimento inicialmente desconhecido, pre-skip e fim sem corte/silêncio, duração real no lock screen, seek após salto, ASBD do EQ, varispeed, crossfade, interrupções/saídas de áudio, bloqueio do ecrã antes do download terminar, memória/CPU/bateria. Se faltar um aparelho com versão inferior a 17, testar a decisão em Node e registar que o comportamento nessa versão não foi observado fisicamente.

Riscos principais: suporte Safari não se traduzir no AVPlayer; temporização/priming incorretos; comprimento de saída incompatível com o transporte; consumo de CPU/memória no JS; mistura de representações após renovação; fallback em ciclo. Cada um tem teste ou condição de avanço explícita acima.

Rollback com flags internas separadas para seleção Opus e Opus em fluxo. AAC continua disponível e com formato/cache intactos. Desativar seleção de Opus perante incompatibilidade comprovada, sem apagar AAC nem reset global do stream. Reverter o writer Opus não implica reverter a correção do arranque ou a semântica de Download.

## Ordem de entrega e critérios de conclusão

**Ordem revista a 22/9, à noite.** A tabela original fica por baixo, riscada.

| Entrega | Conteúdo | Condição para concluir |
|---|---|---|
| 1 — downloads | Intenção persistida, pin automático, menus/ícone/lista, offline e a migração simplificada (pins migram; o resto é cache, protegida 7 dias). | Só pedidos explícitos aparecem concluídos e sobrevivem ao LRU; toda a cache válida continua tocável offline; Clear cache remove tudo. |
| 2 — viabilidade Opus | Uma fixture MP4-Opus e uma CAF-Opus, geradas fora da app, tocadas numa build EAS. | O AVPlayer toca do princípio ao fim, com a duração certa no ecrã bloqueado, e com seek, pausa, velocidade, EQ e crossfade a comportarem-se. Se falhar nos dois contentores, o Opus morre aqui e o plano fecha-se sem dívida. |
| 3 — Opus de produção | Conversor WebM→MP4 (ou CAF) em modo ficheiro, seleção do 251, cache com os dois formatos, recuo automático para AAC. | Não atrasa o arranque mais do que o AAC de hoje, o AAC existente continua a tocar sem ser reconvertido, e passa a matriz de aparelho. |
| — em espera | O arranque (problema 1) e o remux em fluxo. | Só se o stream for religado. |

~~| Entrega | Conteúdo | Condição para concluir |~~
~~| 0 — diagnóstico | Correlação local, origem correta, estado nativo antes do som e saúde hidratada. | Um relatório permite distinguir adesão, fila, cooldown e ranges futuros. |~~
~~| 1 — arranque AAC | Prova no aparelho, escritor partilhado, consumidores/cancelamento, publicação. | Na faixa fria e na adoção de adiantamento, som antes de terminar e sem redownload. |~~
~~| 2 — downloads | Intenção persistida, pin automático, menus/ícone/lista, offline e migração. | Só pedidos explícitos aparecem concluídos. |~~
~~| 3A — viabilidade Opus | Fixture local, depois crescimento conhecido, depois saída de comprimento desconhecido. | As três provas passam. |~~
~~| 3B — Opus de produção | Remux JS, fluxo, identidade de representação, variantes de cache e fallback. | Não piora o arranque. |~~

Esta ordem evita diagnosticar simultaneamente um novo codec, um novo contentor e o problema de adesão a downloads. A infraestrutura do problema 1 é reutilizada pelo 2 e pelo 3; a separação de intenção do problema 2 prepara a coexistência de variantes sem duplicar a UI.

Em cada entrega futura, atualizar [package.json](C:/Users/Utilizador/Desktop/duotone-main/package.json) com os scripts novos e registar no CLAUDE as decisões e resultados reais. Correr typecheck e testes antes da build. Após alterações em `modules/`, regenerar o projeto nativo pelo fluxo de prebuild e produzir build EAS para sideload. O checkout também contém build iOS em CI macOS; nenhum teste Node nem execução Windows valida compilação Swift ou comportamento no iPhone.

**Estado deste trabalho:** inspeção estática do repositório e consulta de fontes primárias concluídas. Não foi alterado código da app, executada a suite, lançada uma build ou validado áudio num aparelho. O único artefacto criado é este plano.
