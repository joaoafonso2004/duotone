"""
Gera `assets/abertura.webp` -- a animacao que aparece ao ligar a app.

Um eclipse que se abre: os dois discos do logo comecam um em cima do outro
(so se ve o anel de luz a volta), afastam-se, e o que sobra da sobreposicao
sao os dois crescentes. Depois passa um reflexo pelo metal.

Porque e que e assim, e nao outra coisa:

- **Os pixeis sao os do logo** (`logo_windows.png`), nao um desenho a imitar.
  Cada crescente e a propria textura do logo a andar com o seu disco; um
  circulo "cortador", que acompanha o outro lado, esconde o que ainda nao devia
  aparecer. Nunca e preciso inventar metal: por convexidade, o crescente em
  qualquer instante fica dentro do crescente final.
- **O ultimo fotograma e o logo tal e qual.** No fim o cortador fica 8 px
  aquem do corte verdadeiro e ja nao toca em nada. `--verificar` confirma-o
  (diferenca maxima de 1/255, que e so arredondamento).
- **Fundo transparente.** Sem alfa o ficheiro tinha metade do tamanho, mas
  qualquer desvio de cor da compressao deixava ver o quadrado da imagem em
  cima do fundo da app.
- **Toca uma vez e fica no logo.** `loop = 1`, e o ultimo fotograma dura 8 s:
  se algum leitor ignorasse o loop, o recomeco ficava muito depois de a
  abertura ter saido. O `scripts/test-abertura.ts` prende isto e os tempos do
  `src/lib/abertura.ts` ao ficheiro.

Correr (precisa de numpy, scipy e do ffmpeg no PATH):

    python scripts/gerar-abertura.py               # escreve assets/abertura.webp
    python scripts/gerar-abertura.py --previa DIR  # dois .mp4 para ver no telemovel/PC
    python scripts/gerar-abertura.py --verificar   # o fim bate com o logo?
"""
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates, zoom

RAIZ = Path(__file__).resolve().parent.parent
LOGO = RAIZ / "logo_windows.png"
SAIDA = RAIZ / "assets" / "abertura.webp"

FPS = 60
DURACAO = 1.0              # a animacao; a saida (fade) e feita pela app
CANVAS = 720               # 240 pt a 3x no iPhone; o logo ocupa 2/3
QUALIDADE = 80             # 47 dB depois de compor sobre o fundo: igual a vista
SEGURAR_FIM_S = 8          # quanto tempo o ultimo fotograma fica no ficheiro
BG = np.array([10, 10, 15], np.float64) / 255.0      # #0A0A0F, so para as previas
LUZ = np.array([222, 228, 242], np.float64) / 255.0  # o branco frio do metal


def ler_rgba(path):
    info = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height",
                           "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    w, h = map(int, info.stdout.strip().split(","))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 4).astype(np.float64) / 255.0


# ---------------------------------------------------------------- geometria
# Mede-se no proprio PNG: se o logo mudar, a animacao acompanha.
IMG = ler_rgba(LOGO)
ALFA = IMG[..., 3]


def ajustar_circulo(px, py):
    """Minimos quadrados algebricos (Kasa)."""
    A = np.c_[2 * px, 2 * py, np.ones_like(px)]
    c, *_ = np.linalg.lstsq(A, px ** 2 + py ** 2, rcond=None)
    return c[0], c[1], math.sqrt(c[2] + c[0] ** 2 + c[1] ** 2)


def geometria():
    m = ALFA > 0.5
    borda = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    by, bx = (v.astype(float) for v in np.nonzero(borda))
    ys, xs = np.nonzero(m)
    cy0, r0 = (ys.min() + ys.max()) / 2, (ys.max() - ys.min()) / 2
    cxl0, cxr0 = xs.min() + r0, xs.max() - r0
    meio0 = (cxl0 + cxr0) / 2
    dl, dr = np.hypot(bx - cxl0, by - cy0), np.hypot(bx - cxr0, by - cy0)
    esq = ajustar_circulo(*(v[(bx < cxl0 + 0.3 * r0) & (np.abs(dl - r0) < 12)] for v in (bx, by)))
    dir_ = ajustar_circulo(*(v[(bx > cxr0 - 0.3 * r0) & (np.abs(dr - r0) < 12)] for v in (bx, by)))
    # Os bordos da lente, longe das pontas (onde o desenho arredonda). O corte
    # NAO e o outro disco: e um circulo um pouco mais pequeno e desviado.
    perto = np.abs(by - cy0) < 0.55 * r0
    fora_e = np.abs(np.hypot(bx - esq[0], by - esq[1]) - esq[2]) > 8
    fora_d = np.abs(np.hypot(bx - dir_[0], by - dir_[1]) - dir_[2]) > 8
    corte_e = ajustar_circulo(*(v[perto & (bx > esq[0]) & (bx < meio0) & fora_e] for v in (bx, by)))
    corte_d = ajustar_circulo(*(v[perto & (bx < dir_[0]) & (bx > meio0) & fora_d] for v in (bx, by)))
    return esq, dir_, corte_e, corte_d


