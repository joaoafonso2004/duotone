# Duotone v1.10.6 — auditoria técnica e estratégia de produto

Data: 6 de setembro de 2026. Estado: análise concluída; alterações de produção ainda não aplicadas.

## Referência, alcance e evidência

Repositório indicado: [joaoafonso2004/duotone](https://github.com/joaoafonso2004/duotone). As tags locais `ios-v1.10.6` e `win-v1.10.6` resolvem ambas para `2860a7490217aef71824cff392facc93bb10efc2`. A cópia `Desktop/duotone-main` está em `ab9b217`, um commit posterior, que altera pesquisa e acrescenta um teste. Confirmei pelo diff que os ficheiros de áudio, segurança, Electron, módulos Swift e lockfile usados neste diagnóstico são idênticos aos da release. Não mudei de branch nem alterei ficheiros da aplicação.

O `package.json` continua a indicar 1.5.8 e `app.json` 1.0.0; a CI sobrepõe a versão através das tags. Esses campos não identificam a release principal. A pasta `Desktop/App IOS Musica` é uma cópia anterior e não fundamenta os resultados abaixo. Não foi possível obter a página GitHub pelo navegador de pesquisa; a identidade foi confirmada pelo remote e pelos objetos Git locais, não por uma nova comparação remota.

| Verificação executada | Resultado e alcance |
|---|---|
| TypeScript, `tsc --noEmit` | Passou no checkout local, incluindo a alteração de pesquisa posterior à release. |
| `npm test`, incluindo `pretest` | Passou. Testes de lógica, APIs simuladas, Electron simulado e SQL em PGlite local. Não são testes no binário iOS/Windows. |
| `reproduzir.mjs` | Cinco reproduções: parser altera um box irmão; aceita range errado; reutiliza ficheiro truncado; LRU não distingue download explícito; pausa do motor não altera intenção. |
| `validar-candidatas.mjs` | Guardas propostas de parser/range e migração serializada passaram em isolamento. A bateria histórica do fixer também passa com o preflight compatível. |
| `npm audit --omit=dev --json` | 59 entradas afetadas: 58 moderadas, 1 alta. |
| `npm audit --json` | 80 entradas afetadas: 59 moderadas, 21 altas, 0 críticas. Inclui Electron, que está em devDependencies mas é o runtime distribuído no Windows. |

Os totais do npm contam pacotes e propagação pela árvore, não vulnerabilidades únicas nem explorações confirmadas. Os JSON e os logs estão junto deste relatório. O wrapper global de npm estava quebrado; usei o `npm-cli.js` instalado em `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`, sem reinstalar dependências.

Não executei aplicações de SQL em produção, não li valores de `.env`, não analisei dumps de sessões reais e não publiquei builds. Ficam por fazer Instruments/Allocations/Energy Log, captura do áudio real, testes de chamadas/Bluetooth/DAC, avaliação de assinaturas dos instaladores e confirmação das migrações instaladas no Supabase. Nenhum ganho de latência ou RAM é apresentado como medição desses dispositivos.

### Arquitetura efetivamente encontrada

| Área | Implementação atual |
|---|---|
| iOS | React Native/Expo 57, TypeScript, Zustand; dois AVPlayer via expo-video para crossfade; módulo Swift para EQ; MPRemoteCommandCenter e artwork; widget WidgetKit/App Group. |
| Windows | Electron 37.10.3, React Native Web; um IFrame YouTube reutilizado; Web Audio/EQ dentro do iframe; Media Session, atalhos multimédia, tray e notificações. |
| Fonte áudio iOS | Resolver InnerTube, download progressivo completo para M4A local, reparação MP4, HLS em alternativa e WebView como último fallback. O harvester inicial já está desativado. |
| Dados | Supabase Auth/Postgres/Storage/RLS; caches locais, sessão restaurada em pausa, contagens e ajustes com mecanismos de sincronização. |
| Spotify | O código atual inclui importação/matching. A arquitetura de Spotify Connect descrita no README não deve ser tomada como implementação atual: não existe `src/api/spotify.ts` nesta referência. |

Há decisões boas a preservar: listeners React geralmente têm cleanup; KVO usa referências fracas; o tap liberta o `passRetained` em finalize/erro; crossfade respeita dois motores e perfis distintos; normalização apenas atenua; shuffle materializa uma ordem; sessão restaura em pausa; player desktop reutiliza iframe; visualizador já usa WebGL, 30 fps e suspensão por visibilidade. Não há evidência para reescrever toda a stack ou mover o EQ para Metal/DirectX.

## Seção 1: Diagnóstico de Riscos, Otimizações & Substituições

### Criticidade Alta

#### A01 — Sessões persistidas sem cofre da plataforma

**Ficheiro/componente:** `src/lib/supabase.ts:14`; `src/state/auth.ts`; `electron/preload.cjs`.

**Problema identificado:** o adaptador de Auth é `AsyncStorage`, incluindo tokens de sessão. Instalar `expo-secure-store` e declarar o plugin não altera essa escolha. No Windows web, a persistência assenta no storage do renderer. Isto aumenta exposição em cópias do perfil, extração de ficheiros ou execução indevida de JS. A chave pública/anon Supabase é pública por desenho: não a confundir com refresh tokens nem com uma service-role key. Não encontrei evidência de service-role no código examinado.

**Abordagem proposta:** Keychain no iOS; cofre `safeStorage`/DPAPI no processo principal Windows, com IPC de origem validada e chaves limitadas. Migrar a sessão sem pedir novo login, confirmando gravação antes de apagar o legado; serializar migração/refresh/logout. DPAPI protege dados em repouso contra outros utilizadores, mas não isola todas as aplicações do mesmo utilizador nem elimina o impacto de XSS durante a sessão. [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

**Código de correção:** a função completa `criarStorageMigrado` encontra-se em [correcoes-candidatas.ts](./correcoes-candidatas.ts). Copiar para `src/lib/authStorageMigration.ts`. Criar `src/lib/authStorage.native.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { criarStorageMigrado } from './authStorageMigration';

const options = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
export const authStorage = criarStorageMigrado({
  getItem: key => SecureStore.getItemAsync(key, options),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  removeItem: key => SecureStore.deleteItemAsync(key, options),
}, AsyncStorage);
```

Em `supabase.ts`, substituir o import de AsyncStorage por `import { authStorage } from './authStorage'` e a propriedade por `storage: authStorage`. Implementar também a variante `.web.ts` e o IPC descritos no [anexo de integrações](./INTEGRACOES.md), antes de ligar o import. Não usar autenticação biométrica obrigatória para refresh em background. Validar sessões reais com metadata grande: SecureStore pode rejeitar payloads grandes; nesse caso implementar envelope cifrado com chave no Keychain ou chunks versionados com manifest atómico, em vez de voltar a guardar tokens em claro. A implementação completa só fecha após essa validação e os testes de reinstalação/logout.

#### A02 — Download inteiro em RAM, ranges insuficientemente validados e retomada ambígua

**Ficheiro/componente:** `src/lib/youtubeCache.ts:259–392`; callers `YouTubePlayerView.tsx:860`, `:958`, `:1323`; `TrackActionsSheet.tsx:75`.

**Problema identificado:** `new Uint8Array(total)` reserva o tamanho total do áudio, até 256 MiB por operação. Além disso existem buffers de resposta/bridge. Requests aceitam 200 ou 206, mas não verificam `Content-Range`; `arrayBuffer()` consome o corpo antes da verificação final de tamanho. Reproduzido: pedir bytes 4–7 aceita uma resposta `bytes 0-3/8`. Renovar o URL preserva só a string: se mudar itag/representação pode juntar bytes incompatíveis. Pré-cache, reprodução e download explícito não partilham um job único.

**Abordagem proposta:** primeiro validar intervalos/representação; depois downloader nativo em fila serial de I/O, para `.part`, com limite real por bytes recebidos, quota/reserva de disco, cancelamento por evento e uma operação por chave `(sourceId, formato, qualidade)`. Download solicitado pelo utilizador tem prioridade sobre prefetch. Um consumidor a sair não deve cancelar um job ainda requerido por outro. Guardar itag/MIME/codec/total e ETag forte quando disponível; se a identidade não puder ser confirmada após renovar URL, reiniciar de zero. Manter o download completo antes de tocar até haver ensaio que prove reprodução incremental equivalente.

**Ganho estimado, não medido:** um ficheiro de 120 MiB ocupa pelo menos 120 MiB no buffer JS atual. Uma janela de I/O de 1–4 MiB elimina aproximadamente 116–119 MiB dessa alocação, sem contar overheads nativos. Dois jobs atuais podem reservar 240 MiB. O objetivo é O(chunk) por job, não O(ficheiro). Continuar a descarregar tudo antes de tocar não reduz o tempo mínimo de rede: 8 MB a 5 Mbit/s implicam aproximadamente 12.800 ms, antes de RTT, resolver e parsing. Reduzir esse arranque exige cache hit ou transporte incremental/HLS suportado, validado à parte.

**Código de correção imediata:** copiar `validarRespostaParcial` de [correcoes-candidatas.ts](./correcoes-candidatas.ts) para `src/lib/audioRange.ts`. Acrescentar `expectedTotal?: number` ao fim da assinatura de `fetchChunkWithRetry`, e passar `total` como sexto argumento na chamada dentro de `downloadProgressiveAudio`. Substituir o ramo de sucesso por:

```ts
if (res.status === 206 || res.status === 200) {
  if (expectedTotal === undefined) throw new Error('Total do áudio em falta');
  validarRespostaParcial(res, start, end, expectedTotal);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength !== end - start + 1) throw new Error('Chunk truncado');
  return { bytes, url: current };
}
```

Esta correção fecha a corrupção por offset/tamanho; NÃO resolve o pico de RAM de `arrayBuffer()` nem limita um servidor que mente sobre o corpo. A substituição do downloader fica no ticket F2.1 do plano, com aceitação obrigatória de memória, background e cancelamento. Não proponho baixar arbitrariamente o teto de 256 MiB, pois isso retiraria suporte a faixas longas.

#### A03 — Parser MP4 escreve fora do box lógico

**Ficheiro/componente:** `src/lib/mp4Fixer.ts:75–160`.

**Problema identificado:** o parser confirma apenas se o box cabe no seu pai; não confirma se os campos cabem no próprio box. Um `mvhd` truncado faz `write32` alterar bytes do `mdat` seguinte. Reproduzido com uma fixture de poucas dezenas de bytes: os offsets 32–35 são alterados. A leitura 32-bit é signed; `largesize` ignora a metade alta e há recursão sem teto. Trata-se de corrupção lógica de um buffer JS e risco de indisponibilidade; não foi demonstrada escrita arbitrária de memória nativa nem RCE.

**Abordagem proposta:** preflight completo com leitura unsigned, comprimentos de cabeçalhos/campos, limite de profundidade/boxes, sem mutações até terminar. Preservar a semântica do fixer: moov a zero, moof/mdat intactos, sidx/edts neutralizados. O código completo está em `validarEstruturaMp4`, nas candidatas.

**Código de correção:** copiar o validador para `src/lib/mp4Structure.ts` e importá-lo nos dois módulos. No início de `fixMp4Duration`, antes do `try` existente:

```ts
try { validarEstruturaMp4(buffer); }
catch { return; } // mantém o contrato legado: lixo não faz o helper lançar
```

No downloader, antes de chamar `fixMp4Duration`:

```ts
validarEstruturaMp4(combined); // aqui o erro impede publicar/tocar media inválido
fixMp4Duration(combined,
  durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds : null);
```

A validação não é um descodificador completo nem uma verificação de autenticidade. Mede-se o custo do preflight antes de decidir mover o parser para nativo. Num downloader incremental, percorrer cabeçalhos no ficheiro, sem voltar a carregar o áudio todo para JS. Não invalidar automaticamente todos os downloads existentes só por introduzir esta guarda.

#### A04 — Downloads “permanentes” podem ser removidos e cache incompleto pode ficar válido

**Ficheiro/componente:** `src/lib/youtubeCache.ts:34`, `:117`, `:196`, `:340`, `:390`; `App.tsx:108`; `TrackActionsSheet.tsx:55`.

**Problema identificado:** o mesmo diretório/ficheiro representa prefetch, cache e download explícito. O LRU de 500 MiB protege a fila, mas não a intenção de guardar offline. `mtime` é data de escrita, não último acesso. A invalidação por versão apaga tudo. `dest.create()` seguido de `dest.write()` publica o nome final antes de terminar; depois basta `exists` para o aceitar. Reproduzido: falha simulada de disco deixa 1 byte e a chamada seguinte devolve esse URI sem descarregar. Remover download também pode apagar um ficheiro em uso, apesar de o pruning ser limitado ao arranque.

**Abordagem proposta:** manifest de cache com `bytes`, digest, versão de formato, `pinned`, `lastAccessedAt` e leases de leitura; ficheiro temporário promovido só após validação. Downloads explícitos não entram na quota descartável. Na migração, considerar todos os ficheiros antigos como preservados: não existe informação para adivinhar quais eram explícitos. Recolha após libertação de leases e por quota de cache; não apagar a fila para caber no limite.

**Código de correção imediata:** substituir o `dest.create/write` final pela publicação em temporário abaixo. A deduplicação por job é requisito antes de permitir produtores concorrentes; este bloco reduz a janela de ficheiro parcial, não substitui o manifest nem garante durabilidade perante perda de energia.

```ts
const temporary = new File(audioDir(), `${PREFIX}${videoId}-${Date.now()}-${Math.random().toString(36).slice(2)}.part`);
try {
  temporary.create();
  temporary.write(combined);
  if (temporary.size !== total) throw new Error('Gravação de áudio incompleta');
  if (opts.shouldAbort?.()) throw new Error(DOWNLOAD_ABORTED);
  // Executar este commit sob o job único desta faixa; não sobrescrever
  // um ficheiro que um AVPlayer esteja a ler.
  temporary.moveSync(dest);
  cachedIdsIndex?.add(videoId);
  changed();
  return dest.uri;
} finally {
  if (temporary.exists && temporary.uri !== dest.uri) temporary.delete();
}
```

Alterar também todos os leitores para exigirem entrada válida no manifest; o `exists` antigo não deve continuar como autoridade. Um SHA-256 local deteta corrupção posterior, mas não prova a origem se o atacante puder reescrever ficheiro e manifest. Autenticidade requer manifest confiável/assinado; proteção em repouso deve usar Data Protection iOS com acesso após primeiro desbloqueio e ACLs Windows. Não cifrar M4A arbitrariamente sem um caminho de descodificação/seek que continue compatível com AVPlayer e background. Política de backups deve excluir cache regenerável e tratar downloads explicitamente.

Validar também `videoId` antes de construir caminhos: os metadados partilhados aceitam strings mais gerais do que um ID YouTube. Não foi demonstrado escape do sandbox nativo, mas não se deve passar separadores de caminho ao filesystem. No início de `cachedAudioFile`, depois do retorno web, usar `if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('ID YouTube inválido');`; tratar o erro de metadados nos callers e atualizar fixtures que usam IDs artificiais curtos. Isto não retira suporte a IDs YouTube válidos.

#### A05 — Pausa por mudança de saída não entra na intenção do player

**Ficheiro/componente:** `DuotoneRemoteCommandsModule.swift:33–57`; `PlayerRoot.tsx:254–283`; `YouTubePlayerView.tsx:1018`; `src/lib/playbackMachine.ts`.

**Problema identificado:** existem eventos para interrupções, mas não para mudança de rota. A confirmação `em-pausa` do motor preserva deliberadamente a intenção `tocar`; isso está correto para eventos atrasados, mas deixa a UI a querer tocar quando AVPlayer pausa por remoção de auscultadores. A máquina foi reproduzida localmente; o comportamento completo de Bluetooth ainda exige hardware. A Apple documenta que AVPlayer pausa automaticamente na desconexão e que a UI deve refletir essa pausa. [Mudanças de rota](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes).

**Abordagem proposta:** criar evento específico de remoção de saída e chamar `pausePlayback()`; impedir retoma automática após essa remoção. Não transformar todas as pausas do motor em ordens do utilizador. Acrescentar geração de intenção/faixa às interrupções para não retomar uma faixa nova ou contrariar uma pausa feita durante a chamada. Registar rota/taxa/canais sem identificadores pessoais; observar media-services reset e reenquadrar ambos os motores.

**Código de correção:** adição Swift e bridge TypeScript completas no [anexo de integrações](./INTEGRACOES.md). Não trocar a categoria de AVAudioSession por fora do expo-video. Aceitação: desconectar Bluetooth/fio pausa os dois motores durante crossfade; reconectar não arranca som; chamadas respeitam `shouldResume`, mas uma intenção manual posterior prevalece.

#### A06 — Electron sem suporte e advisories na cadeia de dependências

**Ficheiro/componente:** `package.json`, `package-lock.json`, `electron/main.cjs`, workflows.

**Problema identificado:** o runtime instalado é Electron 37.10.3. A série 37 atingiu fim de suporte em 13/01/2026; na data desta auditoria o calendário indica 42–44 como séries estáveis suportadas. `^37.10.3` não atravessa uma major. A app carrega frames remotos, usa permission handlers, executeJavaScript e contextBridge; esses mecanismos aparecem entre os advisories reportados. Não se deve deduzir que todas as vulnerabilidades são atingíveis, mas o processo continua a executar Chromium/Node antigos. [Calendário Electron](https://releases.electronjs.org/schedule).

O scanner também encontrou `@xmldom/xmldom@0.7.13` pela cadeia `@bacons/apple-targets → @bacons/xcode → @expo/plist`; é sobretudo superfície de prebuild/build, não prova de exploração pelo áudio. [Advisory do mantenedor xmldom](https://github.com/xmldom/xmldom/security/advisories/GHSA-wh4c-j3r5-mjhp).

**Histórico confirmado após esclarecimento do utilizador:** a atualização para 44 já foi tentada em `e5fbed3` e revertida em `5a6d194`. A reversão regista `The specified electronDist does not exist: node_modules/electron/dist`, atribuindo a ausência do binário ao mecanismo de instalação do pacote 44. Antes disso, `b59bc64` corrigiu um lockfile gerado por npm 11 que falhava na CI com npm 10. São evidências históricas de falha de instalação/empacotamento; não reproduzi o incidente nesta auditoria. A recomendação inicial de simplesmente instalar Electron 44 ignorava este contexto e foi retirada.

**Abordagem proposta revista:** manter 37.10.3 e o lockfile funcional enquanto se aplicam guardas, cofre e mitigação IPC compatíveis. Investigar a migração numa cópia isolada, começando pelo mesmo Node/npm da CI e pela forma de obter o binário/compatibilidade com electronDist e builder. A promoção depende de instalação limpa, instalador completo e ensaio real de EQ, captura, permissões, iframe e atalhos. Não considerar os testes simulados suficientes para esta mudança. Corrigir dependências de build pelo upstream compatível; evitar `npm audit fix --force`. CI deve auditar runtime distribuído mesmo quando está em devDependencies.

**Passo de diagnóstico antes de qualquer alteração de versão:**

```powershell
git show -s --format=full 5a6d194
git show -s --format=full b59bc64
# A implementação da migração depende de reproduzir e resolver estes erros
# em instalação limpa; não há substituição de versão pronta a aplicar.
```

O histórico foi consultado; a versão e o lockfile não foram alterados. Mitigações locais não eliminam o risco de um runtime sem patches, que permanece registado até existir uma migração validada. Rever dependências afetadas sem correção reportada e criar exceções apenas por advisory e alcançabilidade documentada. Build assinada, verificação de origem/assinatura da atualização e canal beta são parte do plano; o workflow iOS atual produz IPA sem assinatura, adequado ao fluxo existente de sideload, não evidencia distribuição comercial preparada.

#### A07 — Timeout dos chunks não cobre toda a resolução

**Ficheiro/componente:** `src/api/ytstream.ts` (`fetchPlayer`, `pickAudioOnlyHls`); `src/api/potProvider.ts`; `YouTubePlayerView.tsx`.

**Problema identificado:** o downloader tem timeout de 30 s por request, mas vários pedidos anteriores do resolver, manifesto HLS e fornecedor de token não têm `AbortSignal` nem deadline explícito. Os run IDs evitam publicar alguns resultados obsoletos, mas não cancelam a rede. Assim, ainda é possível ficar à espera antes de chegar ao downloader, e os backoffs acumulados não têm orçamento global. Não foi medida a frequência em produção.

**Abordagem proposta:** deadline por etapa e orçamento total; propagar o sinal da seleção da faixa até fetch/parse/retry. Não classificar cancelamento manual como falha de fonte. Respeitar Retry-After em 429, limitar retentativas e manter o utilizador informado. Renovar formato conforme A02; mudar de rede não deve disparar jobs concorrentes.

**Código de correção:** helper novo em `src/lib/requestDeadline.ts`, aplicado à resolução e também à leitura do corpo:

```ts
export async function comDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, milliseconds);
  try {
    if (controller.signal.aborted) throw new Error('Pedido cancelado');
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
```

Em `fetchPlayer`, substituir o fetch e leitura da resposta pelo bloco abaixo; acrescentar um parâmetro opcional `signal?: AbortSignal` à função e propagá-lo pelo resolver até ao controller da seleção:

```ts
return comDeadline(async requestSignal => {
  const res = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(body), signal: requestSignal,
  });
  if (!res.ok) {
    const error = Object.assign(new Error(`InnerTube HTTP ${res.status}`), { http: res.status });
    throw error;
  }
  return res.json();
}, 12_000, signal);
```

Os 12 s são um valor inicial proposto, não uma latência garantida. O helper depende de o transporte respeitar AbortSignal; não interrompe por si trabalho síncrono de parsing. Acrescentar limites de corpo e erros tipados (timeout/cancel/rede) na integração. Não serve como orçamento total: esse deve envolver a cascata inteira.

### Criticidade Média

#### M01 — Arranque Electron confia numa porta antes de confirmar que lhe pertence

**Ficheiro/componente:** `electron/main.cjs:84`, `:141`, `:485`, `app.whenReady`.

**Problema identificado:** `startLocalServer()` não é aguardado, não trata `error` e faz bind em `127.0.0.1`, enquanto a janela carrega `localhost`. Porta ocupada pode terminar o processo com `EADDRINUSE`; o nome localhost também pode resolver de forma diferente. A navegação inicia antes de confirmar o servidor. Não demonstrei takeover nem fuga de credenciais; é uma fronteira de confiança desnecessariamente frágil.

**Abordagem proposta:** aguardar bind, abortar antes de criar janela em erro e validar origem/caminho. Conservar a origem atual nesta primeira correção para não mudar o localStorage dos utilizadores. Uma migração futura para protocolo privado/origem nova precisa de transferência explícita da sessão. A sandbox/contextIsolation/webSecurity já estão ativadas; preservar. Falta ainda uma CSP de produção adaptada ao bundle, introduzida em modo de observação antes de bloquear recursos legítimos. [Segurança Electron](https://www.electronjs.org/docs/latest/tutorial/security).

**Código de correção:** transformar `startLocalServer` em função que devolve Promise e substituir apenas o trecho do listen por:

```js
return new Promise((resolve, reject) => {
  localServer.once('error', reject);
  localServer.listen(SERVER_PORT, '127.0.0.1', resolve);
});
```

Em `app.whenReady().then(async () => { ... })`, usar `if (!isDev) await startLocalServer();` antes de `createWindow()`, terminando a cadeia com `.catch(error => { console.error('Falha no arranque local:', error.code); app.quit(); });`. Separadamente testar a política IPv4/IPv6 e a migração de origem. Ainda não é a correção integral de CSP. Evitar porta aleatória sem migração: mudaria a origem do armazenamento em cada arranque.

#### M02 — EQ nativo com trabalho síncrono e pressupostos de formato

**Ficheiro/componente:** `modules/duotone-audio/ios/DuotoneEq.swift:63`, `:218`, `:358`; `DuotoneAudioModule.swift`.

**Problema identificado:** `asset.tracks(withMediaType:)` corre sincronicamente no caminho de main; mudar ganhos reconstrói o tap, com descontinuidade reconhecida nos comentários. `tapProcess` interpreta buffers como Float32 sem verificar o ASBD. `prepare` aloca arrays; não há medição que permita afirmar que viola o deadline neste uso. Os loops `process` não mostram locks/I/O explícitos e a libertação de estado está implementada. Portanto não diagnostico um leak nativo confirmado.

**Abordagem proposta:** carregar tracks de forma assíncrona, com geração por motor/item; descartar resultados antigos. Guardar capacidades de formato em prepare e fazer bypass transparente para formatos não suportados. Para EQ sem clicks, preparar coeficientes fora de process e trocar blocos com passagem suave, sem locks/alocações no callback. Não transferir processamento de dez biquads para GPU sem perfil: o overhead pode aumentar a latência.

**Código de correção de formato:** no `EstadoDoTap`, acrescentar `var suportaPCM = false`. Em `tapPrepare`, antes de preparar:

```swift
let f = formato.pointee
estado.suportaPCM = f.mFormatID == kAudioFormatLinearPCM
  && (f.mFormatFlags & kAudioFormatFlagIsFloat) != 0
  && (f.mFormatFlags & kAudioFormatFlagIsBigEndian) == 0
  && f.mBitsPerChannel == 32
  && f.mSampleRate.isFinite && f.mSampleRate > 0
  && f.mChannelsPerFrame > 0 && f.mChannelsPerFrame <= 8
guard estado.suportaPCM else { return }
```

Em `tapProcess`, após obter `estado` e DEPOIS de `MTAudioProcessingTapGetSourceAudio`, usar `guard estado.suportaPCM else { return }`. Acrescentar validação da contagem de canais/buffers e de `quantidadeSaida` antes da filtragem; a guarda acima é apenas a correção inicial de formato. Compilação Swift e loopback a 44,1/48/96 kHz ainda pendentes. Referência de orçamento, não resultado: 128 frames a 48 kHz dão 2,67 ms; 256 dão 5,33 ms para toda a cadeia.

#### M03 — Artwork limitada por número, não por memória descodificada

**Ficheiro/componente:** `DuotoneRemoteCommandsModule.swift:25`, `:88`, `:227`, `:253`.

**Problema identificado:** `UIImage(data:)` aceita imagens externas sem limite de dimensões; cache guarda até cerca de 41 artworks antes de esvaziar tudo. A dimensão da imagem pode dominar a RAM e os closures de artwork mantêm a imagem recortada viva. `sampleCells` aceita dimensões positivas sem teto, embora o caller atual use uma grelha pequena. Não foi medido leak: é retenção explícita com orçamento inadequado.

**Abordagem proposta:** downsampling ImageIO antes de descodificar a resolução inteira, NSCache com custo em bytes, limite de download antes de guardar Data e grelha limitada. Preservar o recorte sem barras. A 512×512 RGBA, uma imagem representa cerca de 1 MiB; a 4096×4096 representa 64 MiB. Não significa que as capas atuais tenham 4096 px.

**Código de correção:** em `sampleCells`, limitar `colunas`/`linhas` a `1...32`. Adicionar `import ImageIO` e substituir `UIImage(data:)` por:

```swift
private func imagemReduzida(_ dados: Data) -> UIImage? {
  guard dados.count <= 8 * 1024 * 1024,
        let source = CGImageSourceCreateWithData(dados as CFData, nil),
        let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: 512,
          kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary) else { return nil }
  return UIImage(cgImage: cg)
}
```

Esta guarda limita o decode depois de receber Data; limitar os bytes de rede exige delegate/download task com cancelamento, previsto no plano. Não prometer redução de RAM do transporte só com este bloco. NSCache é limite oportunista: confirmar no perfil de memória.

#### M04 — Login por username faz verificação de password fora do serviço Auth

**Ficheiro/componente:** `supabase/username-login-seguro.sql`; `src/state/auth.ts:120`.

**Problema identificado:** RPC anónima lê hashes em `auth.users` e executa `crypt`. Há bloqueio após cinco falhas por username, mas o SELECT inicial não está serializado com a atualização: pedidos concorrentes podem atravessar a verificação antes do bloqueio. Usernames inexistentes gastam bcrypt sem incrementar tentativas. O bloqueio de uma conta pública também permite negação de serviço dirigida. Aplicabilidade ao servidor depende de esta migração estar instalada; não foi verificado remotamente.

**Abordagem proposta:** conservar login por username, mediado por backend/Edge Function que resolve a identidade internamente e delega password/MFA ao Auth; aplicar rate limit por origem/conta com janela e TTL, sem devolver emails ao cliente. Até à migração, serializar a RPC por chave antes do SELECT e contar também identidades inexistentes. Isso reduz corrida por conta mas não substitui proteção por origem/capacidade.

**Código de correção parcial:** após a validação inicial e antes do SELECT de bloqueio:

```sql
perform pg_advisory_xact_lock(hashtextextended(lower(uname), 0));
```

A versão completa da RPC/Edge Function é um ticket próprio com testes concorrentes e erros indistinguíveis, não deve ser apresentada como resolvida só com esta linha. Aplicar limite de comprimento de password antes de trabalho caro com uma política compatível com contas existentes; manter passwords fora de logs. O Supabase de produção não foi alterado.

### Criticidade Baixa

#### B01 — Trabalho redundante no progresso desktop

**Ficheiro/componente:** `YouTubePlayerView.web.tsx:233–261`; `src/lib/sessionSync.ts:30`.

**Problema identificado:** o ciclo de progresso ainda tenta ler `contentWindow.document` do iframe de outra origem. Falha e cai num catch; já existe uma implementação correta no processo principal (`naoEsticarOTempo`). Este bloco não fornece a funcionalidade pretendida. O polling do handoff já é 60 s e só faz requests com a app visível; não é um vilão de performance demonstrado.

**Abordagem proposta/código:** remover apenas o bloco `try` que vai de `const iframe = document.getElementById(hostId.current)` até ao respetivo `catch {}` dentro de `atualizarProgresso`. Manter as chamadas existentes a `duotoneDesktop.naoEsticarOTempo`. É substituição por uma via equivalente que já existe. Ganho contável: até 60 tentativas falhadas/minuto visível ou 12/minuto oculto, por player. Ganho em ms/RAM ainda não medido. Não desligar o relógio da posição nem o handoff.

#### B02 — Documentação e metadados de versão não descrevem a release

**Ficheiro/componente:** README, ROADMAP, CLAUDE.md, `package.json`, `app.json`, `scripts/write-build-info.mjs`.

**Problema identificado:** documentos descrevem arquitetura antiga e funções já implementadas como futuras; versões locais divergem da tag. Além disso, o passo CI grava o SHA em `buildInfo.ts`, mas `npm run web:build` executa `preweb:build → write-build-info.mjs`, que volta a escrever `BUILD_ID = 'dev'`. Perde-se a identidade do commit no bundle desktop. Isto introduz decisões e suporte baseados na referência errada, como aconteceu no início desta análise.

**Abordagem proposta/código:** manter um manifest de release único por plataforma, validado no build. Este relatório regista a realidade sem alterar os documentos antigos. O script já valida a versão; corrigir a identidade perdida, sem duplicar essa validação. Em `scripts/write-build-info.mjs`, conservar leitura/validação de versão e substituir a criação de `output` por:

```js
const buildId = process.env.DUOTONE_BUILD_ID || 'dev';
if (!/^(?:dev|[a-f0-9]{7,40})$/.test(buildId)) throw new Error('Build ID inválido');
const output = '// Gerado automaticamente.\n'
  + `export const BUILD_ID = ${JSON.stringify(buildId)};\n`
  + `export const APP_VERSION = ${JSON.stringify(version)};\n`;
```

No passo `Compilar bundle web` do workflow Windows, acrescentar `env: { DUOTONE_BUILD_ID: '${{ steps.vars.outputs.short_sha }}' }`. Testar build de tag e desenvolvimento. Não unificar à força ciclos de lançamento iOS/Windows que podem continuar independentes.

## Seção 2: Roadmap Estratégico de Produto

### Posicionamento proposto e premissas

Hipótese de posicionamento: **“A tua biblioteca musical, afinada ao teu gosto, entre iPhone e PC.”** Público inicial a validar: pessoas que organizam muita música, alternam iOS/Windows e valorizam fila, ajustes por faixa e continuidade. Não há dados fornecidos sobre clientes, retenção, disposição a pagar ou preços. Logo, não fixo preço, conversão esperada nem alego que o público já validou estas propostas.

O diferencial demonstrável está na combinação de biblioteca pessoal, ajustes por faixa, descoberta e continuidade. Corrigir segurança, playback, cache e controlos básicos deve beneficiar também o gratuito. Crossfade, EQ, widget, handoff e social já existentes permanecem acessíveis; Premium deve acrescentar valor novo, não retirar estes fluxos.

**Dependência comercial concreta:** a implementação iOS extrai/separa áudio YouTube e o desktop oculta/controla um iframe. As políticas oficiais do YouTube restringem download fora da experiência autorizada, separação/modificação de áudio e background playback. Isto condiciona a proposta comercial e a distribuição, não se resolve com otimização. A alternativa é acrescentar ficheiros pessoais e fontes com direitos/capacidades adequados, mantendo descoberta/importação como metadados e integrações oficiais onde aplicável. Não afirmo equivalência de catálogo sem confirmar disponibilidade/licenciamento; não proponho apagar a implementação atual nesta fase. [Políticas YouTube](https://developers.google.com/youtube/terms/developer-policies-guide).

| Categoria | Iniciativa | Situação atual e impacto técnico | Valor para o utilizador | Esforço estimado / risco |
|---|---|---|---|---|
| Quick Wins | Estado claro de reprodução e recuperação | Usar diagnóstico existente, distinguir sem rede/fonte indisponível/download corrompido; retry sem duplicar fila | Perceber o que aconteceu e recuperar num gesto | 2–3 dias / baixo |
| Quick Wins | Centro de downloads com progresso, tamanho e espaço livre | Manifest/pins dependem de F2; UI pode preparar-se antes | Confiar no “disponível offline” e gerir espaço | 2–4 dias UI após F2 / baixo |
| Quick Wins | Controlos da barra de tarefas Windows | `setThumbarButtons` → comandos da store; aproveitar atalhos/tray existentes | Controlar música sem abrir a janela | 1–3 dias / baixo-médio |
| Quick Wins | Media Session completa e coerente | Já há metadata/play/pause/next/prev; acrescentar seek, posição, cleanup e prevenir comandos duplicados | SMTC mais útil e estado consistente | 2–4 dias / médio, requer Windows real |
| Quick Wins | Acessibilidade do player | Auditar labels, foco, escalas de texto, targets táteis; reduced motion já existe | Utilização mais confortável por teclado/VoiceOver | 2–4 dias / baixo |
| Premium novo | Perfis por dispositivo de saída | EQ por faixa já existe; acrescentar perfil de auscultadores/DAC e precedência determinística | O mesmo gosto sonoro em cada equipamento | 1–2 semanas após eventos de rota / médio |
| Premium novo | Regras de biblioteca e mixes explicáveis | Biblioteca/shuffle inteligente já existem; acrescentar filtros guardados e critérios editáveis | Menos organização manual, descoberta controlável | 1–2 semanas / médio |
| Premium novo | Backup/versionamento de playlists e ajustes | Handoff já existe; acrescentar histórico/recuperação, conflitos e exportação | Recuperar trabalho e trocar de aparelho com confiança | 2–3 semanas / médio |
| Premium novo | Mini-player Windows flutuante | Nova janela pequena com always-on-top e IPC restrito, sem segundo motor; não é automaticamente WinUI CompactOverlay | Música acessível enquanto trabalha | 1–2 semanas / médio |
| Premium novo | Cache preditivo com orçamento | Já há prefetch da próxima faixa; acrescentar Wi-Fi/dados móveis, energia, espaço e probabilidade de consumo | Menos esperas e tráfego previsível | 1–2 semanas após F2 / médio |
| Longo Prazo | Motor de fontes com capacidades explícitas | Adaptadores para media pessoal/licenciada; codec, seek, download, EQ e crossfade por fonte | Biblioteca que não depende de uma única extração frágil | 4–8+ semanas; catálogo/licenciamento separado / alto |
| Longo Prazo | Crossfade com análise de silêncio | Crossfade fixo já existe no iOS; análise offline por faixa, cache de envelope e fallback para fade atual | Transições sem cortar intros/outros ou criar buracos | 2–4 semanas após fontes/medição / alto |
| Longo Prazo | App Intents, atalhos e widget interativo | Widget atual é snapshot/deep links; acrescentar comandos reais e biblioteca de intents | Tocar favoritas por voz/atalho sem navegar | 1–3 semanas / médio |
| Longo Prazo | Live Activity para uma sessão útil | Now Playing já existe e deve ser validado primeiro na Dynamic Island; ActivityKit apenas para contexto adicional, como sessão temporizada | Contexto relevante no bloqueio, sem duplicação | 1–2 semanas de protótipo / médio |
| Longo Prazo | Espacialização simulada opcional | DSP novo só para fontes controladas; ABX, headroom, consumo e bypass | Personalização espacial para quem a aprecia | 3–6 semanas de investigação / alto |

As estimativas são dias/semanas de engenharia de uma pessoa, não datas de entrega; não incluem contratação, validação comercial ou espera por hardware/revisão de lojas. Windows SMTC já tem uma base via Chromium Media Session; não se justifica adicionar WinRT antes de verificar as lacunas reais. [Integração SMTC Microsoft](https://learn.microsoft.com/en-us/windows/apps/develop/media-playback/integrate-with-systemmediatransportcontrols). Live Activities precisam de uma experiência específica e finita, não de atualizações JS ao segundo; validar a adequação às orientações da Apple antes de construir. [Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities).

### Como decidir o Premium

1. Congelar o inventário das funcionalidades gratuitas da v1.10.6 como contrato de regressão.
2. Entrevistar 8–12 utilizadores-alvo: organização, continuidade, controlo sonoro e problemas atuais, sem presumir procura por espacialização.
3. Comparar preferências por perfis de saída, regras de biblioteca e recuperação de playlists; protótipos antes de infraestrutura paga.
4. Medir adoção/retorno de cada novidade e testar disposição a pagar. Considerar compra única para valor local e subscrição apenas quando há serviço contínuo justificável.
5. Só introduzir entitlements depois de separar capacidades da fonte e de definir um pacote que preserve os fluxos gratuitos existentes.

## Ordem de execução

O plano operacional está em [PLANO-IMPLEMENTACAO.md](./PLANO-IMPLEMENTACAO.md): F0 baseline → F1 segurança e guardas → F2 downloads/cache → F3 ciclo de áudio → F4 integrações → F5 validação Premium. A modernização das fontes é uma decisão de produto antecipada e uma implementação maior posterior. Cada fase tem testes, critérios de saída e reversão.
