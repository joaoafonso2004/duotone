# O que verificar no Duotone 6.0.0 (iPhone e Windows)

Passaram a verificação de tipos e os testes de cada área. A suite inteira estava a correr sem falhas quando se lançou; a cópia com CRLF não correu (pedido do João: lançar já).

## No Supabase (SQL Editor), antes de usar a 6.0.0

1. `supabase/albuns-guardados.sql`: sem ele, guardar um álbum dá erro.
2. `supabase/relatar-problema.sql`: sem ele, o "Report a problem" não envia.
3. `supabase/limpar-filas-e-cache.sql`: a limpeza da noite. No fim do ficheiro, os dois `vacuum full`.

## iPhone

- Playlists → ⋯ de uma playlist → Download: "Downloading N of M" e as músicas com ↓.
- Guardar um álbum (♡ na folha do álbum, ou segurar um disco na página do artista): a pasta "Albums" aparece à cabeça das Playlists, com as capas em camadas.
- Settings → Report a problem: escrever, enviar, e ver o relato na tabela `relatos`.

## Windows

- A foto do artista vai até ao topo da janela, por baixo da barra; os botões da janela respondem.
- A pasta "Albums" nas Playlists, a página dos álbuns e o ♡ no diálogo de um álbum.
- Definições → Report a problem.
