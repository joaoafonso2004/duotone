# O que verificar no Duotone 5.4.4

Passaram a verificação de tipos e os 277 testes, também numa cópia com finais de linha CRLF (318 s na pasta principal; 322 s na cópia). As correções da fila foram verificadas com gestos, medidas e relógio simulados; a fluidez e o som precisam do iPhone. Esta versão não altera Swift.

## iPhone — a Queue

- Abre a Queue e arrasta a aba entre meia altura e o ecrã inteiro, com a capa 3D e depois com as letras atrás. Compara a fluidez com a 5.4.3. Ao fechar, o leitor deve retomar o movimento e a letra na posição da música.
- As três barras ao lado das músicas desapareceram. Um toque continua a tocar; segura meio segundo e arrasta para reordenar. Segurar e largar sem mover não toca a música.
- Desce bastante na fila e segura uma música a meio do ecrã, sem mexer: a lista deve ficar parada. Repete junto às bordas.
- Depois de agarrar, leva o dedo até à borda inferior ou superior: a lista deve rolar nessa direção e a música aterrar no lugar indicado. Larga ou fecha a folha e confirma que o scroll pára.
- Confirma que o shuffle respeita a ordem mostrada e que a fila de um Jam ou de um amigo continua só para leitura aqui.

## iPhone — o AutoMix

Liga o AutoMix, usa músicas já no iPhone e deixa-as acabar sozinhas. Saltar à mão não testa a transição automática.

- Volta ao rap/trap do relatório da 5.4.3: uma confiança entre 2,3 e 3 só pode ser aceite se o andamento for estável. Compara as passagens com as que antes diziam "low confidence" e caíam em "suave".
- Experimenta duas músicas com andamentos próximos, como 100 e 102 BPM. O relatório pode indicar "next nudged" e a passagem na batida, em vez de um corte curto. A música que entra deve voltar à velocidade escolhida depois da passagem, sem estalos.
- Inclui uma intro sem batida e músicas de andamentos diferentes. Confirma que a escolha continua musical: a estabilidade permite mais planos, mas não garante uma passagem perfeita entre quaisquer duas músicas.
- Partilha o relatório depois de várias passagens, incluindo as que soem mal.

## iPhone — memória e resposta

- Com áudio já em cache, usa durante pelo menos cinco minutos o mesmo percurso do relatório anterior: leitor fechado, aberto e letras à vista. Compara alocações/min, coleções/min, tempo de recolha e paragens de JavaScript.
- O relatório anterior mostrava cerca de 652 MB/min de alocações e 124 MB de memória naquele instante. Alocações não são crescimento de memória retida. O ensaio local mede só uma parte do caminho da store em Node; não permite prometer uma percentagem de redução no iPhone.
- Pausa, retoma, muda de música e procura uma posição. O progresso e o indicador de carregamento devem continuar certos.

## Windows

- Confirma que a atualização chega e que a app abre e toca.
- Abre as letras, deixa avançar vários versos e toca noutro verso. A linha ativa e a procura devem continuar certas.
- Pausa, retoma e procura uma posição na música.
