# Duotone iOS — melhorias propostas

Data: 5 de outubro de 2026. Base: código atual, screenshots fornecidas e estudo de fontes dos 13 repositórios indicados. [Referências e critérios](REFERENCIAS-DESIGN-IOS.md).

O maior ganho vem de dar uma função clara a cada zona: identidade no perfil, regresso e descoberta no Início, controlo das próximas músicas na fila. A app já tem uma linguagem própria e controlos úteis; falta reduzir a competição entre secções e tornar a origem da reprodução mais explícita.

## Estado das propostas

| Área | Prioridade | Proposta | Estado |
| --- | --- | --- | --- |
| Fila/Rádio | Alta | Interruptor contextual direto e Undo numa linha | Implementado no código iOS/Windows; sem nova build |
| Perfil/capa | Alta | Separar a zona segura do topo do enquadramento da fotografia; identidade centrada e bio opcional | Preview; ainda não aplicado |
| Início | Manter | Conservar a Home atual | Redesenho rejeitado pelo utilizador em 5/10; não aplicar |
| Social | Média | Conversas recentes antes da presença, Friends separado e linhas mais compactas | Preview com a screenshot real; ainda não aplicado |
| Artista/chat/shuffle | Alta | Primeiro frame com loading local, Mix permanente, gesto nativo e resposta visual antes da descoberta | Correções no código; validar num iPhone |
| Tipografia e controlos | Média | Primitivas partilhadas e medição com texto maior/VoiceOver | Critérios e análise; sem migração global |
| Biblioteca | Média | Tornar filtros e ordenação consistentes nas três listas atuais | Proposta; manter os cinco separadores nesta fase |
| Leitor/Jam | Alta em comportamento | Estados de áudio explícitos e permissões visíveis, sem novos efeitos contínuos | Preservar trabalho de estabilidade; validar numa build real |

## Perfil: arrumar o enquadramento

O perfil já é editorial e centrado. A screenshot 4.5.2 confirma que a medalha e estatísticas saíram do cabeçalho; o botão de edição é discreto e as playlists já aparecem em linhas. Reintroduzir cartões de números ou um botão Share contrariaria as preferências expressas.

A capa ainda entra por baixo da barra de estado. `ProfileHero.tsx` usa uma altura móvel fixa de 220 mais uma pequena fração da safe area; `profileImageCrop.ts` gravou a imagem em 3:2 e `enquadrarCapa` ancora sempre no topo. A combinação pode mostrar só uma fração do recorte em ecrãs largos e aproximar o assunto da zona da hora. O comentário antigo de que o iPhone mostra sempre a imagem inteira já não descreve todos os tamanhos.

Proposta: reservar primeiro a zona da barra de estado e colocar a fotografia mais abaixo; dimensionar a área da fotografia a partir da largura e do recorte, com limites para não consumir o ecrã. Respeitar o ponto focal escolhido no editor. O editor tem de pré-visualizar exatamente a mesma moldura do perfil. Uma capa já gravada não contém os píxeis que o recorte removeu; corrigir o layout não recupera uma fotografia cortada anteriormente.

Manter avatar e nome centrados, @username secundário, bio com largura confortável e altura natural, seguida de Edit profile. Sem bio, remover o parágrafo e manter um intervalo discreto; com bio, deixar o conteúdo crescer e rolar, sem altura fixa que corte o texto. Não inventar uma biografia para o utilizador: o texto do preview é um exemplo editável.

No preview, o antes é a screenshot real recente; a proposta usa uma capa de referência anterior também enviada pelo utilizador. Permite avaliar hierarquia e posição, mas não comprova o recorte exato da fotografia recente. Para confirmar esse recorte precisamos da imagem original da capa.

## Início: menos secções com o mesmo peso

**Decisão de 5/10: manter a Home atual.** A proposta abaixo fica como histórico de análise e não faz parte do trabalho a aplicar.

`SearchScreen.tsx` já junta Home e pesquisa, com Jump back in e Daily mix. Depois apresenta Discover daily, Rare finds, Your styles, Radio, Your genres, Decades, Playlists e mais quatro coleções. Muitas usam a mesma forma de prateleira e a diferença fica sobretudo no título. O problema é de hierarquia, não de falta de funcionalidades.

Proposta: deixar o ecrã principal responder a três intenções. Jump back in mostra poucos destinos recentes; a mistura do dia fica num cartão com capa, contexto e play claro; Discover daily mostra uma seleção curta. Explore abre as restantes coleções, preservando nomes e destinos. A pesquisa continua acessível no topo; não acrescentar outro campo nem mover imediatamente a navegação inteira.

