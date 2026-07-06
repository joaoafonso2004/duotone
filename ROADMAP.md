# Duotone — Roadmap de refinamento

Pedido do João (jul 2026): botões de adicionar em todo o lado, recomendações
personalizadas, ecrã de definições completo, QOL geral. Referências: Spotify
e Deezer (Flow, letras, Shaker, SongCatcher).

## Restrição de API a ter sempre presente

A Spotify **fechou os endpoints de recomendações** (Recommendations, Related
Artists, Audio Features) para apps novas em nov/2024 — não há acesso. Continuam
disponíveis: search, artist top-tracks, new releases, player/Connect. As
recomendações do Duotone terão de ser **heurísticas nossas** sobre os dados do
utilizador no Supabase. O YouTube também já não dá "related videos" via API.

---

## Fase 1.1 — Ações e definições (o refinamento óbvio)

**Botões/ações de adicionar em todo o lado**
- Coração (guardar/remover) no Now Playing e no mini-player
- Swipe nas linhas de faixa: guardar · adicionar a playlist · tocar a seguir
- "Tocar a seguir" e "Adicionar à fila" no menu ••• de qualquer faixa
- Guardar álbum inteiro (botão no detalhe do álbum)
- Guardar top-tracks de um artista (endpoint ainda disponível)
- Multi-seleção na biblioteca (guardar em playlist / remover em lote)
- Badge "guardada ✓" nos resultados de pesquisa
- Ordenação e filtros em Songs/Albums/Artists/Playlists (recentes, A–Z, fonte)

**Ecrã de Definições** (engrenagem no header de Songs)
- Conta: email, mudar password, terminar sessão, apagar conta
- Spotify: ligar/desligar conta, estado da ligação
- Reprodução: tab de pesquisa default, autoplay da fila, modo vídeo/foto
  default, keep-awake on/off
- Dados: limpar cache YouTube, ver uso aproximado de quota, exportar
  playlists (JSON)
- Sobre: versão, avisos de renovação da assinatura (7 dias), licenças

**QOL base**
- Pull-to-refresh em todas as listas
- Skeletons em vez de spinners
- Erros com botão "Tentar de novo"
- Toasts de confirmação ("Guardado", "Adicionado a X")
- Histórico de pesquisa (últimas 10) + limpar
- Deteção de duplicados ao adicionar a playlists

## Fase 1.2 — Recomendações ("Flow caseiro")

Requer primeiro: tabela `plays` no Supabase (histórico de reproduções:
track_id, played_at, ms_played) + coluna `spotify_artist_id` nos tracks.

Secção Home (painel no topo da Pesquisa, ou 6.ª tab):
- **Recently played** — últimas ouvidas
- **Heavy rotation** — mais tocadas dos últimos 30 dias
- **Because you saved X** — top-tracks dos teus artistas (Spotify) +
  pesquisa "artista X" no YouTube
- **New releases** dos teus artistas (endpoint new-releases + filtro)
- **Forgotten favorites** — guardadas há muito, não tocadas recentemente
- **Mix do dia** — shuffle ponderado: 70% favoritas + 30% descobertas
  (géneros dos teus artistas via Spotify search `genre:`)

## Fase 1.3 — Player avançado

- Fila visível e editável (reordenar, remover, limpar)
- Shuffle + repeat (uma/todas)
- Sleep timer (15/30/60 min — pausa Spotify via API, pausa YT via bridge)
- **Letras** sincronizadas via lrclib.net (API gratuita, sem chave) — com
  tradução seria à la Deezer, mas requer serviço de tradução (avaliar)
- Swipe no mini-player: próxima faixa / dispensar
- Landscape para o vídeo YouTube

## Fase 2 — Social e extras (do plano original + inspiração Deezer)

- Playlists partilhadas com amigos (Supabase Realtime) — estilo Shaker
- Upload de MP3s próprios (Supabase Storage 1 GB grátis + expo-audio) —
  terceira fonte "local", à la Deezer; avaliar se vale o esforço
- Perfil com estatísticas (minutos ouvidos, top artistas — temos os dados!)

## Fora de alcance (honestidade técnica)

- **Offline/downloads** — a arquitetura proíbe (YouTube só no player oficial;
  Spotify só na app deles)
- **Recomendações com IA da Spotify** — API fechada desde nov/2024
- **SongCatcher/Shazam** — APIs de reconhecimento são pagas
- **Lossless** — as fontes são o YouTube e a app Spotify
