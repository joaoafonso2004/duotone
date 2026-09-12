"""
Gera o "portal" da saída da abertura: o logo com o vazio do meio RECORTADO.

    python scripts/gerar-portal-da-abertura.py
    python scripts/gerar-portal-da-abertura.py --verificar

## O que é

A abertura acabava com o véu a desaparecer e o logo a crescer 4%. Passa a
acabar com o logo a vir na direção do ecrã: cresce depressa e a app aparece
pelo vazio que ele tem no meio, até esse vazio encher o ecrã.

Para isso é preciso uma imagem que seja OPACA em todo o lado menos no vazio --
o contrário do `abertura.webp`, que é o logo sobre transparência. Aqui o fundo
da abertura é pintado por cima de toda a tela e só o buraco fechado do logo
fica a zero; ampliá-la é abrir uma janela para a app que está por baixo.

## A GEOMETRIA É A DO WEBP, e é por isso que este ficheiro o importa

As duas imagens entram no MESMO quadrado na app, uma por cima da outra, e a
saída troca-as: a de baixo pára no último fotograma e a de cima acende-se. Se
o logo não estiver exatamente no mesmo sítio e com o mesmo tamanho nas duas,
essa troca vê-se -- e vê-se muito.

Foi o que aconteceu na primeira versão: o `gerar-abertura.py` desenha o logo a
**2/3 da tela** (`k = (CANVAS * 2/3) / LARGURA_LOGO`, centrado em `MEIO`) e
aqui o logo enchia os 720 px. Ao começar a ampliação o logo dava um salto de
1,5x, como se aparecesse uma segunda camada por cima. Daí importar-se o outro
gerador em vez de repetir os números: a geometria passa a vir de um sítio só, e
se alguém mexer nos discos lá, isto acompanha. O `--verificar` compara as
caixas do conteúdo das duas imagens, que é o que apanha esta classe de erro.

## O buraco é medido, não desenhado

O vazio sai do ALFA do próprio logo (`logo_windows.png`), pela região
transparente que NÃO toca as bordas -- a de fora é o resto da imagem. São
324x600 px em 1254, e depois de reduzido à escala do WebP é isso que o
`src/lib/abertura.ts` precisa de saber para calcular quanto tem de crescer até
encher um ecrã qualquer. O `--verificar` compara os dois: se alguém regenerar
o ficheiro com outro logo, o número no código deixa de bater certo e o teste da
abertura acusa.

## E fica CENTRADO no buraco

O vazio do logo não está exatamente no meio da imagem. Numa ampliação de 30x um
desvio de 2 px seriam 60 px, com a app a aparecer fora do centro do ecrã. A
tela é deslocada para o centro do BURACO ficar no centro da imagem; o logo é
que fica esses 2 px descaído, e a 0,9 px no ecrã isso ninguém vê -- ao
contrário do salto de 1,5x.

Precisa de numpy, scipy e do ffmpeg no PATH -- o mesmo que o
`gerar-abertura.py`, que lê o logo da mesma maneira.
"""
from __future__ import annotations

import argparse
import importlib
import re
import struct
import sys
import zlib
from pathlib import Path

import numpy as np
from scipy import ndimage

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "assets" / "abertura-portal.png"
TEMPOS = RAIZ / "src" / "lib" / "abertura.ts"

# O gerador do WebP. Ao importar, ele mede o logo (ffmpeg + ajuste dos dois
# discos) -- é dessa medição que sai a geometria que as duas imagens partilham.
sys.path.insert(0, str(Path(__file__).resolve().parent))
GA = importlib.import_module("gerar-abertura")

# O fundo da abertura, pintado na própria imagem. É o mesmo nas duas
# plataformas de propósito: com a cor dentro do ficheiro, as tiras que tapam o
# resto do ecrã têm de usar exatamente esta -- e duas cores quase iguais dariam
# uma emenda visível na ampliação.
FUNDO = (6, 6, 8)

# Abaixo disto o pixel do logo conta como vazio.
LIMIAR_DE_ALFA = 8

# A borda do buraco, em píxeis do ficheiro final. A imagem vai ser ampliada
# trinta vezes e um recorte a direito ficava serrilhado. Desfoca-se ANTES de
# reduzir (daí dividir pela escala), senão a redução comia a borda suave.
SUAVIZAR = 1.2


