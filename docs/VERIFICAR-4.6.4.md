# O que verificar no Duotone 4.6.4 (iPhone e Windows)

1. **Mensagens chegam.** Com a conversa aberta num aparelho, mandar uma mensagem do outro (de um amigo, e uma tua do outro aparelho): aparece na conversa e sobe na lista do Social. Com a app escondida e de volta, também.
2. **Bolinhas de por ler.** Ler uma conversa no PC: a bolinha sai no iPhone (pode levar até à próxima abertura do Social).
3. **Grupos.** Alguém cria um grupo contigo e manda uma mensagem: o grupo aparece na lista sem reiniciar a app.
4. **Jam.** Fechar e reabrir a app dentro de uma Jam: voltas a estar lá. Numa conta que já esteve em muitas Jams, abrir a app não liga a uma antiga.
5. **Amigos online.** No Social e na lateral do PC, quem está a ouvir continua a aparecer e a mudar de música.
6. **Os logs.** Supabase → Usage → Log Ingestion, nos dias depois de os aparelhos atualizarem: o gráfico por dia deve descer. Em Logs → API Gateway → Pathname (últimas 24 h), `get_public_profiles`, `chat_group_members`, `chat_reads`, `chat_groups`, `listening_sessions` e `faixas_comecadas` devem cair bastante.

Porquê: os logs do plano grátis são 1 GB por ciclo e quase tudo era API Gateway (uma linha por pedido). Ver a secção Supabase do CLAUDE.md e `scripts/test-pedidos-ao-supabase.cjs`.

Releases: [iOS 4.6.4](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.6.4) · [Windows 4.6.4](https://github.com/joaoafonso2004/duotone/releases/tag/win-v4.6.4).
