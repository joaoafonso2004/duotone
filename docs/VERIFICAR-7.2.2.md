# Verificar a 7.2.2 (só iPhone)

A 7.2.0 ficava em "Offline · downloaded liked songs only" no Wi-Fi e nos dados móveis. O Supabase respondia bem à 7.2.0, e a rede da app não mudou da 7.1.0 para a 7.2.0. Três correções: o teste de rede passou a ser o do iOS (captive.apple.com) e não o do Google (que um DNS anti-revoke, dos que se usam com o KravaSigner, bloqueia); uma resposta do Supabase também conta como rede; e a sessão volta a ser pedida quando a rede chega. A 7.2.1 foi cancelada no CI antes de sair (faltava-lhe o primeiro destes). Correram o typecheck e os testes da sessão, da rede e do App, não a suite inteira; o CI do iOS corre-a antes de compilar.

1. **Abrir a app no Wi-Fi e nos dados móveis**: sai do "Offline" em poucos segundos e aparece a biblioteca toda.
2. **Fechar à força e abrir** outra vez: abre já ligada.
3. **Modo de avião**: com a app aberta, ligar — passa a "Offline" e mostra só as descarregadas; desligar — volta sozinha.
4. **Mudar de Wi-Fi para dados móveis** com a app aberta: não fica presa em "Offline".
