# O que verificar no Duotone 5.4.1

Passaram a verificação de tipos e os 274 testes, tanto na cópia normal como numa cópia com os finais de linha do Windows (CRLF). A leitura nativa do AutoMix mudou: o Swift será compilado pelo CI. No PC, o refrão foi visto num ensaio anterior no browser com um leitor falso; o som a sério e o volume da outra música ainda precisam de ser ouvidos no PC e no iPhone.

## PC

### O refrão primeiro (novo)

- **O auscultador:** na Home, passa o rato por um cartão. No canto da capa aparece um auscultador pequeno; tira o rato e ele desaparece.
- **Ouvir:** com uma música a tocar, carrega no auscultador.
  - Em menos de um segundo ou dois tem de se ouvir o refrão, e não o início da música.
  - A tua música baixa (não para) e volta no fim.
  - O anel à volta do botão conta os 15 s.
- **Parar:** carrega outra vez no mesmo auscultador, ou Esc. A tua música volta ao volume de antes, sem degrau.
- **Trocar:** carrega no auscultador de outra música a meio: troca logo.
- **O cartão:** carrega fora do auscultador e a música toca normal, do início. A pré-escuta, se estava a soar, para.
- **Sem nada a tocar:** a pré-escuta funciona na mesma.
- **O volume:** mexe na barra do volume durante a pré-escuta; ela acompanha.
- **O EQ:** com um EQ ligado, a tua música continua com ele depois da pré-escuta.

### A risca na barra (novo)

- Definições → Playback → "Chorus on the progress bar" (vem desligada). Liga-a e toca uma música conhecida: aparece uma risca fina na barra; com o rato na barra diz "Chorus".
- Numa música com poucas visualizações não aparece nada (de propósito).

### Recommended com os Corsair

- Leitor → EQ → Recommended: tem de dizer "Tuned for Corsair Void Elite", e não "No measurements…".

### Segurar nas Playlists

- Arrasta uma música de uma lista e segura-a em cima de "Playlists", na lateral. O item enche-se, e a página das Playlists abre.
- Larga a música num cartão: entra nessa playlist, e voltas para a página de onde vieste.
- Esc a meio também volta.

## iPhone

### O refrão primeiro (novo)

- **Onde:** Home → Discover daily (o auscultador antes do "…") e Rare finds (no canto da capa). Nas outras listas não há, de propósito.
- **Ouvir:** com uma música a tocar, toca no auscultador. Ele roda enquanto prepara e depois fica um "parar" na cor do tema. Tem de se ouvir o refrão, e a tua música tem de baixar e voltar no fim.
- **Parar e trocar:** o mesmo auscultador para; o de outra música troca.
- **A música:** tocar no resto da linha ou do cartão toca a música normal. A pré-escuta para.
- **O ecrã bloqueado e o leitor:** o ecrã bloqueado continua a mostrar a tua música, e não a pré-escuta.
- **Sem rede:** diz "Chorus preview needs a connection".

### A risca na barra (novo)

- Definições → "Chorus on the progress bar" (vem desligada). Liga-a e abre o Now Playing: uma risca fina na barra, onde o refrão começa. Desligada, a barra fica como sempre.

### O AutoMix

- **Opus e cache:** com AutoMix ligado, deixa acabar duas músicas já descarregadas. A análise deve conseguir ler os ficheiros Opus em MP4. Esta é a causa provável do relatório da 5.4.0, mas precisa de confirmação no aparelho.
- **O relatório:** em "queue decisions", cada plano diz "automix batida" ou "suave", os BPM e a confiança de ambas as músicas. O suave explica se os andamentos diferem, se a confiança é baixa ou se não há compassos que caibam.
- **Sem plano:** aparece o motivo: duração em falta, velocidade diferente de 1x, ficheiro local em falta/HLS, análise suspensa por calor ou poupança, falha de leitura nativa, janela sem ritmo ou passagem sem espaço. Uma entrada que ficou atrasada também é identificada.
- **Quente ou em poupança:** uma análise já guardada pode ser usada; uma nova não corre. Não se baixa a confiança mínima sem medições de música real.
- **Pausa, seek e ecrã bloqueado:** confirma que a seguinte não começa sozinha depois de cancelar a passagem e que a passagem continua com o ecrã bloqueado.
- **Álbum, repeat one e Jam:** continuam sem AutoMix entre faixas. No PC o AutoMix continua ausente.
- **Pedidos:** a correção do AutoMix usa apenas os ficheiros do aparelho; não descarrega músicas adicionais nem envia diagnósticos ao servidor.
