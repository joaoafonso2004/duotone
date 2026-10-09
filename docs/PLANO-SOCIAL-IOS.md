# Plano: o Social do iPhone

9/10/2026, a partir dos prints do João (Social e conversa, 11:27-11:28) e do código. Maquete: [`docs/social-ios.html`](social-ios.html).

**O objetivo:** a página do Social tem de ficar ao nível do leitor e da Home. Hoje é uma lista crua. O chat também melhora, mas fica para depois.

**Estado (9/10):** fases 1 e 2 feitas, por ver no iPhone. As decisões ficaram as da proposta (aprovadas com a maquete): a linha inteira abre a conversa, "Listening now" só com quem ouve, as reações vão para a conversa. A fase 3 não foi feita.

## 1. O que está mal hoje

### A página (`components/SocialOverview.tsx`)

1. **"Music activity" é um cartão de um terço da largura.** Com um amigo a ouvir, sobram dois terços vazios. Tocar abre o menu da música, e não "ouvir com ele".
2. **Cada linha tem um botão de conversa** que faz o mesmo que a linha. São seis ícones iguais à direita, e não dizem nada.
3. **Há dois alvos na mesma linha, sem pista nenhuma:** a cara abre o perfil e o texto abre a conversa.
4. **A pré-visualização está escrita do lado errado.** Aparecem "You: Invited you to a Jam" e "You: Added you to this playlist…": o texto é de quem recebe, com "You:" à frente (`lib/socialActivity.ts:69`).
5. **Falta a hierarquia.** Não há destaque para quem está a ouvir agora, para as Jams abertas dos amigos nem para os pedidos de amizade. A pesquisa só aparece com muitas conversas.
6. **Tudo tem o mesmo peso**: o título da secção a 13 pt cinzento, as linhas iguais e nenhuma cor.

### A conversa (`SocialHub.tsx`, `ChatAmigo.tsx`, `ConviteDeSessao.tsx`)

1. **O cabeçalho mostra o título cru em maiúsculas**, "DDG - ELON MUSK FT. GUNNA (OFFICIAL AUDIO)". Recebe o `currentlyPlaying.title` sem passar pelo `tituloDaFaixa` (`SocialHub.tsx:308`), e não se pode tocar para ouvir com ele.
2. **Molduras dentro de molduras.** O balão próprio tem uma borda na cor do tema, e o cartão (da Jam ou da playlist) tem outra lá dentro.
3. **A hora aparece em cada balão** ("11:10" três vezes seguidas). No cartão da playlist fica entre o texto e o cartão.
4. **O convite "Listen together · Join" não diz que música é nem de quem.** Um convite que já terminou ocupa o mesmo espaço que um ativo.
5. **Só se escreve texto.** Para mandar uma música é preciso sair da conversa.

## 2. A página nova

De cima para baixo (maquete, ecrã 1):

1. **Cabeçalho**: "Social", grande e a encolher como as outras páginas (`useCabecalhoQueEncolhe`). À direita, a lupa e o lápis de nova conversa. "Add friend" passa para dentro da nova conversa. Os pedidos de amizade aparecem numa pastilha por baixo do título ("2 friend requests"), só quando os há.
2. **"Listening now"**, à maneira das Notes do Instagram. É uma fila de caras de 64 pt, cada uma com um balão por cima com a mini-capa e o nome da música. O anel na cor do tema quer dizer "a tocar agora"; um anel apagado quer dizer que parou há pouco (até 10 min). A primeira cara és tu: o que estás a tocar, ou "Hidden" com a escuta privada (tocar abre o `IndicadorDeVisibilidade`). Sem ninguém a ouvir, a fila não aparece.
3. **Tocar numa cara abre a folha do amigo** (maquete, ecrã 2):
   - a capa grande, a música, o artista e a barra a andar (a posição já viaja na presença);
   - o botão principal **"Listen along"** (`ouvirComAmigo`);
   - por baixo, ▶ Play, ♥ Save e ＋ Queue;
   - **as reações** 🔥 😍 😂 🤯 👏: cada uma manda à conversa o cartão da música com o emoji ("🔥 Elon Musk"), e o amigo recebe-a como mensagem;
   - "Up next" com as próximas dele (as `aSeguir`, até 5) e "Message".
4. **Jams abertas**: um cartão por Jam de um amigo, com as caras empilhadas, a música e "Join". Só aparece quando há uma.
5. **Conversas**, como no iMessage e no Instagram:
   - linhas de 72 pt, com a cara de 54 pt (anel se está a ouvir, ponto verde se está online), o nome, a hora e a pré-visualização certa;
   - **uma música mostra a mini-capa**: "♪ Elon Musk · DDG" se a recebeste, "You sent Elon Musk" se a mandaste. Uma Jam diz "You invited zyn to a Jam" ou "Invited you to a Jam";
   - o que não foi lido fica a negrito, com a contagem na cor do tema;
   - **a linha inteira abre a conversa.** O botão de conversa sai, o perfil abre-se no cabeçalho da conversa e o toque longo abre o menu do amigo (já existe);
   - **sem gestos para o lado nas linhas**: o Social vive no pager dos separadores, e um gesto lateral compete com ele (a regra das linhas de música, 6/10);
   - amigos com quem nunca falaste ficam no fim, com o estado ("Online", "2d ago").