(L_CX, L_CY, L_R), (R_CX, R_CY, R_R), (CL_CX, CL_CY, CL_R), (CR_CX, CR_CY, CR_R) = geometria()
RAIO = (L_R + R_R) / 2
MEIO = np.array([(L_CX + R_CX) / 2, (L_CY + R_CY) / 2])
D = R_CX - L_CX                  # distancia final entre os centros
E_L = CL_CX - L_CX               # onde fica cada cortador, visto do seu disco
E_R = R_CX - CR_CX
LARGURA_LOGO = (R_CX + R_R) - (L_CX - L_R)

# Uma textura pre-multiplicada por crescente. Um ponto do crescente esquerdo
# esta sempre mais perto do centro esquerdo, por isso basta cortar a meio.
PM = IMG.copy()
PM[..., :3] *= PM[..., 3:4]
COLUNAS = np.arange(IMG.shape[1])[None, :, None]
TEX_L = PM * (COLUNAS < MEIO[0])
TEX_R = PM * (COLUNAS >= MEIO[0])


# ---------------------------------------------------------------- tempo
def bezier(x1, y1, x2, y2):
    """Uma cubic-bezier como as do CSS, resolvida por bisseccao."""
    def f(t):
        t = min(max(t, 0.0), 1.0)
        lo, hi = 0.0, 1.0
        for _ in range(40):
            u = (lo + hi) / 2
            x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3
            lo, hi = (u, hi) if x < t else (lo, u)
        u = (lo + hi) / 2
        return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3
    return f


EXPO_OUT = bezier(0.16, 1, 0.3, 1)
CUBIC_OUT = bezier(0.33, 1, 0.68, 1)
SINE_IO = bezier(0.37, 0, 0.63, 1)
ABRIR = bezier(0.6, 0, 0.12, 1)   # arranque lento (ve-se o anel a abrir), assentar longo

T_ABRE, T_ABERTO = 0.10, 0.66
T_BRILHO0, T_BRILHO1 = 0.44, 0.94


