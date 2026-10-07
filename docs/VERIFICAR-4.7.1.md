# O que verificar no Duotone 4.7.1 (iPhone e Windows)

**Antes de tudo, no SQL Editor do Supabase** (cada um pode voltar a correr-se):
`supabase/playlists-colaborativas.sql`, `supabase/radio-no-jam.sql`,
`supabase/painel-de-saude.sql` e `supabase/presenca-mais-longa.sql`. O
relatório de reprodução (secção "server updates") diz quais faltam. Sem eles a
app funciona como na 4.6.4, sem a parte nova.

1. **Playlist colaborativa.** Numa playlist tua: "…" → Collaborators… → Add
   collaborators → um amigo. Ele recebe a playlist no chat e vê-a nas
   Playlists dele ("Collaborative"). Ele põe uma música (pelo "Add to
   playlist" de uma faixa), tira outra e reordena; tu vês as mudanças ao
   voltar a abrir a playlist, com a cara dele nas que pôs. Ele NÃO consegue
   mudar o nome nem apagar. "Leave playlist" tira-a das Playlists dele; tirar
   um colaborador na folha (× e depois Remove) faz o mesmo.
2. **Radio que fica ligado.** Ligar a pastilha Radio no Up next e tocar numa
   música de uma playlist: toca essa e a seguir vêm parecidas. O Play de uma
   playlist toca a playlist (e desliga o Radio).
3. **Radio no Jam.** Numa Jam, ligar a pastilha: acende para todos e, quando a
   fila partilhada fica curta, o anfitrião enche-a com parecidas, depois das
   que as pessoas puseram.
4. **O teu mês.** Nos primeiros 7 dias de novembro, abrir a app: as três
   páginas com o mês de outubro (só com 20 escutas ou mais). Toque à direita
   avança, à esquerda volta, premir pausa, X fecha. Não volta a aparecer.
5. **iPhone: Spotify pela conta.** No ecrã de importar das Playlists, "Your
   Spotify account" → entrar → escolher o que importar (pode ser mais do que
   uma): as Liked Songs vão para as Liked Songs da app, cada playlist vira uma
   playlist. Só para as 5 contas registadas no painel do Spotify.
6. **iPhone: dois toques na capa** guardam a música (o coração acende); dois
   toques numa já guardada não a tiram.
7. **iPhone: atalhos do ícone.** Premir sem largar o ícone da app: Resume,
   Daily mix e Shuffle Liked Songs funcionam, com a app fechada e aberta.
8. **Not interested.** Numa sugestão do Smart Shuffle (a estrela), "…" → Not
   interested: sai da fila; se estava a tocar, passa à seguinte.
9. **Perfil.** A capa dissolve-se no fundo, sem corte preto por baixo; o botão
   redondo das estatísticas, em cima, abre as estatísticas.
10. **Painel de saúde** (só na tua conta): Definições → About → App health.
    Noutra conta a linha não aparece.
11. **Amigos online e handoff.** Os amigos continuam a aparecer online e a
    ouvir; o banner "continuar aqui" continua a aparecer no outro aparelho.
12. **PC: Pesquisa.** Sem texto, a Pesquisa mostra só a descoberta, sem o
    separador "Songs of the day".

**Por confirmar nos aparelhos**: tudo o que é ecrã e o Swift novo (os atalhos
do ícone e o ecrã bloqueado no relatório).

Releases: [iOS 4.7.1](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.7.1) · [Windows 4.7.1](https://github.com/joaoafonso2004/duotone/releases/tag/win-v4.7.1).
