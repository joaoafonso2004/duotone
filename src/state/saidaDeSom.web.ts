import type { SaidaDeSom } from '../lib/autoeq';

/**
 * Por onde sai o som no PC, para o Recommended do equalizador (25/10).
 *
 * A música toca na saída predefinida do Windows, e o Chromium dá-a como a
 * saída de áudio com o id `default` ("Default - Headphones (WH-1000XM5)"). O
 * nome só vem com a permissão de áudio, que o Electron já dá à app (a captura
 * do glitch). Sem nome, a saída fica por saber e o Recommended pede o modelo.
 *
 * O `devicechange` chega quando se liga ou desliga um aparelho, ou se muda a
 * predefinida: sem polling nenhum.
 */
export function ouvirSaidaDeSom(aoMudar: (saida: SaidaDeSom | null) => void): () => void {
  const dispositivos = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!dispositivos?.enumerateDevices) {
    aoMudar(null);
    return () => {};
  }
  let vivo = true;
  const ler = async () => {
    try {
      const saidas = (await dispositivos.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
      const atual = saidas.find((d) => d.deviceId === 'default') ?? saidas[0];
      if (vivo) aoMudar({ tipo: 'windows', nome: atual?.label ?? '' });
    } catch {
      if (vivo) aoMudar({ tipo: 'windows', nome: '' });
    }
  };
  void ler();
  dispositivos.addEventListener?.('devicechange', ler);
  return () => {
    vivo = false;
    dispositivos.removeEventListener?.('devicechange', ler);
  };
}
