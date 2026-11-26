# Verificar a 7.2.4 (só iPhone)

A 7.2.3 não deixava entrar na conta ("Cannot read property 'removeItem' of undefined") e podia tirar da conta ao renovar a sessão. O Metro guarda a resolução de um import por pasta. Com o armazém do MMKV em `src/lib`, um vizinho decidia por ele, e na build da 7.2.3 o armazém importou-se a si próprio e ficou sem o AsyncStorage verdadeiro. O armazém passou para `src/armazem/`, sozinho.

Provado antes de lançar:
- no bytecode da 7.2.3 (da release), o armazém tem como 1.ª dependência ele próprio; no da 7.2.2, o AsyncStorage verdadeiro;
- o supabase-js verdadeiro, com o armazém como na 7.2.3, rebenta no login com o mesmo erro; com a correção, entra e guarda a sessão;
- um bundle de iOS feito aqui com a correção: o armazém usa o verdadeiro e o `authStorage` usa o armazém.

1. **Entrar na conta** com email e palavra-passe: entra, sem o erro.
2. **Entrar com o username**: entra.
3. **Fechar à força e abrir**: continua dentro da conta.
4. **Deixar a app uma hora e voltar** (a sessão renova-se): continua dentro da conta.
