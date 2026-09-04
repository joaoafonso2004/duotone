import type { RGB } from './corDaCapa';

/**
 * Ler a cor de uma capa no PC.
 *
 * Aqui há `canvas`, por isso não é preciso o desvio do blurhash: desenha-se a
 * capa reduzida a 4x4 e lêem-se as dezasseis células directamente. O
 * resultado tem a mesma forma que o do telemóvel, e daí para a frente o
 * caminho é o mesmo -- é isso que impede as duas plataformas de divergirem
 * numa cor.
 *
 * O `crossOrigin` não é enfeite: sem ele a tela fica marcada e o `getImageData`
 * lança em vez de devolver. O `i.ytimg.com` responde com `Allow-Origin: *`, e
 * o Storage do Supabase também, por isso as duas fontes de capa que a app tem
 * passam.
 *
 * Nunca lança, pela mesma razão do lado nativo.
 */
export function lerCelulasDaCapa(uri: string | null | undefined): Promise<RGB[] | null> {
  if (!uri || typeof document === 'undefined') return Promise.resolve(null);

  return new Promise((resolver) => {
    const imagem = new window.Image();
    imagem.crossOrigin = 'anonymous';

    // Uma capa que nunca responde não pode deixar a promessa pendurada para
    // sempre: quem espera por ela é o tema, e o tema tem de assentar.
    const desistir = setTimeout(() => resolver(null), 5000);
    const terminar = (valor: RGB[] | null) => {
      clearTimeout(desistir);
      resolver(valor);
    };

    imagem.onerror = () => terminar(null);
    imagem.onload = () => {
      try {
        const tela = document.createElement('canvas');
        tela.width = 4;
        tela.height = 4;
        const ctx = tela.getContext('2d', { willReadFrequently: true });
        if (!ctx) return terminar(null);
        ctx.drawImage(imagem, 0, 0, 4, 4);
        const dados = ctx.getImageData(0, 0, 4, 4).data;

        const celulas: RGB[] = [];
        for (let i = 0; i < dados.length; i += 4) {
          // Um pixel transparente não tem cor: a capa é opaca, e o que vier
          // translúcido são as margens de um PNG, que não contam.
          if (dados[i + 3]! < 200) continue;
          celulas.push({ r: dados[i]!, g: dados[i + 1]!, b: dados[i + 2]! });
        }
        terminar(celulas.length ? celulas : null);
      } catch {
        // Tela marcada por uma origem sem CORS: sem cor, e sem estragar nada.
        terminar(null);
      }
    };

    imagem.src = uri;
  });
}
