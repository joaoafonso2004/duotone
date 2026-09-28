# Plano de implementação — Duotone v1.10.6

Data: 06/09/2026. Referência: `2860a74` (`ios-v1.10.6` e `win-v1.10.6`). Checkout analisado: `ab9b217`, com alteração adicional de pesquisa. Relatório: [RELATORIO.md](./RELATORIO.md).

## Restrição confirmada — atualização do Electron já revertida

Após esclarecimento do utilizador, foi revisto o histórico: `e5fbed3` atualizou para Electron 44; `b59bc64` corrigiu uma incompatibilidade de lockfile entre npm 11 local e npm 10 da CI; `5a6d194` reverteu para 37.10.3 após falha de empacotamento `The specified electronDist does not exist: node_modules/electron/dist`. A mensagem da reversão atribui a ausência do binário à mudança no mecanismo de instalação do Electron 44. Esta causa está documentada no histórico, mas não foi reproduzida nesta auditoria.

**Decisão:** manter Electron 37.10.3 e o lockfile atual como baseline funcional. Não repetir o upgrade para 44 por simples alteração de versão. F1.1 passa a investigação isolada da cadeia de instalação/empacotamento, sem bloquear cofre, IPC, integridade ou cache. A atualização só será candidata após instalação limpa com o mesmo Node/npm da CI, obtenção verificada do binário, instalador produzido e execução real com áudio/EQ/captura. O risco de segurança do runtime antigo continua registado; as mitigações da app não substituem patches do Chromium/Electron.

Qualquer alteração futura ao lockfile deve usar a versão de npm fixada para a CI, preservando dependências transitivas e metadados de scripts de instalação. Os comandos npm 11 usados nesta auditoria foram de leitura/teste e não regeneraram o lockfile.

## Estado de trabalho

- [x] Confirmar referência de release e diferenças do checkout.
- [x] Mapear áudio, cache, Auth, Electron, módulos iOS, SQL e capacidades de produto.
- [x] Executar typecheck e bateria de testes existente.
- [x] Auditar dependências incluindo o runtime Electron em devDependencies.
- [x] Reproduzir cinco casos não cobertos pelos testes existentes.
- [x] Preparar guardas candidatas e validá-las em isolamento.
- [x] Reunir roadmap e organizar execução, dependências e critérios de saída.
- [ ] Implementar alterações de produção e migrações.
- [ ] Medir desempenho em dispositivos e validar binários.
- [ ] Distribuir beta e promover release.

## Contrato de estabilidade

As funcionalidades gratuitas da v1.10.6 são a referência: pesquisa/importação, biblioteca/playlists, fila/shuffle/repeat, letras, offline, crossfade iOS, ajustes/EQ por faixa, widget, social, handoff e controlos atuais. Nenhuma passa para Premium como consequência da auditoria. Uma substituição só entra quando cobre os mesmos cenários suportados, com regressões verificadas. Não descartar ficheiros offline antigos para simplificar migração.

Cada alteração terá um objetivo, testes ligados ao modo de falha e um diff pequeno. Separar atualização de runtime, segurança, armazenamento e motor. Usar branches `codex/...` quando a implementação começar; não criar releases nem reescrever a branch do utilizador nesta análise. Preservar a alteração de pesquisa posterior à tag, integrando-a conscientemente na próxima base de trabalho.

Sem promessas de ganho não medido: orçamentos abaixo são metas iniciais a calibrar. Uma alteração de performance será aceite com comparação antes/depois nos mesmos dispositivos, faixas e condições de rede. A redução de um contador de timers não equivale a redução provada de bateria.

## F0 — Baseline de produto e ensaio reprodutível

Esforço: 2–3 dias de engenharia, mais disponibilidade de hardware. Não bloqueia escrever correções pequenas, mas bloqueia afirmar equivalência de áudio/performance.

