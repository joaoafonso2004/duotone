# Verificar a 7.3.0 (só iPhone)

Três coisas, todas de 27/11, depois da 7.2.8: a capa da playlist que ainda pousava abaixo, segurar um preset fechava a app, e o Liquid Glass refeito.

A capa: a página da playlist começava com o espaço de cima de um ecrã com título grande (44 pt a mais), a capa dela media-se nesse primeiro desenho, e a que voa ia para essa medida; o espaço corrigia-se a seguir e a página subia. Agora começa com o espaço da barra dela, e a capa mede-se outra vez dois fotogramas depois.

Os presets: o toque longo chega com o alvo do toque já a null, e medi-lo rebentava. Cada preset mede-se pela sua vista.

O Liquid Glass: duas cápsulas como a barra do iOS 26 (os separadores em baixo, 62 pt a 21 das bordas e do fundo; a música por cima), o raio no próprio vidro, a cápsula do separador escolhido a seguir o pager, e um esbatido escuro por trás. `lib/vidroDaBase.ts`.

Correram o typecheck e a suite inteira numa cópia dos ficheiros com CRLF.

1. **Abrir uma playlist pelo quadrado** (a do carro, e uma de mosaico): a capa pousa no sítio, sem tapar o título nem saltar para cima.
2. **Customise › segurar um preset**: abre o menu (Rename, Update to current look, Delete preset), sem fechar a app. Aplicar um preset, mudar uma opção, segurar o preset › Update to current look: o preset fica com o aspeto novo.
3. **Liquid Glass** (iOS 26, Customise › App): em baixo, a cápsula dos separadores solta das bordas, com uma cápsula clara por trás do escolhido; por cima, a música noutra cápsula da mesma largura.
4. **Deslizar entre separadores**: a cápsula do escolhido anda com o dedo. Tocar num separador: desliza até ele. Arrastar para lá do Perfil (o Social): a cápsula apaga-se.
5. **Com música**: abrir o leitor a partir do mini e fechá-lo: a capa sai e volta ao sítio da capa no mini. Fechar a música a deslizar o mini: a cápsula da música apaga-se.
6. **Uma página sem separadores e um ecrã sem a base** (Definições): as cápsulas descem e voltam como a base de sempre.
7. **O fim das listas e os avisos** (um "Undo", por exemplo) ficam por cima das cápsulas.
8. **Os botões de baixo do leitor**: a cápsula de vidro com as pontas redondas inteiras.
9. **Liquid Glass desligado**: tudo como antes.