def escrever_png(caminho: Path, rgba: np.ndarray) -> None:
    altura, largura, _ = rgba.shape
    linhas = b"".join(b"\x00" + rgba[y].astype(np.uint8).tobytes() for y in range(altura))

    def pedaco(tipo: bytes, dados: bytes) -> bytes:
        return (struct.pack(">I", len(dados)) + tipo + dados
                + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF))

    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + pedaco(b"IHDR", struct.pack(">2I5B", largura, altura, 8, 6, 0, 0, 0))
        + pedaco(b"IDAT", zlib.compress(linhas, 9))
        + pedaco(b"IEND", b"")
    )


def buraco_do_logo(alfa: np.ndarray) -> np.ndarray:
    """A região transparente FECHADA -- a que não toca nenhuma borda."""
    etiquetas, quantas = ndimage.label(alfa <= LIMIAR_DE_ALFA)
    nas_bordas = set(etiquetas[0, :]) | set(etiquetas[-1, :]) | set(etiquetas[:, 0]) | set(etiquetas[:, -1])
    dentro = [i for i in range(1, quantas + 1) if i not in nas_bordas]
    if not dentro:
        sys.exit("o logo não tem vazio fechado no meio -- sem isso não há portal")
    maior = max(dentro, key=lambda i: int((etiquetas == i).sum()))
    return etiquetas == maior


def amostrar_como_o_webp(textura: np.ndarray) -> np.ndarray:
    """
    Põe uma imagem do tamanho do logo na tela da abertura.

    É a conta do `fotograma()` do `gerar-abertura.py` com a escala no fim da
    animação: o logo a 2/3 da tela, centrado em `MEIO`. Bilinear como lá, para
    as duas imagens terem o mesmo serrilhado na mesma borda.
    """
    k = (GA.CANVAS * 2 / 3) / GA.LARGURA_LOGO
    c = (GA.CANVAS - 1) / 2
    yy, xx = np.mgrid[0:GA.CANVAS, 0:GA.CANVAS].astype(np.float64)
    coords = [GA.MEIO[1] + (yy - c) / k, GA.MEIO[0] + (xx - c) / k]
    if textura.ndim == 2:
        return ndimage.map_coordinates(textura, coords, order=1, mode="constant")
    return np.stack([
        ndimage.map_coordinates(textura[..., ch], coords, order=1, mode="constant")
        for ch in range(textura.shape[2])
    ], axis=-1)


def sobre_o_fundo(premultiplicado: np.ndarray) -> np.ndarray:
    """O logo (alfa pré-multiplicado, 0..1) por cima do fundo da abertura."""
    fundo = np.array(FUNDO, dtype=np.float64) / 255.0
    return premultiplicado[..., :3] + fundo * (1 - premultiplicado[..., 3:4])


