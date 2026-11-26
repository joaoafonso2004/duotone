# Verificar a 7.2.1 (só iPhone)

A 7.2.0 ficava em "Offline · downloaded liked songs only" com rede (5G). O Supabase respondia bem à 7.2.0; a falha era da app: a sessão não se voltava a pedir quando a rede chegava, e a rede só contava se um pedido ao Google respondesse. Correram o typecheck e os testes da sessão, da rede e do App (39), não a suite inteira; o CI do iOS corre-a antes de compilar.

1. **Abrir a app nos dados móveis** logo depois de instalar: em poucos segundos sai do "Offline" e aparece a biblioteca toda (Liked Songs com todas as músicas, a Home a carregar).
2. **Fechar à força e abrir** outra vez: abre já ligada.
3. **Modo de avião**: com a app aberta, ligar o modo de avião — passa a "Offline" e mostra só as descarregadas; desligar — volta sozinha.
4. **Mudar de Wi-Fi para dados móveis** com a app aberta: não fica presa em "Offline".
