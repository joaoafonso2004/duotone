# O que verificar no Duotone 5.1.0 (iPhone e Windows)

Passaram os 243 testes e a validação de tipos. Nada disto foi visto no iPhone nem no PC antes de sair.

**As duas**

1. **O Radio que não se repete.** Liga o Radio numa música e deixa-o tocar uma tarde. Não deve voltar nenhuma música que tenhas ouvido nas últimas 24 horas. Se voltar alguma, abre o relatório de reprodução logo a seguir: as decisões da fila mostram de que tentativa veio.
2. **O fim de uma lista.** Toca um álbum ou uma playlist de um artista até ao fim, com o Radio desligado. O que continua sozinho tem de ser parecido com ele, e nunca as favoritas de outro género (o Isak que passava à Katy Perry).
3. **New releases na Home.** Com a app aberta mais de um dia (no PC, no tabuleiro), a prateleira atualiza-se sem reabrir. Deve aparecer um lançamento recente de um artista que ouves mas não guardaste.
4. **Most played e Newest.** Abre um artista sem lista de músicas própria (o "Santuarius Records Rap"):
   - os dois botões dão listas diferentes;
   - cada linha diz "7.9K views" ou "12 years ago";
   - num artista sem dados nenhuns, os botões não aparecem.

**Windows**

5. **A lista no mini leitor.** Abre o mini leitor e passa o rato por cima:
   - o botão da lista no canto abre as próximas por baixo do cartão (por cima, se estiver encostado em baixo), e o cartão não se mexe;
   - tocar numa faz essa passar a tocar;
   - tirar o rato fecha a lista;
   - arrastar com a lista aberta fecha-a.
6. **Jam no PC.** Numa Jam, quando a música muda, o PC começa já alinhado com a sala, sem o salto aos 7-9 segundos.

**iPhone**

7. **Jam no iPhone.** Se ainda houver cortes no início das músicas, manda o relatório de reprodução logo a seguir a um. Ele diz se foi um acerto do desvio ("Jam drift seek"), um alinhamento falhado ou um arranque travado.

Da 5.0.1 e da 5.0.0, ainda por ver nos aparelhos: [VERIFICAR-5.0.1.md](VERIFICAR-5.0.1.md), [VERIFICAR-5.0.0.md](VERIFICAR-5.0.0.md).

Releases: [iOS 5.1.0](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.1.0) · [Windows 5.1.0](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.1.0).
