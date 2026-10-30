# O que verificar no Duotone 5.5.0

Passaram a verificação de tipos e os 291 testes (969 s), e a suite inteira outra vez numa cópia dos ficheiros com finais de linha CRLF (316 s), como o checkout do CI do Windows. Uma primeira corrida parou no teste das escalas (letras e raios fora da escala, já corrigidos). A maior parte desta versão é o PC (animações, viagens, cores, vinil), que **só se vê numa janela a sério**: os testes leem o código e não veem o resultado. Nada disto foi visto na app antes de sair.

## Windows

1. **A viagem** (Playlists e Artists). Abre uma playlist pela grelha: o mosaico deve voar para o cabeçalho. Volta (botão, botão do rato ou Esc): o cabeçalho deve voar de volta para o cartão. O mesmo com um artista: o retrato redondo cresce para a foto e volta a ser redondo. Se o retrato aterrar fora do sítio, ou sem animação, diz em que playlist e com que scroll. Com "menos movimento" no Windows não deve haver viagem.
2. **A cor do artista na janela.** Abre um artista: a lateral e a barra do leitor ficam com a cor da foto, com a mesma intensidade do Now Playing (nem mais transparente, nem mais forte). Em Definições, "Now Playing colour" em "Page only" tira-a.
3. **Os dois tons.** Por defeito todas as capas vêm a cores. Em Definições, Appearance, liga "Two-tone covers": as capas das prateleiras, da Home e das grelhas ficam a dois tons e ganham cor ao passar o rato. Desliga e volta tudo a cores, sem reiniciar.
4. **Os Artists.** O artista mais ouvido à frente (com as contas dele e o Play), as três ordens, e o vinil que sai de trás do retrato ao passar o rato (repara se passa por baixo do retrato do lado).
5. **As playlists.** Duas playlists fixadas na lateral: cada uma abre com as suas músicas. No fim de uma playlist tua há "Add something that fits": juntar uma deve acrescentá-la à lista e à contagem. Se a secção não aparecer, é porque a Home ainda não carregou as sugestões.
6. **O Social.** Quem está a ouvir em cartões: "Listen along" aparece ao passar o rato e leva-te para a Jam dele, ou a seguir o que ele ouve. As conversas sem o balão em cada linha. Numa conversa, uma música que ainda não é tua vem a dois tons com "NEW TO YOU" (com a opção dos dois tons ligada).
7. **A barra do leitor e o Now Playing.** O coração no grupo da direita e as animações (shuffle, repeat, play/pause, volume, Jam, coração). A Radio com Off / Like this / Mix e o Clear com Undo.
8. **O perfil e as Liked Songs.** A capa presa e a afastar-se ao rolar, a tecla F, e o cabeçalho da tabela preso nas Liked Songs.
9. **"Continue here"** (do telemóvel para o PC): a música deve arrancar na posição em que estava.
10. **O Recommended do equalizador** já existia desde a 5.4.0: confirma que aparece, e que muda ao trocar de auscultadores.

## iPhone

1. **O AutoMix na batida.** Com o AutoMix ligado, ouve uma playlist com várias passagens (quanto mais músicas na batida, melhor): já não se deve ouvir um degrau na velocidade da faixa que entra. Se ainda se ouvir, anota a hora, para a cruzar com o relatório.
2. **O relatório de memória.** Usa a app como usas durante uns cinco minutos, e em Definições partilha o relatório: a linha `memory rate` (`last minutes with the app open`) já não deve dizer "not measured yet" só por teres saído da app. Anota `MB allocated/min` e `collections/min`.
3. Nada mais muda no iPhone: confirma só que a música, o AutoMix e o leitor se portam como na 5.4.5.
