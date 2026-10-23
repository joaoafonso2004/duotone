# O que verificar no Duotone 5.3.4 (iPhone e Windows)

Passaram os 261 testes, também numa cópia com os finais de linha do Windows. Não há SQL novo.

## A mesma imagem fora e dentro (as duas)

- **Artists:** os cartões mostram a foto de cada artista. Na primeira vez vão aparecendo enquanto rolas, e da vez seguinte já lá estão. Quem não tem foto no catálogo fica com a capa de uma música dele.
- **Abrir um artista:** a página abre com a MESMA imagem do cartão (a foto, ou a capa) e não troca. No iPhone, se a foto grande demorar, vê-se a pequena até ela chegar.
- **Dave Blunts:** a foto dele (a de dois homens, fundo branco) fora e dentro. Já não a silhueta cinzenta.

## iPhone: a página do artista

- **O nome pequeno na barra:** rola devagar. A barra ganha o nome pequeno, o fundo e o Play pequeno só quando o nome grande acaba de passar por baixo dela, e não ao começar a rolar.
- **Um artista sem álbuns nem singles** (o Dave Blunts, por exemplo): por baixo dos números aparece "Songs" com as músicas todas numa lista, em vez das Top Songs em grelha e mais nada.

## Pedidos

- As fotos vêm do catálogo de música (não do YouTube nem do Supabase), uma vez por artista em cada aparelho, e ficam guardadas 30 dias.

Releases: [iOS 5.3.4](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.3.4) · [Windows 5.3.4](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.3.4).
