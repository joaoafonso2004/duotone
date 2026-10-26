# O que verificar no Duotone 5.4.3

Passaram a verificação de tipos e os testes todos, também numa cópia com os finais de linha do Windows. O Swift mudou outra vez (os agudos e as notas de cada música): só o CI o compila, e se a build do iPhone falhar é aí. Nada disto foi ouvido num iPhone: foi testado com batidas e acordes sintéticos.

## iPhone — a página do artista

- Abre vários artistas (Artists → um cartão). Enquanto a página desliza, a foto tem de encher o cabeçalho logo, sem passar por um quadrado ao centro.

## iPhone — o AutoMix

Como da outra vez: AutoMix ligado, o iPhone fresco, músicas que já estejam no iPhone, e deixá-las acabar sozinhas.

- **Mais curto:** as passagens já não podem soar a um crossfade de 6 a 16 s. Na batida duram uns 4 compassos; sem batida, 3 s no máximo.
- **O filtro:** na passagem, a que sai tem de ficar mais fina (como um filtro a fechar) e a que entra tem de chegar abafada e abrir. Não pode soar a "mal equalizado" nem dar estalos.
- **O trap:** com o teu rap/trap, as passagens na batida e os cortes têm de cair no "um", e não umas semicolcheias ao lado.
- **A tonalidade e a dobra:** quando a música que sai acaba sem batida (ou não há batida clara), às vezes ela desce ou sobe de tom no fim, como um vinil, para casar com a seguinte. Ouve se dá um corte nesse momento: se der, diz-me e desligo a dobra.
- **A música sem duração:** a "km6ms6YffOM" (a que acabou seca no relatório da 5.4.2) tem de passar para a seguinte com AutoMix.
- **O relatório:** em "queue decisions" cada passagem diz agora a tonalidade das duas ("key 8B -> 10B") e, se se dobrou, "outgoing bent +2 st". Manda-me um depois de umas passagens.

## Windows

Nada mudou. Se a atualização chegar, a app tem de abrir e tocar como na 5.4.2.
