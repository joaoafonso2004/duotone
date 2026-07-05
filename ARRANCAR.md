# Arrancar o Duotone — do PC para o iPhone

As contas e chaves já estão todas configuradas (`.env` preenchido e validado).
Há dois caminhos; começa pelo A, que em ~10 minutos tens a app no telemóvel.

---

## Caminho A — Expo Go (rápido, para testar já)

O Expo Go é uma app da App Store que corre o projeto sem compilar nada.
**Funciona:** login/registo, pesquisa YouTube, player YouTube com toggle
vídeo/foto, biblioteca, álbuns, artistas, playlists, importação.
**Não funciona:** a ligação à conta Spotify (o redirect `duotone://` só
existe no build real — e a conta precisa de Premium de qualquer forma).

### 1. No PC (PowerShell)

```powershell
cd "C:\Users\Utilizador\Desktop\App IOS Musica"
npm install
npx expo start --go
```

- O `npm install` demora uns minutos à primeira.
- O `--go` é importante (força modo Expo Go).
- No fim aparece um **QR code** no terminal.

### 2. No iPhone

1. Instala **Expo Go** da App Store.
2. Liga o iPhone ao **mesmo Wi-Fi** que o PC.
3. Aponta a câmara ao QR code do terminal → abre no Expo Go.
4. Cria conta na app (email + password) e experimenta.

**Se o QR não ligar** (firewall/rede): pára o servidor (Ctrl+C) e corre
`npx expo start --go --tunnel` (aceita instalar o ngrok quando perguntar).

---

## Caminho B — Development build via EAS (a app real, com Spotify)

Compila o iOS na cloud da Expo (não precisas de Mac) e instala a app
"Duotone" verdadeira no iPhone, com ícone, scheme `duotone://` e Spotify
funcional (quando a conta tiver Premium).

**Pré-requisitos:**
- Conta grátis em https://expo.dev
- **Apple Developer Program** (99 USD/ano) em https://developer.apple.com —
  obrigatório para instalar builds no teu iPhone

### Passos (PowerShell, na pasta do projeto)

```powershell
npm install -g eas-cli
eas login                # entra com a conta expo.dev
eas init                 # associa o projeto à tua conta (aceita os defaults)
eas device:create        # abre o link no iPhone e regista o dispositivo
eas build --profile development --platform ios
```

- No primeiro build, o EAS pede para entrar com a conta Apple e trata dos
  certificados sozinho — aceita as opções por defeito.
- O build demora ~10–20 min na fila grátis. No fim dá um **QR code** —
  abre-o no iPhone e instala a app.

### Desenvolver depois do build instalado

```powershell
npx expo start
```

Abre a app **Duotone** no iPhone (mesma rede Wi-Fi) e ela liga-se ao
servidor do PC. A partir daqui, qualquer alteração ao código aparece no
telemóvel ao gravar — só precisas de novo build se adicionares módulos
nativos novos.

---

## Lembretes

- **Spotify**: o separador Spotify dá erro até a conta dona da app
  (a "Neon") ter **Premium**. YouTube funciona sempre.
- **iPhone + Spotify**: instala a app Spotify no iPhone e faz login antes
  de testares a reprodução.
- **Quota YouTube**: 10.000 unidades/dia grátis; a cache no Supabase já
  minimiza o consumo.
- Problemas comuns e soluções: ver fim do **GUIA-SETUP.md**.
