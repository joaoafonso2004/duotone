# Verificar a 7.3.3 (iPhone e Windows)

A 7.3.3 é a nova versão mínima das duas plataformas (28/11, o João: "vou querer a mínima na próxima que lançar de ambas as plataformas").

## Depois de as duas builds estarem publicadas

1. Correr o `supabase/versao-minima.sql` inteiro no SQL Editor (a mínima passa a 7.3.3, e as últimas linhas voltam a ligar o gancho `pgrst.db_pre_request`).
2. Confirmar: um pedido à API sem o cabeçalho `x-duotone-versao` dá 426, e com `7.3.3` passa.
3. Abrir a app numa versão antiga (se houver uma à mão): o aviso de versão nova aparece, e os dados não carregam até atualizar.

Desfazer, se algo correr mal: `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`

## iPhone

1. **About this song** (as reticências de uma música › About this song, no leitor e nas listas): por baixo da música (Album, Released, You played it, Tempo, Key), o **Artist** com a foto redonda, os fãs e a estrela; tocar na linha abre a página do artista e fecha o leitor. A seguir "You and …" (as escutas dele e as músicas dele na biblioteca), Latest release, Your most played of theirs (tocar numa põe-na a tocar) e Fans also like (nomes em texto). Com "Chorus on the progress bar" ligado, a linha Chorus; "Play from here" só na música que está a tocar.
2. **A barra de cima ao rolar** (Home, Liked Songs, Artists, Playlists, e as Definições): opaca, sem se ver a lista por baixo. Com "Background follows the song" ligado, a cor da música continua na barra sem se notar a borda.
3. **Fechar o leitor a arrastar para baixo**: a capa pousa no mini e não pisca a preto no fim.
   - Com o Liquid Glass: os cantos arredondam-se durante a descida até aos da cápsula.
   - Sem o Liquid Glass: a capa do mini com os cantos quase retos de antes.
4. **Liquid Glass** (Customise › App): o vidro transparente, sem o cinzento lamacento; Glass opacity de 0 a 100 escurece por trás do vidro, do limpo ao escuro. A barra dos separadores do sistema também.

## Windows

1. **Ligar a app e abrir uma playlist pela grelha das Playlists**: a capa voa para o cabeçalho da playlist logo à primeira, como à segunda. Enquanto as músicas carregam, o cabeçalho (o mosaico, o nome e o número de músicas) já está no sítio e não salta quando elas chegam.
