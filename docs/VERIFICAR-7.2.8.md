# Verificar a 7.2.8 (iPhone e Windows)

O que o João pediu a 27/11, depois da 7.2.7: a capa da playlist que pousava abaixo, o shuffle do amigo, a Customise ao vivo com o Liquid Glass e o fundo da música, as Definições por secções com procura, e no PC as sombras, o Up next e a versão da app no perfil.

**Antes de tudo:** correr à mão o `supabase/versoes-no-perfil.sql` no SQL Editor (a versão da app no perfil, só para a conta do João). Sem ele a linha não aparece, e nada parte.

Correram o typecheck e a suite inteira numa cópia dos ficheiros com CRLF. O iPhone leva um módulo nativo novo (`expo-glass-effect`, o vidro do iOS 26).

## iPhone

1. **Abrir uma playlist pelo quadrado**: a capa pousa no sítio e não sobe quando as músicas chegam. A contagem não passa por "00 songs".
2. **Shuffle numa lista grande**: carregar em Shuffle, ouvir umas músicas, fechar a app, voltar e carregar outra vez: as que já tocaram não voltam tão cedo.
3. **Customise**: os dois ecrãs em cima, presos enquanto as opções rolam. Mudar o play, a barra ou o fundo acende o Now Playing; mudar as listas mostra a Playlist; os nomes dos separadores, a Home. "Next song" muda a capa na pré-visualização sem mudar a música.
4. **Liquid Glass** (só iOS 26): ligar em Customise › App. A barra de baixo e o mini leitor num cartão de vidro a flutuar, e os botões de baixo do leitor numa cápsula. Desligar: tudo como antes. Mudar de separador, abrir uma página sem separadores e fechar a música (deslizar o mini) com ele ligado.
5. **Background follows the song**: ligar, e a cor da capa no topo das páginas; mudar de música: a cor passa devagar. Desligado de origem.
6. **Definições**: cada secção com uma ou duas linhas e "More"; abrir e fechar anima. Sair e voltar: as abertas continuam abertas. Procurar "cross", "eq", "cache": a secção abre e a linha acende.
7. **A versão no perfil** (na conta do João, depois do SQL): abrir o perfil de alguém, amigo ou não: "App version" com o iPhone e o Windows.

## Windows

8. **Sem sombras**: por baixo do separador escolhido (Up next, Lyrics, About) e do Off/Like this/Mix do Radio fica só a linha; o painel de quem está a ouvir sem a sombra escura por baixo da capa.
9. **Up next**: no Now Playing e no painel da direita, a lista começa logo em "Next · N songs", sem a linha da música que toca.
10. **Definições › procura**: "fullscreen" encontra o Ambient full screen (Windows); escolher abre a secção e acende a linha.
11. **Shuffle**: como no iPhone.