| Ticket | Trabalho | Dependências | Critério de saída |
|---|---|---|---|
| F0.1 | Fixar release/base e manifest por plataforma; impedir `write-build-info` de apagar o SHA da CI | Nenhuma | Ecrã Sobre, bundle, instalador e logs identificam a mesma release/commit. |
| F0.2 | Criar fixtures locais de áudio e servidor controlado de Range/HLS | Nenhuma | Mono/estéreo, 44,1/48/96 kHz, faixa curta/longa, MP4 v0/v1, final arredondado, silêncio inicial/final. |
| F0.3 | Capturar perfil iOS e Windows | Dispositivos reais | Baseline de RSS/heap, CPU, bloqueios de UI, arranque até áudio e gaps documentado. |
| F0.4 | Inventário de funcionalidades e capacidades por fonte/plataforma | Relatório | Matriz aceite como referência gratuita; não prometer lossless/espacialização da fonte atual. |
| F0.5 | Confirmar estado das migrações Supabase por leitura em ambiente autorizado | Acesso ao ambiente | Lista de migrações/policies/RPCs instaladas comparada com repo; nenhuma aplicação automática. |

Instrumentação: timestamps monotónicos por run/track para pedido, resolução, primeiro byte, ficheiro validado, player pronto e primeiro avanço real; a medição acústica do primeiro som requer loopback/captura externa. Guardar p50/p95/p99, não apenas média. Não incluir JWT, URLs assinados completos ou passwords em telemetria. A configuração de recolha/exportação deve respeitar a escolha do utilizador.

## F1 — Segurança e guardas de integridade

Prioridade imediata para guardas e mitigação. Esforço: 1–2 semanas para correções compatíveis com a base atual; a investigação e eventual migração do runtime têm estimativa separada, a definir após reproduzir o problema de build.

| Ticket | Trabalho concreto | Dependências | Critério de saída |
|---|---|---|---|
| F1.1 | Investigar em ambiente isolado a reversão 5a6d194: Node/npm/lockfile, instalação do binário, electronDist e builder; classificar advisories | F0.2; histórico revisto | Reprodução do erro e candidato com instalação limpa, binário/instalador verificados e testes reais de iframe/EQ/captura/permissões/teclado/tray. Só então propor versão exata para promoção. |
| F1.2 | Cofre Keychain/DPAPI com migração serializada e rollback seguro usando APIs da versão atual | F1.4 para proteger a fronteira IPC; helpers já preparados | Refresh/login/logout/reinstalação/troca de conta/payload grande passam; tokens não permanecem no storage legado após migração confirmada. |
| F1.3 | Validar MP4 antes de modificar/publicar; ranges exatos e limites de metadados | Candidatas e fixtures | Casos adversariais rejeitados sem modificar bytes válidos; duração real e moof/mdat preservados. |
| F1.4 | Aguardar servidor local e falhar antes da janela em colisão; endurecer IPC/CSP/permissões na versão atual | Baseline Electron 37.10.3 | Porta ocupada não carrega outra origem; frames estrangeiros não acedem ao cofre; não conceder microfone/câmara por uma permissão genérica de media. |
| F1.5 | Mitigar concorrência na RPC de login e preparar substituição por backend mediado | F0.5 + staging | Username mantém fluxo; casos inexistente/errado não revelam identidade; rate limit por origem/conta e concorrência verificados. |
| F1.6 | Corrigir dependências de build vulneráveis via versões upstream compatíveis, usando Node/npm alinhados com CI | Reprodução da instalação limpa atual; sem depender do upgrade Electron | Prebuild/widget/builds passam; exceções específicas documentadas por advisory, nunca ignorar toda a árvore. |

**Ordem de execução escolhida:** F1.3 (guardas pequenas com regressões claras), F1.4 (fronteiras Electron atuais), F1.2 (cofre), F1.5/F1.6. F1.1 é investigação separada; não retirar estabilidade às entregas restantes para repetir uma atualização já revertida. Uma alteração de CSP começa em observação e só entra em enforcement depois de inventariar os recursos legítimos, incluindo imagem, iframe e serviços externos.

