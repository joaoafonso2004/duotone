# Verificar a 7.2.5 (iPhone e Windows)

No iPhone, três coisas: o login da 7.2.3 corrigido (a 7.2.4 foi cancelada antes de sair), as capas de playlist à escolha e o Eclipse no skip. No Windows (a seguir à 7.1.0), as capas e a música dos amigos sem atraso.

O login: o Metro guarda a resolução de um import por pasta. Com o armazém do MMKV em `src/lib`, um vizinho decidia por ele, e na build da 7.2.3 o armazém importou-se a si próprio e ficou sem o AsyncStorage verdadeiro (o supabase-js rebentava no `removeItem` ao guardar a sessão). O armazém passou para `src/armazem/`, sozinho. Provado no bytecode da 7.2.3 e da 7.2.2, com o supabase-js verdadeiro, e verificado no `.ipa` desta versão antes de a dar como pronta.

As capas precisam do `supabase/capas-das-playlists.sql` corrido no SQL Editor. Sem ele a opção não aparece, e o resto funciona como antes.

Correram o typecheck e a suite inteira (397 testes) numa cópia dos ficheiros com CRLF.

1. **Entrar na conta** com email e palavra-passe, e com o username: entra, sem o erro.
2. **Fechar à força e abrir**: continua dentro da conta. **Deixar a app uma hora e voltar** (a sessão renova-se): continua dentro.
3. **Capa de uma playlist tua**: Playlists › segurar numa playlist › Choose cover…, escolher uma foto. A capa aparece no cartão, ao abrir a playlist (o quadrado que voa e o cabeçalho) e na Home.
4. **Change cover…** com outra foto, e depois **Remove cover**: volta o mosaico das músicas.
5. **Uma playlist de que és colaborador**: o menu não oferece a capa.
6. **No PC**, a mesma playlist mostra a capa escolhida no iPhone.
7. **Eclipse no skip**: o disco passa inteiro e sem engasgos, e as laterais da capa 3D trocam quando ele tapa a capa.

## Windows

A música de um amigo: o realtime-js chama CHANNEL_ERROR também à ligação que cai (o PC a dormir, a rede, um batimento sem resposta), e a app tratava-a como a recusa do servidor. Largava os canais dos amigos e esperava meia hora; até lá o PC só via a tabela, que quem ouve escreve de 10 em 10 min. Agora os canais ficam e voltam a entrar sozinhos, e só uma recusa a sério faz a espera (no fim, o PC volta a entrar sem esperar por nada). O `test-presenca-ao-vivo-religa.cjs` corre o módulo com os erros verdadeiros do realtime-js: falhava 10 de 11 casos no código antigo.

8. **A atualização**: o PC atualiza-se sozinho para a 7.2.5 (a versão aparece nas Definições).
9. **Capa no PC**: botão direito numa playlist tua › Choose cover…, escolher uma imagem. Aparece no cartão, na página da playlist e no atalho da lateral, se estiver fixada. No iPhone, a mesma capa.
10. **Change cover…** e **Remove cover** no mesmo menu, e no "…" da página da playlist.
11. **Um amigo a ouvir no iPhone**: no PC aparece a música dele, e quando ele muda, a nova chega em segundos.
12. **Depois de o PC dormir** (ou de desligar e voltar a ligar a rede): a música do amigo volta a mudar em segundos, sem reabrir a app.
