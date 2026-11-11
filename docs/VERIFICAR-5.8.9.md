# O que verificar no Duotone 5.8.9 (só Windows)

Passaram a verificação de tipos e os 345 testes, numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina.

Só para Windows. O iPhone fica na 5.8.8.

**A 5.8.9 ainda chega pelo caminho antigo**: descarrega-se sozinha e instala-se na próxima vez que a app abrir de raiz. Para a ter já: sair pelo tabuleiro ("Quit") e abrir. A instalação sem reabrir só vale a partir da versão seguinte.

## Windows

1. **A atualização sozinha** (só se vê na versão a seguir à 5.8.9). Com a 5.8.9 instalada e uma versão nova publicada:
   - com a app no tabuleiro e nada a tocar, a versão nova instala-se entre 10 e 20 minutos depois de a música parar, sem reabrir à mão;
   - a app volta para o tabuleiro, sem a janela aparecer;
   - com a janela aberta e o PC em uso, não instala; com o PC sem uso há 10 minutos, instala e a janela volta minimizada;
   - a tocar, nunca instala.
2. **Check for updates.** Com uma versão pronta diz "Duotone X is ready. It installs by itself when you're not listening."
3. **A versão obrigatória.** Com "Minimum version: X" nas notas da versão mais recente, o aviso "Update required" aparece também no PC, com "Update now" e sem "Not now".