Reversão: reverter o código da funcionalidade, mas manter leitor compatível com o cofre novo e os formatos publicados. Não “reverter” segurança copiando tokens de volta para AsyncStorage. A reversão de migração SQL é preparada em staging e não elimina dados reais sem um plano específico.

## F2 — Downloads, cache e orçamento de recursos

Esforço: 2–3 semanas. Dependências: F1.3 e F0.2. Esta é a maior intervenção no núcleo e merece uma fase própria.

| Ticket | Trabalho concreto | Critério de saída |
|---|---|---|
| F2.1 | Downloader nativo/worker com escrita incremental em `.part`, limite de bytes real, cancelamento por evento e fila de prioridade | Aumento de memória de download deixa de crescer proporcionalmente ao tamanho total; meta inicial <=16 MiB adicionais por job, a medir. |
| F2.2 | Job único por representação, múltiplos consumidores, prefetch subordinado | Play + download explícito da mesma faixa transferem uma vez; cancelar prefetch não cancela download explícito. |
| F2.3 | Manifest transacional com bytes/digest/versão/pin/lastAccess e leases | `.part` nunca aparece offline; crash antes/depois do commit é recuperável; não apagar ficheiro em reprodução. |
| F2.4 | Migrar cache antigo preservando conteúdo | Ficheiros antigos ficam preservados até decisão explícita; falha não apaga downloads; cache automático novo tem orçamento separado. |
| F2.5 | Renovação com identidade de formato; retry com deadline global | URL de outro itag/total não é colado no mesmo ficheiro; mudança de IP recupera ou reinicia com mensagem clara. |
| F2.6 | UI de downloads e gestão de espaço | Estado de progresso/falha/cancelamento/fixado coerente; HLS sem suporte offline não simula sucesso; aviso de espaço livre. |
| F2.7 | Data Protection/ACLs e política de backups | Download toca com ecrã bloqueado após primeiro desbloqueio; cache regenerável excluído de backup; sem prometer DRM. |

Modelo de entrada proposto:

```ts
type AudioEntry = {
  key: string; // inclui fonte, ID, representação/itag e qualidade
  file: string;
  bytes: number;
  sha256: string; // integridade local; não prova origem isoladamente
  formatVersion: number;
  representation: { mime: string; codec: string; itag?: string; etag?: string };
  pinned: boolean;
  lastAccessedAt: number;
};
```

Os leases de leitura e jobs em curso são estado de execução, não pins permanentes. O manifest tem de ser validado/hidratado antes dos badges. Os dados de biblioteca por conta continuam isolados; partilhar bytes públicos por ID, se mantido, não autoriza revelar biblioteca/histórico de outra conta. Documentar “remover da biblioteca”, “remover download”, “limpar cache” e “terminar sessão” como operações distintas.

Manter MP4 progressivo descarregado completamente antes de AVPlayer nesta fase. Transportes incrementais/HLS só substituem esse fluxo depois de ensaios com duration/seek/background; não repetir a tentativa já documentada de passar simplesmente o URL problemático a AVPlayer.

Reversão: feature flag seleciona downloader antigo apenas para entradas/formatos compatíveis e sem voltar a publicar parciais. Conservar leitor dos manifest novos. Rollback não elimina ficheiros ou pins.

## F3 — Ciclo de áudio, latência e dispositivos

Esforço: 1–2 semanas após instrumentação; desenvolver partes independentes de F2 se necessário.

