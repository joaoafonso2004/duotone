# O que verificar no Duotone 4.6.1

Instalar 4.6.1 no iPhone e no PC. Confirmar a versão e o identificador da build em Settings/About antes dos testes. Quase tudo o que mudou é navegação e apresentação, feito sem aparelho: é no iPhone que pode haver surpresas.

## iPhone

1. **Capa do perfil.** A fotografia aparece inteira e só escurece no último terço. Rolar para cima: a fotografia sobe mais devagar do que o texto, e a barra com o nome aparece quando o nome passa por baixo dela. Puxar para atualizar no topo continua a funcionar. Ver também o perfil de um amigo sem capa.
2. **Detalhes dentro do separador.** Abrir uma playlist e um artista a partir da Home, do perfil e do Social: a barra de baixo fica sempre visível. Dentro de um detalhe, arrastar para os lados volta atrás e não muda de separador. Tocar no separador onde já se está, dentro de um detalhe, não faz nada; na raiz leva a lista ao topo.
3. **Conversas.** Abrir uma conversa pelo Social, pelo "Message" de um perfil e por uma notificação. Dentro dela, abrir o perfil de quem escreveu e voltar: regressa à conversa. Arrastar para a direita em qualquer sítio fecha a conversa. A base de baixo esconde-se dentro da conversa e volta ao sair.
4. **A partir da fila e do leitor.** Abrir a fila e escolher "View artist" numa música: a fila fecha e abre o artista. Tocar no nome do artista no leitor aberto: o leitor baixa e abre a página.
5. **Definições.** Roda dentada do perfil → Definições; de lá, Downloads e Library check. Voltar atrás percorre o caminho certo. A base de baixo some nas Definições, no Library check e no Importar.
6. **Menus junto ao dedo.** O "…" de uma música numa lista abre o menu junto ao dedo; escolher uma opção que abre outra janela (playlist, partilhar) não deixa a app presa. Toque longo num amigo do Social: o menu dele, e "Remove friend" pede confirmação.
7. **Biblioteca e Home.** A linha "Downloads" no topo das Playlists; o menu de uma playlist toca, baralha e põe na fila sem abrir. O botão das mensagens na Home mostra a contagem e abre o Social. "Jump back in" reabre cada sítio.
8. **Rádio.** Ligar o Rádio na fila e deixá-lo correr várias músicas: não deve parar. Saltar duas músicas do mesmo artista: deixa de o pôr. A seguir um amigo, a pastilha aparece e ligar começa pela música dele. Fechar e reabrir a app: o Rádio continua.
9. **Calor.** Se o telemóvel aquecer com a app aberta, exportar o playback report logo a seguir e anotar o ecrã onde se estava. Ainda em investigação: o relatório da 4.6.0 mostrou o JavaScript muito ocupado ao voltar à app.

## PC

10. **Menus no cursor.** Botão direito numa música, numa playlist (cartão e página), num atalho da lateral e num amigo: o menu abre junto ao cursor; setas, Enter e Esc funcionam; clicar fora fecha.
11. **Partilhar.** Partilhar uma música e uma playlist: o diálogo fecha com X, Esc e clique fora.
12. **O que chegou ao PC.** "You two" no perfil de um amigo; "Year in review" nas estatísticas; "Jump back in" no topo da página principal (álbuns e prateleiras ficam de fora no PC).
13. **Navegação.** O nome do artista nas tabelas e a barra do leitor (abre o Now Playing) continuam a levar ao sítio certo; o voltar diz para onde vai.

## Validação técnica desta entrega

- Suite completa, TypeScript e os testes novos (`test-destinos.ts`, `test-menu-da-playlist.ts`, `test-consistencia-pc-ios.ts`, `test-capa-do-perfil.ts`).
- No browser: os menus de contexto do PC, o "Jump back in" e a coluna do artista. Nada disto corre no iPhone sem aparelho.

Releases: [iOS 4.6.1](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.6.1) e [Windows 4.6.1](https://github.com/joaoafonso2004/duotone/releases/tag/win-v4.6.1).
