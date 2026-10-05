# Quatro pontos de desempenho e sincronização

Implementados em 5 de outubro de 2026 no checkout `duotone-main`. As alterações do cliente ainda precisam de chegar às builds iOS e Windows. A migração `supabase/sincronizacao-economica.sql` já foi executada e verificada no projeto Duotone.

## Playlists

Biblioteca e afinidade usam o mesmo snapshot por conta, em memória e AsyncStorage. A revisão do servidor é verificada no máximo uma vez por 15 segundos quando há uma leitura; uma consulta sem alterações devolve apenas revisão e lista vazia. Até 20 playlists alteradas são relidas individualmente; apagamentos removem dados locais sem transferir outras playlists. Há uma reconciliação completa diária para alterações dos metadados do catálogo. Detalhes de playlists próprias já conhecidas reutilizam estes dados; playlists dos amigos mantêm a leitura normal sujeita à RLS.

Teste: duas chamadas concorrentes para 2105 faixas partilham 3 páginas; reinício com revisão igual transfere 0 linhas de faixas. Alterar uma playlist relê só essa playlist. Apagá-la exige 0 leituras de `playlist_tracks`.

## Bloqueios da interface

Aprendizagem de nomes de artistas, derivação de afinidade e junção de bibliotecas grandes cedem tempo à interface entre blocos. A confirmação de artistas começa depois de devolver as faixas ao ecrã. As contagens em memória evitam voltar a interpretar todo o histórico em cada leitura.

O relatório de reprodução inclui até 48 operações locais recentes acima de 8 ms, com instante e duração. Medições de espera por rede/disco são identificadas separadamente: não demonstram bloqueio da thread JS. Não são enviadas ao Supabase e não incluem IDs ou conteúdo musical.

Teste: aprendizagem de 1205 faixas produz o mesmo vocabulário que a função síncrona, cedendo a execução pelo menos 12 vezes. O relatório anterior prova que houve um bloqueio de 4443 ms, mas não identifica a função responsável; estas mudanças e medições não substituem uma nova sessão real no iPhone.

## Histórico incremental

O servidor mantém uma revisão por conta e uma linha compacta por faixa alterada, incluindo tombstones de apagamentos. A primeira sincronização lê o histórico; as seguintes recebem só alterações, em páginas de 500. Cursor e base remota são persistidos juntos para evitar perda de alterações após uma escrita interrompida.

As contagens próprias continuam imediatas. Consultas de histórico/estatísticas e reproduções podem verificar alterações após 60 segundos, sem um novo polling permanente. Uma sincronização explícita verifica já. Em servidores sem a migração, mantém-se o caminho antigo com leitura completa limitada a 30 minutos.

Teste: 1105 contagens na leitura inicial; 10 incrementos próprios não provocam mais leituras de histórico; uma atualização e um apagamento chegam como deltas. Reinício, falha de persistência, limpeza do histórico, paginação, RLS e isolamento entre contas verificados.

## Realtime e Jam

Eventos completos da fila e membros atualizam a linha diretamente. Eventos incompletos são agrupados durante 100 ms antes de uma leitura de recuperação. Reconnect continua a reconciliar o estado. Uma resposta antiga não apaga eventos mais recentes. Abrir e fechar o Centro de Controlo não repete as leituras da sala; uma passagem real por segundo plano recupera o estado.

Atualizações sociais em rajada partilham uma leitura. A presença descarta estados antigos ainda em fila e publicações equivalentes em 1,5 segundos, conservando batimentos e mudanças de privacidade. A lógica de alinhamento de áudio do Jam não recebe um intervalo de sincronização mais lento.

Teste: 12 eventos completos da fila e um evento de membro exigem 0 GETs adicionais; 12 eventos incompletos exigem 1 recuperação. Apagamentos de outras salas são ignorados. Respostas antigas não repõem uma pausa, não apagam uma adição e não reabrem uma sala abandonada.

## Servidor e validação

A migração foi aplicada sem remover histórico ou playlists. Verificação no dashboard: `history_delta_ready=true`, `playlist_delta_ready=true`, `existing_history_indexed=true`, `handoff_light_events=true`, `handoff_full_events=false`.

Validados os 208 scripts da suite, incluindo SQL, snapshot/histórico, APIs, consumo, Jam, notificações, segundo plano e Listen along. Uma asserção antiga que procurava o texto exato da publicação de presença foi adaptada à variável partilhada; os restantes scripts foram executados após essa correção. `npx tsc --noEmit` e `git diff --check` passaram. A proteção adicional contra leituras antigas da fila teve também um teste focado após a revisão final.

Falta confirmar numa build instalada: cortes no início da faixa num Jam, resposta a play/pause, bloqueios máximos e consumo real. A garantia de margem no gratuito depende da medição comparável após atualizar os dois clientes; testes locais não medem egress ou temperatura de um iPhone.
