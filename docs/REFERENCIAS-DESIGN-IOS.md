# Referências de design para o Duotone

Estudo de 5 de outubro de 2026. Foram lidos fontes e documentação selecionados dos 13 repositórios pedidos, com versões fixadas no registo de investigação. O objetivo é guardar critérios reutilizáveis para este projeto. Isso não altera o treino do modelo nem torna instruções externas regras do repositório.

## Critérios para novas alterações

1. **Uma hierarquia por ecrã.** Uma tarefa principal, ações secundárias discretas e grupos reconhecíveis. Usar tipografia e espaçamento antes de acrescentar cartões, bordas ou brilho.
2. **Tokens existentes primeiro.** Continuar com `theme/index.ts`. Separar valores estáveis de cores/estados dinâmicos; partilhar primitivas para títulos, linhas, botões e mensagens, sem obrigar iOS e desktop a usar o mesmo layout.
3. **Geometria real.** Safe area, tamanho do texto, altura da doca e teclado entram na medição. Capas mantêm proporção e ponto focal; o editor deve usar o enquadramento que a página apresenta.
4. **Interações explicáveis.** Fila pessoal, rádio e Jam têm donos e efeitos distintos. Estados de preparação, indisponibilidade e erro precisam de texto curto. Por escolha explícita do utilizador, o Rádio liga diretamente e oferece Undo seguro; não pede confirmação.
5. **Acessibilidade como acabamento.** Alvos de toque de pelo menos 44 pontos, nomes e estados acessíveis, foco ao abrir/fechar sobreposições e texto que cresce. Cor, gesto ou hover não podem ser a única forma de encontrar uma ação.
6. **Movimento com função.** Usar transform/opacity e animação no motor nativo quando aplicável. Respeitar Reduce Motion; interromper efeitos fora do ecrã. Evitar loops decorativos, blur animado e escalonar animações em listas extensas, especialmente enquanto o som está a resolver.
7. **Conteúdo antes de chrome.** Música, capas e identidade dão personalidade. Reservar preenchimentos para ações e estados; não imitar uma dashboard com cartões para cada informação.
8. **Provar no produto.** Referências e screenshots não substituem teste no iPhone, com bio longa, teclado, texto maior, VoiceOver, fila longa, rede lenta e Jam. Alterações visuais não devem aumentar leituras de rede.

## O que foi aproveitado de cada fonte

