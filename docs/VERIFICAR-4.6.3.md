# O que verificar no Duotone 4.6.3 (iPhone)

1. **A barra do leitor aberto anda.** Abrir o leitor com uma música a tocar: o tempo e a barra avançam. Arrastar a barra, largar: a música vai para lá e a barra continua a andar dali (o botão volta ao tamanho pequeno). Repetir várias vezes seguidas, tocar na barra sem arrastar (salta para o ponto), arrastar e descer o dedo (abranda), e fechar o leitor a meio de um arrasto: ao abrir, a barra está no sítio da música.
2. **Arrastar entre secções nas listas.** Nas Liked Songs, nos Artists, nas Playlists e na Home, arrastar para os lados por cima das músicas muda de secção, como no resto do ecrã. Nenhuma linha se desloca para revelar um ícone da fila.
3. **Pôr na fila.** O "…" de uma música → "Add to queue": aparece no Up next.

Porquê: na captura da 4.6.1/4.6.2 o botão da barra tinha 16 pt e a barra 6 pt — as medidas do arrasto —, por isso não era a posição a não chegar: o começo de um gesto chegava depois do fim dele e o arrasto ficava sem fim. Ver `lib/arrastarBarra.ts` (`beganAtrasado`, `arrastoAbandonado`) e `test-arrastar-barra.ts`.

Release: [iOS 4.6.3](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.6.3).
