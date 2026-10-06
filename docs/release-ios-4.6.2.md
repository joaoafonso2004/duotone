Duotone iOS 4.6.2 — menos calor com a app aberta

- O iPhone aquecia com uma ou duas músicas: ao voltar à app e ao tocar, o Rádio, o Smart Shuffle e a descoberta recalculavam o nome do artista de milhares de faixas, várias vezes por música, e cada título sem " - " percorria todos os artistas conhecidos. Era isso que dava as paragens de mais de um segundo e o JavaScript sempre ocupado.
- O nome do artista, o título e a identidade de cada música passam a ficar guardados, e a procura de um artista dentro de um título vai pelas palavras do título em vez de percorrer todos os artistas. Os resultados são os mesmos; o trabalho por passagem pela biblioteca desce de ~50 ms para ~1–3 ms (medido em Node com 2537 faixas), e com o shuffle cada "seguinte" deixa de refazer a fila inteira.
- O relatório de reprodução passa a medir a energia com a app aberta a partir de 15 segundos (antes, só a partir de um minuto).

Verificações recomendadas: https://github.com/joaoafonso2004/duotone/blob/main/docs/VERIFICAR-4.6.2.md
Comparar com iOS 4.6.1: https://github.com/joaoafonso2004/duotone/compare/ios-v4.6.1...ios-v4.6.2
