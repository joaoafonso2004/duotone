"""
O ícone do Duotone no tabuleiro (e na barra de tarefas) do Windows: electron/icone.ico.

O tabuleiro recebia o `logo_windows.png` inteiro (1254 px) e o Windows
encolhia-o sozinho para 16-32 px, de uma vez -- bordas serrilhadas e manchadas,
e o crescente escuro da esquerda a desaparecer num tabuleiro escuro. Ao lado
dos outros ícones ficava para trás (João, 2/10).

Aqui cada tamanho é feito à parte, pela MÉDIA DA ÁREA (cada píxel de destino é
a média exata dos píxeis de origem que cobre, com o alfa pré-multiplicado), e o
.ico leva-os todos: o Windows escolhe o do DPI do ecrã. O logo é cortado à
volta do que tem (sem a margem transparente do quadrado), e nos tamanhos
pequenos os escuros sobem um pouco, para o crescente da esquerda se ver.

Só numpy; o PNG é lido e escrito à mão, como nos outros geradores.

Correr:     python scripts/gerar-icone-do-tabuleiro.py
Verificar:  python scripts/gerar-icone-do-tabuleiro.py --verificar
"""
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
LOGO = RAIZ / "logo_windows.png"
ICO = RAIZ / "electron" / "icone.ico"

TAMANHOS = [16, 20, 24, 32, 40, 48, 64, 128, 256]
# A margem à volta do logo, em fração do lado: o Windows já deixa espaço entre
# ícones, e com mais o logo ficava mais pequeno do que os vizinhos.
MARGEM = 0.04


def ler_png(caminho: Path) -> np.ndarray:
    dados = caminho.read_bytes()
    assert dados[:8] == b"\x89PNG\r\n\x1a\n", "não é um PNG"
    pos, idat, largura = 8, [], None
    while pos < len(dados):
        n = struct.unpack(">I", dados[pos:pos + 4])[0]
        tipo = dados[pos + 4:pos + 8]
        corpo = dados[pos + 8:pos + 8 + n]
        if tipo == b"IHDR":
            largura, altura, prof, cor = struct.unpack(">IIBB", corpo[:10])
            assert prof == 8 and cor == 6, "o gerador só lê RGBA de 8 bits"
        elif tipo == b"IDAT":
            idat.append(corpo)
        pos += 12 + n
    cru = zlib.decompress(b"".join(idat))
    passo = largura * 4
    img = np.zeros((altura, passo), dtype=np.uint8)
    anterior = np.zeros(passo, dtype=np.int32)
    for y in range(altura):
        filtro = cru[y * (passo + 1)]
        linha = np.frombuffer(cru, dtype=np.uint8, count=passo, offset=y * (passo + 1) + 1).astype(np.int32)
        if filtro == 0:
            atual = linha
        elif filtro == 2:
            atual = (linha + anterior) & 0xFF
        else:
            atual = np.zeros(passo, dtype=np.int32)
            for x in range(passo):
                a = atual[x - 4] if x >= 4 else 0
                b = anterior[x]
                c = anterior[x - 4] if x >= 4 else 0
                if filtro == 1:
                    p = a
                elif filtro == 3:
                    p = (a + b) // 2
                else:  # 4, Paeth
                    pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                    p = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                atual[x] = (linha[x] + p) & 0xFF
        img[y] = atual
        anterior = atual
    return img.reshape(altura, largura, 4).astype(np.float64) / 255.0


def escrever_png(rgba: np.ndarray) -> bytes:
    altura, largura, _ = rgba.shape
    cru = b"".join(b"\x00" + rgba[y].tobytes() for y in range(altura))

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 6, 0, 0, 0))
        + bloco(b"IDAT", zlib.compress(cru, 9))
        + bloco(b"IEND", b"")
    )


def pesos(origem: int, destino: int, inicio: float, fim: float) -> np.ndarray:
    """Quanto de cada píxel de origem (no intervalo [inicio, fim)) cai em cada píxel de destino."""
    w = np.zeros((destino, origem))
    passo = (fim - inicio) / destino
    for i in range(destino):
        a, b = inicio + i * passo, inicio + (i + 1) * passo
        for x in range(int(np.floor(a)), int(np.ceil(b))):
            if 0 <= x < origem:
                w[i, x] = max(0.0, min(b, x + 1) - max(a, x))
        w[i] /= max(w[i].sum(), 1e-12)
    return w


def caixa_do_logo(img: np.ndarray):
    alfa = img[..., 3] > 0.02
    ys, xs = np.nonzero(alfa)
    return xs.min(), xs.max() + 1, ys.min(), ys.max() + 1


