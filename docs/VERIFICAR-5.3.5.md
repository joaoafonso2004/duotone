# O que verificar no Duotone 5.3.5 (iPhone e Windows)

Passaram os 262 testes, também numa cópia com os finais de linha do Windows.

**SQL novo, por correr à mão no Supabase:** `supabase/radio-tipo-no-jam.sql` (depois do `radio-no-jam.sql`). Sem ele, o Radio da Jam continua a não repetir e a encher ao ligar, mas não tem o menu do tipo.

## Os pedidos ao servidor (o mais importante)

- **PC:** deixa a app aberta umas horas, com a janela escondida no tabuleiro e sem música durante um bocado. Depois: Settings → Save playback report → "Server requests".
  - A primeira linha deve dizer **"realtime: connected, N/N channels joined"** e poucas quedas ("drops").
  - Na última hora devem ser bem menos de 100 pedidos (eram ~270).
  - `get_public_profiles`, `chat_reads` e `shared_items` já não devem aparecer às dezenas.
- **Se disser "NOT connected"** ou muitas quedas, manda-me o relatório: aí a causa é outra.
- **No Supabase**, o gráfico "Log Ingestion per day" do Usage deve descer nos dias seguintes (estava a ~25-30 MB/dia). Não abras o explorador de logs com mais de uma hora: é ele que gasta o Log Query.

## Jam (as duas)

- **O volume (PC):** numa Jam, baixa o volume ou põe em mudo. A música seguinte deve começar nesse volume, ou calada.
- **O Radio da sala** (com o SQL corrido):
  - quem manda carrega na pastilha e aparece o menu "Songs like this one" / "Mix";
  - escolher liga-o, e a pastilha diz "Radio on" ou "Mix on";
  - entram músicas logo, mesmo com a fila cheia, depois das que lá estavam.
- **Sem repetições:** com o Radio ligado uma tarde, não deve voltar nenhuma música que a sala já ouviu nessa Jam.
- **Não seca:** a fila não deve acabar com o Radio ligado.

## Mensagens e amigos

- As mensagens continuam a chegar na hora (pelo tempo real), e os nomes e as fotos dos amigos aparecem como antes. Uma foto mudada por um amigo aparece logo, pelo aviso em tempo real.

Releases: [iOS 5.3.5](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.3.5) · [Windows 5.3.5](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.3.5).
