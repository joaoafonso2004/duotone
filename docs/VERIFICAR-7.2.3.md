# Verificar a 7.2.3 (só iPhone)

Duas mudanças, as duas de um comentário no Reddit. A música para onde se salta e a seguinte descarregam os bocados 3 a 3 depois do primeiro (eram um de cada vez: um skip para uma que não estava no telemóvel esperava 5+ s). E a folha de importar do Spotify diz em que conta se entrou, com um "Use another account" que apaga a sessão do Spotify (módulo nativo novo, `duotone-sessao-web`) e abre o login. Correram o typecheck e os testes do download e do Spotify, não a suite inteira; o CI do iOS corre-a antes de compilar. O Swift novo só o CI compila.

1. **Saltar várias seguidas** (4-5 skips rápidos numa playlist que não está descarregada): cada uma começa mais depressa do que na 7.2.2, e nenhuma fica com som partido ou a meio.
2. **Saltar logo no início de uma música**: a seguinte arranca sem os 5 s de antes.
3. **Library › Import › Your Spotify account › Connect Spotify**: a folha "Choose what to import" mostra por baixo do Import "Signed in as <o teu nome>".
4. **Use another account**: a folha fecha, abre-se o login do Spotify sem sessão; ao entrar com outra conta, a folha volta com as listas dessa conta e o nome dela.
5. **Fechar o login com Cancel** depois do passo 4: o Connect Spotify volta a pedir login (a sessão antiga já não está).