Há um custo: Rare finds e coleções específicas passam a exigir mais um toque. Só fazer essa deslocação se a menor densidade compensar no uso real; quem usa frequentemente uma coleção pode vê-la como um destino recente. A app já carrega prateleiras por partes, uma boa decisão que deve permanecer. Arrumar visualmente não deve aumentar consultas nem forçar recálculo de recomendações em cada render.

## Fila: explicar a decisão que controla o som

Já existe separação entre Now playing e Up next, arrasto, menus e identificação de RADIO/SHARED. Faltava uma forma explícita de começar rádio, porque autoplay só prolongava uma fila terminada. O novo controlo entra entre as duas zonas, com o mesmo componente nas duas plataformas.

Ligar atua diretamente, sem confirmação; a substituição só acontece após descoberta válida. A música atual continua intacta. A linha mostra Radio, o interruptor e Undo após ativar; só razões de indisponibilidade e erros acrescentam texto. Desligar interrompe a reposição e conserva as sugestões na fila. Undo recupera a fila anterior apenas enquanto a música e a fila não sofreram outra mudança. Num Jam ou Listen along, mostrar por que o controlo pessoal está indisponível.

O contexto parte das escutas confirmadas desta sessão, não do gosto global nem de tudo o que se encontrava na playlist. O modo estrito dispensa o Flow de último recurso. [Plano e validação](PLANO-MODO-RADIO.md).

## Consistência: melhorar os componentes existentes

- `theme/index.ts` já centraliza cores, espaçamento e tipografia; `socialTokens.ts` reutiliza-os. Há ainda textos com tamanho, peso e line height definidos diretamente, por exemplo no perfil e no leitor. Criar Text, SectionHeading, IconButton e ActionRow a partir dos tokens atuais, migrando apenas as zonas tocadas. Não adotar outro sistema inteiro para uniformizar meia dúzia de componentes.
- Os limites `ESCALA_MAXIMA` protegem caixas fixas, mas reduzir a escala não substitui reflow. Verificar nomes longos no perfil, títulos de música, rótulos da fila e descrições das ações com Dynamic Type. Permitir crescimento nas áreas que têm espaço e manter uma forma acessível de ler o nome completo.
- `SongsScreen.tsx`, Artists e Playlists representam tarefas diferentes. Preservar os separadores nesta fase e harmonizar localmente posição da pesquisa, filtro ativo, ordenação e estado vazio. Uma Biblioteca única mudaria hábitos e merece uma proposta separada.
- A doca já combina mini-player e navegação e os ecrãs calculam padding inferior. Não diagnosticar sobreposição só porque a screenshot apanha uma linha a passar sob o vidro durante scroll. Confirmar o último item e ações clicáveis no dispositivo; o preview mantém conteúdo essencial acima da doca.
- `BottomSheet.tsx` mantém as folhas nativas desativadas devido ao corte de conteúdo observado. Preservar o caminho estável e testar alturas com pouco/muito conteúdo, teclado e texto aumentado antes de voltar a mudar a apresentação. O estudo de Gorhom dá critérios de medição e listas integradas, não justifica trocar já a biblioteca.

## Leitor e Jam: qualidade percebida começa no som

Há trabalho útil já presente: controlos alinhados em cinco eixos, labels nas ações, movimentos no motor nativo e suporte a Reduce Motion. O acabamento seguinte deve privilegiar estados distinguíveis de preparado, a carregar, em pausa e com erro, sem um spinner que pareça pausa eterna. Uma animação decorativa não pode disputar tempo com play/pause ou sincronização.

Na fila de Jam, distinguir quem pode controlar e quem pode sugerir, e apresentar a origem partilhada com um acesso à gestão da sessão. O código já evita mudar a fila pessoal por ações de convidado; a interface deve explicar essa regra. Validar em dois aparelhos as trocas de faixa, reconexão e início do som antes de acrescentar parallax ou blur dinâmico.

## Ordem de execução recomendada

1. Validar as correções de consumo, pausa e início do Jam em iPhone e Windows com versões equivalentes e utilização comparável. Não prometer margem no gratuito com base apenas nos testes de código.
2. Aprovar visualmente o perfil e testar uma capa clara/escura, sem bio e com bio longa, em dois tamanhos de iPhone.
3. Avaliar a proposta Social com conversas e música partilhada em primeiro plano, preservando a Home atual e os limites de consumo.
4. Uniformizar os componentes tocados e verificar Dynamic Type/VoiceOver; só depois avaliar uma reorganização maior da biblioteca.

## Limites desta análise

Não houve inspeção interativa de uma build iOS nesta máquina. O perfil atual foi comparado com uma screenshot real; Início e fila foram reconstruídos a partir do código. Os conteúdos/capas de descoberta no preview são ilustrativos. O preview foi verificado no browser, incluindo edição de bio, Rádio, cancelamento e Undo; isso não mede FPS, temperatura, consumo Supabase nem qualidade de som no iPhone.
