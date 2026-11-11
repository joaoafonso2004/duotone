# O que verificar no Duotone 5.9.0

Passaram a verificação de tipos e os 345 testes, numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina.

## Windows

1. **A primeira atualização que se instala sozinha.** A 5.9.0 é a primeira que chega a quem já tem a 5.8.9, que traz a instalação sem reabrir. Com a 5.8.9 aberta no tabuleiro e nada a tocar, a 5.9.0 tem de se instalar sozinha entre 10 e 20 minutos depois de a música parar (o download pode demorar uns minutos antes). A app volta para o tabuleiro, sem a janela aparecer. Se estiver aberta e o PC sem uso há 10 minutos, volta minimizada. **É a primeira vez que este caminho corre fora dos testes.**
2. **Settings › About:** "Support Duotone" abre o ko-fi.com/zjoaoafonso no browser, e "Privacy & terms" abre a página de privacidade. O texto das atualizações fala do tabuleiro.
3. **Ecrã de entrar** (com a sessão terminada): por baixo do botão, "By continuing, you agree to the Privacy & terms.", e a ligação abre a página.

## iPhone

1. **Abre na Home.** Fechar a app de vez e voltar a abrir: abre na Home, com e sem rede (antes abria quase sempre nas Liked Songs).
2. **Definições › About:** "Support Duotone" e "Privacy & terms" abrem as páginas no Safari.
3. **Ecrã de entrar:** a frase da privacidade por baixo do botão, com a ligação.
