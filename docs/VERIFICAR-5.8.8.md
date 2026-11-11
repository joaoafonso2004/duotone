# O que verificar no Duotone 5.8.8

Passaram a verificação de tipos e os 345 testes, na árvore normal e numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina.

A 5.8.8 sobe também a correção do CI do iPhone que saiu com a 5.8.6 (os testes antes de alinhar a versão com a tag).

## Antes: o SQL, se ainda não correu

No SQL Editor, por esta ordem. Sem eles a app funciona como antes, mas sem o ganho:

1. `supabase/caber-no-plano-gratis.sql`: o `app_events` só guarda o que está partido e a abertura da app, e as limpezas diárias (com o pg_cron).
2. `supabase/o-que-mudou.sql`: o "o que mudou?" num só pedido ao voltar à app.
3. `supabase/perfil-limitado.sql`: os números no perfil de quem não é amigo.

## As duas

1. **O aviso de versão nova.** Numa 5.8.6, ao abrir, aparece "New version available" com "Not now", como sempre. As notas não podem mostrar nenhuma linha "Minimum version".
2. **A atualização obrigatória** só se vê na próxima versão: com "Minimum version: 5.8.9" nas notas da 5.8.9, a 5.8.8 mostra "Update required", sem "Not now", e não fecha (nem a arrastar no iPhone).
3. **O perfil de quem não é amigo.** Mostra quanto ouviu, quantas músicas, a última escuta e desde quando usa a app, nunca o que ouve. Em Edit profile › Privacy dá para os esconder.
4. **Os artistas.** A página de um artista mostra mais álbuns. "Bones" dos Imagine Dragons fica nos Imagine Dragons.
5. **As estatísticas e os ajustes por faixa.** "A tua escuta" dá os mesmos números de antes. Um ajuste mudado num aparelho chega ao outro.

## iPhone

1. **Sem rede.** Em modo de avião, a Home, o perfil e o Social ficam, com a faixa "No internet connection" no topo. Uma mensagem a meio fica escrita. Ao voltar a rede, o Social relê.
2. **A conversa.** Tocar numa música abre o menu das listas. O ▶ toca-a com o resto da conversa a seguir, e o leitor diz "From chat with …". As capas aparecem.
3. **O Spotify.** Entrar com uma conta qualquer (não só as do painel). "Continue with Google" diz para entrar com o email e o código.
4. **Playlists.** O menu diz "Import a playlist".

## Windows

1. **Os controlos de media.** No Win+A, no ecrã bloqueado e nos botões dos auscultadores aparece a Duotone, com a capa e a barra de progresso. Seguinte e anterior funcionam.
2. **A capa 3D.** Arrastar e largar fora da capa: deixa de rodar, e a letra continua a aceitar cliques e scroll. O efeito do som arranca sem ser preciso clicar.
3. **Import music.** A conta do Spotify aparece em cima, e também nas Definições.