| Ticket | Trabalho | Critério de saída |
|---|---|---|
| F3.1 | Evento de rota removida, intenção/generation para retoma e reset dos serviços media | Sem reprodução inesperada ao reconectar, terminar chamada ou trocar faixa; ambos os motores pausam. |
| F3.2 | Tirar carregamento de tracks da main; proteger resultado por motor/item | Trocas rápidas descartam resultados antigos; nenhum audioMix no item errado. |
| F3.3 | Validar formato/canais/frames no tap; preservar estado sem locks/I/O/alocações em process | Teste nativo/loopback 44,1/48/96 kHz, mono/estéreo; sem NaN/Inf nem acesso fora do buffer. |
| F3.4 | Suavizar alterações de EQ sem reconstruções audíveis | Comparação de onda e escuta cega; EQ flat não acrescenta DSP desnecessário. |
| F3.5 | Limitar artwork por bytes/resolução e requisições por deadline | Memória estabiliza após ciclos de 100 faixas; grelhas externas grandes são recusadas antes de alocar. |
| F3.6 | Deadline por etapa de resolução/rede e tratamento de stalls | Cancelar seleção chega ao fetch; nenhum estado “a resolver” infinito; recuperação preserva intenção e posição. |
| F3.7 | Separar renderizações de progresso das árvores pesadas onde o profiler justificar | Comparação do número de commits React e frames longos; remover bloco cross-origin redundante já identificado. |

Não recriar AVAudioSession por módulo nem mudar a matemática de normalização/fixer para esconder sintomas. Um watchdog limitado pode continuar como rede de segurança; eventos nativos ficam responsáveis por interrupção, rota e fim. Não substituir timers de progresso por subscrições que não existem na IFrame API. Windows tem modelo de mistura/ducking distinto do iOS: testar coexistência com chamadas, não impor exclusividade sem decisão de UX.

Reversão: desativar apenas a nova suavização/DSP, conservando o EQ atual e seus presets. Um formato não suportado deve tocar sem processamento e mostrar essa limitação, não produzir ruído nem alterar os dados guardados.

## F4 — Integrações nativas e Quick Wins

Esforço: 1–2 semanas. Requisitos F1/F3 para controlos de sistema; a UI de downloads depende de F2.

| Ticket | Entrega | Validação |
|---|---|---|
| F4.1 | Media Session: seek/posição, limpeza dos handlers e uma autoridade por comando | SMTC mostra metadata correta; uma tecla produz uma ação, incluindo quando outra app toca. |
| F4.2 | Botões de thumbnail na barra de tarefas | Next/prev/play/pause usam store e ficam desativados corretamente sem faixa. |
| F4.3 | Melhorias de estado/retry e acessibilidade | VoiceOver/teclado, escala de texto e reduced motion; erro recuperável sem apagar fila. |
| F4.4 | Protótipo mini-player Windows com uma janela de controlo | Fechar/minimizar não cria segundo player; ponte limitada; suporte multi-monitor e DPI. |
| F4.5 | Ensaiar Now Playing/Dynamic Island atual | Metadata, arte, duração e comandos corretos; distinguir comportamento nativo de ActivityKit personalizado. |

F4.4 é candidato a valor Premium adicional, mas a execução inicial deve provar o controlo de uma única sessão. “Always on top” Electron é uma solução equivalente de UX a investigar; não lhe chamar implementação nativa WinUI CompactOverlay sem a construir e testar.

## F5 — Validação de produto e Premium

Decisões podem começar em F0. Implementação após estabilidade dos fluxos que suportam a proposta.

| Ticket | Trabalho | Evidência para avançar |
|---|---|---|
| F5.1 | Confirmar público e tarefas principais com 8–12 entrevistas | Linguagem dos utilizadores e problemas recorrentes; separar hipóteses de procura real. |
| F5.2 | Prototipar perfis de saída, regras de biblioteca e recuperação de playlists | Utilizadores concluem tarefas e valorizam benefício; não só avaliação estética. |
| F5.3 | Definir pacote/gratuito e modelo comercial | Mantém baseline gratuito; preço dependente de disposição a pagar/custo contínuo, ainda não fixado. |
| F5.4 | Separar capacidades por fonte e distribuição | Caminho suportado para ficheiros pessoais/fontes licenciadas; não depender comercialmente de extração frágil sem resolver condições da fonte. |
| F5.5 | Beta restrita de uma funcionalidade nova | Adoção repetida e retenção antes de lançar várias features pagas simultaneamente. |

Roadmap posterior: análise de silêncio para crossfade, App Intents/atalhos, widget interativo, cache por padrões com consentimento/orçamento, Live Activity de sessão e espacialização opcional. Cada item precisa de hipótese de valor, medição e fallback; não há necessidade atual demonstrada de microserviços, reescrita total ou GPU no motor de áudio.

