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
precision highp float;

varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uEspetro;
// [0] = levelAvg 0..255, desvios globais R/G/B em pixeis CSS
// [1] = passo aleatorio a 15 Hz, lado CSS, envelope da batida, energia aguda
uniform vec4 uQuadro[2];
// 0 = glitch original; 1 = ondas radiais.
uniform float uIntensidade;
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

// Cada caixa e um putImageData: se o pixel esta no retangulo de destino,
// devolve a coordenada equivalente no retangulo de origem. Percorrer de tras
// para a frente reproduz tambem caixas posteriores que copiam caixas antigas.
vec2 origemDasCaixas(vec2 px, float levelAvg, float passo, float lado) {
  float base = max(levelAvg / 110.0, 0.0001);
  float boxCount = min(8.0, ceil(pow(base, base)));

  for (int rev = 0; rev < 8; rev++) {
    float i = 7.0 - float(rev);
    float s = passo * 19.31 + i * 47.17;
    float sorte = hash11(s + 0.7);
    float existe = step(i + 0.5, boxCount) * step(220.0, sorte * 100.0 + levelAvg);

    vec2 tamanho = vec2(20.0 + 60.0 * hash11(s + 1.9),
                        20.0 + 60.0 * hash11(s + 3.1));
    vec2 origem = vec2(hash11(s + 5.3), hash11(s + 7.7)) * (vec2(lado) - tamanho);
    vec2 destino = origem + vec2(-30.0 + 60.0 * hash11(s + 11.1),
                                  -30.0 + 60.0 * hash11(s + 13.7));
    vec2 dentro = step(destino, px) * step(px, destino + tamanho);
    float usa = existe * dentro.x * dentro.y;
    px = mix(px, origem + px - destino, usa);
  }
  return px;
}

float canal(vec2 px, float offsetLinha, float offsetGlobal, float levelAvg,
            float passo, float lado, int componente) {
  px.x -= offsetLinha;
  px = origemDasCaixas(px, levelAvg, passo, lado);
  px.x -= offsetGlobal;
  vec2 uv = vec2(px.x / lado, 1.0 - px.y / lado);
  vec2 tuv = uv * uEscala + uDeslocamento;
  vec4 amostra = texture2D(uTex, tuv);
  if (componente == 0) return amostra.r;
  if (componente == 1) return amostra.g;
  return amostra.b;
}

