# Plano: pesquisa, fila, perfil e navegação

Onze pontos reportados a 8 de setembro de 2026, sobre a build `ios-v2.3.0`.
Não são onze problemas independentes — há causas partilhadas, e agrupá-las
muda a ordem por que vale a pena atacá-los.

---

## O que está mesmo avariado, e porquê

### R1. O pré-download segue a fila errada depois de reordenar
**Pontos 9 e 10.**

O efeito do Smart Cache, em `src/components/YouTubePlayerView.tsx:1477`,
depende de:

```
[track.sourceId, backend, queue, queueIndex, shuffle, repeatMode, sessaoJam, filaJam]
```

Falta ali o `shuffleOrder`. Enquanto reordenar só era possível com o shuffle
desligado, isso não tinha consequência — mexer na fila mexia no `queue`, que
está nas dependências. Ao fazer o arrasto funcionar também com o shuffle
ligado (commit `4ca12d2`), o `reordenarProximas` passou a escrever no
`shuffleOrder` e mais nada. O efeito não volta a correr, o `proximaFaixa()`
que ele leu continua a ser o antigo, e descarrega-se a música que **estava**
a seguir em vez da que passou a estar.

Isto é uma regressão minha, e é a causa do ponto 9 inteiro.

O ponto 10 é o que acontece a seguir: chega-se a uma faixa sem ficheiro, e
cai-se no encravamento nos 0:00 que já conhecemos. A rede que escrevi para ele
(`src/lib/arranqueTravado.ts`) está pendurada no `useSincroniaDaSessao`, que
só corre **dentro de uma sessão**. A ouvir sozinho não há rede nenhuma — o
mesmo sintoma, sem ninguém a apanhá-lo.

### R2. O arrasto foi calibrado sem o testar com uma fila real
**Ponto 11.**

Dois defeitos, ambos meus:

- **Um segundo é demasiado.** Escolhi 1000 ms para não colidir com o toque
  longo de 350 ms das outras listas. O raciocínio estava certo e o número
  errado: 350 ms já é um toque longo confortável, e o dobro disso chega para
  separar os dois gestos. Fica em 500 ms.
- **Não há deslize nas bordas.** O `scrollEnabled={arrastar === null}` desliga
  a lista inteira durante o arrasto, o que impede o dedo de puxar a lista.
  Numa fila de 53 músicas, só se consegue mover uma linha dentro do que está
  visível — que é o mesmo que não se conseguir movê-la.

### R3. A pesquisa mostra pouca música e no formato errado
**O pedido de topo, mais os pontos 1 a 5.**

`POR_PRATELEIRA = 14` em `src/state/recomendacoes.ts:64`, mas o que se vê é
menos: a primeira secção corta em três linhas (`LINHAS_NA_LISTA`), e o dedupe
entre prateleiras tira faixas às de baixo. Quem está à procura de música fica
com meia dúzia por secção.

E o formato da primeira secção está a meio caminho: é uma lista vertical de
três, quando o desenho de referência é uma lista **paginada na horizontal** —
três linhas por página, e desliza-se para a direita para ver as três
seguintes. É isso que faz caber vinte músicas no espaço de três.

### R4. Duas coisas sem retorno no perfil
**Pontos 6 e 7.**

- `src/components/SocialProfileView.tsx:233` — o botão de tirar uma playlist
  copiada está dentro de `{!own && ...}`. No perfil de outra pessoa dá para
  tirar a tua cópia; no teu próprio perfil, não há botão nenhum. Uma playlist
  que se põe e não se tira.
- `src/components/SocialProfileView.tsx:203` — o "recently played" mostra
  `toLocaleDateString` com dia e mês. Numa lista do que ouviste há pouco, a
  data não acrescenta nada e rouba a linha ao que interessa.

### R5. Trocar de separador a arrastar precisa de uma dependência nativa
**Ponto 8.**

O `@react-navigation/bottom-tabs` não desliza, por desenho. Para deslizar é
preciso `react-native-pager-view` — uma dependência **nativa**, que obriga a
uma build nova e passa a ter voz em cada actualização de Expo.

Não é caro nem arriscado como o `reanimated` era, mas é uma decisão que não
tomo sozinho: é a primeira dependência nativa que entra nesta app desde há
muito. **Fica em espera até dizeres.** Ver a onda 6.

---

## As ondas

### Onda 1 — A regressão do pré-download `[~40 min]`

Primeiro porque é regressão minha, e porque é a que estraga a audição.

1. Acrescentar `shuffleOrder` às dependências do efeito do Smart Cache.
2. Escrever o teste que falta: reordenar a fila com o shuffle ligado tem de
   mudar o que o `proximaFaixa()` devolve. Provar que falha antes da correcção
   — sem isso não se sabe se o teste apanha alguma coisa.
3. Varrer o ficheiro à procura de outros efeitos que leiam `proximaFaixa()`
   sem depender do `shuffleOrder`. Há três chamadas (`:494`, `:1180`, `:1423`)
   e só verifiquei uma.

### Onda 2 — A rede do 0:00 também para quem ouve sozinho `[~40 min]`

