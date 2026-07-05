# Guia de setup — tudo o que tens de fazer manualmente

Segue pela ordem. Tempo estimado: 45–60 min (sem contar com a aprovação da
conta Apple Developer, se fores por EAS).

---

## 1. Node.js no Windows

1. Instala o Node LTS: https://nodejs.org (versão 22.x).
2. Abre um terminal na pasta do projeto e corre:
   ```bash
   npm install
   ```

## 2. Supabase (base de dados + auth) — grátis

1. Cria conta em https://supabase.com e um **New project** (região Europe
   West, password forte da BD — guarda-a).
2. Quando o projeto abrir, vai a **SQL Editor** → **New query**, cola o
   conteúdo completo de `supabase/schema.sql` e carrega **Run**. Deve dizer
   "Success". Isto cria as tabelas, as políticas de segurança (RLS) e o
   trigger que cria o perfil no registo.
3. Vai a **Project Settings → API** e copia:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. (Opcional, facilita testes) **Authentication → Providers → Email** →
   desliga "Confirm email". Assim entras logo após criar conta na app.

## 3. Spotify Developer

1. Vai a https://developer.spotify.com/dashboard e entra com a tua conta
   Spotify (**tem de ser Premium** — desde fev/2026 o dono de uma app em
   Development Mode precisa de Premium; a reprodução também exige Premium).
2. **Create app**:
   - Name/Description: Duotone (ou o que quiseres)
   - **Redirect URI**: `duotone://spotify-auth`  ← tem de ser exatamente isto
   - APIs: seleciona **Web API**
3. Copia o **Client ID** → `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`.
   (Não precisas do Client Secret — a app usa PKCE.)
4. Em **User Management** adiciona o email da tua conta Spotify (e de quem
   for testar — máx. 5 utilizadores em Development Mode).
5. No iPhone: instala a app **Spotify** e faz login.

## 4. YouTube Data API v3 — grátis

1. Vai a https://console.cloud.google.com → cria um projeto (ex.: "Duotone").
2. **APIs & Services → Library** → procura **YouTube Data API v3** → Enable.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Copia a chave → `EXPO_PUBLIC_YOUTUBE_API_KEY`.
5. (Recomendado) Em **Edit API key**: restringe a "YouTube Data API v3".
   Quota grátis: 10.000 unidades/dia (cada pesquisa custa ~101; a app faz
   cache no Supabase para não repetir gastos).

## 5. Ficheiro .env

```bash
copy .env.example .env
```
Abre o `.env` e preenche as 4 variáveis com o que copiaste acima.

## 6. Compilar para o iPhone (estás em Windows)

A app usa módulos nativos → **não corre no Expo Go**. Duas opções:

### Opção A — EAS Build (cloud, sem Mac) ← recomendada
1. Cria conta em https://expo.dev.
2. Precisas de **Apple Developer Program** (99 USD/ano) em
   https://developer.apple.com para instalar builds no teu iPhone.
3. No terminal:
   ```bash
   npm install -g eas-cli
   eas login
   eas build:configure          # associa o projeto à tua conta
   eas device:create            # regista o teu iPhone (abre link no telemóvel)
   eas build --profile development --platform ios
   ```
4. No fim, o EAS dá um QR code — abre no iPhone para instalar a app.
5. Para desenvolver:
   ```bash
   npx expo start --dev-client
   ```
   Abre a app Duotone no iPhone e liga ao servidor (mesma rede Wi-Fi).

### Opção B — Mac com Xcode
Com provisioning gratuito (sem pagar Apple), builds válidos 7 dias:
```bash
npx expo prebuild --platform ios
npx expo run:ios --device
```

## 7. Primeiro arranque

1. Cria conta na app (email + password) — o perfil é criado automaticamente.
2. Tab **Search** → separador **Spotify** → **Connect Spotify** (abre o
   consentimento OAuth; usa a conta que puseste no User Management).
3. Pesquisa uma música no YouTube e toca — deve aparecer o mini-player com o
   vídeo. Expande e experimenta o toggle **Video/Photo**.
4. Pesquisa no Spotify e toca — se disser "No active Spotify device", abre a
   app Spotify uma vez e volta a tentar (a app tenta acordá-la sozinha).

## Problemas comuns

- **"No active Spotify device"** — a app Spotify tem de estar aberta em
  background no iPhone. Abre-a, toca qualquer coisa 1 segundo, volta ao
  Duotone.
- **Spotify 403** — a conta não é Premium ou não está no User Management da
  app no dashboard.
- **YouTube "quotaExceeded"** — gastaste as 10.000 unidades diárias; renova à
  meia-noite (hora do Pacífico). A cache no Supabase minimiza isto.
- **YouTube pausa quando bloqueias o ecrã** — comportamento do iOS/YouTube
  (background playback é feature do YouTube Premium). A app mantém o ecrã
  acordado enquanto o YouTube toca, incluindo na vista foto.
- **Erro de env em falta no arranque** — confirma que o `.env` existe e
  reinicia o `expo start` com `--clear`.
