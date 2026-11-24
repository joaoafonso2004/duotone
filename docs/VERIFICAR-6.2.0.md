# Verificar a 6.2.0 (iPhone) e a 7.0.6 (Windows)

Nada disto foi visto no aparelho: o iPhone só com a build, e o PC só no código (a correção da letra 3D foi pela causa, no `CapaMetal3D.web.tsx`). Antes de lançar: o typecheck, a suite inteira e a mesma suite numa cópia dos ficheiros com CRLF.

## iPhone 6.2.0

**Entrar pelo quadrado** (o mais arriscado: a página abre por baixo sem animação nativa e acende quando a capa pousa)
1. Playlists: tocar numa playlist. A cor cresce do quadrado até tapar o ecrã, a capa voa para o topo da página e a página aparece por baixo dela, sem saltar. Nunca se deve ver a página de trás a desaparecer de repente, nem um ecrã preto.
2. Na página da playlist, o botão de voltar: a cor tapa a página, a página sai, e tudo encolhe até ao quadrado de onde saiu.
3. Deslizar da borda numa playlist aberta assim: volta como sempre (desliza), sem encolher.
4. Uma pasta de playlists e uma mistura da Home (Your styles, Radio): a capa apaga-se a chegar ao título.
5. Artists: tocar num círculo. O círculo cresce para a foto grande do artista. Voltar pelo botão: encolhe até ao círculo.
6. Home: Jump back in (uma playlist, um artista, uma mistura) e a Daily mix. Perfil: as playlists e os artistas.
7. Tocar duas vezes depressa num cartão: abre só uma página.
8. Com "Reduzir movimento" ligado no iPhone: as páginas abrem como antes, sem voo.

**QR no Send to friends**
9. Numa playlist → Share: abre logo o "Send to friends". O ícone de QR está no fim do cartão da playlist; tocar nele faz o QR crescer a partir do ícone, no lugar dos amigos. A seta volta.
10. Ler o QR com a câmara de outro iPhone (de um amigo que veja a playlist, no perfil ou porque lha mandaste): abre a Duotone na página da playlist. Com a app fechada também.
11. "Share link…" no QR: abre a partilha do sistema com o link.
12. O menu de uma playlist já não tem "QR code / Copy link".

**O resto**
13. Os plays redondos são de metal: a música do momento no perfil, o "Listening now", a página do artista, a Daily mix, uma playlist e uma música numa conversa. Customise → Play button → Filled: ficam claros.
14. Uma lista da Home (uma mistura, ou o "See all" de uma prateleira): o Play e o Shuffle por cima das músicas.
15. "Playing from" ligado: tocar a música do momento do teu perfil diz "Your song of the moment"; a de um amigo, "Ana's …", e tocar no nome leva ao perfil. Listen again, Heavy rotation, a pesquisa ("From search"), Downloads e um álbum também dizem de onde. Num Jam diz "Jam" e abre o painel.
16. Perfil: os três pontos e o segurar da música do momento abrem o menu de sempre, com "Remove from profile" no teu. Numa conversa, tocar numa música também abre esse menu.
17. Numa conversa, arrastar uma mensagem para a esquerda responde, mesmo com o dedo um pouco torto; arrastar na vertical rola.
18. Em francês: "Afficher le QR code", "Scanner pour ouvrir", "Partager le lien…", e os "Your song of the moment" traduzidos.

## Windows 7.0.6

1. Now Playing com a capa 3D, virada para a letra: clicar numa linha salta para lá, logo a seguir a virar e com o rato a mexer.
2. Um perfil: a música do momento tem o play de metal; no teu, o menu tem "Remove from profile". "Play now" de um perfil ou de uma conversa mostra "From …" no Now Playing.
3. O resto da 7.0.6 é da outra sessão (o hover dos Albums e das Playlists, o interruptor de metal, as prateleiras, os menus e os diálogos): ver os commits `339f9aa`, `1b83657`, `f87c3f6` e `95655b3`.
