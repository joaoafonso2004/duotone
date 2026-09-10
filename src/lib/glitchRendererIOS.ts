import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { VERTEX, FRAGMENT } from './glitchShaders';

/**
 * O mesmo shader do PC, alimentado pelas MESMAS contas.
 *
 * O shader é partilhado byte a byte (ver `glitchShaders.ts`), por isso tudo o
 * que pode fazer o iPhone parecer diferente do PC está aqui: são os números que
 * entram. As três fórmulas abaixo são cópias das do `renderer.web.ts` e do
 * `nivel()` do `beat.web.ts` -- se mudarem lá, têm de mudar aqui.
 */

/**
 * Os limites dos bins, pelas MESMAS frequências do `beat.web.ts`.
 *
 * A taxa de amostragem assume-se 48 kHz, que é o mesmo recurso que o PC usa
 * quando o AudioContext não a diz. A 44,1 kHz as fronteiras andam 9%, o que
 * move o fim dos graves de 260 para 239 Hz -- invisível neste efeito.
 */
const HZ_POR_BIN = 48000 / 1024;
const bin = (hz: number) => Math.round(hz / HZ_POR_BIN);
const GRAVE = [Math.max(1, bin(45)), Math.max(2, bin(260))] as const;
const AGUDO = [bin(3200), Math.min(256, bin(10000))] as const;
/** Metade do espectro, como o `binsCorpo` do PC. */
const CORPO = 128;

const media = (bins: readonly number[], de: number, ate: number) => {
  let soma = 0;
  for (let i = de; i < ate; i++) soma += bins[i];
  return soma / Math.max(1, ate - de) / 255;
};

/** O nível contínuo: grave-first, com um resto de corpo para as músicas sem
 * subgrave não matarem o efeito. Cópia do `nivel()` do `beat.web.ts`. */
function nivelDoQuadro(bins: readonly number[]): number {
  const grave = media(bins, GRAVE[0], GRAVE[1]);
  const corpo = media(bins, 0, CORPO);
  return Math.min(1, grave * 0.82 + corpo * 0.18);
}

/**
 * Os agudos NUNCA criam movimento por si -- só mudam a textura dentro da janela
 * de uma batida. Por isso são um EXCESSO sobre um piso, e não a energia em cru:
 * em cru ficavam altos de forma constante e o shader tremia sempre. RMS e não
 * média, para um transiente estreito não desaparecer entre muitos bins.
 */
function agudosDoQuadro(bins: readonly number[]): number {
  let quadrados = 0;
  for (let i = AGUDO[0]; i < AGUDO[1]; i++) quadrados += bins[i] * bins[i];
  const rms = Math.sqrt(quadrados / Math.max(1, AGUDO[1] - AGUDO[0])) / 255;
  return Math.max(0, Math.min(1, (rms - 0.045) / 0.32));
}

/** O multiplicador da preferência, igual ao do PC. */
export const MULTIPLICADOR: Record<string, number> = { subtle: 0.62, normal: 1, strong: 1.34 };

