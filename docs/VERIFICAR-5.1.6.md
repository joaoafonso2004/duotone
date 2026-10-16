# O que verificar no Duotone 5.1.6 (iPhone e Windows)

Passaram os 248 testes.

## As duas

- **O relatório** (Windows: Settings → Save playback report; iPhone: o relatório de reprodução) tem a secção "YouTube requests": quantos pedidos na última hora e em 24 h, por tipo, quantos recusados (403/429), e "backing off" quando a app está a recuar.
- **Radio uma tarde inteira:** continua a variar e a não repetir; no relatório, poucos pedidos `ytm-radio` (no máximo um por lote).
- **Home e Radio depois de reabrir a app:** as descobertas aparecem sem uma rajada de pedidos `procura-de-musica` (as já procuradas vêm do aparelho).
- **Com o YouTube a recusar** (o relatório diz "refused"): a pesquisa e o tocar continuam; o Radio usa o que já tem e os lançamentos esperam uns minutos.

Releases: [iOS 5.1.6](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.1.6) · [Windows 5.1.6](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.1.6).
