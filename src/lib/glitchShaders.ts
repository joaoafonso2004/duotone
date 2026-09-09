/**
 * Os shaders do efeito da capa, partilhados pelo PC e pelo iPhone.
 *
 * Saíram do `desktop/glitch/renderer.web.ts` para aqui quando o iOS passou a
 * desenhar o mesmo efeito: dois ficheiros com o mesmo GLSL divergiam ao
 * primeiro acerto, e um efeito que é "o mesmo" nas duas plataformas tem de ter
 * uma só fonte.
 *
 * ## Porque é que as quebras de linha se normalizam
 *
 * Este ficheiro fica em CRLF na árvore de trabalho do Windows e em LF na do
 * CI (é o `core.autocrlf`). Sem o `semRetorno`, o MESMO commit compilava GLSL
 * com bytes diferentes conforme a máquina que fez a build. Um retorno de carro
 * no meio do código é o género de coisa que passa em todo o lado menos no
 * driver onde não passa. Custa uma passagem por string, ao carregar o módulo.
 */
const semRetorno = (fonte: string) => fonte.replace(/\r\n?/g, '\n');

export const VERTEX = semRetorno(`
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`);

/**
 * Tudo escala com `uNivel`. Com nivel 0 o resultado tem de ser a capa LIMPA,
 * pixel por pixel — e o que sustenta o modo "estatico" partilhar este mesmo
 * caminho em vez de ter um segundo.
 */
export const FRAGMENT = semRetorno(`
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
`);