/** Mesmo shader do desktop; só o carregamento/apresentação da textura muda. */
export function criarRendererIOS(
  gl: ExpoWebGLRenderingContext,
  size: number,
  image: { localUri: string; width: number; height: number },
  intensidade = 1,
) {
  const shaders: WebGLShader[] = [];
  const textures: WebGLTexture[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let disposed = false;
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    try {
      textures.forEach(t => gl.deleteTexture(t)); shaders.forEach(s => gl.deleteShader(s));
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
    } catch {}
  };
  try {
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind); if (!shader) throw Error('shader');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('shader compilation');
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram(); if (!program) throw Error('program');
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('program link');
    gl.useProgram(program);
    buffer = gl.createBuffer(); if (!buffer) throw Error('buffer'); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = (unit: number, filter: number) => {
      const t = gl.createTexture(); if (!t) throw Error('texture'); textures.push(t);
      gl.activeTexture(unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    };
    texture(gl.TEXTURE0, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    // A extensão Expo recebe um ficheiro local no lugar de um elemento DOM.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, { localUri: image.localUri } as any);
    const side = Math.min(image.width, image.height);
    const scaleX = side / image.width, scaleY = side / image.height;
    gl.uniform2f(gl.getUniformLocation(program, 'uEscala'), scaleX, scaleY);
    gl.uniform2f(gl.getUniformLocation(program, 'uDeslocamento'), (1-scaleX)/2, (1-scaleY)/2);
    gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'uIntensidade'), intensidade);
    texture(gl.TEXTURE1, gl.NEAREST);
    const spectrum = new Uint8Array(256 * 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, spectrum);
    gl.uniform1i(gl.getUniformLocation(program, 'uEspetro'), 1);
    if (gl.getError() !== gl.NO_ERROR) throw Error('texture upload');
    const frameUniform = gl.getUniformLocation(program, 'uQuadro[0]');
    const frame = new Float32Array(8);
    let previousStep = -1, previousBeat = 0;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    return {
      draw(values: readonly number[], seconds: number) {
        if (disposed) return;
        const bins = values;
        const level = nivelDoQuadro(bins);
        const beat = Math.min(1, values[256]);
        const step = Math.floor(seconds * 15);
        // A MESMA conta do `renderer.web.ts`: a intensidade entra aqui e no
        // shader, senão o número de caixas deixava de acompanhar o desenho.
        const levelAvg = Math.min(225, (level * 255 + beat * 185) * intensidade);
        if (step !== previousStep || (beat > 0.55 && beat > previousBeat + 0.08)) {
          const base = levelAvg / 70;
          const shift = levelAvg > 0 ? Math.ceil(base ** base) : 0;
          for (let i = 1; i <= 3; i++) frame[i] = Math.round((Math.random() * 2 - 1) * shift);
          previousStep = step;
        }
        previousBeat = beat;
        frame[0] = level * 255; frame[4] = step; frame[5] = size;
        frame[6] = beat; frame[7] = agudosDoQuadro(bins);
        // Um bin por texel, sem esticar nada. Era aqui que estava a diferença
        // que se via: oito bandas esticadas para 256 davam a linhas vizinhas
        // quase o mesmo valor, e o shader (que lê um texel por LINHA do ecrã)
        // deslocava-as todas juntas -- blocos a deslizar em vez do pente
        // irregular do PC.
        for (let i = 0; i < 256; i++) spectrum[i * 4] = bins[i];
        gl.activeTexture(gl.TEXTURE1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, spectrum);
        gl.uniform4fv(frameUniform, frame); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.endFrameEXP();
      },
      /**
       * A capa saiu mesmo na textura?
       *
       * O `texImage2D` do expo-gl não desenha já -- entra numa fila que corre
       * na thread do GL. Se o ficheiro não se ler, ele chama o `glTexImage2D`
       * com 0x0 e **isso não é erro nenhum**: o `getError()` diz que está tudo
       * bem e fica uma textura preta. Era a capa preta.
       *
       * Por isso a pergunta não é "houve erro?", é "o que ficou desenhado tem
       * cor?". Quatro pontos espalhados, uma vez só, depois do primeiro
       * desenho. Uma capa a sério não é preta absoluta em quatro sítios ao
       * mesmo tempo -- e se for, mostrar a imagem normal por baixo dá
       * exactamente o mesmo aspecto.
       */
      desenhouAlgo(): boolean {
        if (disposed) return false;
        // Desenha AQUI e não chama `endFrameEXP`: o `readPixels` tem de ler o
        // buffer de trás antes de ele ser apresentado. Com o quadro a zeros o
        // shader toma o atalho da capa limpa, por isso isto testa a TEXTURA e
        // não o efeito. O `readPixels` do expo-gl é bloqueante: força a fila
        // toda a correr, incluindo o carregamento da capa. Uma vez só.
        gl.uniform4fv(frameUniform, frame);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        const lado = gl.drawingBufferWidth, alto = gl.drawingBufferHeight;
        const pixel = new Uint8Array(4);
        for (const [x, y] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.3], [0.4, 0.8]]) {
          gl.readPixels(Math.floor(lado * x), Math.floor(alto * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (pixel[0] || pixel[1] || pixel[2]) return true;
        }
        return false;
      },
      destroy,
    };
  } catch (error) { destroy(); throw error; }
}
