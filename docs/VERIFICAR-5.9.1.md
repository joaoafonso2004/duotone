# O que verificar no Duotone 5.9.1

Passaram a verificação de tipos e os 346 testes, numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina.

É a primeira versão **obrigatória**: as notas têm `Minimum version: 5.9.1`. Quem tem a 5.8.8 ou a 5.9.0 vê "Update required", sem "Not now". As versões até à 5.8.6 não entendem a linha e veem o aviso normal.

## As duas

1. **O aviso obrigatório.** Numa 5.8.8 ou 5.9.0: "Update required", sem "Not now" nem forma de fechar, e os passos à vista. No PC, com "Update now". As notas mostradas não têm a linha "Minimum version".
2. **Os logs do Supabase.** Nos dias seguintes, em Usage → Log Ingestion, os MB por dia têm de descer à medida que as pessoas atualizam. Na lista Pathname dos logs (uma hora só), o `yt_cache`, o `publish_social_presence` e o `track_catalog` têm de baixar bastante.
3. **Nada parece diferente.** Os artistas parecidos (Radio, Smart Shuffle), os nomes e anos das músicas e o "a ouvir" dos amigos funcionam como antes. Os amigos continuam a ver a música mudar logo e as próximas na fila quando elas mudam.

## Windows

1. **Atualiza sozinha** a partir da 5.8.9 (tabuleiro e nada a tocar há 10 minutos) ou com o "Update now" do aviso obrigatório.
