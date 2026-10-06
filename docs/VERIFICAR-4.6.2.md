# O que verificar no Duotone 4.6.2

Instalar 4.6.2 e confirmar a versão e o identificador da build em Settings/About.

## O que mudou e porquê

O relatório da 4.6.0 mostrou o iPhone a aquecer com a app aberta: paragens de 0,8 a 1,7 s logo depois de voltar à app, ~2800 recolhas de lixo e ~10 GB alocados num minuto, e o segundo plano tranquilo (3,9% de CPU). A causa era o JavaScript a recalcular o nome do artista de milhares de faixas, várias vezes por música (Rádio, Smart Shuffle, descoberta, identidade de cada faixa da fila com o shuffle), e cada título sem " - " percorria os ~1500 artistas conhecidos a criar texto novo. Agora os resultados ficam guardados e a procura vai pelas palavras do título. Os resultados são os mesmos (testado contra o algoritmo antigo em 2400 textos ao acaso).

## No iPhone

1. **O teste do calor.** Com o telemóvel frio e fora do carregador, abrir a app, tocar uma música da biblioteca ou a "Song of the moment" (o Rádio arranca logo), saltar 4–5 músicas com o shuffle ligado e deixar tocar 10 minutos com a app aberta. Comparar com a 4.6.0. Exportar o playback report no fim.
2. **No relatório:** em "responsiveness", as paragens acima de 500 ms devem quase desaparecer; "memory rate, last minutes with the app open" deve descer muito (eram 2771 recolhas e 10 717 MB por minuto). A secção "foreground energy" passa a ter períodos a partir de 15 s.
3. **Nada mudou no que se vê:** os nomes dos artistas nas listas, na página de artistas e no leitor são os mesmos; o Rádio e o Smart Shuffle continuam a sugerir o mesmo género; o shuffle não repete músicas.
4. **Uma nota sobre o carregador:** na sessão do relatório o iPhone tinha estado a carregar (35% → 95%) até abrir a app. Carregar também aquece; testar fora do carregador para comparar.

## No PC

5. A página de artistas, o Rádio e o Smart Shuffle com a biblioteca grande: os mesmos nomes e sugestões, sem esperas novas.

## Validação técnica desta entrega

- Suite completa e TypeScript; `test-artist-name.ts` compara a procura nova com a antiga em 2400 textos ao acaso e prende as memórias por vocabulário e a confiança guardada; `test-identidade-da-musica.ts` e `test-energia-em-segundo-plano.ts` acrescentados.
- Medido em Node com 2537 faixas e 1420 artistas fiáveis: `displayArtist` 49 → 1–3 ms por passagem, `chavesDaMusica` numa fila de 2537 227 → 1 ms, `nomesDeConfianca` com ~5000 faixas 118 → 2 ms. O Hermes do iPhone não tem JIT, por isso os números antigos eram várias vezes piores lá.

Releases: [iOS 4.6.2](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.6.2) e [Windows 4.6.2](https://github.com/joaoafonso2004/duotone/releases/tag/win-v4.6.2).
