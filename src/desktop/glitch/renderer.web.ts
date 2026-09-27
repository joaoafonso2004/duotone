/**
 * Glitch equalizer — o DESENHO. A capa a desfazer-se ao ritmo: separacao dos
 * canais RGB, blocos deslocados e linhas alimentadas pelo espectro.
 *
 * A referencia visual e um pen do Joshua van Boxtel (codepen poWQNaJ), mas o
 * codigo dele NAO podia entrar aqui: faz `getImageData`/`putImageData` da tela
 * inteira a cada fotograma — uma leitura da GPU para a CPU que trava o
 * pipeline — e o `createGlitchLine` repete essa leitura num ciclo por METADE
 * das linhas da tela. Por isso e que o proprio autor so desenha a cada quarto
 * fotograma (`count > 3`): e uma solucao de recurso para ~15 fps. Numa demo de
 * 400 px passa; num Now Playing aberto durante horas, nao.
 *
 * Aqui e um fragment shader, que e onde este efeito pertence: separar canais,
 * deslocar blocos e cortar linhas sao, por definicao, "para cada pixel, decide
 * de onde ir buscar a cor".
 *
 * ORCAMENTO POR FOTOGRAMA: zero alocacoes, zero `getImageData`, um
 * `texSubImage2D` de 256 bytes, uma escrita de uniforms e um `drawArrays`. A
 * capa entra como textura UMA VEZ POR FAIXA. Se algum fotograma passar de 16
 * ms, e bug, nao e afinacao.
 */

import { VERTEX, FRAGMENT } from '../../lib/glitchShaders';

export type GlitchRenderer = {
  /** A capa. Uma vez por faixa — nunca por fotograma. */
  definirTextura(imagem: TexImageSource): void;
  temTextura(): boolean;
  /** Tamanho em pixeis CSS; o renderer trata do devicePixelRatio. */
  redimensionar(lado: number): void;
  desenhar(nivel: number, batida: number, agudos: number, tempoSegundos: number, espetro: Uint8Array): void;
  destruir(): void;
};

export type Recorte = { x: number; y: number; lado: number };

/**
 * O quadrado da capa dentro da miniatura, pela GEOMETRIA: uma conta com a
 * largura e a altura, e mais nada.
 *
 * Era uma deteção por píxeis (procurava faixas quase uniformes nas bordas) e
 * falhava nas capas escuras: o fundo preto da própria capa lia-se como barra e
 * a capa aparecia ampliada, cortada nas bordas (João, 27/9, a do "NEED" do
 * Playboi Carti). A conta é a das listas (`molduraSemBarras`, em
 * `lib/modoLimpo.ts`):
 *
 * - **4:3** (`hqdefault`, `sddefault`, `default`): o vídeo 16:9 vem com barras
 *   em cima e em baixo; a capa é o quadrado do meio da faixa 16:9.
 * - **O resto** (a `maxresdefault` 16:9, as capas quadradas do catálogo): o
 *   quadrado do meio.
 *
 * Não lê a imagem: sem canvas e sem `getImageData` por capa.
 */
export function recorteDaCapa(largura: number, altura: number): Recorte {
  if (!(largura > 0) || !(altura > 0)) return { x: 0, y: 0, lado: Math.max(1, Math.min(largura, altura)) };
  if (Math.abs(largura / altura - 4 / 3) < 0.02) {
    const faixa = (largura * 9) / 16;
    return { x: (largura - faixa) / 2, y: (altura - faixa) / 2, lado: faixa };
  }
  const lado = Math.min(largura, altura);
  return { x: (largura - lado) / 2, y: (altura - lado) / 2, lado };
}

