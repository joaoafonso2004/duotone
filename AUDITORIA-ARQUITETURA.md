# Auditoria de Engenharia Atualizada: Duotone vs. Spotify Core Engine
**Autor:** Principal Software Architect & Lead Product Manager (Áudio Distribuído & Sistemas de Streaming)  
**Projeto:** Duotone (`duotone-main`)  
**Plataformas:** **iOS (iPhone/iPad)** e **PC (Windows / Desktop Electron / Web)**  
**Data da Auditoria:** 27 de Setembro de 2026 (Refletindo a versão de produção atual)  
**Documento para:** Alinhamento de Produto, Arquitetura e Execução via **Claude Code**  

---

## 1. Visão Geral do Estado Real do Projeto

A versão ativa da base de código (`duotone-main`) já ultrapassou com sucesso a fase inicial de protótipo e resolveu de forma independente vários dos problemas estruturais comuns em apps de streaming em React Native. A aplicação já dispõe de módulos nativos próprios em Swift (`modules/duotone-remote-commands`), suporte dedicado a Desktop/PC em Electron (`Duotone-Setup.exe`), shell responsiva para desktop (`src/desktop/casca.web.tsx`), e mecanismos avançados de telemetria de áudio (`lib/tempoAteAoSom.ts`).

Esta auditoria atualizada foca-se estritamente **no que já foi superado** e **nos desafios de engenharia que ainda separam o Duotone do padrão de playback do Spotify**.

---

## 2. Vitórias Técnicas: O que JÁ ESTÁ RESOLVIDO no Código Atual

As seguintes vulnerabilidades identificadas em versões legadas já foram corrigidas na base de código atual:

| Vulnerabilidade Antiga | Solução Implementada em `duotone-main` | Ficheiro de Referência |
| :--- | :--- | :--- |
| **Exaustão de Quota da API do YouTube** | Pesquisa via InnerTube sem chave e com quota ilimitada (cliente WEB). A API oficial é apenas último recurso. | `src/api/ytSearchFree.ts` |
| **Re-renders da Barra no `PlayerRoot`** | Componente raiz desacoplado; apenas os sub-componentes isolados subscrevem `positionMs`. | `src/components/PlayerRoot.tsx` (`BarraDoLeitor`, linhas 1853-1869) |
| **Falta de Suporte a PC / Desktop** | Shell completa para Desktop, mini-janela dedicada e build de Windows em Electron. | `src/desktop/casca.web.tsx`, `src/janelaMini.web.tsx`, `electron/` |
| **Teclas de Multimédia no PC** | Integração total com a `MediaSession` API para atalhos de teclado (Play/Pause, Next, Prev) e controlos do Windows/Mac. | `src/navigation/RootNavigator.web.tsx` (linhas 461-516) |
| **Lockscreen do iOS & Background** | Módulo nativo local desenvolvido para interagir diretamente com o `MPRemoteCommandCenter`. | `modules/duotone-remote-commands/` |
| **Sleep Timer Congelado no iOS** | Abandono do `setInterval` JS; verificação por prazo absoluto (`sleepTimerEndsAt`) no `timeUpdate` nativo. | `src/state/player.ts` & `CLAUDE.md` |
| **I/O Excessivo ao Persistir Fila** | Fila de reprodução isolada da posição temporal, evitando escritas contínuas em disco a cada 3s. | `src/lib/sessaoPartida.ts` |
| **Atraso em Mudança de Músicas na Fila** | Smart Cache agressivo que adianta 3 faixas em Wi-Fi e 2 em dados móveis em segundo plano. | `src/lib/adiantarFaixas.ts` |

---

## 3. Onde o Spotify Ainda Ganha: Desafios Restantes no Código Atual

Apesar das enormes melhorias, existem **4 áreas-chave** onde a experiência ainda não atinge o nível instantâneo e determinístico do Spotify:

```
[Spotify]      Clique na música ────► [Instant PCM Audio via C++ Ring Buffer] (< 250ms)
                                     
[Duotone Hoje] Faixa Adiantada  ────► [Lê Cache Local] (< 200ms)  ✅ Perfeito!
               Faixa Nova (Skip) ───► [Espera Download de Todos os Chunks] (2 a 6s) ⚠️ Gargalo
```

### 3.1 O Paradigma "Download-then-Play" em Faixas Não-Cacheadas
* **Ficheiros:** `src/components/YouTubePlayerView.tsx` e `src/lib/youtubeCache.ts`.
* **Diagnóstico:** O `Smart Cache` (`adiantarFaixas.ts`) mascara o problema quando o utilizador ouve uma playlist sequencialmente. Contudo, ao clicar numa **primeira música avulsa na Pesquisa** ou saltar para uma faixa fora da previsão:
  - A app ainda espera pelo download do ficheiro antes de iniciar o `AVPlayer`.
  - Como documentado no teu `CLAUDE.md` (linha 81): *"O 'tocar enquanto descarrega' continua desligado: só se lhe volta a mexer se os números mostrarem que a fase lenta é o download."*
* **Impacto:** O Time-To-First-Sound (TTFA) nessas situações pontuais ainda é de 2 a 6 segundos.

