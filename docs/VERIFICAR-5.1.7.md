# O que verificar no Duotone 5.1.7 (iPhone e Windows)

Passaram os 250 testes.

## Antes de tudo: o SQL

- Correr **`supabase/presenca-quinze-minutos.sql`** uma vez no SQL Editor do Supabase. Até lá a presença bate de 200 em 200 s, como na 5.1.6. O relatório diz se já está aplicado: secção "server updates", "Even fewer presence updates".

## Windows

- **Tudo continua a carregar:** entrar na conta, Social, mensagens, playlists, gostos e Jam. Os pedidos ao servidor passam agora pelo processo da app. Se a ponte falhar, o pedido sai pela janela, como antes.
- **O relatório** (Settings → Save playback report) tem a secção "Server requests": os pedidos da última hora e das últimas 24 h, por tabela ou função.

## As duas

- **Amigos:** o "Online now" continua certo, e ao fechar ou esconder a app desaparece logo. "A ouvir" mostra a música certa e acaba quando a música acaba.
- **Continue here** com o PC e o iPhone na mesma conta: o banner continua a aparecer.

## No painel do Supabase (só o gráfico, nunca o explorador)

- Depois de os PCs atualizarem, Usage → Log Ingestion por dia deve descer para menos de ~33 MB por dia. O 17/10 é o dia de referência.
- Logs → API Gateway, última hora, faceta Method: os `OPTIONS` devem cair para quase zero.

Releases: [iOS 5.1.7](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.1.7) · [Windows 5.1.7](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.1.7).