void main() {
  float levelBase = clamp(uQuadro[0].x, 0.0, 255.0);
  float batida = clamp(uQuadro[1].z, 0.0, 1.0);
  // Os agudos nao abrem uma animacao propria: so ganham expressao dentro da
  // janela temporal da batida grave. Assim variam o desenho sem criar tremor.
  float agudos = clamp(uQuadro[1].w, 0.0, 1.0) * batida;
  // O teto evita que um master muito alto mande os canais dezenas de pixeis
  // para fora da capa. O ataque continua forte: a 205, o Pen da ~24 px de
  // deslocamento global, quatro caixas e linhas em cerca de 1/3 das tentativas.
  float levelAvg = min(225.0, (levelBase + batida * 185.0) * uIntensidade);

  // Nivel zero e uma via deliberadamente curta: nenhum hash, deslocamento ou
  // arredondamento pode alterar sequer um pixel da capa limpa.
  if (levelBase <= 0.0 && batida <= 0.0) {
    gl_FragColor = texture2D(uTex, vUv * uEscala + uDeslocamento);
    return;
  }


  vec3 globalPx = uQuadro[0].yzw;
  float passo = uQuadro[1].x;
  float lado = uQuadro[1].y;
  // Um pulso de escala muito curto da peso fisico ao ataque. Como usa o mesmo
  // envelope do bombo, desaparece por completo entre batidas e nao acrescenta
  // o tremor continuo que se quer eliminar.
  vec2 uvPulso = (vUv - 0.5) * (1.0 - min(0.028, 0.018 * batida * uIntensidade)) + 0.5;
  vec2 px = vec2(uvPulso.x, 1.0 - uvPulso.y) * lado;

  // Uma linha de 1 px em cada par, apenas nos 80% centrais. O texel vem da
  // frequencia dessa altura, tal como fbc_array[y] no Pen — nao de ruido.
  float linhaPar = 1.0 - step(1.0, mod(floor(px.y), 2.0));
  float centro = step(lado * 0.1, px.x) * step(px.x, lado * 0.9);
  float linhaId = floor(px.y * 0.5);
  float sorteLinha = hash21(vec2(linhaId, passo + 31.0));
  float ativaLinha = linhaPar * centro
    * step(300.0, sorteLinha * 150.0 + levelAvg + agudos * 45.0);
  float banda = texture2D(uEspetro, vec2(1.0 - vUv.y, 0.5)).r * 255.0;
  float shift = floor(banda / 20.0 + 0.5) * ativaLinha
    * (1.0 + 0.75 * batida + 1.25 * agudos);

  // drawRGBGlitch escreve cada canal em destino=origem+offset. Para obter a
  // cor de um pixel de destino, amostra-se por isso em destino-offset.
  vec3 cor = vec3(
    canal(px, -shift, globalPx.r, levelAvg, passo, lado, 0),
    canal(px,  shift, globalPx.g, levelAvg, passo, lado, 1),
    canal(px, shift * 2.0, globalPx.b, levelAvg, passo, lado, 2)
  );
  gl_FragColor = vec4(cor, 1.0);
}
`;

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
 * Deteta margens que ja fazem parte da thumbnail (letterbox/pillarbox).
 *
 * O `cover` normal resolve uma imagem 16:9, mas nao resolve um quadrado que o
 * YouTube tenha colocado DENTRO de um thumbnail 4:3/16:9 com barras pretas ou
 * cinzentas. Amostramos a capa uma vez a baixa resolucao, procuramos pares de
 * faixas quase uniformes nas extremidades e devolvemos um recorte quadrado da
 * zona util. Em caso de duvida ou CORS, fica o cover centrado habitual.
 */
export function detetarRecorte(imagem: TexImageSource, largura: number, altura: number): Recorte {
  const ladoBase = Math.min(largura, altura);
  const base: Recorte = {
    x: (largura - ladoBase) / 2,
    y: (altura - ladoBase) / 2,
    lado: ladoBase,
  };

  try {
    const maximo = 112;
    const escala = Math.min(1, maximo / Math.max(largura, altura));
    const w = Math.max(8, Math.round(largura * escala));
    const h = Math.max(8, Math.round(altura * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return base;
    ctx.drawImage(imagem as any, 0, 0, w, h);
    const dados = ctx.getImageData(0, 0, w, h).data;

    const lado = Math.min(w, h);
    const x0 = Math.floor((w - lado) / 2);
    const y0 = Math.floor((h - lado) / 2);
    const limite = Math.max(2, Math.floor(lado * 0.24));

    const detalheLinha = (horizontal: boolean, fixa: number) => {
      let soma = 0;
      let n = 0;
      for (let i = 1; i < lado; i++) {
        const ax = horizontal ? x0 + i - 1 : fixa;
        const ay = horizontal ? fixa : y0 + i - 1;
        const bx = horizontal ? x0 + i : fixa;
        const by = horizontal ? fixa : y0 + i;
        const a = (ay * w + ax) * 4;
        const b = (by * w + bx) * 4;
        soma += Math.abs(dados[a] - dados[b])
          + Math.abs(dados[a + 1] - dados[b + 1])
          + Math.abs(dados[a + 2] - dados[b + 2]);
        n += 3;
      }
      return soma / Math.max(1, n);
    };

    const linhas = new Float32Array(lado);
    const colunas = new Float32Array(lado);
    for (let i = 0; i < lado; i++) {
      linhas[i] = detalheLinha(true, y0 + i);
      colunas[i] = detalheLinha(false, x0 + i);
    }

    // Tres linhas detalhadas seguidas evitam confundir um risco isolado na
    // barra (ou o proprio glitch gravado na thumbnail) com o inicio da capa.
    const margem = (valores: Float32Array, inverter: boolean) => {
      // O limiar e relativo a propria margem. Capas muito escuras como esta
      // podem ter detalhe medio < 2 mesmo ja dentro da imagem; o antigo valor
      // fixo 7 nunca encontrava a transicao do lado inferior/direito.
      let detalheMargem = 0;
      const amostrasMargem = Math.min(6, lado);
      for (let i = 0; i < amostrasMargem; i++) {
        detalheMargem += valores[inverter ? lado - 1 - i : i];
      }
      detalheMargem /= amostrasMargem;
      const limiarDetalhe = Math.max(0.9, detalheMargem * 1.65);
      for (let i = 1; i < limite - 2; i++) {
        const a = inverter ? lado - 1 - i : i;
        const b = inverter ? a - 1 : a + 1;
        const c = inverter ? a - 2 : a + 2;
        if (valores[a] > limiarDetalhe && valores[b] > limiarDetalhe && valores[c] > limiarDetalhe) return i;
      }
      return 0;
    };

    let topo = margem(linhas, false);
    let fundo = margem(linhas, true);
    let esquerda = margem(colunas, false);
    let direita = margem(colunas, true);

    // Margens embutidas surgem aos pares. Esta regra impede que um ceu liso
    // apenas no topo de uma fotografia seja interpretado como letterbox.
    const minimoMargem = Math.max(2, Math.floor(lado * 0.025));
    if (topo < minimoMargem || fundo < minimoMargem) topo = fundo = 0;
    if (esquerda < minimoMargem || direita < minimoMargem) esquerda = direita = 0;
    if (!topo && !esquerda) return base;

    const utilX = x0 + esquerda;
    const utilY = y0 + topo;
    const utilW = lado - esquerda - direita;
    const utilH = lado - topo - fundo;
    const utilLado = Math.max(1, Math.min(utilW, utilH));
    const recorteX = utilX + (utilW - utilLado) / 2;
    const recorteY = utilY + (utilH - utilLado) / 2;
    return {
      x: recorteX / escala,
      y: recorteY / escala,
      lado: utilLado / escala,
    };
  } catch {
    return base;
  }
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
        const recorte = detetarRecorte(imagem, larg, alt);
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
      // Teto de 2x: acima disso sao pixeis que ninguem distingue a custo real.
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
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
