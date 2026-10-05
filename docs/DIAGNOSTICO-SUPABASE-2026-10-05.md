# Duotone — consumo e reprodução, 5 de outubro de 2026

Atualização posterior: os quatro pontos adicionais foram implementados e a
migração incremental aplicada ao projeto. Ver [Quatro pontos de desempenho
e sincronização](QUATRO-PONTOS-2026-10-05.md). Os intervalos e comportamentos
descritos abaixo registam a primeira ronda de correções; o histórico passa
agora a receber deltas quando há uma consulta após 60 segundos.

## O que está confirmado no painel

Consultado diretamente no projeto duotone. Logs em janelas móveis de 24 horas;
as consultas foram feitas entre aproximadamente 02:37 e 03:15 de Lisboa. Os
totais de consultas sucessivas não representam exatamente a mesma janela.

- O aviso de restrição para **22 de outubro** refere **Egress Exceeded no ciclo
  anterior**, não Log Ingestion. O ciclo atual, 3 de outubro–3 de novembro,
  estava em 0,58 GB de egress não servido de cache, de 5 GB incluídos.
- No dia **4 de outubro**, a divisão de egress mostrada pelo painel (inclui
  tráfego servido de cache) era: PostgREST **243,981 MB / 73,2%**; Storage
  **50,188 MB / 15,1%**; Realtime **38,729 MB / 11,6%**; Auth 264,272 KB / 0,1%.
- Log Ingestion: 338,192 MB no dia 4; cerca de 0,594 GB no ciclo atual.
- Na primeira consulta, API Gateway tinha **145 222 eventos** nas últimas 24 h.
  Destes, **106 625** eram pedidos à `yt_cache`, aproximadamente **73,4%**.
  Postgres, Auth e Realtime tinham muito menos eventos: não é uma explosão de
  logs do Postgres nem uma Edge Function a gerar o volume.
- As famílias dominantes da `yt_cache` eram `deezer:vizinhanca:v2` e
  `deezer:artista-faixa:v1`. Windows também acrescenta os pedidos OPTIONS de
  preflight. São consultas repetidas a metadados públicos do catálogo.
- A consulta posterior aos Content-Range das respostas encontrou **447 632
  linhas devolvidas de `user_play_counts`** e **381 541 de `playlist_tracks`**.
  Contagem de linhas não equivale a bytes; os logs não fornecem o tamanho de
  todas as respostas. Estes são focos concretos de respostas grandes e repetidas.
- No Windows 4.4.0 havia 457 GETs de `user_play_counts`, pedindo todos os campos
  do histórico. Também aparecem pedidos de 4.1.7 e 4.2.0 na janela consultada.
- Somar Content-Length nos logs encontrou cerca de 104 MB de imagens em outra
  janela de 24 h, incluindo capas iguais descarregadas dezenas de vezes.
  Este é um limite inferior do tráfego observado, não a faturação completa, e
  não deve ser somado ao gráfico diário como se fosse o mesmo período.

## Causas encontradas no código e correções

### Histórico inteiro depois de cada música

`incrementPlayCount` guardava um delta e chamava `syncUnsafe`, que fazia sempre
`pullRemote`. Cada música provocava nova descarga de todas as contagens, às
páginas de 1000, e nova conversão/serialização do histórico inteiro.

Agora o delta continua a ser enviado imediatamente e a cache local mantém a
contagem atual. O histórico completo é relido na primeira sincronização,
quando se pede uma sincronização explícita ou após meia hora. Uma mudança de
conta invalida a leitura anterior. Uma falha ao enviar os deltas não permite
que a leitura remota apague incrementos locais pendentes.

Isto é uma causa comprovada de tráfego repetido. Não é possível atribuir todos
os 243,981 MB do PostgREST a esta função com os campos disponíveis nos logs.

### Confirmações de artistas repetidas

A biblioteca voltava a confirmar pares ambíguos, incluindo nomes que o catálogo
já tinha rejeitado. A cache em memória tinha 600 entradas, menos do que uma
biblioteca real. Uma passagem expulsava resultados necessários à seguinte.
Fechar a app perdia toda essa cache.

Agora cada par tem uma confirmação partilhada em curso; resultados positivos
e negativos persistem no aparelho, com validade de 30 dias e limites de tamanho.
Os resultados compactos dos pares têm prioridade sobre respostas grandes,
para sobreviverem à leitura da própria biblioteca. Falhas temporárias não são
guardadas como resultados negativos. Dados da conta continuam a consultar o
servidor; esta cache persistente só aceita o espaço de chaves público `deezer:`.

A aprendizagem local da biblioteca também deixou de ser repetida três vezes
por passagem. O próximo relatório inclui tempos síncronos dessas passagens e
contadores de acertos em memória/disco e leituras ao Supabase, apenas locais.

### Imagens iguais descarregadas novamente

Os links assinados de seis horas só existiam em memória. Reiniciar criava um
novo URL para a mesma fotografia. A capa do perfil não usava a cache de disco
explícita do Expo Image. Além disso, a amostragem nativa da cor descarregava a
capa de novo em cada chamada.

Agora os links válidos persistem **por conta**, são eliminados ao terminar a
sessão ou revogar a amizade e não passam para outra conta. A capa usa Expo
Image com cache de disco e chave estável do objeto. As 16 cores amostradas
persistem numa cache pequena, sem tokens, partilhada entre montagens/reinícios.