6. **Sem amigos**, um cartão "Bring your friends" com o teu link de amizade (ver as decisões).

## 3. A conversa nova (fase 2)

Maquete, ecrã 3. O componente é partilhado, por isso o PC ganha o mesmo.

1. **Cabeçalho**: a cara com o anel e o nome. Por baixo, "Listening to Elon Musk · DDG", em letra normal e na cor do tema; tocar abre a folha do amigo. À direita, os auscultadores (Listen together) e o "⋯" (perfil, You two).
2. **Balões sem bordas.** Os teus vão preenchidos com `tema.soft`, os dele com `surface`. Mensagens seguidas da mesma pessoa (até 5 min) juntam-se num grupo, e só a última leva a ponta.
3. **A hora sai dos balões.** Há um separador ao centro ("Today 11:10") quando o dia muda ou passam 15 min entre mensagens. A hora exata vê-se com o toque longo, junto às reações.
4. **O cartão é o próprio balão**, sem caixa dentro de caixa:
   - uma música mostra a capa de 56, o título, o artista, ▶ para tocar sem sair e ♥ para guardar;
   - uma playlist mostra o mosaico, o nome, "5 songs" e "Open";
   - o texto da mensagem vai dentro do mesmo cartão.
5. **O convite para a Jam diz o que é**: a capa, "calito invited you to listen to Plug" e Join na cor do tema. Quando acaba, encolhe para uma linha ao centro: "🎧 Jam ended · 11:10".
6. **"Added you to this playlist"** passa a ser uma linha de sistema ao centro, com o cartão pequeno por baixo.
7. **Mandar música a partir da conversa.** O "＋" à esquerda do campo abre uma folha com quatro coisas: o que estás a tocar (um toque), as últimas que ouviste, a pesquisa e as tuas playlists. Com o campo vazio, o botão de enviar passa a ♪ e manda o que está a tocar.
8. **Dois toques num balão põem ❤️**, como na capa do leitor.

## 4. Fases

| Fase | O quê | Ficheiros | SQL | Pedidos ao Supabase |
|---|---|---|---|---|
| 1 | A página nova: cabeçalho, "Listening now", folha do amigo com reações, Jams abertas, linhas novas, pré-visualizações certas | `SocialOverview.tsx` (iPhone, reescrito), `SocialOverview.web.tsx` (o PC fica como está), `OuvirAgora.tsx`, `FolhaDoAmigoAOuvir.tsx`, `LinhaDaConversa.tsx`, `lib/previaDaConversa.ts` (puro, substitui o `previewText`) | Não | Nenhum novo em polling. A presença já chega pelo canal. As Jams dos amigos são um `sessoes_dos_amigos` ao abrir o Social, no máximo de 2 em 2 min. Cada reação é uma mensagem (um insert, só quando alguém a manda). |
| 2 | A conversa: cabeçalho, balões, separadores de hora, cartões, convite, enviar música | `SocialHub.tsx`, `ChatAmigo.tsx`, `ConviteDeSessao.tsx`, `SharedPlaylistCard.tsx`, `EnviarMusica.tsx`, `lib/gruposDeMensagens.ts` (puro) | Não | Nenhum. "As últimas que ouviste" vêm do histórico que já está no telemóvel. |
| 3 (opcional) | Conversas fixadas e silenciadas; "Seen"; "a escrever…" | prefs (`pref:conversasFixadas`, viaja pelo prefsSync) | Só o "Seen": uma função que devolve a marca de leitura do amigo para a conversa contigo | "Seen": uma leitura ao abrir a conversa. "A escrever…": um broadcast do Realtime, só com a conversa aberta dos dois lados. |

**Testes** (sem framework, como o resto):
- `test-previa-da-conversa.ts`: as frases dos dois lados, para cada tipo de item.
- `test-grupos-de-mensagens.ts`: os grupos, os separadores e o dia que muda à meia-noite.
- Um teste de leitura de código que falha se uma linha do Social voltar a ter um botão de conversa ou um gesto lateral.

**Por confirmar no iPhone:** os anéis e os balões a 120 Hz, a folha do amigo com o texto grande, e o VoiceOver em cada cara.

## 5. Decisões que são tuas

1. **Na lista, tocar na cara de alguém** abre a conversa (proposta, como no Instagram) ou o perfil (como hoje)?
2. **"Listening now"** mostra só quem está a ouvir (proposta) ou toda a gente online?
3. **As reações** vão para a conversa como mensagem (proposta), ou ficam só como aviso?
4. **Um link para adicionar amigos** no cartão "Bring your friends" e na nova conversa (não no perfil, como já decidiste)?
5. **A fase 3** entra (o "Seen" leva SQL), ou paramos na 2?

Fora deste plano, de propósito: pôr o Social na barra de separadores. Foi decisão tua deixá-lo fora (seis ícones não cabiam), e a porta continua a ser o botão das mensagens na Home.