O `arranqueTravado.ts` já existe, já está testado, e a decisão que ele toma
não depende de haver sessão nenhuma — só o sítio onde está pendurado é que
depende.

1. Mover a vigia do `useSincroniaDaSessao` para um sítio que corra sempre.
2. Ajustar a condição: fora de uma sessão não há `sessaoATocar`, e o que a
   substitui é a intenção do utilizador mais o ficheiro estar cá.
3. O remédio é o mesmo — seek e depois tocar, por essa ordem.

Nota honesta: continuo sem saber a causa do encravamento. Isto continua a ser
um remédio, e alarga-o a quem ouve sozinho em vez de o explicar.

### Onda 3 — O arrasto utilizável `[~1 h 30]`

1. Activação a 500 ms.
2. **Deslize nas bordas.** Enquanto uma linha está pegada e o dedo está nos
   60 px de cima ou de baixo da lista, a lista desliza sozinha, com a
   velocidade a crescer com a proximidade da borda. Precisa da posição
   absoluta do dedo (não do `dy`), de uma referência ao `FlatList` para o
   `scrollToOffset`, e de saber onde a lista começa e acaba no ecrã.
3. O destino tem de contar com o quanto a lista deslizou entretanto — sem
   isso a música aterra onde o dedo está, e não onde ela parece estar.
4. Teste para a conta nova do destino com deslize, no `arrastarFila.ts`.

### Onda 4 — A pesquisa com música que chegue `[~2 h]`

1. **Mais música por prateleira.** `POR_PRATELEIRA` de 14 para 30. Verificar
   quanto é que cada fonte devolve mesmo — o `descobrirNovas` depende do
   catálogo e do YouTube e pode ser ele o tecto real, e nesse caso o número
   aqui não muda nada.
2. **Primeira secção paginada na horizontal**: três linhas por página,
   desliza-se para a direita. É o formato da referência e é o que põe vinte
   músicas onde cabiam três.
3. **Fora os ícones** antes dos títulos das secções.
4. **Fora o "Daily flow"** — a prateleira deixa de ser pedida, não só
   escondida, senão continua a gastar uma ida à rede para nada. Sai da
   `ORDEM_DAS_PRATELEIRAS`, e o dedupe passa a distribuir por cinco.
5. **Nova ordem**: Discover new · Never released · Playlists · Listen again ·
   Heavy rotation · Forgotten favourites.

### Onda 5 — Playlists geradas `[~2 h 30]`

O ponto 3 é o único que precisa de coisa nova, e menos do que parece: as
faixas já existem nas prateleiras. O que não existe é a ideia de uma
**playlist** — uma coisa com nome, capa e uma página própria.

1. Derivar 3 a 5 playlists do que já há: por artista-âncora ("À volta de
   2hollis"), por período, por afinidade.
2. **Capas** — o `src/lib/celulasDaCapa.ts` já monta mosaicos de capas.
   Reaproveitar em vez de inventar.
3. Caixas maiores do que as do "Never released", como pedido.
4. Tocar numa abre a `PrateleiraScreen`, que já existe e já serve.

### Onda 6 — Deslizar entre separadores `[bloqueado]`

Não avanço sem tu decidires. Precisa do `react-native-pager-view`, que é
nativo. Se disseres que sim, entra com a onda seguinte de build.

### Onda 7 — As três do perfil `[~45 min]`

1. Mostrar o botão de remover também no perfil próprio (`{!own}` sai).
2. Tirar a data do "recently played".
3. **A caixa da "song of the moment"** — os cantos arredondados não agradam.
   Acrescentado a 8 de setembro, depois do plano escrito. A decidir com o
   desenho à frente: ou a caixa perde o raio e passa a assentar numa linha
   fina, ou desaparece de todo e a faixa fica solta sobre o fundo. A segunda
   é mais coerente com o resto da app, onde o cartão é usado para separar
   objectos e não para emoldurar um só.

### Onda 8 — A disposição depois das playlists `[~30 min]`

Ponto 5, deixado ao meu critério com uma exclusão: sem os quadrados de antes.
Proposta: linhas largas com capa pequena à esquerda, título e artista, e a
duração à direita — o mesmo que a fila de reprodução usa. Já é uma forma que
existe na app, e quebra a monotonia dos carrosséis sem inventar um padrão
novo.

---

## O que fica por decidir

- **Onda 6** — a dependência nativa. Só tu.
- **O tecto real da descoberta.** Se o `descobrirNovas` só conseguir devolver
  oito faixas, subir o `POR_PRATELEIRA` não resolve o "só 5 músicas", e o
  trabalho é outro: alargar a busca no catálogo. Mede-se na onda 4 antes de
  se decidir.

## Como isto se verifica

Cada onda fecha com `npm run typecheck && npm test && npm run lint` a zero.
As ondas 1, 3 e 4 levam testes novos; a 1 e a 3 têm de falhar antes da
correcção, e isso prova-se repondo o bug — como se fez no `test-jam-store` e
no `test-arrastar-fila`.

O que nenhum teste aqui apanha, e só tu no telemóvel: se o arrasto com deslize
nas bordas é agradável, e se a pesquisa passou a parecer cheia.
