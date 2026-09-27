/**
 * Lê um bocado HTTP até ao fim, observando os bytes que chegam. O ficheiro
 * continua a ser publicado inteiro: isto não entrega áudio parcial ao motor.
 * Sem dependências nativas, para testar as corridas e o relógio à parte.
 */
type Leitor = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
};
type Resposta = {
  body?: { getReader(): Leitor } | null;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export const PRAZO_SEM_BYTES_MS = 10_000;
export const CORPO_SEM_PROGRESSO = 'Download sem progresso no corpo';

export type OpcoesDoCorpo = {
  /** Comunica o estado inicial e as mudanças de atividade; devolve a limpeza. */
  observarAtividade?: (avisar: (ativa: boolean) => void) => () => void;
};

export async function lerCorpoDoAudio(
  resposta: Resposta,
  tamanho: number,
  pedido: AbortController,
  opcoes: OpcoesDoCorpo = {},
): Promise<Uint8Array> {
  // Compatibilidade com um fetch sem reader: mantém o prazo total que já
  // envolve o pedido. Não se inventa progresso a partir de arrayBuffer().
  if (!resposta.body?.getReader) return new Uint8Array(await resposta.arrayBuffer());
  if (pedido.signal.aborted) throw new Error('Leitura do audio cancelada');

  const leitor = resposta.body.getReader();
  let relogio: ReturnType<typeof setTimeout> | undefined;
  let deixarDeOuvir: (() => void) | undefined;
  let ativa = true, completo = false;
  let rejeitar!: (erro: Error) => void;
  const interrupcao = new Promise<never>((_, rejeita) => { rejeitar = rejeita; });
  const aoAbortar = () => rejeitar(new Error('Leitura do audio cancelada'));
  const rearmar = () => {
    clearTimeout(relogio);
    // Em segundo plano, não observar bytes em JS não prova que a rede parou.
    // Ao voltar, dá-se uma janela completa para entregar os eventos pendentes.
    if (ativa) relogio = setTimeout(() => {
      rejeitar(new Error(CORPO_SEM_PROGRESSO));
      pedido.abort();
    }, PRAZO_SEM_BYTES_MS);
  };
  pedido.signal.addEventListener('abort', aoAbortar);
  try {
    // Um buffer por pedido Range (até 1 MB no downloader), sem acumular uma
    // lista de fragmentos que duplicasse a memória ao juntar o resultado.
    const bytes = new Uint8Array(tamanho);
    let recebidos = 0;
    rearmar();
    deixarDeOuvir = opcoes.observarAtividade?.((valor) => { ativa = valor; rearmar(); });
    for (;;) {
      // A corrida termina mesmo se read() ignorar o cancelamento nativo.
      const parte = await Promise.race([leitor.read(), interrupcao]);
      if (pedido.signal.aborted) throw new Error('Leitura do audio cancelada');
      if (parte.done) break;
      if (!parte.value?.byteLength) continue; // vazio não é progresso
      if (recebidos + parte.value.byteLength > tamanho) throw new Error('Corpo do audio excede o Range pedido');
      bytes.set(parte.value, recebidos);
      recebidos += parte.value.byteLength;
      rearmar();
    }
    if (recebidos !== tamanho) throw new Error(`Chunk incompleto (${recebidos}/${tamanho} bytes)`);
    completo = true;
    return bytes;
  } finally {
    clearTimeout(relogio);
    deixarDeOuvir?.();
    pedido.signal.removeEventListener('abort', aoAbortar);
    if (!completo) {
      pedido.abort();
      // Nem cancel() pode prender a vaga. Uma rejeição tardia é consumida.
      try { void leitor.cancel().catch(() => {}); } catch { /* reader já fechado */ }
    }
    try { leitor.releaseLock(); } catch { /* leitura nativa ainda a terminar */ }
  }
}