def suave(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def parametros(t):
    abrir = ABRIR((t - T_ABRE) / (T_ABERTO - T_ABRE))
    recuo = EXPO_OUT(t / 0.75)
    return dict(
        p=abrir,                                          # separacao dos discos
        rot=math.radians(-24.0) * (1 - abrir),           # o eixo roda ate a horizontal
        escala=1.0 + 0.16 * (1 - recuo),                  # a camara a recuar
        blur=6.0 * (1 - CUBIC_OUT(t / 0.36)),             # foco, em px de um canvas de 720
        entrada=suave(0.0, 0.10, t),
        coroa=suave(0.0, 0.10, t) * (1 - suave(0.18, 0.50, t)),
        brilho=SINE_IO((t - T_BRILHO0) / (T_BRILHO1 - T_BRILHO0)),
        brilho_vivo=suave(T_BRILHO0, T_BRILHO0 + 0.10, t) * (1 - suave(T_BRILHO1 - 0.12, T_BRILHO1, t)),
    )


# ---------------------------------------------------------------- desenho
def fotograma(t, canvas):
    """RGBA pre-multiplicado de um canvas quadrado, sem fundo."""
    P = parametros(t)
    k = (canvas * 2 / 3) / LARGURA_LOGO * P["escala"]
    c = (canvas - 1) / 2
    yy, xx = np.mgrid[0:canvas, 0:canvas].astype(np.float64)
    vx, vy = (xx - c) / k, (yy - c) / k
    cr, sr = math.cos(-P["rot"]), math.sin(-P["rot"])
    qx, qy = vx * cr - vy * sr, vx * sr + vy * cr    # px da textura, a partir do MEIO
    p = P["p"]
    aa = 1.0 / k                                      # 1 px do canvas, em px da textura

    def amostra(tex, dx):
        coords = [MEIO[1] + qy, MEIO[0] + qx + dx]
        return np.stack([map_coordinates(tex[..., ch], coords, order=1, mode="constant") for ch in range(4)], -1)

    meia = (D / 2) * (1 - p)
    esq, dir_ = amostra(TEX_L, -meia), amostra(TEX_R, +meia)
    # Os cortadores: no inicio maiores que o disco (nao se ve metal nenhum);
    # no fim 8 px aquem do corte verdadeiro (ja nao tocam no crescente).
    r_l = (CL_R - 8) + (RAIO + 4 - (CL_R - 8)) * (1 - p)
    r_r = (CR_R - 8) + (RAIO + 4 - (CR_R - 8)) * (1 - p)
    m_l = np.clip((np.hypot(qx - (E_L - D / 2) * p, qy - (CL_CY - MEIO[1]) * p) - r_l) / aa + 0.5, 0, 1)
    m_r = np.clip((np.hypot(qx + (E_R - D / 2) * p, qy - (CR_CY - MEIO[1]) * p) - r_r) / aa + 0.5, 0, 1)
    rgba = esq * m_l[..., None] + dir_ * m_r[..., None]

    if P["brilho_vivo"] > 0:                          # o reflexo, so onde ha metal
        ang = math.radians(26)
        u = qx * math.cos(ang) + qy * math.sin(ang)
        u0 = (-1.3 + 2.6 * P["brilho"]) * (D / 2 + RAIO)
        banda = np.exp(-((u - u0) / (0.34 * RAIO)) ** 2) * 0.36 * P["brilho_vivo"]
        rgba[..., :3] += banda[..., None] * (rgba[..., 3:4] - rgba[..., :3])

    if P["coroa"] > 0:                                # o anel de luz, por fora da silhueta
        fora = np.minimum(np.hypot(qx + D * p / 2, qy), np.hypot(qx - D * p / 2, qy)) - RAIO
        f = np.maximum(fora, 0)
        luz = (0.85 * np.exp(-(f / (0.025 * RAIO)) ** 2) + 0.22 * np.exp(-(f / (0.20 * RAIO)) ** 2))
        luz *= np.clip(fora / aa + 0.5, 0, 1) * P["coroa"]
        rgba[..., :3] += luz[..., None] * LUZ
        rgba[..., 3] = np.clip(rgba[..., 3] + luz, 0, 1)

    if P["blur"] > 0.05:
        s = P["blur"] * canvas / 720
        rgba = np.stack([gaussian_filter(rgba[..., ch], s) for ch in range(4)], -1)
    return rgba * P["entrada"]


def n_fotogramas():
    return int(round(DURACAO * FPS)) + 1


def para_rgba_direito(pm):
    a = np.clip(pm[..., 3:4], 0, 1)
    rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
    return (np.clip(np.concatenate([rgb, a], -1), 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()


def sobre_fundo(pm):
    return (np.clip(pm[..., :3] + BG * (1 - pm[..., 3:4]), 0, 1) * 255 + 0.5).astype(np.uint8)


def gerar_asset():
    ff = subprocess.Popen([
        "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{CANVAS}x{CANVAS}",
        "-r", str(FPS), "-i", "-",
        # o ultimo fotograma repetido: o libwebp funde fotogramas iguais e fica
        # um so, com a duracao toda
        "-vf", f"tpad=stop_mode=clone:stop_duration={SEGURAR_FIM_S}",
        "-c:v", "libwebp_anim", "-pix_fmt", "yuva420p", "-quality", str(QUALIDADE), "-loop", "1",
        str(SAIDA)], stdin=subprocess.PIPE)
    for i in range(n_fotogramas()):
        ff.stdin.write(para_rgba_direito(fotograma(i / FPS, CANVAS)))
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("o ffmpeg falhou")
    print(f"{SAIDA.relative_to(RAIZ)}: {SAIDA.stat().st_size} bytes")


def gerar_previa(pasta):
    """Como fica no ecra, com a saida que a app faz (segura, some e cresce 4%)."""
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, (w, h, lado) in {"iphone": (1080, 2340, 660), "windows": (1920, 1080, 420)}.items():
        destino = pasta / f"abertura-{nome}.mp4"
        ff = subprocess.Popen([
            "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "14",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destino)], stdin=subprocess.PIPE)
        x0, y0 = (w - lado) // 2, (h - lado) // 2
        final = None
        for i in range(int(round((DURACAO + 0.5) * FPS))):
            t = i / FPS
            tela = np.empty((h, w, 3), np.uint8)
            tela[:] = sobre_fundo(np.zeros((1, 1, 4)))[0, 0]
            if t <= DURACAO:
                final = fotograma(t, lado)
                sub = final
            else:
                u = suave(DURACAO + 0.12, DURACAO + 0.42, t)
                z = np.stack([zoom(final[..., ch], 1 + 0.04 * u, order=1) for ch in range(4)], -1)
                o = (z.shape[0] - lado) // 2
                sub = z[o:o + lado, o:o + lado] * (1 - u)
            tela[y0:y0 + lado, x0:x0 + lado] = sobre_fundo(sub)
            ff.stdin.write(tela.tobytes())
        ff.stdin.close()
        ff.wait()
        print(destino)


def verificar():
    fim = fotograma(DURACAO, CANVAS)
    k = (CANVAS * 2 / 3) / LARGURA_LOGO
    c = (CANVAS - 1) / 2
    yy, xx = np.mgrid[0:CANVAS, 0:CANVAS].astype(np.float64)
    coords = [MEIO[1] + (yy - c) / k, MEIO[0] + (xx - c) / k]
    ref = np.stack([map_coordinates(PM[..., ch], coords, order=1, mode="constant") for ch in range(4)], -1)
    dif = np.abs(fim - ref).max()
    print(f"ultimo fotograma vs logo: diferenca maxima {dif:.5f} (1/255 = {1 / 255:.5f})")
    sys.exit(0 if dif <= 1 / 255 + 1e-9 else 1)


if __name__ == "__main__":
    if "--verificar" in sys.argv:
        verificar()
    elif "--previa" in sys.argv:
        gerar_previa(sys.argv[sys.argv.index("--previa") + 1])
    else:
        gerar_asset()