def caixa_do_conteudo(cor: np.ndarray) -> tuple[int, int, int, int]:
    """
    A caixa do que não é fundo.

    É a medida que apanha o defeito da primeira versão: se o logo estiver a
    outra escala, a caixa muda e as duas imagens deixam de casar.
    """
    fundo = np.array(FUNDO, dtype=np.float64) / 255.0
    marca = np.abs(cor - fundo).max(axis=-1) > (6 / 255)
    ys, xs = np.where(marca)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def fazer_portal() -> tuple[np.ndarray, dict[str, float], np.ndarray]:
    escala = (GA.CANVAS * 2 / 3) / GA.LARGURA_LOGO

    # O logo na tela da abertura, exatamente como o último fotograma do WebP.
    cor = sobre_o_fundo(amostrar_como_o_webp(GA.PM))

    # O buraco: medido no logo, desfocado lá e só depois trazido para a tela.
    buraco = buraco_do_logo(GA.ALFA * 255).astype(np.float64)
    buraco = ndimage.gaussian_filter(buraco, sigma=SUAVIZAR / escala)
    buraco = np.clip(amostrar_como_o_webp(buraco), 0, 1)

    # Centrar a tela no BURACO, não no logo.
    dentro = buraco > 0.5
    if not dentro.any():
        sys.exit("o buraco desapareceu na redução -- a escala do WebP mudou?")
    ys, xs = np.where(dentro)
    meio = (GA.CANVAS - 1) / 2
    desvio_y = int(round(meio - (ys.min() + ys.max()) / 2))
    desvio_x = int(round(meio - (xs.min() + xs.max()) / 2))
    cor = np.roll(cor, (desvio_y, desvio_x), axis=(0, 1))
    buraco = np.roll(buraco, (desvio_y, desvio_x), axis=(0, 1))

    portal = np.zeros((GA.CANVAS, GA.CANVAS, 4), dtype=np.uint8)
    portal[..., :3] = np.clip(cor * 255, 0, 255).astype(np.uint8)
    # O alfa é 255 em todo o lado menos no buraco.
    portal[..., 3] = np.clip((1 - buraco) * 255, 0, 255).astype(np.uint8)
    # A moldura tem de ficar OPACA: é ela que tapa o ecrã enquanto o buraco não
    # chega lá.
    portal[0, :, 3] = portal[-1, :, 3] = portal[:, 0, 3] = portal[:, -1, 3] = 255

    medidas = {
        "larguraDoBuraco": round(float(xs.max() - xs.min() + 1) / GA.CANVAS, 4),
        "alturaDoBuraco": round(float(ys.max() - ys.min() + 1) / GA.CANVAS, 4),
    }
    return portal, medidas, cor


def constantes_do_codigo() -> dict[str, float]:
    texto = TEMPOS.read_text(encoding="utf-8")
    saida: dict[str, float] = {}
    for nome in ("larguraDoBuraco", "alturaDoBuraco"):
        m = re.search(rf"{nome}:\s*([\d.]+)", texto)
        if not m:
            sys.exit(f"falta a constante {nome} em src/lib/abertura.ts")
        saida[nome] = float(m.group(1))
    return saida


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verificar", action="store_true", help="mede sem escrever")
    args = parser.parse_args()

    portal, medidas, cor = fazer_portal()

    if args.verificar:
        problemas: list[str] = []
        if not SAIDA.exists():
            problemas.append("falta assets/abertura-portal.png -- corre o script sem --verificar")
        codigo = constantes_do_codigo()
        for nome, valor in medidas.items():
            if abs(codigo[nome] - valor) > 0.005:
                problemas.append(f"{nome}: o código diz {codigo[nome]}, a imagem dá {valor}")
        meio = portal[portal.shape[0] // 2, portal.shape[1] // 2, 3]
        if meio != 0:
            problemas.append(f"o centro do portal não está aberto (alfa {meio})")
        if portal[0, 0, 3] != 255 or portal[-1, -1, 3] != 255:
            problemas.append("os cantos do portal têm de ser opacos: é o véu")

        # O que falhava na primeira versão: o logo entrava 1,5x maior do que o
        # último fotograma do WebP e a troca das imagens dava-se a ver.
        do_webp = caixa_do_conteudo(sobre_o_fundo(GA.fotograma(GA.DURACAO, GA.CANVAS)))
        do_portal = caixa_do_conteudo(cor)
        desvios = [abs(a - b) for a, b in zip(do_webp, do_portal)]
        if max(desvios) > 4:
            problemas.append(
                "o logo do portal não casa com o do WebP: caixa "
                f"{do_portal} contra {do_webp} (desvio máximo {max(desvios)} px)"
            )

        for p in problemas:
            print(f"  FALHOU - {p}")
        if problemas:
            return 1
        print(f"  ok - o buraco mede {medidas['larguraDoBuraco']}x{medidas['alturaDoBuraco']} da tela, "
              "o centro está aberto e os cantos tapados")
        print(f"  ok - o logo casa com o do abertura.webp (desvio máximo {max(desvios)} px)")
        return 0

    escrever_png(SAIDA, portal)
    print(f"escrito {SAIDA.relative_to(RAIZ)} ({SAIDA.stat().st_size / 1024:.0f} KB)")
    print(f"buraco: {medidas['larguraDoBuraco']} de largura, {medidas['alturaDoBuraco']} de altura "
          "(fração da tela) -- tem de bater com o PORTAL em src/lib/abertura.ts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
