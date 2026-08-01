# Instalar o Duotone no iPhone de borla (GitHub Actions + Sideloadly)

O plano: o GitHub compila o `.ipa` num Mac na cloud (grátis), e o Sideloadly
instala-o no iPhone por cabo, assinado com o teu Apple ID normal.

**O compromisso:** certificados de conta Apple gratuita expiram ao fim de
**7 dias**. A app não desaparece nem perde dados — só deixa de abrir até
reassinares (ligar cabo → Sideloadly → 1 minuto). Máximo 3 apps assim.

---

## Parte 1 — Pôr o projeto no GitHub (uma vez)

1. Cria conta em https://github.com (grátis).
2. Instala o **Git para Windows**: https://git-scm.com/download/win
   (aceita as opções por defeito).
3. No GitHub: **New repository** → nome `duotone` →
   **Public** (recomendado: builds ilimitados; em repositório Private os
   minutos de Mac grátis dão só para ~8 builds/mês) → Create.
   Nota: o repositório público expõe o código, mas **não** as tuas chaves —
   o `.env` está no .gitignore e nunca sobe.
4. PowerShell na pasta do projeto:
   ```powershell
   cd "C:\Users\Utilizador\Desktop\App IOS Musica"
   git init
   git add .
   git commit -m "Duotone v1"
   git branch -M main
   git remote add origin https://github.com/O-TEU-USER/duotone.git
   git push -u origin main
   ```
   (troca `O-TEU-USER`; no push abre-se o browser para autorizares)

## Parte 2 — Meter as chaves como secret (uma vez)

1. No repositório: **Settings → Secrets and variables → Actions →
   New repository secret**.
2. Name: `ENV_FILE`
3. Secret: abre o ficheiro `.env` da pasta do projeto no Bloco de Notas e
   cola o **conteúdo todo**.
4. Add secret.

## Parte 3 — Compilar o .ipa

1. No repositório: separador **Actions** → workflow
   **"Build iOS (.ipa sem assinatura)"** → **Run workflow**.
   (Também corre sozinho sempre que fizeres push.)
2. Espera ~15–25 min até ficar verde ✓.
3. Clica no run → secção **Artifacts** → descarrega **Duotone-ipa**.
4. O download é um .zip — extrai-o: lá dentro está o **Duotone.ipa**.

## Parte 4 — Instalar no iPhone (Sideloadly)

1. Instala o **iTunes** no PC (Microsoft Store serve; se o Sideloadly
   reclamar, usa a versão do site da Apple).
2. Descarrega o **Sideloadly**: https://sideloadly.io → instala.
3. Liga o iPhone por **cabo USB** → toca "Confiar" no telemóvel.
4. Abre o Sideloadly:
   - o iPhone aparece no topo;
   - arrasta o `Duotone.ipa` para a janela;
   - em "Apple account" mete o teu Apple ID → **Start**;
   - pede a password (e código 2FA se tiveres) — vai direto à Apple,
     e se preferires podes criar uma palavra-passe específica de app em
     https://account.apple.com.
5. No fim, no iPhone: **Definições → Geral → VPN e gestão de dispositivos**
   → toca no teu Apple ID → **Confiar**.
6. Abre o Duotone no ecrã principal. 🎧

## Renovar (a cada 7 dias)

Cabo → Sideloadly → mesmo .ipa → Start. Os dados da app mantêm-se
(e a biblioteca/playlists vivem no Supabase de qualquer forma).

## Atualizar a app (quando mudares código)

```powershell
git add .
git commit -m "alterações"
git push
```
→ novo build automático no GitHub → descarregar novo .ipa → Sideloadly
por cima do antigo (dados mantêm-se).

## Lançar uma versão (aparece no portfólio)

Um push normal só produz um artefacto para testares. Para publicar uma
versão que apareça no site e avise quem já tem a app, cria uma **tag**:

```powershell
git tag ios-v1.1.0
git push origin ios-v1.1.0
```

O resto é automático: compila, cria o Release com o `Duotone.ipa` anexado,
e avisa o portfólio. Para o PC é igual, com `win-v1.1.0` — e nesse caso nem
sequer precisas de compilar na tua máquina.

**As duas plataformas são independentes.** Uma tag `ios-v*` só faz aparecer
o aviso de atualização nos iPhones; uma `win-v*` só nos PCs.

A versão sai da tag, não do `app.json` — lançar `ios-v1.1.0` faz a app
passar a reportar-se como 1.1.0 sozinha.

## Problemas comuns

- **Build vermelho no GitHub** — abre o run, copia as últimas linhas do
  log ao Claude, que ele resolve.
- **Sideloadly "Guru Meditation"/erros de login** — usa palavra-passe
  específica de app (link acima) em vez da password normal.
- **App instalada mas não abre ("Untrusted Developer")** — falta o passo 5
  da Parte 4.
- **"Maximum App IDs reached"** — o Apple ID gratuito só regista 10 IDs
  por semana; espera uns dias ou usa o mesmo .ipa (não muda o ID).
