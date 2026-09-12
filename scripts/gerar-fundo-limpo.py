"""
Gera as duas texturas do modo limpo (F11 no PC): o grão e a vinheta.

    python scripts/gerar-fundo-limpo.py
    python scripts/gerar-fundo-limpo.py --verificar

Porque é que isto existe, e não é CSS:

  - **O grão** (`assets/grao-limpo.png`) mata o BANDING. Um fundo escuro e
    muito desfocado num monitor grande mostra degraus -- anéis de cor onde
    devia haver uma passagem suave --, porque 8 bits por canal não chegam para
    um gradiente tão lento. Um ruído de 1 px por cima quebra os degraus e o
    olho vê uma passagem contínua. É o mesmo truque dos filmes.
  - **A vinheta** (`assets/vinheta-limpa.png`) escurece os cantos, o que puxa
    o olho para a capa. Um `radial-gradient` do CSS fá-lo-ia, mas o
    react-native-web não o deixa passar num `style` (o `backgroundImage` não é
    suportado), e um PNG de meio megabyte resolve-o sem mais uma dependência.

Só depende do numpy, que já era preciso para o `gerar-abertura.py`. O PNG é
escrito à mão com o `zlib` -- o Pillow não está instalado e não vale a pena
uma dependência nova por duas imagens.

As duas são DETERMINÍSTICAS (semente fixa): voltar a correr isto dá ficheiros
iguais, e por isso não há ruído no git de cada vez que alguém mexe no script.
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
GRAO = RAIZ / "assets" / "grao-limpo.png"
VINHETA = RAIZ / "assets" / "vinheta-limpa.png"

# O grão é um quadrado que se repete. 256 é o mínimo que não deixa ver o
# padrão: com 64 o olho apanha a repetição num monitor grande.
LADO_DO_GRAO = 256
# Quanto o grão pesa. Acima de ~0,05 deixa de ser textura e passa a sujidade.
FORCA_DO_GRAO = 0.045

# A vinheta não precisa de resolução: é um gradiente lento e vai esticada.
LARGURA_DA_VINHETA, ALTURA_DA_VINHETA = 960, 540
# Onde começa a escurecer (0 = no centro, 1 = só no canto) e quanto escurece.
INICIO_DA_VINHETA = 0.42
FORCA_DA_VINHETA = 0.62


def escrever_png(caminho: Path, rgba: np.ndarray) -> None:
    """Um PNG RGBA de 8 bits, sem Pillow."""
    altura, largura, canais = rgba.shape
    assert canais == 4, "o PNG é RGBA"
    linhas = b"".join(
        b"\x00" + rgba[y].astype(np.uint8).tobytes() for y in range(altura)
    )

    def pedaco(tipo: bytes, dados: bytes) -> bytes:
        return (
            struct.pack(">I", len(dados))
            + tipo
            + dados
            + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)
        )

    cabecalho = struct.pack(">2I5B", largura, altura, 8, 6, 0, 0, 0)
    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + pedaco(b"IHDR", cabecalho)
        + pedaco(b"IDAT", zlib.compress(linhas, 9))
        + pedaco(b"IEND", b"")
    )


def fazer_grao() -> np.ndarray:
    """
    Ruído de 1 px, metade claro e metade escuro.

    Cada pixel é branco ou preto com uma opacidade pequena, e não um cinzento
    por cima de tudo: um cinzento a 4% só lava o ecrã, enquanto claros e
    escuros à mistura é que quebram os degraus do gradiente.

    Não precisa de costura: o ruído é independente pixel a pixel, por isso os
    lados opostos já casam -- é o desfoque que cria emendas, e aqui não há.
    """
    rng = np.random.default_rng(20260912)
    v = rng.standard_normal((LADO_DO_GRAO, LADO_DO_GRAO))
    rgba = np.zeros((LADO_DO_GRAO, LADO_DO_GRAO, 4), dtype=np.uint8)
    claro = v > 0
    rgba[..., 0:3] = np.where(claro[..., None], 255, 0)
    # |v| até 2 sigma; acima disso seriam pontos a saltar à vista.
    alfa = np.clip(np.abs(v) / 2.0, 0, 1) * FORCA_DO_GRAO
    rgba[..., 3] = np.round(alfa * 255).astype(np.uint8)
    return rgba


def fazer_vinheta() -> np.ndarray:
    """
    Preto transparente no meio, preto opaco a caminho dos cantos.

    A distância é medida em ELIPSE (x e y normalizados cada um pelo seu lado),
    para a imagem poder ser esticada a qualquer formato de ecrã sem o escuro
    entrar mais de um lado do que do outro.
    """
    y, x = np.mgrid[0:ALTURA_DA_VINHETA, 0:LARGURA_DA_VINHETA]
    nx = (x / (LARGURA_DA_VINHETA - 1)) * 2 - 1
    ny = (y / (ALTURA_DA_VINHETA - 1)) * 2 - 1
    # Dividido pela diagonal do quadrado unitário: 1 no canto, 0 no centro.
    d = np.sqrt(nx**2 + ny**2) / np.sqrt(2)
    t = np.clip((d - INICIO_DA_VINHETA) / (1 - INICIO_DA_VINHETA), 0, 1)
    # Ao quadrado: começa devagar e só fecha mesmo no canto. Linear vê-se como
    # um anel.
    alfa = (t**2) * FORCA_DA_VINHETA
    rgba = np.zeros((ALTURA_DA_VINHETA, LARGURA_DA_VINHETA, 4), dtype=np.uint8)
    rgba[..., 3] = np.round(alfa * 255).astype(np.uint8)
    return rgba


def verificar() -> int:
    """As propriedades que os dois ficheiros têm de ter, medidas."""
    problemas: list[str] = []
    grao, vinheta = fazer_grao(), fazer_vinheta()

    if grao[..., 3].max() > 0.06 * 255:
        problemas.append(f"o grão está forte de mais: alfa máximo {grao[..., 3].max()}")
    claros = (grao[..., 0] == 255) & (grao[..., 3] > 0)
    escuros = (grao[..., 0] == 0) & (grao[..., 3] > 0)
    if abs(int(claros.sum()) - int(escuros.sum())) > 0.06 * grao[..., 3].size:
        problemas.append("o grão está desequilibrado entre claros e escuros")

    centro = vinheta[ALTURA_DA_VINHETA // 2, LARGURA_DA_VINHETA // 2, 3]
    if centro != 0:
        problemas.append(f"a vinheta não é transparente no centro: {centro}")
    if vinheta[0, 0, 3] < 0.5 * 255:
        problemas.append(f"a vinheta não escurece o canto: {vinheta[0, 0, 3]}")

    for caminho in (GRAO, VINHETA):
        if not caminho.exists():
            problemas.append(f"falta {caminho.name} -- corre o script sem --verificar")

    for p in problemas:
        print(f"  FALHOU - {p}")
    if problemas:
        return 1
    print("  ok - o grão é subtil e equilibrado; a vinheta abre no centro e fecha nos cantos")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verificar", action="store_true", help="mede sem escrever")
    args = parser.parse_args()
    if args.verificar:
        return verificar()

    escrever_png(GRAO, fazer_grao())
    escrever_png(VINHETA, fazer_vinheta())
    print(f"escrito {GRAO.relative_to(RAIZ)} ({GRAO.stat().st_size / 1024:.0f} KB)")
    print(f"escrito {VINHETA.relative_to(RAIZ)} ({VINHETA.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
