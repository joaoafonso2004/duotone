# Guia — PO Token (BgUtils / bgutil-ytdlp-pot-provider)

Resolve a limitação de ~1MB (~20-30s) de áudio por vídeo do YouTube quando
não autenticado como a app oficial. Baseado nos dois repositórios indicados
pelo professor:

- https://github.com/LuanRT/BgUtils — resolve o desafio BotGuard e gera o token.
- https://github.com/Brainicism/bgutil-ytdlp-pot-provider — servidor HTTP de
  referência que usa o BgUtils por baixo e expõe um endpoint simples
  (`POST /get_pot`).

## Não precisas de correr nada — é automático

A app gera o PO Token **on-device**, sem qualquer servidor: `BotGuardMinter`
(`src/components/BotGuardMinter.tsx`) é uma WebView escondida, montada uma
vez em `App.tsx`, que corre a mesma lógica do BgUtils (traduzida para JS
simples) dentro do motor WebKit real do iPhone — o que o desafio BotGuard
verifica (DOM, Canvas, WebGL, IndexedDB) está genuinamente lá, ao contrário
do `jsdom` usado pelo servidor de referência. Não há nada a configurar; isto
arranca sozinho quando a app abre e fica pronto poucos segundos depois (ver
`src/lib/botguardBridge.ts` para o mecanismo de pedido/resposta com a
WebView).

Se por algum motivo isto falhar (ex.: a Google mudar o desafio e a
implementação on-device ficar desatualizada), a app cai automaticamente para
o comportamento anterior (sem PO Token, ~20-30s por música) — nada parte.

## Alternativa avançada: servidor externo (Docker)

Só é preciso se quiseres correr literalmente o servidor de referência do
professor em vez da implementação on-device (ex.: para comparação, ou se a
versão on-device parar de funcionar antes de a atualizares). A app tenta
sempre primeiro on-device; só recorre a este servidor se aquilo falhar.

### 1. Correr o servidor

Mais simples via Docker (não precisa de instalar Node à parte):

```bash
docker run --name duotone-pot -d --init -p 4416:4416 brainicism/bgutil-ytdlp-pot-provider
```

Confirma que arrancou:

```bash
curl http://localhost:4416/ping
```

Deve responder algo como `{"server_uptime":...,"version":"..."}`.

Sem Docker, dá para clonar o repositório e correr nativamente — segue o
README do próprio projeto (`server/README.md`) para `npm install` + `node
build/main.js`.

### 2. Descobrir o IP do PC/Mac na rede local

O iPhone (dispositivo físico) tem de conseguir alcançar este servidor pela
mesma rede Wi-Fi.

- **Windows**: `ipconfig` → vê o "Endereço IPv4" do adaptador Wi-Fi (ex.:
  `192.168.1.10`).
- **Mac**: `ipconfig getifaddr en0`.

O URL a usar na app é `http://<esse-IP>:4416`.

### 3. Configurar na app

1. Abre a app → **Definições → Advanced**.
2. No campo "PO Token server", escreve `http://<IP>:4416`.
3. Carrega **Test connection** — deve dizer "Connected".

A partir daqui, sempre que tocares uma música do YouTube, a app pede a este
servidor um PO Token ligado ao `visitorData` da sessão e anexa-o ao URL do
stream (`?pot=...`). Isto remove o limite de ~1MB — a faixa completa
descarrega-se em pedaços normalmente (ver `src/api/ytstream.ts` e
`src/api/potProvider.ts`).

### 4. Notas

- Se o servidor estiver desligado ou o URL errado, a app cai automaticamente
  para o comportamento anterior (sem PO Token) — não parte nada.
- O servidor tem de estar a correr **antes** de tocares uma música; não há
  arranque automático a partir da app.
- Se mudares de rede (ex.: 4G em vez de Wi-Fi de casa), o IP local deixa de
  ser alcançável — nesse caso é preciso expor o servidor publicamente (ex.:
  túnel `ngrok`/`cloudflared`, ou deploy num VPS/host sempre ligado) e pôr
  esse URL nas Definições.
