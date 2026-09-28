# Integrações propostas — A01 e A05

Estes blocos são propostas para a v1.10.6, não alterações aplicadas. Os helpers de migração foram testados em isolamento; Electron real, Keychain e Swift ainda precisam dos testes do plano. Integrar todos os ficheiros de cada proposta na mesma alteração, sem deixar o cliente apontar para uma ponte inexistente.

Restrição confirmada: o upgrade para Electron 44 foi revertido em `5a6d194` após falha de empacotamento. O cofre abaixo usa APIs disponíveis em 37.10.3 e não depende de repetir essa atualização. A migração do runtime tem investigação e validação separadas no plano.

## A01 — Cofre Windows

Em `electron/main.cjs`, acrescentar `safeStorage` ao destructuring de `require('electron')` e adicionar o seguinte depois de `daJanelaPrincipal`. A validação de origem complementa a identidade da janela/frame. A fila serializa as operações de cofre. Os caminhos não são recebidos do renderer.

```js
const fsp = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
let credentialQueue = Promise.resolve();

ipcMain.handle('auth-storage', (event, operation, key, value) => {
  if (!daJanelaPrincipal(event) || !origemDaApp(event.senderFrame.url)) {
    throw new Error('Origem inválida');
  }
  if (!['get', 'set', 'remove'].includes(operation)
      || typeof key !== 'string'
      || !/^sb-[a-z0-9-]{1,100}-auth-token(?:-code-verifier)?$/.test(key)) {
    throw new Error('Pedido de sessão inválido');
  }
  if (operation === 'set' && (typeof value !== 'string'
      || Buffer.byteLength(value, 'utf8') > 256 * 1024)) {
    throw new Error('Sessão demasiado grande');
  }
  const task = credentialQueue.catch(() => {}).then(async () => {
    await app.whenReady();
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Cofre indisponível');
    const directory = path.join(app.getPath('userData'), 'credentials');
    const file = path.join(directory, `${key}.bin`);
    if (operation === 'get') {
      try { return safeStorage.decryptString(await fsp.readFile(file)); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    if (operation === 'remove') {
      await fsp.rm(file, { force: true });
      return null;
    }
    await fsp.mkdir(directory, { recursive: true });
    const encrypted = safeStorage.encryptString(value);
    const temporary = path.join(directory, `${key}.${randomUUID()}.tmp`);
    try {
      await fsp.writeFile(temporary, encrypted, { flag: 'wx' });
      await fsp.rename(temporary, file);
    } finally {
      await fsp.rm(temporary, { force: true });
    }
    return null;
  });
  credentialQueue = task;
  return task;
});
```

São as APIs síncronas de cifra compatíveis com Electron 37; os ficheiros usam I/O assíncrono e as sessões são pequenas. Na atualização do Electron, avaliar as APIs async disponíveis na versão efetivamente fixada. Não copiar APIs de documentação latest para uma versão que não as tem. Acrescentar quota/recusa de múltiplas chaves se o produto passar a aceitar múltiplos projetos Auth. Testar rename sobre ficheiro existente e falhas de disco no Windows real.

No objeto exposto de `electron/preload.cjs`:

```js
authStorage: Object.freeze({
  getItem: key => ipcRenderer.invoke('auth-storage', 'get', key),
  setItem: (key, value) => ipcRenderer.invoke('auth-storage', 'set', key, value).then(() => undefined),
  removeItem: key => ipcRenderer.invoke('auth-storage', 'remove', key).then(() => undefined),
}),
```

No tipo `Window.duotoneDesktop` de `src/desktop/electron.d.ts`:

```ts
authStorage?: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
```

Criar `src/lib/authStorage.web.ts`, usando o mesmo helper de migração do relatório:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { criarStorageMigrado } from './authStorageMigration';

const desktop = typeof window === 'undefined' ? undefined : window.duotoneDesktop;
if (desktop && !desktop.authStorage) throw new Error('Atualiza a aplicação para ativar o cofre');
// O browser de desenvolvimento conserva o comportamento atual.
// O produto Windows/Electron nunca recua silenciosamente para AsyncStorage.
export const authStorage = desktop?.authStorage
  ? criarStorageMigrado(desktop.authStorage, AsyncStorage)
  : AsyncStorage;
```

Criar `src/lib/authStorage.ts` que reexporta `./authStorage.native`, para o TypeScript resolver a importação sem extensões de plataforma; Metro resolve `.web` na build Windows. Não confundir browser de preview com Windows distribuído; se existir futuramente produto web público, desenhar a sessão web separadamente.

Na inicialização, apresentar erro recuperável se a migração falhar. Não eliminar o token legado antes de confirmar gravação no cofre. Testar logout concorrente, refresh expirado, utilizadores diferentes e instalação sobre versão antiga. O backend nativo deve ser validado com payloads grandes antes de usar este adaptador de forma generalizada.

## A05 — Mudança de rota iOS

Em `DuotoneRemoteCommandsModule.swift`:

1. Acrescentar uma propriedade `private var observadorDeRota: NSObjectProtocol?`.
2. Acrescentar `"onAudioRouteLost"` à declaração existente de `Events`.
3. No `OnCreate`, depois do observador de interrupção, adicionar:

```swift
self.observadorDeRota = NotificationCenter.default.addObserver(
  forName: AVAudioSession.routeChangeNotification,
  object: AVAudioSession.sharedInstance(),
  queue: .main
) { [weak self] nota in
  guard let raw = nota.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
        let reason = AVAudioSession.RouteChangeReason(rawValue: raw),
        reason == .oldDeviceUnavailable else { return }
  self?.sendEvent("onAudioRouteLost")
}
```

4. No `OnDestroy`, junto da remoção do observador existente:

```swift
if let observador = self.observadorDeRota {
  NotificationCenter.default.removeObserver(observador)
  self.observadorDeRota = nil
}
```

Em `modules/duotone-remote-commands/index.ts`, usando o `native` já existente:

```ts
export function addAudioRouteLostListener(onLost: () => void): () => void {
  if (!native) return () => {};
  const subscription = native.addListener('onAudioRouteLost', onLost);
  return () => subscription.remove();
}
```

Em `PlayerRoot.tsx`, importar esse export do mesmo módulo dos outros comandos. Depois da declaração `tocavaAntesDaInterrupcao`:

```ts
useEffect(() => addAudioRouteLostListener(() => {
  tocavaAntesDaInterrupcao.current = false;
  usePlayer.getState().pausePlayback();
}), []);
```

Isto fecha especificamente a pausa por remoção de saída e cancela a retoma pendente desse caso. Não resolve, por si, pausa manual/troca de faixa durante uma chamada, resets do media server ou transferência de foco no Windows. Para estes, o plano pede um identificador de intenção atualizado em play/pause/seek/next/close/handoff e um evento nativo distinto de confirmação de estado. Testar o fluxo inteiro antes de afirmar a correção em hardware.

Regenerar o projeto nativo e compilar após alterações dos módulos; uma atualização só de JS não acrescenta eventos a um IPA antigo. Manter a degradação no-op para builds sem o módulo e informar sobre a capacidade real nas definições.
