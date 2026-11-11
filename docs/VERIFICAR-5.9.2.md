# O que verificar no Duotone 5.9.2 (só iPhone)

Passaram a verificação de tipos e os 346 testes, numa **cópia dos ficheiros com finais de linha CRLF**. Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina. O Swift só o CI compila.

Só para iPhone. O Windows fica na 5.9.1.

As notas mantêm `Minimum version: 5.9.1`: a app só lê as notas da versão mais recente, e sem a linha quem ainda tem a 5.8.8 ou a 5.9.0 deixava de ser obrigado a atualizar. Quem tem a 5.9.1 vê o aviso normal, com "Not now".

## iPhone

1. **Tocar no leitor do ecrã bloqueado abre a app.** Com uma música a tocar:
   - bloqueia o iPhone e toca na capa do leitor: tem de abrir a Duotone (com o Face ID antes, se pedir);
   - com a app em segundo plano, um toque curto na Dynamic Island abre a Duotone; manter o dedo expande o leitor, e tocar na capa expandida também a abre;
   - o mesmo no leitor do Centro de Controlo / Centro de notificações.
   **É uma hipótese** (o Now Playing passa a declarar-se áudio, como o Spotify, em vez de vídeo): se não abrir, o problema é outro.
2. **Nada mais muda no ecrã bloqueado.** O título, o artista, a capa (também a dois tons), a barra de progresso e os botões anterior/seguinte continuam iguais. Trocar de música e pausar não fazem desaparecer o leitor.