### 3.2 Transições e Gapless Playback Real
* O Spotify utiliza um motor de áudio em C++ com dois pipelines de decodificação PCM a correr em simultâneo. A transição entre duas faixas é contínua e sem hiatos perceptíveis (zero-gap a 44.1kHz).
* No Duotone, a substituição de item no `AVPlayer` ainda introduz uma micro-latência de inicialização de hardware entre faixas.

### 3.3 Arquitetura de Catálogo: Offline-First Integral
* Já dispões de `useOfflineMode()` e gestão de downloads de faixas, mas a biblioteca de músicas/playlists global ainda efetua queries ao Supabase quando há rede ativa.
* O Spotify utiliza um banco de dados relacional local (SQLite/RocksDB) como única fonte de verdade da UI (0ms para abrir qualquer lista), sincronizando com a cloud via *Delta Sync* assíncrono em segundo plano.

---

## 4. Recomendações Priorizadas para o Claude Code

Este é o plano de ação técnico estruturado por prioridade (**P0 a P3**) para orientar as próximas sessões de refatoração no Claude Code.

---

### 🔴 PRIORIDADE 0: Playback Instantâneo em Faixas Fora de Cache (TTFA < 300ms)

#### [P0.1] Reativar ou Refatorar o "Tocar Enquanto Descarrega"
* **Alvo:** `modules/duotone-stream` e `src/components/YouTubePlayerView.tsx`.
* **Objetivo:** Garantir que uma música que não esteja em cache comece a tocar em **< 300ms**, enquanto o resto do ficheiro é gravado em disco concorrentemente.
* **Caminhos de Implementação:**
  1. **Reativar e Estabilizar `duotone-stream`:**
     - Analisar os logs de telemetria de `lib/tempoAteAoSom.ts`.
     - Validar por que razão o `.part` causava instabilidade e assegurar que o cabeçalho corrigido pelo `mp4Fixer` é entregue de imediato ao AVPlayer enquanto o ficheiro cresce.
  2. **Alternativa Padrão Ouro (Localhost HTTP Streaming Proxy):**
     - Levantar um micro-servidor HTTP nativo em `127.0.0.1:8080` (via `GCDWebServer`).
     - O AVPlayer lê desse endereço local. O proxy faz os pedidos em Range ao YouTube CDN, remuxa o cabeçalho em tempo real e entrega os bytes instantaneamente ao leitor, gravando em disco em paralelo.

---

### 🟠 PRIORIDADE 1: Refinamento de Transições e Buffer de Próxima Faixa

#### [P1.1] Redução da Latência de Comutação entre Faixas
* **Alvo:** `src/components/YouTubePlayerView.tsx` e gestão do `player.replaceAsync`.
* **Objetivo:** Quando a faixa atual atinge o fim, a faixa seguinte (que já foi adiantada pelo Smart Cache) deve transitar com 0ms de silêncio perceptível.
* **Ação:**
  - Garantir que a `proximaFaixa` já tem a instância do leitor pré-aquecida ou usar dois `AVPlayerItem` alternados para crossfade real.

---

### 🟡 PRIORIDADE 2: Base de Dados Local Offline-First para a Biblioteca

#### [P2.1] Cache Relacional Local com Delta Sync
* **Alvo:** `src/screens/SongsScreen.tsx`, `src/api/library.ts`.
* **Objetivo:** Eliminar o tempo de carregamento da biblioteca e garantir funcionamento perfeito sem internet.
* **Ação:**
  1. Integrar armazenamento relacional local ultra-rápido (`op-sqlite` no iOS; IndexedDB no PC).
  2. O ecrã lê sempre da base local (carregamento instantâneo em 0ms).
  3. A sincronização com o Supabase é feita em segundo plano apenas para buscar alterações (`updated_at > last_sync`).

---

### 🔵 PRIORIDADE 3: Monitorização e Blindagem do InnerTube

#### [P3.1] Health Check Proativo de Clientes InnerTube
* **Alvo:** `src/api/ytstream.ts` e `QUANDO-O-YOUTUBE-PARTIR.txt`.
* **Ação:**
  - Implementar verificação automática periódica das versões dos clientes (`ANDROID_VR`, `ANDROID`, `WEB`).
  - Se um cliente começar a devolver `HTTP 400 Precondition check failed` em background, registar aviso no diagnóstico do leitor para atualização rápida de `clientVersion`.

---

## 5. Checklist de Execução para o Claude Code

```markdown
- [ ] 1. OTIMIZAÇÃO DO TTFA EM FAIXAS AVULSAS (P0):
      - Inspecionar `lib/tempoAteAoSom.ts` e analisar os tempos reais de resolução e download.
      - Reavaliar o estado do módulo nativo `modules/duotone-stream`.
      - Testar a reprodução de faixas não adiantadas e assegurar início de áudio em menos de 500ms.

- [ ] 2. POLIMENTO DE TRANSIÇÃO E GAPLESS (P1):
      - Verificar o tempo de comutação entre faixas na fila e minimizar o hiato no fim da faixa.
      - Assegurar que faixas em Smart Cache entram imediatamente sem recomeços espúrios (verificando `arranqueTravado.ts`).

- [ ] 3. PERSISTÊNCIA OFFLINE-FIRST DA BIBLIOTECA (P2):
      - Criar camada de cache local para as faixas da biblioteca (SQLite / IndexedDB).
      - Testar o ecrã `SongsScreen` em modo offline total sem atrasos na UI.
```
