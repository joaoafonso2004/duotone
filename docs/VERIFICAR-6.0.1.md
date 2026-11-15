# O que verificar no Duotone 6.0.1 (iPhone e Windows)

**A 6.0.1 é a 6.0.0 que chega a sair, e é obrigatória** (pedido do João, 15/11). As builds da 6.0.0 pararam no `test-escalas` (o raio 10 da pasta dos álbuns no PC, corrigido em `376301b`) e não publicaram nada; as tags `ios-v6.0.0` e `win-v6.0.0` ficam no GitHub sem release. As notas são as da 6.0.0, com `Minimum version: 6.0.1`: quem tem uma versão anterior vê o aviso de atualização sem "Not now", e o PC instala-a sozinho quando está parado.

Passaram a verificação de tipos e a suite inteira, também numa **cópia dos ficheiros com finais de linha CRLF** (os testes 230 a 359 nunca tinham corrido na CI da 6.0.0). O Swift só o CI compila.

## No Supabase (SQL Editor)

Antes de usar a 6.0.1, os três da 6.0.0, se ainda não correram:

1. `supabase/albuns-guardados.sql`: sem ele, guardar um álbum dá erro.
2. `supabase/relatar-problema.sql`: sem ele, o "Report a problem" não envia.
3. `supabase/limpar-filas-e-cache.sql`: a limpeza da noite. No fim do ficheiro, os dois `vacuum full`.

Depois, **só quando as duas builds estiverem publicadas** (o `.ipa` na `ios-v6.0.1`, o instalador na `win-v6.0.1`, e o `versions.json` do portfólio já na 6.0.1):

4. `supabase/versao-minima.sql`: sobe a mínima do servidor de 5.9.4 para 6.0.1.
   - Daí em diante, as versões abaixo recebem 426 e deixam de carregar dados.
   - Correr antes disso deixava quem está na 5.9.4 sem app e sem para onde atualizar.
   - Depois de correr: a tua 6.0.1 abre e carrega tudo.

## iPhone

- Playlists → ⋯ de uma playlist → Download: "Downloading N of M" e as músicas com ↓.
- Guardar um álbum (♡ na folha do álbum, ou segurar um disco na página do artista): a pasta "Albums" aparece à cabeça das Playlists, com as capas em camadas.
- Settings → Report a problem: escrever, enviar, e ver o relato na tabela `relatos`.

## Windows

- A foto do artista vai até ao topo da janela, por baixo da barra; os botões da janela respondem.
- A pasta "Albums" nas Playlists, com as capas em camadas e o raio certo nos cantos; a página dos álbuns e o ♡ no diálogo de um álbum.
- Definições → Report a problem.
