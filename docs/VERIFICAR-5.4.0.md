# O que verificar no Duotone 5.4.0

Passaram os testes todos, também numa cópia com os finais de linha do Windows. O Swift novo (o AutoMix) só o CI compila: se a build do iPhone falhar, é aí. Nada disto foi visto num iPhone ainda; o arrastar e o Recommended do PC foram vistos num ensaio no browser.

## iPhone

### O que reportaste antes da 5.4.0

- **O leitor a abrir.** Toca em músicas de uma lista ou da página de um artista, várias vezes seguidas: o leitor tem de abrir tão suave como fecha, sem saltos no início. Abre também pelo mini-player. E vê que a capa aparece logo inteira (sem piscar), que a capa 3D flutua e que as letras aparecem ao rodar a capa.
- **O separador leva à página principal.** Abre um artista ou uma playlist e carrega no botão do separador onde estás: volta à página principal dele. Experimenta também abrir um artista na Home, ir às Playlists e voltar à Home pelo botão: a Home aparece na página principal. Na página principal, carregar outra vez sobe a lista ao topo. Deslizar entre separadores não fecha nada.
- **O menu do "…" na fila.** Abre a fila e carrega no "…" de uma música:
  - aparece o mesmo menu das listas, junto ao botão, com a capa, o nome e o coração em cima;
  - o coração guarda sem fechar o menu;
  - Add to playlist e Share abrem as folhas de sempre; Remove from queue tira-a, com Undo;
  - tocar fora fecha. Já não há "Back to queue".
- **Segurar e largar.** Segura uma música na fila até ela pegar e larga sem a mexer: não pode começar a tocar. Um toque normal continua a tocá-la.
- **Arrastar na fila.** As músicas à volta afastam-se a deslizar (já não saltam), e ao largar a música assenta no sítio novo. Experimenta também a pega (≡) e a edição de uma playlist, que usa o mesmo arrasto.

### AutoMix (novo)

- **Onde:** Definições → por baixo do Crossfade → AutoMix. Vem desligado.
- **Na batida:** liga-o e ouve uma playlist ou um Mix de músicas parecidas, deixando-as acabar sozinhas. A seguinte deve entrar em cima da batida da que está a tocar, e as duas cruzam-se uns compassos. Não pode haver estalos nem um momento com o som a dobrar.
- **Andamentos diferentes:** um fade suave que começa num tempo forte, e a seguinte entra sem silêncio no início.
- **Num álbum:** sem passagem entre faixas seguidas do mesmo disco.
- **Com o ecrã bloqueado:** é o caso que mais interessa. As passagens têm de acontecer na mesma.
- **Pausa a meio:** pausa durante uma passagem e retoma. Não pode ficar uma música a tocar sozinha por cima; a seguinte entra no fim, com o crossfade normal.
- **Quente ou em poupança de bateria:** as Definições dizem "Paused while iPhone is hot or saving battery", e as passagens são o crossfade normal.
- **O relatório:** manda-me o relatório de reprodução depois de umas passagens. Em "queue decisions" aparece cada plano ("automix batida/suave", os BPM e a confiança), e é com isso que se afina.
- **Calor:** depois de 30 min com o AutoMix e o ecrã bloqueado, vê a bateria nas Definições do iPhone, como da outra vez.

### Recommended no equalizador (novo)

- **Com AirPods:** leitor → EQ. "Recommended" é o primeiro preset; carrega nele e por baixo aparece "Tuned for Apple AirPods Pro 2 · Change".
- **Troca de auscultadores:** liga outros, e a curva tem de mudar sozinha, sem mudares de música.
- **Com fio:** aparece "Which headphones are these? · Choose". Escolhe o modelo na lista; da próxima vez que ligares esses auscultadores já está escolhido.
- **No altifalante:** "iPhone speaker · no correction, stays flat".
- **Em todas as músicas:** a música seguinte também usa o Recommended. Uma música com o seu EQ fica com o dela.
- **Desligar:** Definições → Equaliser → escolhe outro preset.
- **Com o crossfade ligado:** a música que entra já vem com a curva certa.

### Crossfade que respeita o disco

- Com o crossfade ligado, ouve um álbum (de preferência ao vivo): não pode haver fade entre faixas seguidas do mesmo disco. Numa playlist, o fade de sempre.

## Windows

- **Arrastar uma música**, de uma lista ou de uma prateleira da Home:
  - para as Liked Songs, uma playlist ou um amigo da lateral, para a fila (no sítio exato) e para a barra do leitor;
  - dentro da tua playlist, para mudar a ordem;
  - o cartão a arrastar diz o que vai acontecer; Esc desiste; o aviso no fim tem Undo;
  - um clique continua a tocar, e num carrossel puxar para o lado continua a deslizá-lo.
- **Recommended no equalizador:** Now Playing → EQ.
  - Com auscultadores Bluetooth, deve aparecer "Tuned for …" com o modelo.
  - Nas colunas ou na ficha da placa de som aparece "Speakers · no correction, stays flat · Choose headphones"; escolhe o modelo e fica lembrado.
  - **Diz-me** se o Windows deu o nome da saída ou se ficou sempre em "Choose". Isso não deu para ver fora da app.
  - Também está nas Definições → Sound, como EQ padrão.
- **Crossfade que respeita o disco**, como no iPhone.

## Do teu lado, por fazer desde a 5.3.5

- Correr `supabase/radio-tipo-no-jam.sql` à mão no Supabase.
- Mandar o "Server requests" do relatório do PC.

Releases: [iOS 5.4.0](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.4.0) · [Windows 5.4.0](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.4.0).
