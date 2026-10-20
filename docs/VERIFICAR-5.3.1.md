# O que verificar no Duotone 5.3.1 (iPhone e Windows)

Passaram os 260 testes, também numa cópia com os finais de linha do Windows. Não há SQL novo.

## Windows: o crossfade (mexe no motor do PC)

- **Com o Crossfade ligado nas Definições:** deixa uma música chegar ao fim. Nos ~15 s antes da passagem não se ouve nada da seguinte; a passagem começa e os volumes cruzam-se, como antes. Repete com duas ou três músicas seguidas (a partir da segunda, o player em espera é o que tocou a anterior).
- **Ao fim da passagem** a música que entrou continua a ouvir-se, sem cortes, e a fila passa para ela.
- **Seguinte à mão perto do fim** e **pausa a meio da passagem** portam-se como antes.
- **No relatório** (fila de reprodução): se aparecer "crossfade prep was audible on load (PC), muted again", era mesmo o player do YouTube a repor o som — e foi apanhado.

## Windows: o progresso das atualizações

Só se vê na atualização a seguir a esta (a que te traz a 5.3.1 ainda mostra "Checking").

- **About, com uma versão nova a descarregar:** a linha diz "Downloading Duotone X… N%" e sobe; no fim volta a "Check for updates" (e, se tinhas carregado nela, aparece "Duotone X is ready…"). A versão entra quando voltares a abrir o Duotone.
- **Abrir o About a meio do download** já mostra a percentagem.

## iPhone

Igual à 5.3.0: [VERIFICAR-5.3.0.md](VERIFICAR-5.3.0.md).

Releases: [iOS 5.3.1](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.3.1) · [Windows 5.3.1](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.3.1).
