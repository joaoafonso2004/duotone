# O que verificar no Duotone 5.4.2

Passaram a verificação de tipos e os 274 testes, também numa cópia com os finais de linha do Windows. O Swift mudou (a seguinte a entrar à velocidade dela): só o CI o compila, e se a build do iPhone falhar é aí. Nada disto foi ouvido num iPhone: a análise e as passagens foram testadas com sinais sintéticos.

## iPhone — o AutoMix

Antes de tudo: Definições → AutoMix ligado, o iPhone fresco e sem poupança de bateria. Toca músicas que já estejam no iPhone (a passagem precisa dos ficheiros) e deixa-as acabar sozinhas. A frase por baixo do AutoMix diz agora "On the beat when tempos match · otherwise at the end of a phrase".

- **Primeira passagem da sessão:** a música que sai só baixa o volume (os graves dela não trocam ainda). Da segunda em diante já há troca dos graves. Não pode haver estalos em nenhuma.
- **Andamentos parecidos (na batida):** as batidas das duas têm de bater certo, e a meio ouve-se o baixo a passar de uma para a outra, sem dois baixos ao mesmo tempo.
- **Uma música que começa só com melodia (por cima):** a intro dela entra por baixo da outra, e quando a batida dela entra, a da outra já acabou. Tem de soar a uma passagem só.
- **Uma música que acaba sem batida (na cauda):** a batida da seguinte começa logo, e a cauda da outra desvanece por baixo, mais fina.
- **Andamentos diferentes, as duas com batida (corte):** nos últimos 2 s a que sai fica mais fina (sem graves), e a seguinte entra cheia no "um". Tem de soar a um corte de DJ, e não a um salto.
- **O EQ:** com um EQ próprio numa música (ou o Recommended), ela tem de soar com ele durante a passagem, e a seguinte com o dela no fim. Mexe no EQ a meio de uma passagem: os graves da que sai não podem voltar de repente.
- **A velocidade:** põe uma música a 1,1× ou 0,9× e deixa-a passar para a seguinte. Tem de haver passagem do AutoMix (e não o crossfade de sempre), e a seguinte tem de entrar à velocidade dela.
- **Ecrã bloqueado:** as passagens têm de acontecer na mesma.
- **Pausa e saltos a meio:** pausa durante uma passagem e retoma; carrega em seguinte a meio. A que fica tem de ter os graves e o volume dela.
- **O relatório:** depois de umas passagens, manda-me o relatório de reprodução. Em "queue decisions" cada passagem diz o tipo ("automix batida", "por-cima", "cauda", "corte" ou "suave"), os BPM como se ouvem, a confiança e o motivo.
- **Calor:** com o AutoMix ligado, cada música toca agora com o equalizador montado (é o que deixa trocar os graves). Depois de 30 min com o ecrã bloqueado, vê a bateria nas Definições do iPhone.

## Windows

Nada mudou. Se a atualização chegar, a app tem de abrir e tocar como na 5.4.1.
