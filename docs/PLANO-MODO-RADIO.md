# Modo Rádio — plano de implementação

Estado: modo na fila implementado no código iOS e Windows; 210 scripts de teste e TypeScript passaram. Falta validar o som e os gestos numa build instalada.
Data: 5 de outubro de 2026.

> **Mudou no mesmo dia, a pedido do João** ("o Radio deve ser infinito"):
> as âncoras passaram a aprender com a sessão (núcleo + escutas − saltos,
> `ancorasDoRadio`), o Radio tenta outras sementes quando um lote vem vazio em
> vez de acabar, liga também durante o Listen along (e deixa de seguir), e
> sobrevive a fechar a app. As linhas abaixo sobre âncoras fixas, Listen along
> e persistência ficam como registo da primeira versão.

## Decisão de produto

O Rádio é uma escolha visível na fila, baseada nas músicas realmente ouvidas nesta sessão antes da ativação. Ligar substitui as próximas músicas por sugestões relacionadas; a música atual, posição, pausa e motor de áudio permanecem intactos. Por decisão do utilizador em 5/10, o interruptor atua diretamente, sem confirmação. «Undo» permite recuperar a fila anterior enquanto a música atual e a fila não mudarem.

O utilizador escolheu o interruptor entre «Now playing» e «Up next». No Windows fica no topo do painel «Up next». O controlo apresenta apenas Radio, interruptor e Undo após ativar. O nome acessível explica o efeito e o contexto; erro ou indisponibilidade têm texto visível curto. A indicação «From Radio» já existente acompanha as sugestões no leitor.

## O que já existe

- `src/api/radio.ts`: `fetchRadioTracks` procura músicas da biblioteca, catálogo semelhante e canais musicais confirmados. No rádio pessoal, existe um último recurso para `getFlowMix`, que usa o gosto geral da conta e pode sair do contexto escolhido.
- `src/state/player.ts`: `autoplayRadio` é uma preferência para continuar no fim da fila; `radioActive` indica que já entraram sugestões. `extendQueueWithRadio` acrescenta sugestões, mas não oferece uma ação para começar rádio e substituir a fila.
- `src/lib/radioSync.ts`: observa o leitor e pede mais sugestões perto do fim da fila.
- `src/components/QueueSheet.tsx` e `src/desktop/paginas/NowPlayingPage.web.tsx`: já mostram a fila e a origem RADIO/SHARED.

Não reutilizar `autoplayRadio` como o novo interruptor: repor uma preferência no arranque não pode apagar uma fila escolhida pelo utilizador.

## Comportamento

| Ação/estado | Resultado |
| --- | --- |
| Ligar com uma música atual | Preparar sugestões diretamente, sem confirmação e sem interromper a música. Só substituir a fila depois de obter resultados válidos. |
| Ativar com sucesso | Preservar o item atual; eliminar as próximas músicas da fila pessoal e inserir o lote de rádio. Mostrar «Undo» na linha. |
| Falhar ou não encontrar sugestões | Conservar a fila original e deixar o interruptor desligado. Dar uma mensagem e uma ação para tentar novamente. |
| Desligar | Parar o preenchimento automático. As músicas já geradas continuam na fila. |
| Undo | Restaurar as próximas músicas originais e a ordem de shuffle, se ainda estivermos na música da ativação. Desligar Rádio. Não alterar posição ou pausa. |
| Play numa outra playlist/álbum | Encerrar o modo rádio e respeitar a nova fila explícita. |
| Adicionar/remover uma música manualmente | Respeitar a edição; invalidar o Undo da fila inteira para não apagar a nova escolha. |
| Escolher outra música durante a preparação | Cancelar a ativação pendente. A resposta antiga nunca substitui a fila nova. |
| Sem música atual ou offline | Interruptor indisponível, com motivo curto. Não apagar a fila. |
| Jam ou Listen along | Na primeira versão, Rádio pessoal indisponível. Nunca substituir a fila partilhada a partir deste controlo. |

O contexto vem das últimas 20 escutas confirmadas desta execução da app, isoladas por conta. Uma escuta confirma-se ao passar metade da duração ou quatro minutos, o que ocorrer primeiro: cliques, seeks e músicas ainda por tocar não contam. Agrupar por artista, ordenar por frequência nesta sessão e desempatar por recência produz até três sementes distintas. Sem escutas confirmadas, usar a música atual. As referências capturadas mantêm-se durante o modo; as sugestões geradas não passam a escolher outro contexto por si próprias.

Isto aproxima o rádio do som da sessão através de parentesco musical confirmado no catálogo e das músicas desses artistas. Não é uma garantia de género perfeita: metadados ambíguos e sessões com géneros misturados continuam a exigir validação com exemplos reais. Se faltar parentesco confirmado, preservar a fila em vez de preencher com Flow global.

## Implementação

