"""
O reflexo do metal escovado em círculo (proposta S2 da auditoria de 31/10).

Os dois discos do símbolo são metal escovado: riscos concêntricos, e por isso a
luz não faz uma mancha, faz um LAÇO -- duas cunhas opostas, como num botão de
alumínio de um amplificador. Rodar o laço é a luz a andar no disco sem nada mais
mexer, e rodar é `transform`: corre no driver nativo (iPhone) e no compositor
(PC), sem desenhar nada por fotograma.

  reflexo-do-disco@3x.png  branco com alfa, 384 x 384 (128 pt), centrado.
                           O laço + os riscos finos. Põe-se POR CIMA de um disco
                           de metal (o botão de play, a capa em disco, a orla do
                           eclipse) com opacidade 0,35-0,6 e roda-se.

Só numpy; o PNG é escrito à mão, como no gerar-materiais-da-capa.py.

Correr: python scripts/gerar-reflexo-do-disco.py [pasta]
"""
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

LADO = 384
# Quão estreitas são as cunhas: o expoente do cos(2θ). 6 dá o laço de um botão
# de alumínio; acima de 12 parece uma lanterna.
ESTREITEZA = 6.0
# Os riscos: a amplitude do ruído por raio (0 = espelho, 1 = lixa).
RISCOS = 0.22
SEMENTE = 31


def escrever_png(caminho: Path, rgba: np.ndarray) -> None:
    altura, largura, _ = rgba.shape
    linhas = b"".join(b"\x00" + rgba[y].tobytes() for y in range(altura))

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    cabecalho = struct.pack(">IIBBBBB", largura, altura, 8, 6, 0, 0, 0)
    caminho.write_bytes(b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", cabecalho)
                        + bloco(b"IDAT", zlib.compress(linhas, 9)) + bloco(b"IEND", b""))


def reflexo() -> np.ndarray:
    eixo = (np.arange(LADO) + 0.5) / LADO * 2 - 1
    x, y = np.meshgrid(eixo, eixo)
    r = np.hypot(x, y)
    theta = np.arctan2(y, x)

    # O laço: luz nas duas cunhas opostas, a 45 graus (o canto de cima à
    # direita e o de baixo à esquerda; roda-se a imagem para mudar).
    laco = np.clip(np.cos(2 * (theta + np.pi / 4)), 0, None) ** ESTREITEZA

    # Os riscos concêntricos: ruído que só varia com o raio (cada anel tem o seu
    # brilho), suavizado para não fazer moiré quando se reduz a imagem.
    gerador = np.random.default_rng(SEMENTE)
    aneis = 1200
    brilho_do_anel = gerador.normal(0, 1, aneis)
    nucleo = np.exp(-0.5 * (np.arange(-6, 7) / 2.0) ** 2)
    brilho_do_anel = np.convolve(brilho_do_anel, nucleo / nucleo.sum(), mode="same")
    brilho_do_anel /= np.abs(brilho_do_anel).max()
    riscos = brilho_do_anel[np.clip((r * (aneis - 1)).astype(int), 0, aneis - 1)]

    luz = laco * (1 + RISCOS * riscos)
    # Mais forte a meio do raio (o metal perto do centro e da borda é menos plano).
    luz *= np.clip(1 - (2 * r - 1.1) ** 2, 0, 1) ** 0.5
    # A borda do disco com 1,5 px de antisserrilha, e nada fora dela.
    borda = np.clip((1 - r) * LADO / 3, 0, 1)
    alfa = np.clip(luz, 0, 1) * borda

    rgba = np.zeros((LADO, LADO, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(alfa * 255).astype(np.uint8)
    return rgba


if __name__ == "__main__":
    pasta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "assets"
    destino = pasta / "reflexo-do-disco@3x.png"
    imagem = reflexo()
    escrever_png(destino, imagem)
    print(f"{destino}: {destino.stat().st_size // 1024} KB, alfa médio {imagem[..., 3].mean() / 255:.3f}")
