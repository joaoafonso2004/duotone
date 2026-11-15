# O que verificar no Duotone 6.0.2 (iPhone e Windows)

Passaram a verificação de tipos e a suite inteira, também numa **cópia dos ficheiros com finais de linha CRLF**. O Swift só o CI compila. O francês no PC foi visto a correr (expo web): o ecrã de entrada em francês, placeholders incluídos, e de volta a inglês igual ao de antes.

## No Supabase

Nada a correr. As 79 migrações estão aplicadas (`marcas_em_falta` sem nenhuma em falta, 15/11), e nada desta versão precisa de SQL novo: o EQ por plataforma usa as mesmas tabelas.

A mínima do servidor continua a 6.0.1, e as notas mantêm `Minimum version: 6.0.1`: a 6.0.2 não é obrigatória.

## iPhone

- **Francês:** Settings › Appearance › Language › Français. A frase diz que muda ao reabrir; fecha a app (deslizar para cima no multitarefa) e abre. Ver o Home, as Liked Songs, um menu de uma música e um aviso. Os títulos e os artistas ficam como estão. Voltar a English e reabrir.
  - É a parte com mais risco desta versão: o JSX da app passa pelo `src/i18n/jsx-runtime.ts` também em inglês (sai logo, mas passa). Se a app não abrir, é aqui.
- **Download Liked Songs** (Storage): com o limite de 300 MB pergunta se o sobe; depois "Downloading N of M" no rodapé; gostar de uma música nova e vê-la descarregar. Desligar: "Remove downloads" ou "Keep them".
- **Start Radio** no menu de uma música numa lista: toca-a, o Up next passa a ser o Radio, o aviso tem Undo quando a música já tocava.
- **Show what your PC is playing** (General): desligado, a lingueta e o aviso do PC deixam de aparecer.
- **EQ:** mudar o EQ de uma música no iPhone e ver que no PC essa música fica como estava (e ao contrário).

## Windows

- **Francês:** Definições › Appearance › Language › Français: a janela recarrega em francês.
- **Start Radio** no clique direito de uma música e no menu da barra do leitor.
- **Show what your iPhone is playing** (Definições › Windows).
- **EQ:** os presets e o EQ de cada música já não chegam ao iPhone.
