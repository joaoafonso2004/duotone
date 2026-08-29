/**
 * Glitch equalizer — o DESENHO. A capa a desfazer-se ao ritmo: separacao dos
 * canais RGB, blocos deslocados, linhas de varrimento.
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
 * ORCAMENTO POR FOTOGRAMA: zero alocacoes, zero `getImageData`, uma escrita de
 * uniform e um `drawArrays`. A capa entra como textura UMA VEZ POR FAIXA. Se
 * algum fotograma passar de 16 ms, e bug, nao e afinacao.
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Tudo escala com `uNivel`. Com nivel 0 o resultado tem de ser a capa LIMPA,
 * pixel por pixel — e o que sustenta o modo "estatico" partilhar este mesmo
 * caminho em vez de ter um segundo.
 */
const FRAGMENT = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uTex;
uniform float uNivel;
uniform float uTempo;
// Recorte "cover": a capa nem sempre e quadrada (as miniaturas do YouTube sao
// 16:9) e a moldura e. Sem isto a imagem saia esticada — a Image do RN que
// isto substitui recortava-a.
uniform vec2 uEscala;
uniform vec2 uDeslocamento;

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float n = clamp(uNivel, 0.0, 1.0);
  vec2 uv = vUv;

  // O glitch tem "fotogramas" proprios, a 15 por segundo. A 60 Hz o efeito
  // le-se como ruido de video; a 15 le-se como avaria, que e o que se quer.
  float passo = floor(uTempo * 15.0);

  // --- blocos deslocados ---------------------------------------------------
  // Quantizar o v em faixas, gerar um hash por (faixa, passo) e deslocar em u
  // as que passarem o limiar. O limiar desce com o nivel: mais batida, mais
  // faixas partidas.
  float faixa = floor(uv.y * 24.0);
  float sorte = hash21(vec2(faixa, passo));
  float ativa = step(1.0 - 0.6 * n, sorte);
  uv.x += ativa * (hash21(vec2(faixa * 1.7 + 3.1, passo)) - 0.5) * 0.30 * n;

  // --- rasgo horizontal ----------------------------------------------------
  // Uma banda unica a atravessar a capa. E o que da a leitura de "salto de
  // fita" em vez de chuvisco uniforme.
  float bandaY = hash11(passo * 1.37);
  float banda = smoothstep(0.001 + 0.07 * n, 0.0, abs(uv.y - bandaY));
  uv.x += banda * (hash11(passo + 7.0) - 0.5) * 0.20 * n;

  // --- separacao RGB -------------------------------------------------------
  // Tres amostragens em u desviado, uma por canal. Cresce ao quadrado para
  // ser invisivel em musica calma e obvia no refrao.
  float sep = 0.010 * n + 0.045 * n * n;
  vec2 tuv = uv * uEscala + uDeslocamento;
  vec2 dsep = vec2(sep * uEscala.x, 0.0);
  vec3 cor = vec3(
    texture2D(uTex, tuv + dsep).r,
    texture2D(uTex, tuv).g,
    texture2D(uTex, tuv - dsep).b
  );

  // --- linhas de varrimento ------------------------------------------------
  // No v ORIGINAL, nao no deslocado: as linhas sao do ecra, nao da imagem.
  cor *= 1.0 - 0.12 * n * (0.5 + 0.5 * sin(vUv.y * 600.0));

  // O rasgo acende, como um cabecote a saturar.
  cor += 0.10 * n * banda;

  gl_FragColor = vec4(cor, 1.0);
}
`;

export type GlitchRenderer = {
  /** A capa. Uma vez por faixa — nunca por fotograma. */
  definirTextura(imagem: TexImageSource): void;
  temTextura(): boolean;
  /** Tamanho em pixeis CSS; o renderer trata do devicePixelRatio. */
  redimensionar(lado: number): void;
  desenhar(nivel: number, tempoSegundos: number): void;
  destruir(): void;
};

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
  opcoes: { preservarBuffer?: boolean; aoPerderContexto?: () => void } = {},
): GlitchRenderer | null {
  const { preservarBuffer = false, aoPerderContexto } = opcoes;
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

  const uNivel = gl.getUniformLocation(prog, 'uNivel');
  const uTempo = gl.getUniformLocation(prog, 'uTempo');
  const uTex = gl.getUniformLocation(prog, 'uTex');
  const uEscala = gl.getUniformLocation(prog, 'uEscala');
  const uDeslocamento = gl.getUniformLocation(prog, 'uDeslocamento');
  gl.uniform2f(uEscala, 1, 1);
  gl.uniform2f(uDeslocamento, 0, 0);

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

  let temTex = false;
  let morto = false;
  let lado = 0;

  const perdeu = (e: Event) => {
    e.preventDefault();
    morto = true;
    aoPerderContexto?.();
  };
  canvas.addEventListener('webglcontextlost', perdeu);

  return {
    definirTextura(imagem) {
      if (morto) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem as any);
        const larg = (imagem as any).naturalWidth || (imagem as any).width || 1;
        const alt = (imagem as any).naturalHeight || (imagem as any).height || 1;
        // Recorte centrado, como um `object-fit: cover` numa moldura quadrada.
        if (larg >= alt) {
          const f = alt / larg;
          gl.uniform2f(uEscala, f, 1);
          gl.uniform2f(uDeslocamento, (1 - f) / 2, 0);
        } else {
          const f = larg / alt;
          gl.uniform2f(uEscala, 1, f);
          gl.uniform2f(uDeslocamento, 0, (1 - f) / 2);
        }
        temTex = true;
      } catch (e) {
        // Imagem contaminada (sem CORS) — nao ha textura possivel.
        console.warn('[glitch] textura recusada:', e);
        temTex = false;
      }
    },
    temTextura: () => temTex,
    redimensionar(ladoCss) {
      // Teto de 2x: acima disso sao pixeis que ninguem distingue a custo real.
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      const px = Math.max(1, Math.round(ladoCss * dpr));
      if (px === lado) return;
      lado = px;
      canvas.width = px;
      canvas.height = px;
      if (!morto) gl.viewport(0, 0, px, px);
    },
    desenhar(nivel, tempoSegundos) {
      if (morto || !temTex) return;
      gl.uniform1f(uNivel, nivel);
      gl.uniform1f(uTempo, tempoSegundos);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destruir() {
      canvas.removeEventListener('webglcontextlost', perdeu);
      morto = true;
      try {
        gl.deleteTexture(tex);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {}
    },
  };
}
