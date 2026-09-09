import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { VERTEX, FRAGMENT } from './glitchShaders';

/** Mesmo shader do desktop; só o carregamento/apresentação da textura muda. */
export function criarRendererIOS(gl: ExpoWebGLRenderingContext, size: number, image: { localUri: string; width: number; height: number }) {
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
    gl.uniform1f(gl.getUniformLocation(program, 'uIntensidade'), 1);
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
        const level = Math.min(1, (values[0] + values[1]) / 2);
        const beat = Math.min(1, values[8]);
        const step = Math.floor(seconds * 15);
        if (step !== previousStep || (beat > 0.55 && beat > previousBeat + 0.08)) {
          const base = Math.min(225, level * 255 + beat * 185) / 70;
          const shift = base > 0 ? Math.ceil(base ** base) : 0;
          for (let i = 1; i <= 3; i++) frame[i] = Math.round((Math.random() * 2 - 1) * shift);
          previousStep = step;
        }
        previousBeat = beat;
        frame[0] = level * 255; frame[4] = step; frame[5] = size;
        frame[6] = beat; frame[7] = (values[6] + values[7]) / 2;
        // O espectro nativo tem oito bandas medidas, interpoladas na textura
        // de 256 amostras que o shader partilha com o PC.
        for (let i = 0; i < 256; i++) {
          const x = i * 7 / 255, band = Math.floor(x), mix = x - band;
          spectrum[i * 4] = Math.round(255 * (values[band] * (1-mix) + values[Math.min(7, band+1)] * mix));
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, spectrum);
        gl.uniform4fv(frameUniform, frame); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.endFrameEXP();
      },
      destroy,
    };
  } catch (error) { destroy(); throw error; }
}
