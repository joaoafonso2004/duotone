# Os ícones alternativos (26/11, item 9 do plano): a partir do assets/icon.png real.
# Uso: python -I scripts/gerar-icones-alternativos.py <raiz do repo> <folha de comparação.png>
import os, sys
from PIL import Image
import numpy as np
from scipy.ndimage import gaussian_filter, grey_erosion

raiz = sys.argv[1]
im = np.asarray(Image.open(os.path.join(raiz, 'assets/icon.png')).convert('RGB')).astype(np.float32) / 255.0
lum = im @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
H, W = lum.shape
def suave(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
# A borda de fora pela geometria (os dois discos medidos no original, com antialias):
# pela luminância apanhava a sombra suave à volta e saía irregular. A lente (o corte
# escuro do meio) sim pela luminância, que lá é nítida.
_xs = np.arange(W)[None, :]; _ys = np.arange(H)[:, None]
def _disco(cx, cy, r): return np.clip(r - np.hypot(_xs - cx, _ys - cy) + 0.5, 0, 1)
fora = np.maximum(_disco(426, 513, 270), _disco(586, 513, 284))
lente = suave(gaussian_filter(lum, 0.8), 0.12, 0.16)
mascara = (fora * lente).astype(np.float32)
# O sombreado sem o grão escovado (que, esticado, fazia riscas): média só dentro dos discos.
lum_disco = gaussian_filter(lum * mascara, 10) / np.maximum(gaussian_filter(mascara, 10), 1e-4)
s = np.clip((lum_disco - 0.18) / (0.81 - 0.18), 0, 1)
s = 0.25 + 0.75 * s
grao = (lum - gaussian_filter(lum, 3)) * 0.8
xs = np.arange(W)[None, :].repeat(H, 0); ys = np.arange(H)[:, None].repeat(W, 1)
esquerdo = xs < W / 2
nucleo = grey_erosion(mascara, size=(11, 11))
aro = np.clip(mascara - grey_erosion(mascara, size=(7, 7)), 0, 1)

def hexa(h): return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0
def diagonal(c1, c2):
    t = (xs / W) * 0.45 + (ys / H) * 0.55
    return c1 * (1 - t[..., None]) + c2 * t[..., None]
def disco(claro, escuro): return escuro * (1 - s[..., None]) + claro * s[..., None]
def compor(fundo, de, dd, aro_luz=0.0):
    discos = np.where(esquerdo[..., None], de, dd)
    m = mascara[..., None]
    out = fundo * (1 - m) + discos * m + grao[..., None] * nucleo[..., None] * 0.85
    if aro_luz: out = out * (1 - aro[..., None] * aro_luz) + aro[..., None] * aro_luz
    return Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), 'RGB')
plano = lambda h: np.broadcast_to(hexa(h), im.shape).copy()

v = {
  'metal': compor(diagonal(hexa('eef0f3'), hexa('a4a7af')), disco(hexa('4a4d55'), hexa('16171b')), disco(hexa('5a5d66'), hexa('1d1e23'))),
  'twotone': compor(plano('0b0b0f'), disco(hexa('e7bab3'), hexa('8e5f59')), disco(hexa('e6e9ee'), hexa('7f838c'))),
  'light': compor(plano('f2f2f4'), disco(hexa('4b4e56'), hexa('1c1d22')), disco(hexa('60636b'), hexa('24252b'))),
  'night': compor(plano('000000'), disco(hexa('3a3c44'), hexa('0d0e11')), disco(hexa('3a3c44'), hexa('0d0e11')), 0.4),
}
pasta = os.path.join(raiz, 'assets/icones')
for f in os.listdir(pasta): os.remove(os.path.join(pasta, f))
for nome, img in v.items(): img.save(os.path.join(pasta, f'icone-{nome}.png'), optimize=True)
folha = Image.new('RGB', (5 * 220 + 20, 240), (20, 20, 24))
folha.paste(Image.open(os.path.join(raiz, 'assets/icon.png')).convert('RGB').resize((200, 200), Image.LANCZOS), (20, 20))
for i, nome in enumerate(['metal', 'twotone', 'light', 'night']):
    folha.paste(v[nome].resize((200, 200), Image.LANCZOS), (20 + (i + 1) * 220, 20))
folha.save(sys.argv[2])
print(sorted(os.listdir(pasta)))
