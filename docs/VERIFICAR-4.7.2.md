# O que verificar no Duotone 4.7.2 (iPhone e Windows)

Precisa do `supabase/playlists-ao-vivo.sql` corrido (o relatório de reprodução,
secção "server updates", diz se falta) e de uma playlist colaborativa com um
amigo.

1. **Ao vivo.** Os dois com a mesma playlist colaborativa aberta, um no iPhone
   e outro no PC. Um põe uma música (pelo "Add to playlist" de uma faixa): no
   outro aparece sozinha, cerca de um segundo depois, com a cara de quem a pôs.
   Tirar e reordenar também.
2. **As tuas mudanças não releem nada.** Pôr uma música numa playlist tua a
   partir do mesmo aparelho continua a funcionar como antes (sem a página a
   piscar).
3. **PC, reabrir.** Sair da playlist, esperar meio minuto, o amigo põe uma
   música, voltar a abrir: já lá está.
4. **Refrescar à mão.** No PC, o botão ao lado do Sort; no iPhone, puxar a
   lista para baixo.
5. **As caras.** No iPhone ficam centradas por baixo de "N songs · N min"; no
   PC, por baixo do título, alinhadas com ele.
6. **A editar no iPhone.** Com o Edit aberto, o amigo põe uma música: a lista
   da edição não muda; ao carregar em Save (ou Cancel), a música dele aparece.

Releases: [iOS 4.7.2](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.7.2) · [Windows 4.7.2](https://github.com/joaoafonso2004/duotone/releases/tag/win-v4.7.2).
