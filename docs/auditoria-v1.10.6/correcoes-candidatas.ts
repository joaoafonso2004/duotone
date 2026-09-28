// Candidatos isolados para revisão. NÃO estão ligados à aplicação.
// As instruções de integração e os limites estão em RELATORIO.md.

/** Validar antes de o fixer escrever qualquer byte. Limita estrutura e recursão. */
export function validarEstruturaMp4(buffer: Uint8Array): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let boxes = 0;
  const walk = (start: number, end: number, depth: number): void => {
    if (depth > 32) throw new Error('MP4: nesting excessivo');
    let offset = start;
    while (offset < end) {
      if (++boxes > 50_000 || end - offset < 8) throw new Error('MP4: estrutura inválida');
      let size = view.getUint32(offset, false);
      let header = 8;
      if (size === 1) {
        if (end - offset < 16) throw new Error('MP4: largesize truncado');
        // O downloader tem teto de 256 MiB. Um box >4 GiB nunca cabe nele.
        if (view.getUint32(offset + 8, false) !== 0) throw new Error('MP4: box demasiado grande');
        size = view.getUint32(offset + 12, false);
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || size > end - offset) throw new Error('MP4: tamanho inválido');
      const type = String.fromCharCode(...buffer.subarray(offset + 4, offset + 8));
      const p = offset + header;
      const limit = offset + size;
      if (['moov', 'trak', 'mdia', 'mvex'].includes(type)) {
        walk(p, limit, depth + 1);
      } else if (['mvhd', 'tkhd', 'mdhd', 'mehd'].includes(type)) {
        if (p >= limit) throw new Error('MP4: full box truncado');
        const version = buffer[p];
        if (version !== 0 && version !== 1) throw new Error('MP4: versão não suportada');
        const required = type === 'tkhd' ? (version ? 36 : 24)
          : type === 'mehd' ? (version ? 12 : 8) : (version ? 32 : 20);
        if (limit - p < required) throw new Error(`MP4: ${type} truncado`);
      }
      offset = limit;
    }
  };
  walk(0, buffer.length, 0);
}

/** Evita juntar ranges de offsets/tamanhos diferentes e aceitar um 200 parcial. */
export function validarRespostaParcial(
  response: { status: number; headers: { get(name: string): string | null } },
  start: number,
  end: number,
  total: number,
): void {
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || end >= total) {
    throw new Error('Intervalo de áudio inválido');
  }
  const expected = end - start + 1;
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== expected)) {
    throw new Error('Comprimento HTTP inconsistente');
  }
  if (response.status === 200 && start === 0 && expected === total && Number(declared) === total) return;
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
  if (response.status !== 206 || !range || Number(range[1]) !== start || Number(range[2]) !== end || Number(range[3]) !== total) {
    throw new Error('Content-Range não corresponde ao pedido');
  }
}

export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Serializa operações por chave; um logout não ultrapassa uma migração pendente.
 * Só elimina o legado depois de gravar e confirmar leitura no cofre.
 * Falha do cofre propaga erro: nunca recua silenciosamente para texto simples.
 */
export function criarStorageMigrado(secure: AuthStorage, legacy: AuthStorage): AuthStorage {
  const pending = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const operation = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    pending.set(key, operation);
    void operation.then(() => finish(), () => finish());
    function finish() { if (pending.get(key) === operation) pending.delete(key); }
    return operation;
  }
  return {
    getItem: key => serial(key, async () => {
      const current = await secure.getItem(key);
      if (current !== null) { await legacy.removeItem(key); return current; }
      const old = await legacy.getItem(key);
      if (old === null) return null;
      await secure.setItem(key, old);
      if (await secure.getItem(key) !== old) throw new Error('Migração de sessão não confirmada');
      await legacy.removeItem(key);
      return old;
    }),
    setItem: (key, value) => serial(key, async () => {
      await secure.setItem(key, value);
      await legacy.removeItem(key);
    }),
    removeItem: key => serial(key, async () => {
      // O legado sai primeiro: se o cofre falhar, não se ressuscita o token antigo.
      await legacy.removeItem(key);
      await secure.removeItem(key);
    }),
  };
}