| Repositório e fonte lida | Critério aproveitado | Limite para o Duotone |
| --- | --- | --- |
| [cursor.directory — README](https://github.com/pontusab/cursor.directory/blob/8ff363186ff3985d4a186fa8f46aa5d1f0b58eb8/README.md), `rules-section.tsx` | Procurar e selecionar regras pelo contexto; apresentar detalhe apenas quando necessário | A versão consultada é um diretório de plugins com conteúdo na base de dados, não a coleção local de regras descrita originalmente |
| [awesome-cursorrules — Expo](https://github.com/PatrickJS/awesome-cursorrules/blob/b044f956f021b6e8877f16781bcfc466a6a120e9/rules/react-native-expo-cursorrules-prompt-file.mdc), regras de testes de acessibilidade | Tipagem, tratamento de erros, suporte offline e validação por fluxo | São prompts genéricos; não justificam trocar React Navigation por Expo Router ou instalar testes web como substituto de VoiceOver |
| [Bluesky — ALF](https://github.com/bluesky-social/social-app/blob/61c7cad053ccf25e9bee70be8b3148a4a1c25e1f/src/alf/README.md), `tokens.ts`, `typography.tsx` | Primitivas estáticas reutilizáveis, tema separado e normalização de tipografia por escala | A versão atual também importa `@bsky.app/alf`; não copiar o design system inteiro ou a identidade Bluesky |
| [Spotube — mini-player](https://github.com/team-spotube/spotube/blob/69a310c78f5ceaf4eab7dfee98f187d38211c9ba/lib/modules/player/player_overlay_collapsed.dart), `player_queue.dart`, `bottom_player.dart`, `pubspec.yaml` | Separação entre superfície compacta e leitor completo; estado de resolução visível; fila com interação própria | É Flutter. Aproveitar organização e comportamento, não widgets como se fossem React Native |
| [Expensify — acessibilidade](https://github.com/Expensify/App/blob/d5d72859a1b7732b4d87688fd33f990b7abfd1cd/contributingGuides/ACCESSIBILITY.md), `BaseModal.tsx` | Feedback uniforme, alvos de toque, labels e gestão de foco; fechar realmente o modal antes de transferir foco | A complexidade do sistema modal responde ao produto deles; preservar o caminho estável de folhas do Duotone |
| [Artsy — SectionTitle](https://github.com/artsy/eigen/blob/5b59ee222b7ab667d38d79f3c029fcedf3ae6452/src/app/Components/SectionTitle.tsx), `GenericGrid.tsx` | Escala editorial de secções, ação lateral consistente e grelhas adaptadas ao tamanho do ecrã | A escala visual de uma galeria de arte não serve diretamente para uma lista de músicas |
| [Reanimated — Reduce Motion](https://github.com/software-mansion/react-native-reanimated/blob/7cb9282187f1cca7d568f2dee7b6f9649f5d9c4e/apps/common-app/src/apps/reanimated/examples/ReducedMotionExample.tsx), exemplo Carousel | Animação local com shared values e respeito pelas preferências de movimento | Exemplos demonstram APIs; transições com atrasos e loops de demonstração não são requisitos de produção |
| [Catalin Miron — MovieList](https://github.com/catalinmiron/react-native-movie-animation-live-streaming/blob/ff090f36cc481d54ab1619fe9c5961423beba892/src/components/MovieList.tsx), `MovieItem.tsx`, README | Dimensões derivadas da janela, composição de gestos e transformação do conteúdo sem refazer toda a página | É uma demonstração, incluindo atraso artificial de rede; não reproduzir esse atraso nem efeitos de galeria no leitor |
| [Gorhom — dynamic sizing](https://github.com/gorhom/react-native-bottom-sheet/blob/9bfbeb521b90d525791a3400a68eec523ad7e444/website/docs/guides/dynamic-sizing.mdx), keyboard handling e scrollables | Altura baseada no conteúdo, teto da folha e integração de listas/teclado | Não instalar outra biblioteca para corrigir um layout sem primeiro medir a causa e validar os modais atuais |
| [shadcn/ui — dialog](https://github.com/shadcn-ui/ui/blob/295a1f114a138f23b5dfee0e0c6812394dfeb90c/apps/v4/registry/new-york-v4/ui/dialog.tsx), `button.tsx` | Primitivas de diálogo e variantes de ação com estados explícitos | Radix e CSS web não são modais nativos; adaptar o contrato de interação |
| [MagicUI — bento grid](https://github.com/magicuidesign/magicui/blob/d7207e5692d14c00dceafa8488d6d01f197fa0e4/apps/www/registry/magicui/bento-grid.tsx), `border-beam.tsx` | Agrupamento por hierarquia e ações disponíveis em dispositivos de toque | O border beam tem animação infinita; não é adequado para resolver calor/lag numa app de música |
| [Dub — Button](https://github.com/dubinc/dub/blob/7c93d97abf0ecd37fb669c6a68a1f7ef9109daea/packages/ui/src/button.tsx), `empty-state.tsx` | Ações primárias/secundárias neutras, loading/disabled e estados vazios com saída | O repositório antigo redireciona para `dubinc/dub`; não copiar densidade de dashboard para iPhone |
| [Tamagui — tokens](https://github.com/tamagui/tamagui/blob/0eb99e3fc61537988500268a607b157496985bf0/code/tamagui.dev/data/docs/core/tokens.mdx), animações | Tokens estáticos versus temas dinâmicos e animação escolhida por propriedade/plataforma | O Duotone já tem tokens; uma migração completa teria custo sem resolver os problemas urgentes |

As conclusões de layout aplicadas ao Duotone são interpretações destas fontes e do código local, não afirmações de que os projetos recomendaram este redesenho.

## Skills consultadas e aplicação concreta

Foram também lidos os `SKILL.md` existentes nestas cinco fontes. A seleção respeita a stack do Duotone: consultar uma skill não obriga a instalar a biblioteca ou a copiar convenções internas de outro produto.

| Skill lida | Aplicação nesta entrega |
| --- | --- |
| [Expensify — app-coding-standards](https://github.com/Expensify/App/blob/d5d72859a1b7732b4d87688fd33f990b7abfd1cd/.claude/skills/app-coding-standards/SKILL.md) | Revisão ativa do Rádio: seletores estreitos, ações nos handlers, respostas assíncronas invalidadas, loading local e falhas comunicadas. O Undo verifica também a conta, além da música e fila, antes de restaurar. |
| [Artsy — creating-screens](https://github.com/artsy/eigen/blob/5b59ee222b7ab667d38d79f3c029fcedf3ae6452/.claude/skills/creating-screens/SKILL.md) | Checklist de integração e validação de ecrãs. A composição editorial vem dos componentes examinados; as instruções de Relay, rotas e pastas Eigen não se aplicam a este projeto. |
| [Tamagui](https://github.com/tamagui/tamagui/blob/0eb99e3fc61537988500268a607b157496985bf0/plans/tamagui-skill/skills/tamagui/SKILL.md) | Referência para contratos de tokens, temas e variantes. O Duotone mantém os seus tokens; não foi instalada Tamagui nem executada a configuração destinada a projetos dessa biblioteca. |
| [shadcn](https://github.com/shadcn-ui/ui/blob/295a1f114a138f23b5dfee0e0c6812394dfeb90c/skills/shadcn/SKILL.md) | Referência de composição, nomes acessíveis de diálogos e feedback. Os comandos e componentes Radix/Tailwind ficam fora da implementação nativa. |
| [MagicUI](https://github.com/magicuidesign/magicui/blob/d7207e5692d14c00dceafa8488d6d01f197fa0e4/skills/magic-ui/SKILL.md) | Critérios de responsividade, acessibilidade e movimento com propósito. Não introduzir efeitos infinitos ou dependências web na app enquanto se investiga calor e lag. |

Da skill Expensify foram lidas integralmente as regras `perf-8-events-in-handlers`, `perf-11-optimize-data-selection`, `perf-15-cleanup-async-effects`, `clean-react-5-narrow-state`, `ui-1-correct-loading-indicator` e `consistency-6-proper-error-handling`. As convenções específicas de Onyx foram traduzidas para o contrato equivalente dos stores Zustand existentes.

## Preferências de produto já definidas

- Perfil editorial, centrado, com biografia opcional e sem medalha amarela, números soltos ou botão de partilha do perfil.
- Rádio visível na fila, contextual à escuta desta sessão antes de ligar, conservando a música atual.
- Rádio numa linha, sem confirmação nem descrição permanente; Undo na própria linha após ativar.
- Manter a Home atual. O utilizador rejeitou a reorganização proposta em 5/10.
- Mostrar comparações antes/depois antes de aplicar o redesenho geral.
- Manter qualidade de som, fluidez e consumo económico como condições para qualquer acabamento visual.