## Matriz de aceitação de resiliência

| Cenário | Resultado exigido | Onde validar |
|---|---|---|
| Offline ao iniciar / JWT expirado / reconexão | Biblioteca local abre; remoto recupera sem misturar contas | iOS real e testes de store/Auth |
| 4G↔Wi-Fi, IP alterado, latência/jitter/perda | Recupera URL/representação ou explica falha; não troca conteúdo nem duplica fila | Servidor de fixtures + iPhone |
| CDN 200, 206 errado, truncado, sem Content-Length, corpo excessivo | Range validado; nenhum parcial promovido; teto real de RAM/rede | Testes transporte/nativos |
| DNS sem resposta / resolver pendurado / 401/403/410/429/5xx | Deadline global, Retry-After quando aplicável, cancelamento efetivo e mensagem tipada | Fixtures + integração |
| Espaço cheio / crash durante gravação / manifest corrupto | Conteúdo bom preservado, estado offline honesto, recuperação determinística | Simulação I/O + dispositivo |
| Download explícito + prefetch + play da mesma faixa | Um job; nenhum cancelamento indevido nem sobrescrita em leitura | Concorrência controlada |
| 50 next/prev rápidos / fechar durante download | Só o último run publica estado; jobs órfãos terminam; memória regressa ao patamar estável | iOS/Windows e teste de gerações |
| Desligar Bluetooth/fio durante crossfade | Pausa ambos os motores; sem saída inesperada pelas colunas | iPhone físico |
| Chamada/alarme e pausa manual no intervalo | Retoma só com permissão do sistema e intenção ainda válida | iPhone físico |
| DAC 44,1↔48↔96 kHz / media-services reset | Reconstrução segura; sem ruído, NaN ou áudio duplicado | DAC + build nativa |
| Windows foco multimédia, chamada, sleep/resume | Estado consistente, sem teclas duplicadas ou disputa indevida | Windows instalado |
| Janela oculta, efeito estático/off, reduced motion | Sem trabalho visual desnecessário; reprodução conserva comportamento | Electron profiler |
| Atualização sobre instalação v1.10.6 | Conta, biblioteca, fila, downloads e ajustes sobrevivem | Instalador/IPA reais |

## Metas iniciais de engenharia — a calibrar com F0

- Downloads: memória adicional <=16 MiB por job independente do tamanho total; medir RSS nativo e heap JS, não apenas heap.
- Cancelamento: meta p95 <=250 ms até parar I/O ativo; hoje o polling pode detetar em ~100 ms, mas sleeps/resolve sem cancelamento podem dominar.
- UI: evitar novo trabalho síncrono que exceda o frame budget de 16,7 ms a 60 Hz; medir também devices 120 Hz.
- Cache hit local: medir arranque até primeiro som e evitar regressão p95 >10% contra baseline; valor absoluto será fixado com hardware.
- Estabilidade: 2 h de reprodução/crossfade + 100 trocas, sem crash, áudio duplicado ou crescimento monotónico não explicado após estabilizar caches.
- Integridade: nenhum ficheiro inválido publicado por fixtures adversariais; digest/manifest consistentes após interrupção de gravação.

Não tratar a ausência de crash em testes JS como prova de thread safety Swift. Antes de promover F3, verificar alocações/locks no callback e percursos de prepare/unprepare/reset em build Release.

## Próxima ação operacional

Começar por F1.3: extrair os validadores candidatos para `src/lib`, ligar as guardas sem alterar a duração canónica, adicionar as reproduções como regressões que exigem rejeição do input inválido e executar a suite. A seguir, reforçar IPC/arranque e preparar a migração de credenciais compatível com Electron 37.10.3. Investigar a migração do runtime separadamente a partir da reversão documentada, sem mudar a versão funcional. A implementação só estará concluída quando os critérios de saída dos respetivos tickets passarem; este plano não marca correções propostas como já feitas.
