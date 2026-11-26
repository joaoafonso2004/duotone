# Verificar a 7.1.0 (iPhone e Windows)

Nada disto foi visto nos aparelhos (o iPhone traz três módulos nativos novos que só o CI compila). Antes de lançar: o typecheck, a suite inteira e a mesma suite numa cópia dos ficheiros com CRLF. Depois das builds publicadas, correr o `supabase/versao-minima.sql` (atualizado para `7.1.0`) no SQL Editor.

## iPhone 7.1.0

**Módulos nativos e extensões (só na build)**
1. **Ícone da app**: Definições › Customise › **App icon** — experimentar os 5 (Default, Metal, Two-tone, Light, Night). O iOS mostra o aviso da troca e o ícone no ecrã inicial muda.
2. **Live Activity**: no ecrã bloqueado e na Dynamic Island — só aparece quando há **Jam**, **temporizador** (`Sleep timer`) ou **passagem do AutoMix**; sem nenhum deles desaparece sozinha. Com mais do que um ativo, vê-se tudo sem cortar.
3. **Puxar para voltar**: numa página aberta pelo quadrado (playlist, álbum, artista, mistura), puxar para a direita em qualquer ponto do ecrã encolhe a página de volta até ao cartão, com a página de trás à vista.

**Leitor, letras e menus**
4. **Ocultação no iPhone**: ao passar de música no leitor aberto e no mini leitor, a capa troca em Eclipse e o tom da app acompanha quando a capa é tapada.
5. **About this song**: nas reticências (`…`) de uma música (no leitor e nas listas) → **About this song**. Mostra álbum, ano, quantas vezes ouviste e, nas músicas em que o AutoMix já mediu, **Tempo** (ponto a pulsar ao BPM) e **Key** (roda de Camelot).
6. **Letras**: `Customise › Lyrics › Flowing lyrics` (ligada de origem) move linha a linha com mola; numa música com LRC palavra a palavra, cada palavra acende ao ser cantada, e as marcas `<mm:ss.xx>` não aparecem no texto.
7. **Segurar e levantar**: segurar uma música ou um cartão (Playlists, prateleiras da Home, álbuns guardados) levanta-o por cima do desfoque e o menu abre dele.

**Navegação, pesquisa e polimento**
8. **Álbuns numa página**: abrir um álbum (lançamentos, pesquisa, discografia do artista, álbuns guardados ou conversa) abre em página inteira a sair do quadrado, em vez da folha.
9. **Entrar pelo quadrado e cascata**: abrir playlist, álbum, prateleira ou artista responde logo sem atraso; as músicas entram em cascata quando a capa pousa; voltar encolhe logo para o cartão.
10. **Pesquisa da Home**: tocar no campo faz a pesquisa crescer a partir dele, o Cancel entra pela direita, as recentes chegam uma a uma, e o Cancel devolve a Home na posição de scroll onde estava.
11. **Números a rolar e vazios**: em Listening stats, You two, resumo do mês e contagem de uma playlist, os números rolam; os ecrãs vazios (Downloads, álbuns guardados, playlist vazia, estatísticas) têm botão para onde ir.
12. **Arranque lento**: se a sessão demorar a chegar, o logo da abertura respira até abrir o portal.

## Windows 7.1.0

1. **Paleta do Ctrl+F**: premir `Ctrl+F` em qualquer ecrã abre a paleta por cima de tudo.
   - Sem escrever: mostra as pesquisas recentes e as ações rápidas (Mini player, Sound settings, Sleep timer…, Now Playing).
   - A escrever: filtra logo músicas, artistas e playlists locais; setas sobem/descem, Enter abre, Esc fecha (ou volta do sub-menu do temporizador).
   - Escolher **See all results for "…"** leva à página da pesquisa com resultados do servidor.
2. **Download das Liked Songs e Definições**: em **Liked Songs**, descarregar a lista para ouvir sem rede; em **Settings › Windows**, confirmar o número de músicas guardadas no PC, o espaço ocupado e o botão **Remove all downloads**.
3. **Atualização obrigatória**: abrir uma versão anterior (ex.: 7.0.7) deve mostrar "Update required" sem "Not now", e só depois de correr o `supabase/versao-minima.sql` os pedidos à API de dados passam a devolver 426 às versões abaixo da 7.1.0.
