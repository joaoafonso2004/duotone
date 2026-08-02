# Guia — importar uma playlist do Spotify para o Duotone

> **Estado: incompleto.** As partes 1 e 2 funcionam e estão testadas contra um
> ficheiro real. A parte 3 — o ecrã que junta tudo dentro da app — **ainda não
> está construída**. Hoje consegues exportar do Spotify e o Duotone já sabe ler
> e casar o ficheiro, mas não há ainda um botão para o fazer.

---

## Porque é que isto passa por um ficheiro

O Duotone **não fala com o Spotify**. Não faz login, não guarda tokens, não sabe
quem tu és no Spotify.

A razão é prática: a API do Spotify não dá áudio, só a ficha da faixa. E para
ler as playlists de alguém seria preciso pôr a app em Development Mode (limite
de 25 utilizadores, tecto de 100 faixas por pedido) ou pedir aprovação à
Spotify. O caminho do ficheiro não tem nenhum desses limites.

Por isso o login acontece **no browser, dentro do Exportify** — nunca dentro da
app. Nas definições do Duotone nunca vai aparecer "Spotify — Logged in", porque
seria mentira: não há ligação nenhuma para estar ligada.

---

## Parte 1 — Exportar do Spotify

1. Abre <https://watsonbox.github.io/exportify/>
2. Carrega em **Get Started** (ou "Log in with Spotify").
3. Autoriza no ecrã do Spotify. É o teu login normal, só de leitura — o
   Exportify não consegue alterar nada nas tuas playlists.
4. Aparece a lista das tuas playlists. As **Liked Songs** têm uma linha própria,
   no topo.
5. Carrega no botão de exportar da linha que queres.
6. Guarda o `.csv`.

O ficheiro sai com uma linha por faixa e 19 colunas: URI, nome, artista, álbum,
duração em milissegundos, data de lançamento, ISRC, e mais algumas.

**Os cabeçalhos vêm no idioma da tua conta Spotify.** Numa conta portuguesa dá
`"Nome da faixa"` e `"Duração da faixa (ms)"`, não `"Track Name"`. O leitor
lida com isso — ver a parte 2.

---

## Parte 2 — O que o Duotone faz com o ficheiro

Isto está construído e testado ([spotifyCsv.ts](src/lib/spotifyCsv.ts),
[trackMatch.ts](src/lib/trackMatch.ts)).

### Ler o CSV

As colunas são encontradas **pelo nome**, nunca pela posição — o Exportify tem
campos opcionais que deslocam tudo conforme as caixas que marcares na
exportação.

Quando o cabeçalho vem num idioma desconhecido, há um segundo mecanismo que
identifica as colunas **pelo conteúdo**: os `spotify:track:`, `spotify:artist:`
e `spotify:album:` não são traduzidos, e no ficheiro cada URI é seguido do nome
correspondente. Isso chega para encontrar título, artista e álbum sem perceber
uma palavra do cabeçalho.

Também é tratado o que costuma partir leitores ingénuos: vírgulas dentro dos
títulos, aspas escapadas, o BOM que o Excel cola ao primeiro cabeçalho, e
acentos decompostos (o `á` gravado como `a` + acento).

Se mesmo assim as colunas não forem reconhecidas, a leitura falha de forma
explícita em vez de devolver uma playlist vazia sem explicação.

### Encontrar cada faixa no YouTube

Para cada faixa, uma pesquisa no YouTube e uma escolha entre os resultados. Os
sinais que pesam: canal `- Topic` (upload automático da editora, o mais fiável),
canal com o nome do artista, título que contém o nome da faixa, e a duração —
que é o desempate.

Penalizações para o que não é a gravação original: ao vivo, cover, remix,
karaoke, instrumental, sped up, 8D, e versões alteradas como "Drumless Edition".

Quando a escolha não é clara, a faixa vai para **revisão** em vez de entrar às
cegas. A regra é essa: um erro assinalado corrige-se num toque, um erro
silencioso fica na playlist até alguém dar por ele.

### Taxa de acerto medida

Contra um ficheiro real de 10 faixas, com resultados verdadeiros do YouTube:
**10 em 10 automáticas, todas corretas**.

Mas não leias isso como a taxa real. Eram 10 faixas de rap e eletrónica
mainstream, com uploads oficiais bem identificados — o caso fácil. Música de
nicho, edições regionais e re-uploads fazem a taxa descer.

---

## Parte 3 — O que falta

### O ecrã de importação

Não existe. É a peça que liga tudo: escolher ficheiro → ler CSV → procurar cada
faixa → criar a playlist → mostrar as duvidosas para revisão.

No PC (web/Electron) o `<input type="file">` funciona sem dependência nenhuma.
No telemóvel é preciso instalar o `expo-document-picker`, que ainda não está no
projeto, e o CSV tem de chegar ao telefone primeiro — o Exportify funciona no
browser do telemóvel e o download vai para os Ficheiros/Transferências.

### O problema da quota — ler antes de planear playlists grandes

Cada faixa importada precisa de uma pesquisa na YouTube Data API: **100
unidades**. O tecto grátis é **10.000 por dia**, para a app inteira.

| Faixas | Unidades | Dá para fazer? |
|---|---|---|
| 50 | ~5.050 | sim |
| 99 | ~10.000 | é o limite do dia |
| 1000 | ~101.000 | **não** — dez dias |

Não é um detalhe de afinação, é a viabilidade da funcionalidade. Uma playlist de
1000 faixas não é importável num dia por esta via.

A saída realista é a pesquisa via **InnerTube**, que não consome quota da Data
API e que a app **já usa** para a reprodução ([ytstream.ts](src/api/ytstream.ts)).
É a decisão que falta tomar antes de o ecrã ser construído.

### Além disso, para playlists grandes

- **Ritmo** — pedidos seguidos ao YouTube apanham limitação; é preciso pausas e
  concorrência controlada.
- **Retomar** — se falhar à faixa 700, não pode voltar ao início.
- **Revisão em escala** — a ~20% de dúvida, 1000 faixas dão ~200 por confirmar.
  Ninguém revê 200 à mão; precisa de um modo "aceita tudo, corrijo o que der nas
  vistas".

---

## Ferramentas de diagnóstico

Para inspecionar um CSV sem abrir a app:

```bash
node --experimental-strip-types scripts/check-real-csv.ts caminho/para/ficheiro.csv
```

Mostra os cabeçalhos encontrados, quantas linhas foram lidas e quantas
ignoradas.

Para medir a taxa de acerto contra o YouTube a sério (**gasta quota**: 100
unidades por faixa na primeira passagem; depois fica em cache no disco):

```bash
node --experimental-strip-types scripts/check-match-rate.ts caminho/para/ficheiro.csv
```
