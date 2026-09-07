# Jam sólido

Implementação do plano `jam-solido.html`, em `duotone-main`.

## Investigação

O teste de regressão foi executado antes da correcção e falhou: `playShuffled`
chamava `playTrack` com `interno=true`. Assim, Play nas músicas gostadas e nas
playlists podia iniciar reprodução local num convidado sem controlo.
`playNext` e `addToQueue` também escreviam `current` directamente com fila vazia.
Isto prova caminhos de fuga no código; não prova qual gesto foi usado no relato
original, nem reproduz o áudio de dois iPhones reais.

## Comportamento

- `proximaFaixa` escolhe exclusivamente a fila partilhada enquanto existe Jam.
  Fila partilhada vazia significa esperar, mesmo com shuffle/repeat/rádio locais.
  Smart Cache, preparação do crossfade, letras, avanço e comandos do lock screen
  usam essa decisão. Uma mudança da fila reactiva o pré-carregamento após 5 s.
- O crossfade continua desactivado durante o Jam. A preparação individual usa
  a mesma decisão, mas não há duas transições de motores durante uma sessão.
- Anfitrião e convidado autorizado anunciam a escolha; o servidor confirma-a e
  ambos seguem a confirmação. Convidado sem controlo sugere, sem tocar localmente.
  Play em shuffle segue a mesma regra. “Add to queue” e “Play next” são sugestões
  para todos, sem interromper a música.
- Só o anfitrião avança automaticamente no fim. Next explícito exige controlo.
  A fila é relida para apanhar sugestões ainda em trânsito no realtime. A antiga
  espera consultava a prontidão da faixa anterior, não a da seguinte; foi removida.
- Não se transforma buffering/confirmação do motor em comandos de pausa/play.
  As pausas recebidas também alteram a intenção que um download pendente herdará.
- Fechar por botão ou swipe sai do Jam. O anfitrião confirma “End Jam and close”.
  Cancelar repõe o swipe; uma falha de saída mantém a sessão visível para tentar
  novamente. O fecho também funciona antes da primeira música.
- Foi removido o multiplicador de velocidade da sincronização. Desvios até
  600 ms não alteram o som; os seeks automáticos continuam limitados a dois por
  faixa, com duas leituras consecutivas e descanso de 5 s. Comandos explícitos
  de seek e pausa não fazem parte dessa contagem.

## Migração antes da distribuição

Aplicar `supabase/jam-solido.sql` **depois de `supabase/ouvir-juntos.sql`** na
base de dados de destino. O ficheiro é idempotente e só acrescenta duas RPCs:

- `avancar_fila_da_sessao`: verifica controlo, bloqueia a sessão, confirma a cabeça
  esperada, muda a faixa e retira a sugestão na mesma transacção. Um convidado
  autorizado pode consumir a sugestão do anfitrião. Um pedido repetido sobre a
  cabeça antiga não consome a seguinte; uma falha não perde a sugestão.
- `procurar_na_sessao`: altera a posição sem anunciar uma pausa intermédia.

As RPCs não são executáveis por `anon`/`PUBLIC`. Os testes exercitam também um
estranho e um convidado cuja permissão foi revogada. A migração foi validada
em PGlite; **não foi aplicada à base de dados remota nesta alteração**. Instalar
esta versão antes da migração impede o avanço/seek partilhados e mostra um erro.

## Verificação

- `npm run typecheck`.
- `npm test`, incluindo `test-jam-store.ts`, relógio/sincronização e testes SQL.
- `npm run lint`: só `rules-of-hooks` (erro) e `exhaustive-deps` (aviso), sem os
  presets do React Compiler. Comando separado; não foi adicionado a `npm test`
  nem aos workflows. Zero erros; 40 avisos de dependências de hooks.
- Exportações Expo para iOS com Hermes e para web. São validações dos bundles, não um `.ipa`
  compilado/instalado nem um teste do AVPlayer em dois dispositivos.

O lockfile acrescenta as dependências de desenvolvimento do lint sem mudar ou
remover qualquer pacote existente. Foi preservado o TypeScript 5.9.3 aninhado
de `apple-targets` (peer opcional do Expo 55); o principal mantém-se em 6.0.3.
`npm ci --dry-run --ignore-scripts --offline` validou a instalação descrita no
lockfile, sem warnings de resolução. Não foi feito um `npm ci` completo.

## Aceitação em dois dispositivos

1. Entrar com o Jam a tocar e em pausa; confirmar faixa, posição e intenção
   depois do download, incluindo uma faixa já em cache.
2. Sem controlo, tocar numa faixa e usar Play com shuffle em Songs/playlist:
   ambos devem sugerir, com aviso, sem mudar a faixa local.
3. Ligar controlo: convidado escolhe uma faixa, pausa, retoma e usa Next;
   anfitrião e convidado seguem. Revogar controlo e repetir.
4. Adicionar à fila depois dos primeiros 5 s e durante outra preparação;
   confirmar o download do novo topo e a transição no anfitrião.
5. Esgotar a fila partilhada com uma fila pessoal ainda cheia e repeat/rádio
   activos: a sessão não deve tocar a fila pessoal.
6. Fechar por botão e swipe como convidado e anfitrião, incluindo cancelar
   o diálogo e falhar a rede. Verificar o desaparecimento da barra após saída.
7. Ouvir uma faixa inteira nos dois iPhones, com o ecrã bloqueado e com redes
   diferentes. Confirmar se desapareceram os cortes; a hipótese de que eram
   causados pelas escritas periódicas de velocidade precisa desta validação.
