Duotone iOS 5.4.4 — o AutoMix, a fila e um leitor mais leve

Melhorado:
- O AutoMix reconhece melhor a batida de músicas com muita voz: quando a confiança fica perto do limite, confirma se o andamento é estável nas duas metades da análise antes de decidir a passagem.
- Músicas com andamentos a menos de 4 % podem acertar-se pela velocidade da que entra, para uma passagem na batida. A velocidade escolhida para essa música volta no fim da transição.
- O leitor evita redesenhos repetidos durante a reprodução, as letras atualizam só as linhas que mudam e a barra de progresso reutiliza as suas animações.
- Ao abrir a Queue, a capa 3D e a barra do leitor ficam paradas por trás da folha, e a letra deixa de fazer scroll escondida, aliviando o trabalho enquanto se arrasta a aba.

Corrigido:
- Segurar uma música depois de descer na Queue já não faz a lista descer sozinha. O scroll nas bordas só começa depois de mover o dedo.
- As três barras de reordenar saíram da Queue: para mover uma música, segura-a durante meio segundo e arrasta.

A redução do consumo de memória e a fluidez da aba precisam de comparação no iPhone. A análise do AutoMix continua local, sem pedidos a servidores.

Verificações recomendadas: https://github.com/joaoafonso2004/duotone/blob/ios-v5.4.4/docs/VERIFICAR-5.4.4.md
Comparar com iOS 5.4.3: https://github.com/joaoafonso2004/duotone/compare/ios-v5.4.3...ios-v5.4.4
