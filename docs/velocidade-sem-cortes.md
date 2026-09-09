# Mudança de velocidade no iPhone

O deslizador escrevia cada passo do arrasto na store, na persistência e em `expo-video.playbackRate`. No expo-video instalado, esse setter escreve `AVPlayer.defaultRate` e `AVPlayer.rate`; não distingue uma alteração durante reprodução de um arranque. Os caminhos de play também podiam arrancar primeiro e só depois aplicar a velocidade.

A barra agora mostra uma prévia local durante o arrasto e aplica uma única vez ao largar. Cancelar o gesto não altera o áudio. Trocar de faixa desmonta a prévia, impedindo que o arrasto anterior altere a faixa nova. RESET e os ajustes de acessibilidade continuam imediatos.

O módulo nativo muda a taxa no AVPlayer existente. Com o item pronto, áudio disponível e reprodução ativa, usa `playImmediately(atRate:)`, que dispensa a espera preventiva pelo buffer. Se já está a faltar áudio mantém a política normal; com rate zero guarda apenas defaultRate e preserva a pausa. O estado real é verificado na main queue, para uma pausa entretanto recebida não ser anulada. Não altera audioMix, taps, algoritmo de pitch, volume, posição ou sessão de áudio.

Fontes: [Apple — playImmediately(atRate:)](https://developer.apple.com/documentation/avfoundation/avplayer/playimmediately(atrate:)), código instalado em `node_modules/expo-video/ios/VideoPlayer.swift` e `VideoPlayerObserver.swift`.

O plugin `velocidade-expo-video` torna idempotente o setter nativo do Expo: depois do método nativo, o KVO sincroniza a propriedade JS e não volta a escrever a mesma taxa no AVPlayer. A correção é aplicada a cada prebuild iOS, incluindo após npm ci, e falha explicitamente se uma atualização do Expo mudar o trecho esperado. Não modifica outras propriedades do player.

Arranque/retoma configuram a velocidade antes de tocar; a comparação tolera a representação Float do nativo, evitando reaplicar 0.9 quando o motor devolve 0.899999976. O Jam mantém 1x e a preferência individual continua guardada. Binários antigos sem o novo método usam o fallback Expo, com proteção de pausa.

Validação automatizada: handlers reais do slider (prévia, release, cancelamento, RESET, acessibilidade, mudança externa), ponte opcional, aplicação/retoma e valores Float. Os testes de playback-rate, player store, Jam e equalizador continuam aplicáveis. O teste em Windows e a exportação Hermes não compilam nem executam AVFoundation. Confirmar no iPhone: arrastar lentamente e depressa entre 0.5x/1x/2x, tocar na barra, RESET, pausa/retoma, downloads/stream, EQ ativo/plano e crossfade. É necessário um novo binário iOS para o método nativo; não basta trocar o bundle JS.
