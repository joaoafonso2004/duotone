# Verificar a 7.2.6 (só iPhone)

Duas coisas: as laterais da capa 3D no Eclipse e a presença ao vivo depois de uma quebra da ligação.

As laterais: na 7.2.5 cada lateral tinha por cima uma cópia com a capa que sai, que nunca se via. No vídeo do João (27/11), as laterais tinham a capa nova desde o primeiro fotograma do skip. A causa provável: o Core Animation ordena pela profundidade as camadas irmãs com 3D, e a cópia estava no mesmo plano da de baixo, por isso ganhava a de baixo. Agora a capa que sai vai dentro de cada lateral, por cima da nova, e apaga-se na totalidade com a opacidade nativa da frente.

A presença: uma quebra da ligação ao Realtime era tratada como uma recusa do servidor. O canal saía e a app esperava meia hora, e os amigos viam a música pela tabela, escrita de 10 em 10 min. Agora o canal fica e volta a entrar sozinho.

Correram o typecheck e a suite inteira (398 testes) numa cópia dos ficheiros com CRLF.

1. **Skip com a capa 3D e o Eclipse**, para uma música que já está no telemóvel: as laterais mantêm a capa que sai até o disco tapar a frente, e trocam com ele. O disco continua a passar inteiro e sem engasgos.
2. **Skip para uma música que ainda não está no telemóvel** (a capa monta-se): o mesmo.
3. **Skips seguidos**, depressa: as laterais nunca mostram a capa seguinte antes da frente.
4. **A capa Poster e a Simple**: o skip como antes.
5. **Presença**: com um amigo a ver no PC, mudar de música; a música nova aparece-lhe em segundos. Desligar e voltar a ligar o Wi-Fi e mudar outra vez: também.
