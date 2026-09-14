"""
Os materiais da capa 3D do Now Playing do iPhone (src/components/CapaFlutuante3D.tsx).

O React Native não tem gradiente radial nem texturas geradas em tempo real, por
isso o que a preview desenhava no browser sai daqui como PNG -- com os MESMOS
números da preview de 13/9:

  capa3d-grao@3x.png          grão de pedra, 180 px = 60 pt em mosaico (a mesma
                              semente e o mesmo algoritmo da preview), já com
                              a opacidade de 42%
  capa3d-sombra-ambiente.png  sombra larga, queda radial 0,9 -> 0,45 -> 0
  capa3d-sombra-contacto.png  sombra de contacto, 1 -> 0,6 -> 0, já com o
                              desfoque (a vista fica maior para ele caber)
  capa3d-vinheta.png          vinheta do fundo: elipse de 80% x 46% centrada a
                              36% da altura, 0,06 -> 0,40 -> 0,80, com ruído de
                              meio nível contra o banding num gradiente escuro

Só numpy; o PNG é escrito à mão, como no gerar-fundo-limpo.py.

Correr: python scripts/gerar-materiais-da-capa.py
"""
import struct
import zlib
from pathlib import Path

import numpy as np

ASSETS = Path(__file__).resolve().parent.parent / "assets"

# A opacidade do grão (CAPA_FLUTUANTE.grao.opacidade) vai DENTRO do PNG. Aplicada
# por cima, era opacidade de grupo sobre dezenas de mosaicos, e o iPhone
# desenhava-a à parte a cada fotograma da flutuação.
OPACIDADE_DO_GRAO = 0.42


def escrever_png(caminho: Path, rgba: np.ndarray) -> None:
    altura, largura, _ = rgba.shape
    cru = b"".join(b"\x00" + rgba[y].tobytes() for y in range(altura))

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 6, 0, 0, 0))
        + bloco(b"IDAT", zlib.compress(cru, 9))
        + bloco(b"IEND", b"")
    )
    print(f"escrito {caminho.relative_to(ASSETS.parent)} ({largura}x{altura}, {caminho.stat().st_size} bytes)")


def grao(lado: int = 180, grelha: int = 34, semente: int = 20260913) -> np.ndarray:
    """O grão da preview: fino claro/escuro, manchas quase nulas, um brilho raro."""
    s = semente

    def r() -> float:
        nonlocal s
        s = (s * 16807) % 2147483647
        return s / 2147483647

    valores = [r() for _ in range(grelha * grelha)]

    def v(i: int, j: int) -> float:
        return valores[((j + grelha) % grelha) * grelha + ((i + grelha) % grelha)]

    img = np.zeros((lado, lado, 4), np.uint8)
    for y in range(lado):
        for x in range(lado):
            gx, gy = x / lado * grelha, y / lado * grelha
            x0, y0 = int(gx), int(gy)
            fx, fy = gx - x0, gy - y0
            sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
            mancha = (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy
            d = (r() - 0.5) * 1.0 + (mancha - 0.5) * 0.06
            alfa = min(1.0, abs(d) * 1.35) * 120
            tom = 255 if d > 0 else 0
            if r() < 0.003:
                tom, alfa = 255, 150
            img[y, x] = (tom, tom, tom, int(round(alfa * OPACIDADE_DO_GRAO)))
    return img


def perfil(distancia: np.ndarray, paragens) -> np.ndarray:
    xs = [p for p, _ in paragens]
    ys = [a for _, a in paragens]
    return np.interp(distancia, xs, ys, right=ys[-1])


def preto(alfa: np.ndarray, cor=(0, 0, 0)) -> np.ndarray:
    img = np.zeros(alfa.shape + (4,), np.uint8)
    img[..., 0], img[..., 1], img[..., 2] = cor
    img[..., 3] = np.clip(np.round(alfa * 255), 0, 255).astype(np.uint8)
    return img


def sombra_ambiente(lado: int = 256) -> np.ndarray:
    y, x = np.mgrid[0:lado, 0:lado]
    u, w = (x + 0.5) / lado * 2 - 1, (y + 0.5) / lado * 2 - 1
    return preto(perfil(np.sqrt(u * u + w * w), [(0, 0.9), (0.55, 0.45), (1, 0)]))


def desfocar(a: np.ndarray, sigma_x: float, sigma_y: float) -> np.ndarray:
    def nucleo(sigma: float) -> np.ndarray:
        raio = int(np.ceil(3 * sigma))
        t = np.arange(-raio, raio + 1)
        k = np.exp(-(t * t) / (2 * sigma * sigma))
        return k / k.sum()

    kx, ky = nucleo(sigma_x), nucleo(sigma_y)
    a = np.apply_along_axis(lambda linha: np.convolve(linha, kx, mode="same"), 1, a)
    return np.apply_along_axis(lambda coluna: np.convolve(coluna, ky, mode="same"), 0, a)


def sombra_contacto(lado: int = 256) -> np.ndarray:
    """A elipse de 0,8 x 0,075 lados com desfoque de 0,02, numa caixa de 0,92 x 0,195."""
    largura, altura, desfoque = 0.92, 0.195, 0.02
    xs = ((np.arange(lado) + 0.5) / lado - 0.5) * largura
    ys = ((np.arange(lado) + 0.5) / lado - 0.5) * altura
    X, Y = np.meshgrid(xs, ys)
    a = perfil(np.sqrt((X / 0.4) ** 2 + (Y / 0.0375) ** 2), [(0, 1.0), (0.45, 0.6), (1, 0)])
    return preto(desfocar(a, desfoque / (largura / lado), desfoque / (altura / lado)))


def vinheta(largura: int = 256, altura: int = 512, semente: int = 7) -> np.ndarray:
    y, x = np.mgrid[0:altura, 0:largura]
    u = ((x + 0.5) / largura - 0.5) / 0.8
    w = ((y + 0.5) / altura - 0.36) / 0.46
    a = perfil(np.sqrt(u * u + w * w), [(0, 0.06), (0.6, 0.40), (1, 0.80)])
    ruido = np.random.default_rng(semente).uniform(-0.5, 0.5, a.shape) / 255
    return preto(a + ruido, cor=(10, 10, 15))


if __name__ == "__main__":
    escrever_png(ASSETS / "capa3d-grao@3x.png", grao())
    escrever_png(ASSETS / "capa3d-sombra-ambiente.png", sombra_ambiente())
    escrever_png(ASSETS / "capa3d-sombra-contacto.png", sombra_contacto())
    escrever_png(ASSETS / "capa3d-vinheta.png", vinheta())