function compilar(gl: WebGLRenderingContext, tipo: number, fonte: string): WebGLShader | null {
  const s = gl.createShader(tipo);
  if (!s) return null;
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('[glitch] shader nao compilou:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * Devolve `null` se o WebGL nao estiver disponivel ou o programa nao ligar —
 * quem chama cai para a capa normal, sem canvas. Um efeito decorativo nunca
 * pode ser a razao de nao se ver a capa.
 *
 * `preservarBuffer` e para o modo estatico: sem ele o browser deita fora o
 * buffer depois de compor, e um unico `desenhar()` acabava por dar canvas
 * preto. No modo reativo fica desligado — ha um desenho novo a cada fotograma
 * e a copia extra nao serve para nada.
 */
export function criarRenderer(
  canvas: HTMLCanvasElement,
  opcoes: { preservarBuffer?: boolean; aoPerderContexto?: () => void; intensidade?: 'subtle' | 'normal' | 'strong' } = {},
): GlitchRenderer | null {
  const { preservarBuffer = false, aoPerderContexto, intensidade = 'normal' } = opcoes;
  const atributos: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: preservarBuffer,
  };
  const gl = (canvas.getContext('webgl', atributos)
    || canvas.getContext('experimental-webgl', atributos)) as WebGLRenderingContext | null;
  if (!gl) return null;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[glitch] programa nao ligou:', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // Dois triangulos a cobrir o clip space. Enviados uma vez.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTex = gl.getUniformLocation(prog, 'uTex');
  const uEspetro = gl.getUniformLocation(prog, 'uEspetro');
  const uQuadro = gl.getUniformLocation(prog, 'uQuadro[0]');
  const uEscala = gl.getUniformLocation(prog, 'uEscala');
  const uDeslocamento = gl.getUniformLocation(prog, 'uDeslocamento');
  const uIntensidade = gl.getUniformLocation(prog, 'uIntensidade');
  gl.uniform2f(uEscala, 1, 1);
  gl.uniform2f(uDeslocamento, 0, 0);
  gl.uniform1f(uIntensidade, intensidade === 'subtle' ? 0.62 : intensidade === 'strong' ? 1.34 : 1);

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // CLAMP_TO_EDGE e obrigatorio: as capas nao sao potencia de dois, e e
  // tambem o que faz os blocos deslocados esborratarem a margem em vez de
  // darem a volta — que e o aspeto certo.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.uniform1i(uTex, 0);

  // Textura do analyser. O armazenamento nasce uma vez; cada fotograma so
  // substitui os mesmos 256 bytes, sem recriar textura nem array.
  const texEspetro = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texEspetro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
  gl.uniform1i(uEspetro, 1);

  const quadro = new Float32Array(8);
  let passoAnterior = -1;
  let batidaAnterior = 0;

  let temTex = false;
  let morto = false;
  let lado = 0;
  let tamanhoCss = 0;

  const perdeu = (e: Event) => {
    e.preventDefault();
    morto = true;
    aoPerderContexto?.();
  };
  canvas.addEventListener('webglcontextlost', perdeu);

  return {
    definirTextura(imagem) {
      if (morto) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem as any);
        const larg = (imagem as any).naturalWidth || (imagem as any).width || 1;
        const alt = (imagem as any).naturalHeight || (imagem as any).height || 1;
        const recorte = recorteDaCapa(larg, alt);
        const escalaX = recorte.lado / larg;
        const escalaY = recorte.lado / alt;
        gl.uniform2f(uEscala, escalaX, escalaY);
        // A imagem e carregada com FLIP_Y; converter o Y medido a partir do
        // topo para a origem inferior usada pelas coordenadas da textura.
        gl.uniform2f(
          uDeslocamento,
          recorte.x / larg,
          1 - (recorte.y + recorte.lado) / alt,
        );
        temTex = true;
        // O caminho por fotograma deixa sempre a unidade do espectro ativa.
        gl.activeTexture(gl.TEXTURE1);
      } catch (e) {
        // Imagem contaminada (sem CORS) — nao ha textura possivel.
        console.warn('[glitch] textura recusada:', e);
        temTex = false;
      }
    },
    temTextura: () => temTex,
    redimensionar(ladoCss) {
      // 1,5x mantém a capa nítida e corta quase pela metade os píxeis que a
      // GPU processava a 2x (630² em vez de 840² numa capa de 420 px).
      const dpr = Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      const px = Math.max(1, Math.round(ladoCss * dpr));
      tamanhoCss = ladoCss;
      if (px === lado) return;
      lado = px;
      // Guardar a unidade em que a referencia define caixas e desvios. O
      // buffer pode estar a 2x por causa do DPR, mas um bloco de 20 px deve
      // continuar a medir 20 pixeis visuais.
      canvas.width = px;
      canvas.height = px;
      if (!morto) gl.viewport(0, 0, px, px);
    },
    desenhar(nivel, batida, agudos, tempoSegundos, espetro) {
      if (morto || !temTex) return;
      const levelBase = Math.max(0, Math.min(255, nivel * 255));
      const ataque = Math.max(0, Math.min(1, batida));
      const multiplicador = intensidade === 'subtle' ? 0.62 : intensidade === 'strong' ? 1.34 : 1;
      const levelAvg = Math.min(225, (levelBase + ataque * 185) * multiplicador);
      const passo = Math.floor(tempoSegundos * 15);
      // O RGB mantem os seus fotogramas a 15 Hz, mas o INICIO de uma batida
      // pode furar essa grelha uma vez. Assim o ataque nao ganha ate 66 ms de
      // atraso visual so por ter caido entre dois passos aleatorios.
      const ataqueNovo = ataque > 0.55 && ataque > batidaAnterior + 0.08;
      if (passo !== passoAnterior || ataqueNovo) {
        passoAnterior = passo;
        if (levelAvg <= 0) {
          quadro[1] = quadro[2] = quadro[3] = 0;
        } else {
          const base = levelAvg / 70;
          const glitchCount = Math.ceil(base ** base);
          quadro[1] = Math.round((Math.random() * 2 - 1) * glitchCount);
          quadro[2] = Math.round((Math.random() * 2 - 1) * glitchCount);
          quadro[3] = Math.round((Math.random() * 2 - 1) * glitchCount);
        }
      }
      batidaAnterior = ataque;
      quadro[0] = levelBase;
      quadro[4] = passo;
      quadro[5] = tamanhoCss;
      quadro[6] = ataque;
      quadro[7] = Math.max(0, Math.min(1, agudos));
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, espetro);
      gl.uniform4fv(uQuadro, quadro);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destruir() {
      canvas.removeEventListener('webglcontextlost', perdeu);
      morto = true;
      try {
        gl.deleteTexture(tex);
        gl.deleteTexture(texEspetro);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {}
    },
  };
}