1. **Estado e ação em `player.ts`.** Implementados `radioMode: off | preparing | on`, contexto da sessão e contador de pedidos; `radioSession.ts` calcula as sementes. `startRadio` e `stopRadio` vivem no store; o snapshot transitório e Undo vivem em `RadioQueueControl.tsx`. A ativação verifica identidades da música/fila, conta, contador de pedidos e Jam/offline depois das esperas. Atualiza fila, índice, `doRadio` e shuffle numa alteração de estado. Não chama `playTrack`, `seek` ou recria o motor.
2. **Rádio contextual em `radio.ts`.** Acrescentar uma opção explícita de contexto estrito. Neste modo, não usar `getFlowMix` como último recurso. Reutilizar filtros de feedback, exclusões, artistas confirmados, equilíbrio entre faixas conhecidas/novas e memória de descoberta. A opção antiga de autoplay continua separada, sem mudança incidental nesta entrega.
3. **Reposição em `radioSync.ts`.** Pedir até 12 sugestões quando restarem 3 ou menos. Um pedido em voo por contexto; reutilizar biblioteca/afinidade partilhadas e catálogo em cache. Excluir músicas atuais, geradas e já ouvidas. Uma resposta que ficou obsoleta é descartada. Se só houver 1–2 sugestões relacionadas, aceitá-las; a fila apresenta a quantidade real. Não preencher com artistas aleatórios.
4. **Conflitos do leitor.** Ligar desativa repeat e Smart Shuffle para evitar três geradores a competir. A fila de rádio fica inicialmente em ordem normal. O shuffle normal pode reordenar as sugestões, mantendo a âncora do rádio. Guardar as preferências anteriores para recuperar com Undo; o desligar normal não volta a ativar opções inesperadamente.
5. **UI iOS e Windows.** Usar o interruptor nativo com ativação direta, loading local e Undo. Sem confirmação ou descrição permanente. No Windows reutilizar a mesma lógica do store. Conservar a indicação «From Radio» e os acessos à fila já existentes no leitor.
6. **Persistência.** A fila e posição continuam restauráveis e voltam em pausa. O modo, referências e histórico desta sessão não sobrevivem ao encerramento da app. Guardar apenas que o preenchimento foi interrompido, para o autoplay antigo não transformar a fila restaurada noutra mistura. Voltar a ligar começa uma sessão nova; não persiste Undo nem cria estado deste modo no Supabase.

## Verificação desta implementação

- `scripts/test-radio-mode.ts` executa o store real e cobre contexto de escuta, isolamento de conta, conservação do áudio/posição, reposição com referências estáveis, OFF e respostas tardias após edição da fila, troca de conta, offline ou entrada num Jam.
- `scripts/test-api-regressions.mjs` executa a descoberta real com fixtures: o modo estrito não consulta Flow global; sem canal confirmado devolve vazio; o modo antigo conserva o comportamento separado.
- `npm test`: 210 scripts passaram; `npx tsc --noEmit`: passou. Os ajustes posteriores de estado/ações foram também verificados pelos testes do store e da página.
- Sem nova build ou tag nesta entrega. A verificação num iPhone continua necessária para confirmar qualidade musical, VoiceOver, ativação direta/Undo e ausência de cortes audíveis.

## Critérios de aceitação

- ON substitui exclusivamente Up next; áudio e posição não sofrem pausas, seeks ou reinícios.
- OFF durante um pedido, mudança de faixa, nova playlist, entrada num Jam e logout descartam a resposta pendente.
- Undo não apaga edições posteriores, não restaura a fila de outra conta e nunca repõe a música atual antiga.
- Rede lenta, ausência de sugestões, falha e offline não deixam a fila vazia.
- Um pedido por lote; nenhuma chamada por segundo, nenhum novo temporizador independente e nenhuma nova subscrição Realtime.
- Biblioteca e afinidade usam o snapshot partilhado; próximos lotes reutilizam caches e excluem duplicados.
- Testes dos stores cobrem índices/shuffle/repeat, fim da fila e corridas assíncronas. Validação real em iPhone e Windows confirma que ligar/desligar não mexe no som.
- Testar a descoberta com um artista pouco conhecido, incluindo Isak: sem correspondência musical confirmada, avisar em vez de entrar noutro género por Flow geral.

## Prioridades de produto depois desta entrega

1. **Confiança no leitor.** Play/pause e início das músicas no Jam têm de ser imediatos e previsíveis. Medir os bloqueios e cortes numa build instalada antes de investir em novos efeitos.
2. **Fila compreensível.** Mostrar de onde vêm as próximas músicas (playlist, escolha manual, rádio ou Jam), porque uma sugestão entrou e quem a adicionou num Jam. Ligar/desligar Rádio e Undo resolvem parte desta ambiguidade.
3. **Descoberta com contexto.** Separar «continuar este som» de «mistura do meu gosto». Rádio é a primeira; Flow é a segunda. Dar feedback útil com poucos gestos, reaproveitando os filtros existentes.
4. **Desempenho e consumo como condição de release.** Comparar bytes por hora de escuta e por operação, com iOS e Windows atualizados. Quotas mensais sozinhas não explicam quais ações voltaram a gastar mais.

Não faria agora uma refatoração grande do leitor nem outro redesenho completo do perfil. A estabilidade e uma fila que se percebe têm maior impacto nesta fase.
