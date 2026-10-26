Duotone iOS 5.4.1 — o refrão primeiro

Novo nesta versão:
- O refrão primeiro: nas descobertas (Discover daily, Rare finds e o "See all" das duas), um auscultador pequeno ao lado de cada música toca 15 s do refrão.
  - A música que estava a tocar baixa para 20 % enquanto ouves, e volta no fim.
  - Tocar no auscultador outra vez para; o de outra música troca.
  - Tocar no resto da música toca-a normal, do início.
  - O refrão é a parte que mais se repete quando as pessoas ouvem a música. Sem esse dado, um terço da música.
- "Chorus on the progress bar", nas Definições em Playback (vem desligado): uma risca fina na barra do Now Playing onde o refrão começa. Só nas músicas com esse dado.

Corrigido:
- AutoMix: a análise lê agora os ficheiros Opus em MP4 pelo AVFoundation. O leitor anterior podia tocar a música e, mesmo assim, não conseguir analisá-la, deixando apenas o crossfade normal.
- As músicas já na cache também são analisadas com antecedência. A análise continua local, uma faixa de cada vez, e respeita a temperatura e a poupança de bateria.
- O relatório de reprodução explica cada recuo para o crossfade. Quando há plano, mostra o tipo da passagem, os BPM, a confiança das duas músicas e o motivo de uma passagem suave.

Verificações recomendadas: https://github.com/joaoafonso2004/duotone/blob/ios-v5.4.1/docs/VERIFICAR-5.4.1.md
Comparar com iOS 5.4.0: https://github.com/joaoafonso2004/duotone/compare/ios-v5.4.0...ios-v5.4.1
