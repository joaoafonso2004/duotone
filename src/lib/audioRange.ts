/**
 * Valida a resposta de um pedido Range antes de os bytes entrarem no ficheiro.
 *
 * O bug que isto fecha: o downloader pedia `bytes=4-7` e aceitava uma resposta
 * `Content-Range: bytes 0-3/8`. Como o TAMANHO batia certo (4 bytes), a
 * verificação `part.length !== expected` a seguir não apanhava nada — os bytes
 * errados iam parar ao offset errado e o ficheiro ficava corrompido em
 * silêncio, sem erro nenhum.
 *
 * Deliberadamente NÃO exigimos `Content-Range` quando ele não vem: há CDNs que
 * respondem 206 sem o cabeçalho, e hoje esses downloads funcionam. Rejeitá-los
 * seria trocar uma corrupção rara por uma regressão garantida. Quando o
 * cabeçalho vem, tem de bater certo ao byte.
 */
export function validarRespostaParcial(
  response: { status: number; headers: { get(name: string): string | null } },
  start: number,
  end: number,
  total: number,
): void {
  if (
    ![start, end, total].every(Number.isSafeInteger) ||
    start < 0 ||
    end < start ||
    end >= total
  ) {
    throw new Error('Intervalo de áudio inválido');
  }

  const esperado = end - start + 1;

  // Content-Length, quando existe, tem de ser exatamente o pedido. Antes só se
  // rejeitava um valor MAIOR; um corpo mais curto passava e só rebentava
  // depois, com uma mensagem que não dizia de onde vinha.
  const declarado = response.headers.get('content-length');
  if (declarado !== null && (!/^\d+$/.test(declarado) || Number(declarado) !== esperado)) {
    throw new Error('Comprimento HTTP inconsistente');
  }

  // 200 só é aceitável quando o pedido cobre o ficheiro inteiro: o servidor
  // ignorou o Range e mandou tudo, e tudo é o que queríamos.
  if (response.status === 200) {
    if (start === 0 && esperado === total) return;
    throw new Error('Resposta 200 a um pedido parcial');
  }

  if (response.status !== 206) {
    throw new Error(`Estado HTTP inesperado (${response.status})`);
  }

  const bruto = response.headers.get('content-range');
  if (bruto === null) return; // ver comentário no topo

  const partes = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(bruto);
  if (
    !partes ||
    Number(partes[1]) !== start ||
    Number(partes[2]) !== end ||
    Number(partes[3]) !== total
  ) {
    throw new Error('Content-Range não corresponde ao pedido');
  }
}
