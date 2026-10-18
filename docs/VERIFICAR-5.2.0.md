# O que verificar no Duotone 5.2.0 (iPhone e Windows)

Passaram os 252 testes, também numa cópia com os finais de linha do Windows. Não há SQL novo.

## iPhone: pausar fora da app

- **Ecrã bloqueado:** com uma música a tocar, pausa no ecrã bloqueado e espera um minuto. A música fica pausada, e a app, ao abrir, mostra-a em pausa.
- **Centro de Controlo e AirPods:** o mesmo, pausando por lá.
- **Play fora da app:** com a app em pausa, carrega em play no ecrã bloqueado. A música toca, a app mostra-a a tocar, e no fim passa à seguinte normalmente.
- **Chamada:** com música a tocar, recebe uma chamada. Ao desligar, a música volta, como antes.
- **Tirar os auriculares** continua a pausar e não retoma sozinho.
- **No relatório** (secção da velocidade) aparecem as linhas "paused outside the app" e "played outside the app".

## O resto

O mesmo da 5.1.8: [VERIFICAR-5.1.8.md](VERIFICAR-5.1.8.md).

Releases: [iOS 5.2.0](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.2.0) · [Windows 5.2.0](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.2.0).
