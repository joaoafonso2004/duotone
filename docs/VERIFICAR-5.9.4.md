# O que verificar no Duotone 5.9.4 (iPhone e Windows)

Passaram a verificação de tipos e os 352 testes, também numa **cópia dos ficheiros com finais de linha CRLF**. O Swift só o CI compila.

**A 5.9.4 é obrigatória** (pedido do João, 12/11). As notas levam `Minimum version: 5.9.4`: quem tem uma versão anterior vê o aviso de atualização sem "Not now", e o PC instala-a sozinho quando está parado. O `versao-minima.sql` sobe a mínima do servidor para 5.9.4 (ver em baixo).

## Porque existe

O relatório do PC do João (5.9.3, 12/11 às 02h32) dizia `realtime: NOT connected, 0/0 channels joined | drops: 0`. O servidor tinha fechado todos os canais, e o realtime-js nunca volta a entrar num canal fechado. Cada parte da app passou a ler por sondagem: 383 pedidos numa hora, 2 212 em 24 h, só desse PC, com a inbox lida de minuto a minuto. O gatilho provável: com a sessão a falhar ao renovar, o supabase-js dava ao Realtime a chave pública em vez do token.

## No Supabase (SQL Editor)

1. **Correr outra vez `supabase/presenca-ao-vivo.sql`**, quando quiseres: não depende da versão da app.
   - A presença da 5.9.3 nunca funcionou: o Realtime recusava todos os canais `presenca:<id>`, porque a política só deixava ler `'presence'`. Agora deixa ler `'broadcast'` e `'presence'`, como a da escuta ao vivo.
   - O relatório de migrações não dá pela diferença (só vê se a política existe). Para confirmar: no Logs Explorer, com "Last hour", `realtime_logs` deixa de ter "Unauthorized: You do not have permissions to read from this Channel topic: presenca:…".
2. **`supabase/versao-minima.sql`, só depois de as duas builds estarem publicadas** (o `.ipa` na `ios-v5.9.4`, o instalador na `win-v5.9.4`, e o `versions.json` do portfólio já na 5.9.4).
   - Sobe a mínima do servidor de 5.8.8 para 5.9.4: daí em diante, as versões abaixo recebem 426.
   - Correr antes disso deixava quem está na 5.9.3 sem app e sem para onde atualizar.
   - Depois de correr: a tua 5.9.4 abre e carrega tudo.

## Windows

1. **O canal fica ligado.** Deixa o Duotone aberto no tabuleiro uma noite, ou põe o PC a dormir e acorda-o.
   - No dia seguinte: Definições › Save playback report.
   - Na secção "Server requests", a linha `realtime:` deve dizer `connected, N/N channels joined`, e nunca `0/0`.
   - Em "last hour", o `GET chat_reads` deve ficar em poucas leituras por hora, e não em ~60.
2. **As mensagens chegam sozinhas**, com a janela à vista e escondida (o aviso da barra de tarefas).

## iPhone

1. **As mensagens e a presença dos amigos chegam ao vivo** depois de a app passar muito tempo aberta, e depois de voltar do segundo plano.
2. Com o `presenca-ao-vivo.sql` corrido de novo, um amigo na 5.9.3 ou 5.9.4 aparece "Online" e com a música em poucos segundos.

## O que mudou no código

- `src/lib/tokenDoRealtime.ts`: o Realtime só recebe JWTs. Se a sessão falhar a renovar, fica o último bom; se se sair da conta, esquece-o.
- `src/state/social.ts`: quando o servidor fecha o canal do Social, ele volta a ligar-se (5 s, 30 s, 2 min, 5 min); um canal com o mesmo nome que ainda não saiu sai primeiro; e a recuperação de 2 min apanha um canal que desapareceu.
- Os outros canais (Connect, ajustes, presets) não se recriam sozinhos: dependem de a guarda do token evitar o fecho.
