# Playlists colaborativas (7/10)

Pedido do João: "sim, mas precisa de plano de implementação para ficar tudo bem
feito first try". Este é o plano; foi implementado tal como está.

## O que é

O dono de uma playlist junta amigos como **colaboradores**. Um colaborador vê a
playlist nas suas Playlists, e pode pôr, tirar e reordenar músicas, como o
dono. Só o dono muda o nome, apaga, mostra no perfil e gere quem colabora. Um
colaborador pode sair quando quiser.

Não é uma cópia (o "Save" continua a ser isso): é a MESMA playlist, e o que um
muda os outros veem ao abrir.

## Modelo de dados (`supabase/playlists-colaborativas.sql`, correr à mão)

- `playlist_colaboradores (playlist_id, user_id, convidado_por, adicionado_em)`,
  chave `(playlist_id, user_id)`, `on delete cascade` dos dois lados. Apagar a
  playlist ou a conta tira as linhas.
- `playlist_tracks.added_by uuid` (`on delete set null`), preenchido por um
  gatilho `before insert` com `auth.uid()`. As linhas antigas ficam a `null`.
  Não se confia no que o cliente manda: o gatilho escreve sempre quem insere.
  O upsert da reordenação não mexe nele (o `on conflict do update` só escreve as
  colunas que leva).

## Permissões (RLS)

- **Funções `security definer` para as perguntas** (`e_dono_da_playlist`,
  `colaboro_na_playlist`): uma política de `playlists` que lesse
  `playlist_colaboradores`, cuja política lê `playlists`, dava recursão infinita.
- `playlists`: nova política de SELECT para quem colabora. UPDATE e DELETE
  continuam só do dono (a política de sempre, "gerir as próprias").
- `playlist_tracks`: nova política FOR ALL para quem colabora (ler, pôr, tirar,
  reordenar).
- `playlist_colaboradores`: SELECT para o dono e para os colaboradores da mesma
  playlist. Nenhum INSERT/UPDATE/DELETE direto: tudo pelas funções.

## Funções

- `convidar_para_playlist(p_playlist, p_amigos uuid[])`: só o dono; só amigos
  ACEITES; sem repetidos nem o próprio dono; no máximo 20 colaboradores.
  Devolve quantos entraram.
- `tirar_colaborador(p_playlist, p_user)`: só o dono.
- `sair_da_playlist(p_playlist)`: o próprio colaborador.
- `pessoas_da_playlist(p_playlist)`: dono + colaboradores com nome, username e
  avatar, para quem pode ver a playlist. É por aqui que se desenham as caras: os
  colaboradores não têm de ser amigos uns dos outros, e a RLS dos `profiles` não
  os deixava ler-se.

## App (iPhone e PC, as mesmas regras)

- `lib/playlistColaborativa.ts` (puro, testado): o papel (`dono`,
  `colaborador`, `leitor`), o que cada papel pode fazer, que amigos se podem
  convidar, e a cara de quem pôs cada música.
- `listPlaylists` junta as playlists onde se colabora (uma leitura a mais, à
  tabela pequena dos colaboradores). Sem a migração essa leitura falha e fica
  como era -- nunca esconde as playlists do dono.
- `Playlist` ganha `ownerId`, `colaborativa` e `souColaborador`. A grelha e a
  lista dizem "Collaborative".
- Página da playlist: `podeMexer` (dono ou colaborador) abre "Add tracks", a
  edição (sem o nome, para o colaborador) e o "Remove from this playlist". Um
  colaborador não vê o "Save". A fila de caras por baixo do título abre a folha
  das pessoas.
- **A folha das pessoas** (`PessoasDaPlaylist`, partilhada pelo `BottomSheet`):
  o dono primeiro, depois os colaboradores; o dono tira com ×, e "Add
  collaborators" abre a lista dos amigos aceites que ainda lá não estão. O
  colaborador tem "Leave playlist".
- Convidar manda a playlist no chat a cada novo colaborador ("Added you to this
  playlist"), pelo `shareItem` de sempre. Se falhar, o convite fica feito.
- Menu da playlist (`lib/menuDaPlaylist.ts`): "Collaborators…" para o dono e para
  o colaborador; "Leave playlist" só para o colaborador; editar o nome, apagar
  e "mostrar no perfil" só o dono.
- O perfil próprio mostra só as playlists de que se é dono (a visibilidade é
  do dono).
- Sem Realtime: quem tem a página aberta vê as mudanças dos outros ao voltar a
  ela (egress -- ver a secção do Supabase no CLAUDE.md).

## Sem a migração

- A lista: só as do dono, como hoje.
- A página: sem caras, sem "Collaborators…" (a função falta → `PGRST202`), e a
  ação diz que falta uma atualização do servidor.
- As faixas: sem `added_by` lê-se sem a coluna.

## Testes

- `test-playlists-colaborativas-sql.mjs` (PGlite, RLS ligada): dono convida um
  amigo e não um estranho; o colaborador lê, põe, tira e reordena, e não muda o
  nome nem apaga; um terceiro não vê nada; o `added_by` é sempre quem inseriu;
  sair e ser tirado acabam com o acesso; a função é idempotente; teto de 20.
- `test-playlist-colaborativa.ts`: o papel, as permissões, os amigos a convidar
  e as caras.
- `test-menu-da-playlist.ts`: as linhas novas por papel.

## Por confirmar nos aparelhos

Tudo o que é ecrã: a folha das pessoas, a lista de amigos a convidar, e um
colaborador a editar.
