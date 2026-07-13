# Duotone — YouTube + Spotify numa só app

App de música pessoal para iOS: pesquisa, guarda e organiza faixas do
**YouTube** e do **Spotify** numa biblioteca e playlists próprias, com conta
de utilizador e sincronização via **Supabase**.

## Regra de arquitetura (inegociável)

- Faixas do **YouTube** tocam no **player oficial do YouTube** dentro de um
  WKWebView (IFrame Player API) — vídeo, marca e anúncios intactos. Nunca há
  extração, scraping ou proxy do stream de media.
- Faixas do **Spotify** tocam **na app oficial do Spotify** (ver decisão
  técnica abaixo) — requer app instalada e conta Premium.
- A YouTube Data API v3 serve só para pesquisa/metadados, com cache em
  Supabase para poupar quota.

## Stack

React Native + Expo SDK 57 (prebuild/CNG, TypeScript) · Supabase (Postgres +
Auth) · YouTube Data API v3 · Spotify Web API (PKCE) · zustand · React
Navigation 7.

## Ecrãs (5 tabs + stack)

Search (YouTube | Spotify) · Songs · Albums · Artists · Playlists — mais Now
Playing (overlay com mini-player persistente), detalhe de playlist/álbum/
artista e importação de playlists do YouTube.

O mini-player do YouTube fica **sempre visível** (o WebView nunca desmonta —
anima entre miniatura e frame completo). No modo expandido há o toggle
**Video / Photo**: na vista foto a artwork cobre o vídeo e o WebView continua
a tocar por trás (áudio e anúncios continuam a correr).

## Decisões técnicas importantes

**Spotify — porquê Connect API e não o SDK nativo?** O wrapper clássico do
Spotify iOS SDK para React Native (`react-native-spotify-remote`) está
abandonado e parte com React Native recente. A app usa o caminho oficial e
mantido: OAuth **Authorization Code + PKCE** (expo-auth-session) + **Spotify
Web API / Connect**, que controla a reprodução na app oficial do Spotify
(play/pause/seek/estado). O resultado prático é o mesmo do App Remote SDK — a
música toca na app Spotify, com background playback nativo — sem dependência
morta. A camada está isolada em `src/api/spotify.ts`; se um dia quiseres
trocar para o SDK nativo, é o único ficheiro a mexer.

**WKWebView em background.** O iOS pausa WebViews quando a app vai para
background ou o ecrã bloqueia — e manter YouTube a tocar em background é uma
funcionalidade do YouTube Premium, não algo que a app deva contornar. O que a
app faz (dentro das regras): mantém o ecrã acordado (`expo-keep-awake`)
enquanto o YouTube toca, incluindo na vista foto. Faixas Spotify não têm este
limite (tocam na app Spotify).

**Quota YouTube.** Cada pesquisa custa 100 unidades (tier grátis:
10.000/dia). Pesquisas e imports ficam em cache na tabela `yt_cache` do
Supabase (7 dias para pesquisas, 1 dia para playlists).

## Estrutura

```
App.tsx                    entry (providers + navegação)
app.json / eas.json        config Expo + EAS Build
supabase/schema.sql        schema completo (tabelas + RLS + trigger + cache)
src/
  theme/                   design system (cores, tipografia, espaçamento)
  types.ts                 Track, Playlist, …
  lib/                     supabase client, env, auth Spotify (PKCE)
  api/                     spotify, youtube (com cache), library, playlists
  state/                   zustand: auth, player
  components/              PlayerRoot (mini + expandido), YouTubePlayerView, …
  screens/                 Auth, Search, Songs, Albums, Artists, Playlists,
                           PlaylistDetail, LibraryGroup, ImportYouTube
  navigation/              RootNavigator (5 tabs + stack)
```

## Começar

Segue o **GUIA-SETUP.md** (passo-a-passo de tudo o que é manual: contas,
chaves, build iOS a partir de Windows). Resumo:

```bash
npm install
copy .env.example .env     # e preencher as 4 chaves
# correr supabase/schema.sql no SQL Editor do Supabase
eas build --profile development --platform ios   # ou prebuild num Mac
npx expo start --dev-client
```

Para um projeto Supabase que já existia antes da sincronização do Profile,
executar também `supabase/cross-device-profile.sql`. Esta migration partilha
avatar, histórico, contagens e estatísticas entre iOS e Windows. Na primeira
abertura, cada instalação importa automaticamente os dados locais antigos e,
depois disso, mantém uma fila offline até conseguir sincronizar.

> Nota: esta app usa módulos nativos (WebView, SecureStore, …) — **não corre
> no Expo Go**. É preciso um development build (EAS ou Xcode).
