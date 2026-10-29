# O que verificar no Duotone 5.4.6

Passaram a verificação de tipos e os 278 testes (343 s), com dois casos novos para o fôlego do JavaScript. Não houve cópia com finais de linha CRLF: os testes novos não leem código como texto. Esta versão só muda como o relatório calcula a memória: não altera o motor de áudio, o Swift, o AutoMix nem a interface. A medição em si precisa do iPhone.

## iPhone — a memória no relatório

O que se quer saber é se o JavaScript continua a alocar perto dos 652 MB/min do relatório da 5.4.3 (e das ~140 recolhas/min do da 5.4.5), e o que estava no ecrã quando isso acontece.

1. Usa a app como usas: scroll, abrir e fechar o leitor, mudar de separador e de app. Pelo menos cinco minutos com a app à frente, com áudio já em cache e sem pesquisar nem descarregar de propósito.
2. Em Definições, partilha o relatório (Send playback report) e procura na secção `responsiveness` as duas linhas `memory rate`. A segunda (`last minutes with the app open`) já não deve dizer "not measured yet" só por teres saído da app de vez em quando. Os minutos entre parênteses contam só o tempo à frente.
3. Anota o valor de `MB allocated/min` e de `collections/min`, e diz que ecrã estava aberto: leitor aberto, Songs, Pesquisa, equalizador…
4. Para separar o desenho do JavaScript, repete com o leitor aberto durante cinco minutos sem tocar em nada, e depois com o leitor fechado numa lista parada. Se um dos dois ficar muito acima do outro, está aí a pista.

Se vier outra vez perto dos 650 MB/min, o passo seguinte é um perfil de alocações no aparelho: só com o código não se chega ao que aloca.

## Windows

- Confirma que a atualização chega e que a app abre e toca. Não há nada de novo para ver.