def fazer(img: np.ndarray, lado: int) -> np.ndarray:
    x0, x1, y0, y1 = caixa_do_logo(img)
    # Um quadrado à volta do logo (é mais largo do que alto), com a margem.
    meio_x, meio_y = (x0 + x1) / 2, (y0 + y1) / 2
    meia = max(x1 - x0, y1 - y0) / 2 / (1 - 2 * MARGEM)
    wy = pesos(img.shape[0], lado, meio_y - meia, meio_y + meia)
    wx = pesos(img.shape[1], lado, meio_x - meia, meio_x + meia)
    alfa = img[..., 3]
    pre = img[..., :3] * alfa[..., None]  # pré-multiplicado: as bordas não escurecem
    a = wy @ alfa @ wx.T
    cor = np.stack([wy @ pre[..., c] @ wx.T for c in range(3)], axis=-1)
    cor = np.where(a[..., None] > 1e-6, cor / np.maximum(a[..., None], 1e-6), 0)
    # Nos tamanhos pequenos os escuros sobem: o crescente da esquerda vai até
    # quase preto e, a 16 px num tabuleiro escuro, deixava de se ver.
    subir = 0.38 if lado <= 32 else (0.2 if lado <= 48 else 0.0)
    cor = subir + (1 - subir) * cor
    rgba = np.concatenate([np.clip(cor, 0, 1), np.clip(a, 0, 1)[..., None]], axis=-1)
    return np.round(rgba * 255).astype(np.uint8)


def escrever_ico(imagens) -> bytes:
    cabeca = struct.pack("<HHH", 0, 1, len(imagens))
    pngs = [escrever_png(rgba) for rgba in imagens]
    pos = 6 + 16 * len(imagens)
    entradas = b""
    for rgba, png in zip(imagens, pngs):
        lado = rgba.shape[0]
        entradas += struct.pack("<BBBBHHII", lado % 256, lado % 256, 0, 0, 1, 32, len(png), pos)
        pos += len(png)
    return cabeca + entradas + b"".join(pngs)


def ler_ico(caminho: Path):
    dados = caminho.read_bytes()
    _, tipo, n = struct.unpack("<HHH", dados[:6])
    assert tipo == 1, "não é um .ico"
    lados = []
    for i in range(n):
        lado = dados[6 + 16 * i] or 256
        tamanho, pos = struct.unpack("<II", dados[6 + 16 * i + 8:6 + 16 * i + 16])
        assert dados[pos:pos + 8] == b"\x89PNG\r\n\x1a\n", "cada tamanho é um PNG"
        lados.append(lado)
    return lados


def verificar() -> int:
    problemas = []
    if not ICO.exists():
        print(f"falta {ICO.relative_to(RAIZ)}: corre o gerador")
        return 1
    lados = ler_ico(ICO)
    if sorted(lados) != sorted(TAMANHOS):
        problemas.append(f"tamanhos {lados}, esperava {TAMANHOS}")
    img = ler_png(LOGO)
    pequeno = fazer(img, 16)
    a = pequeno[..., 3]
    # O logo enche a largura (é mais largo do que alto) e não toca as bordas.
    colunas = np.nonzero(a.max(axis=0) > 40)[0]
    if colunas.size == 0 or colunas.max() - colunas.min() + 1 < 14:
        problemas.append("a 16 px o logo não enche a largura")
    if a[0].max() > 40 or a[-1].max() > 40:
        problemas.append("a 16 px o logo toca em cima ou em baixo")
    # O crescente da esquerda vê-se num tabuleiro escuro (#202020).
    vis = a > 128
    esquerda = pequeno[..., :3][vis & (np.arange(16)[None, :] < 7)]
    if esquerda.size == 0 or esquerda.mean() < 100:
        problemas.append("a 16 px o crescente da esquerda continua escuro de mais")
    if problemas:
        for p in problemas:
            print("  FALHOU -", p)
        return 1
    print(f"  ok - {ICO.relative_to(RAIZ)}: {sorted(lados)}; a 16 px o logo enche a largura e o lado escuro vê-se")
    return 0


if __name__ == "__main__":
    if "--verificar" in sys.argv:
        sys.exit(verificar())
    img = ler_png(LOGO)
    ICO.write_bytes(escrever_ico([fazer(img, lado) for lado in TAMANHOS]))
    print(f"escrito {ICO.relative_to(RAIZ)} ({ICO.stat().st_size} bytes, {TAMANHOS})")
    sys.exit(verificar())
