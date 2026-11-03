Duotone iOS 5.7.3 — mudança de velocidade e equalizador

Corrigido:
- Elimina a segunda escrita da velocidade feita pelo player ao sincronizar uma mudança já aplicada pelo módulo nativo.
- Mantém a espera de buffering suspensa durante estados transitórios da mudança de velocidade, incluindo com o equalizador ligado. Pausar repõe a política normal de buffering.
- Ao aplicar o EQ, só altera o algoritmo de tom se esse algoritmo tiver realmente mudado.
- Mantém o tom a acompanhar a velocidade, como no PC, e preserva a pausa, a retoma e a sincronização do valor mostrado no player.

A build verifica que a proteção contra escritas repetidas faz parte do módulo compilado e executa testes Swift do transporte e do KVO.

Comparar com iOS 5.7.2: https://github.com/joaoafonso2004/duotone/compare/ios-v5.7.2...ios-v5.7.3
