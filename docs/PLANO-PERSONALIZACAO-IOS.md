# Plano: personalizar a app e o leitor (iPhone primeiro)

10/10/2026. Maquete interativa: [`docs/personalizacao-ios.html`](personalizacao-ios.html).

**Hoje** o iPhone só deixa escolher três coisas de aspeto: a cor de destaque (o steel ou a cor da capa), o estilo da capa (Floating 3D ou Simple) e o recuo de 15 s. O resto é fixo.

**O objetivo:** uma página "Customise" nas Definições, com uma pré-visualização do leitor no topo que muda à medida que se escolhe, e temas prontos para quem não quer escolher opção a opção.

## 1. Temas prontos

Um toque muda várias opções de uma vez. Depois, cada opção ainda se pode mudar à mão (o tema passa a "Custom").

| Tema | O que muda |
|---|---|
| **Duotone** (o de hoje) | Capa 3D, fundo desfocado, marca no topo, barra fina |
| **Minimal** | Capa Simple, fundo preto, título à esquerda, barra fina, sem flutuar |
| **Glow** | Capa a toda a largura, fundo desfocado mais forte, destaque pela capa |
| **OLED** | Tudo em preto puro (gasta menos bateria no ecrã do iPhone) |

## 2. A app

| Opção | Escolhas | Nota |
|---|---|---|
| Cor de destaque | Steel e a cor da capa (as que já existem) | Sem paleta: decidido a 10/10, como a 4/9 |
| Fundo | Dark (o de hoje), OLED (preto puro), Tinted (um toque da cor de destaque) | O Tinted segue a capa se o destaque a seguir |
| Listas | Comfortable (linhas de 64 pt, as de hoje), Compact (52 pt, cabem mais músicas) | |
| Títulos | Default, Serif, Mono | Só os títulos grandes das páginas e o do leitor; o resto fica igual |
| Rótulos da barra de baixo | Ligados / desligados | Desligados, a barra fica só com os ícones |
| Home | Esconder e ordenar as secções (Jump back in, Daily mix, New releases, Discover daily, Rare finds…) | |
| Ícone da app | Default, Steel, Gold, Black | Precisa de uma build nativa nova |

## 3. O leitor (Now Playing)

| Opção | Escolhas | Nota |
|---|---|---|
| Capa | Floating 3D, Simple (já existem) + **Full** (a toda a largura, sem margens) | O vinil saiu (10/10) |
| Fundo | Blur (o de hoje), Colour (a cor da capa, lisa), Gradient (duas cores da capa, a mexer devagar), Black | |
| Intensidade do fundo | Mais claro … mais escuro | |
| Topo | A marca (hoje) ou "Playing from" (o G1) | O G1 passa a ser uma opção |
| Título | Ao centro (hoje) ou à esquerda (como no Apple Music) | |
| Barra de progresso | Thin, Thick | A onda saiu: precisava de SVG, que é uma dependência nativa nova |
| Botão play | Filled (hoje), Ring, Icon | |
| Botões de baixo | Escolher até 4: Queue, EQ, Lyrics, Speed, Devices, Timer, Share, Jam | Hoje são o EQ e a fila |
| Flutuar | Ligado / desligado | Só para a capa 3D |
| Letras | Tamanho S / M / L, e abrir já nas letras quando as há | |

## 4. Como se faz

- **Uma preferência só, `pref:aparencia`** (um objeto, em `lib/prefs.ts`), lida por uma store (`state/aparencia.ts`). Cada opção tem quem a leia fora do ecrã: é a regra do `test-definicoes-com-efeito.mjs`.
- **Fica no aparelho, não viaja pela conta**: o iPhone e o PC não se parecem, e um iPad podia querer outra coisa. Não custa nada ao Supabase.
- **As decisões puras num `lib/aparencia.ts`** (os temas, os valores de cada opção, a passagem a "Custom", o máximo de 4 botões, o contraste das cores sobre o fundo), com teste. As cores novas passam no `test-contraste.ts`.
- **A pré-visualização é o leitor a sério em pequeno**: os mesmos componentes, numa caixa, com a música que está a tocar (ou uma de exemplo).
- **Regras que já existem e que isto tem de cumprir**: o leitor do iPhone só muda com o teu OK (este plano é esse pedido); as animações novas (o disco, o gradiente) pedem `pedirFluidez` só durante as transições e param quando não se veem; nenhuma letra abaixo de 11 pt.

## 5. Fases

| Fase | O quê | Build nativa? |
|---|---|---|
| 1 | A página "Customise" com a pré-visualização; temas; cor de destaque, fundo, listas, rótulos; no leitor: topo, título, barra, botão play, botões de baixo, flutuar, fundo (Blur/Colour/Black) e intensidade | Não |
| 2 | Capa Full, fundo Gradient, títulos Serif/Mono, letras, secções da Home (**feita a 11/10**) | Não |
| 3 | Ícones da app | Sim |

**Por confirmar no iPhone**: o gradiente a 120 Hz sem aquecer, e a pré-visualização sem pesar na página das Definições.

## 6. Decidido

- **10/10:** a fase 1 está feita (sem a paleta). O vinil sai. A cor de destaque fica só o steel e a cor da capa.
- **11/10:** a fase 2 está feita. Os temas passam a levar o estilo da capa (Duotone 3D, Minimal e OLED Simple, Glow Full) e já não mexem nos botões de baixo, nas letras nem na Home. O estilo da capa está nas Definições e no Customise.
- Ainda por decidir: se a personalização deve viajar para o PC (proponho que não).