Estas mudanças não alteram a altura nem o recorte do perfil. O novo
enquadramento foi apresentado apenas como preview.

## Relatório do convidado do Jam

Relatório de iOS 4.5.2, gerado em 2026-10-05T01:16:50.650Z.

- **Lag real:** nove bloqueios acima de 100 ms nos últimos 15 minutos em
  primeiro plano; cinco acima de 500 ms; pior **4443 ms**; total 10 761 ms.
  O pior conjunto ocorreu perto de 01:03:20–01:03:40 UTC, coincidindo com
  pedidos de play, pausa e limpeza da faixa atual. Sem um perfil de execução
  não é possível identificar a função responsável por esses 4,4 s.
- **CPU elevada em primeiro plano:** 41,24% de um núcleo durante 1,5 minutos;
  26,42% no grupo JavaScript. A etiqueta “not playing” é o estado no início
  do intervalo, não prova de que não houve música durante todo o intervalo.
  O texto dos próximos relatórios passa a esclarecer essa limitação.
- **Temperatura:** nominal no início e fim dos intervalos. O relatório não
  demonstra sobreaquecimento nem mede temperatura contínua em graus.
- **Segundo plano a tocar:** 6,81%–7,91% de um núcleo nos intervalos registados;
  sem tocar, 0,01%–0,03%. Variações da bateria são do telefone inteiro e não
  podem ser atribuídas apenas à app.
- O processamento de áudio registado demorou poucos milissegundos, não
  segundos. Não sustenta atribuir os bloqueios à conversão Opus.

### Cortes e pausa no arranque

O convidado começava do zero e a afinação periódica podia fazer seeks poucos
segundos depois. Agora a posição da sala é recalculada **quando o ficheiro está
pronto e antes do primeiro som**, incluindo posições inferiores a 1,5 s. A
recuperação de um arranque parado conserva a posição da sala, em vez de voltar
a zero. Sem relógio válido não se inventa uma posição.

Os comandos de play/seek durante o carregamento já não são enviados ao motor
da faixa anterior. A intenção/autoplay fica preparada para a nova fonte.
Uma confirmação com a fonte pronta continua a forçar play, preservando a
recuperação de um motor parado. As leituras antigas em voo já não substituem
uma confirmação mais recente do Realtime por uma pausa/faixa antiga.

A afinação automática espera confirmação de reprodução e estabilidade inicial,
prefere a posição real do motor e limita a extrapolação de amostras JavaScript
antigas. Se houver um seek de afinação, o próximo relatório regista-o.

O mecanismo é verificável em testes; o desaparecimento dos cortes e da pausa
presa precisa de uma sessão real com dois dispositivos atualizados.

## Validação e rollout

Testes de regressão exercitam uma biblioteca de 1700 pares, 6800 respostas
subsequentes, concorrência, reinício dos módulos, resultados negativos, falhas
de rede, limites de tamanho, TTL, contas separadas, logout, tokens renovados,
cores reutilizadas, incremento imediato sem pull completo, retry idempotente,
paginação acima de 1000 linhas e respostas Jam fora de ordem.

Validação local: `npx tsc --noEmit` passou; `npm test` terminou com **206 scripts
de teste aprovados em 353 s**. A regressão específica de cache/fotos também foi
repetida após o ajuste final de isolamento da conta e aprendizagem dos nomes.

As alterações estão no código local. Não há redução de consumo comprovada em
produção enquanto os clientes não forem atualizados. **É necessário distribuir
a correção no Windows e iOS**, sobretudo porque o Windows domina vários dos
pedidos volumosos observados.

Depois do rollout, comparar períodos equivalentes de utilização: GETs da
`yt_cache`, linhas de `user_play_counts`, volume PostgREST/Storage e Log
Ingestion. Não comparar o total acumulado do ciclo como se pudesse descer:
o que deve baixar é o acréscimo por hora/dia. O painel pode demorar uma hora
a atualizar. Leituras de playlists e metadados do catálogo continuam a ser
outros consumidores a medir; não se promete que toda a quota esteja resolvida.

## Consultas reproduzíveis no Logs Explorer

Selecionar Last 24 hours. Apenas leitura; sem IDs de pessoas ou conteúdo de músicas.

```sql
select log_attributes['request.path'] as path, count() as requests
from logs where source='edge_logs'
group by path order by requests desc limit 30
```

```sql
select log_attributes['request.path'] as path, count() as requests,
sum(if(position(log_attributes['response.headers.content_range'],'-')>0,
toInt64OrZero(extract(log_attributes['response.headers.content_range'],'-([0-9]+)'))
-toInt64OrZero(extract(log_attributes['response.headers.content_range'],'^([0-9]+)'))+1,0)) as rows_sent
from logs where source='edge_logs' and startsWith(log_attributes['request.path'],'/rest/')
group by path order by rows_sent desc limit 20
```

Fontes: [painel de consumo](https://supabase.com/dashboard/org/kgqyfkdgfadopegxhbue/usage),
[definição de egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress),
[Log Ingestion](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest),
[campos dos logs](https://supabase.com/docs/guides/observability/log-field-reference).
