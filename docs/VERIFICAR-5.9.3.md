# O que verificar no Duotone 5.9.3 (iPhone e Windows)

Passaram a verificação de tipos e os 351 testes, também numa **cópia dos ficheiros com finais de linha CRLF**. Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina. O Swift só o CI compila.

A barra do limite e o nome do perfil foram vistos num harness web, com os componentes verdadeiros. Os toques na barra acertam no degrau. Os arrastos sintéticos do browser param a meio caminho, mas a barra da velocidade (o mesmo gesto, já validado no iPhone) para no mesmo sítio: é do harness. Mesmo assim, o arrasto confirma-se no iPhone (ponto 2 do iPhone, em baixo).

As notas levam `Minimum version: 5.9.3`: todas as versões desde a 5.8.8 veem o aviso de atualização obrigatória, sem "Not now".

## No Supabase (SQL Editor), por esta ordem

1. **Antes de publicar, ou logo a seguir.** A app aguenta sem eles, e podem correr-se outra vez sem problema.
   - `supabase/presenca-ao-vivo.sql`: a presença dos amigos pelo Realtime. Sem ele, a presença fica na base de dados, como na 5.9.2.
   - `supabase/registar-escutas.sql`: a escuta num pedido só. Sem ele, a app usa os pedidos de antes e volta a experimentar a função de 6 em 6 horas.
2. **Só depois de as duas builds estarem publicadas**: o `.ipa` na release `ios-v5.9.3` e o instalador na `win-v5.9.3`.
   - Correr `supabase/versao-minima.sql`. Sobe a mínima do servidor de 5.8.8 para 5.9.3, e daí em diante as versões abaixo recebem 426.
   - Correr antes disso deixava quem está na 5.9.2 sem app e sem para onde atualizar.
   - O mesmo ficheiro mantém a recusa das contas banidas (403).
   - Depois de correr: a tua 5.9.3 abre e carrega tudo.

## As duas plataformas

1. **Escutas e contagens.** Ouve duas ou três músicas até contarem (metade, ou 4 min).
   - O "Most played" e o perfil deste aparelho sobem logo.
   - Noutro aparelho sobem até 10 min depois, ou quando a app vai para segundo plano.
   - Com o `registar-escutas.sql` corrido: na vista por caminho da última hora (só a última hora) aparece `rpc/registar_escutas`. Do teu aparelho deixam de aparecer `upsert_catalog_tracks`, `plays`, `faixas_comecadas` e `apply_play_count_deltas`.
2. **Presença.** Com dois amigos, cada um no seu aparelho:
   - o amigo aparece "Online", e a música dele muda em poucos segundos;
   - o "Listen along" continua a seguir.
3. **"New to you" no Rare Finds.** Uma música saltada aos dez segundos não volta a aparecer como nova.
4. **Atualização obrigatória.** Com uma versão entre a 5.8.8 e a 5.9.2, o aviso aparece sem "Not now". O PC, além disso, instala-a sozinho quando está parado.

## iPhone

1. **O coração do leitor.** Mostra logo se a música está guardada, sem piscar. Guardar e tirar continuam a funcionar, também numa música guardada noutro aparelho.
2. **O limite do armazenamento** (Definições › Storage, entre Downloads e Clear cache).
   - A barra começa nos 300 MB, onde está a marca.
   - Arrastada, vai de 10 MB a Unlimited, com um toque por degrau, e só muda ao largar.
   - Abaixo do que já está guardado, pergunta antes ("Lower the storage limit?"). Com "Lower limit", o número dos Downloads desce logo; com "Cancel", a barra volta para trás.
   - Fecha e abre a app com 2 GB ou Unlimited: nada desaparece no arranque.
   - O rodapé do ecrã de Downloads diz o limite escolhido.
3. **O IPA no aviso de atualização.** Só se vê quando sair uma versão depois da 5.9.3: as anteriores não têm o botão.
   - O aviso tem "Download IPA" por cima de "Open Sideloadly".
   - O Safari descarrega o `Duotone.ipa` da release (o link vem do `versions.json` do portfólio), e nos Ficheiros abre-se no SideStore ou no AltStore.
4. **O nome no topo do perfil.** Rola o teu perfil até o nome aparecer na barra de cima.
   - Fica à esquerda e acaba antes do botão das conversas, com reticências se for comprido.
   - No perfil de um amigo fica ao centro, entre o voltar e as estatísticas.

## Fora da app

- O `test-o-que-mudou-sql.mjs` falhava às vezes com a máquina carregada: comparava duas horas arredondadas ao milissegundo. Passou a compará-las ao microssegundo. Só mudou o teste.
