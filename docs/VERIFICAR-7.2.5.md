# Verificar a 7.2.5 (só iPhone)

Três coisas: o login da 7.2.3 corrigido (a 7.2.4 foi cancelada antes de sair), as capas de playlist à escolha e o Eclipse no skip.

O login: o Metro guarda a resolução de um import por pasta. Com o armazém do MMKV em `src/lib`, um vizinho decidia por ele, e na build da 7.2.3 o armazém importou-se a si próprio e ficou sem o AsyncStorage verdadeiro (o supabase-js rebentava no `removeItem` ao guardar a sessão). O armazém passou para `src/armazem/`, sozinho. Provado no bytecode da 7.2.3 e da 7.2.2, com o supabase-js verdadeiro, e verificado no `.ipa` desta versão antes de a dar como pronta.

As capas precisam do `supabase/capas-das-playlists.sql` corrido no SQL Editor. Sem ele a opção não aparece, e o resto funciona como antes.

Correram o typecheck e a suite inteira (397 testes) numa cópia dos ficheiros com CRLF.

1. **Entrar na conta** com email e palavra-passe, e com o username: entra, sem o erro.
2. **Fechar à força e abrir**: continua dentro da conta. **Deixar a app uma hora e voltar** (a sessão renova-se): continua dentro.
3. **Capa de uma playlist tua**: Playlists › segurar numa playlist › Choose cover…, escolher uma foto. A capa aparece no cartão, ao abrir a playlist (o quadrado que voa e o cabeçalho) e na Home.
4. **Change cover…** com outra foto, e depois **Remove cover**: volta o mosaico das músicas.
5. **Uma playlist de que és colaborador**: o menu não oferece a capa.
6. **No PC** (na próxima versão do Windows), a mesma playlist mostra a capa escolhida no iPhone.
7. **Eclipse no skip**: o disco passa inteiro e sem engasgos, e as laterais da capa 3D trocam quando ele tapa a capa.
