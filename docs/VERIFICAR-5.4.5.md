# O que verificar no Duotone 5.4.5

Passaram a verificação de tipos e os 278 testes, também numa cópia com finais de linha CRLF (326 s em cada cópia). O percurso de edição foi testado nos dois painéis com React e armazenamento simulados. A confirmação visual e a sincronização entre aparelhos precisam das apps instaladas. Esta versão não altera o motor de áudio nem o Swift.

## iPhone e Windows — atualizar um preset

1. Abre o equalizador e escolhe um preset teu, como Top.
2. Mexe numa banda: deve aparecer Update “Top”. Toca nesse botão; aparece Preset updated e o botão desaparece.
3. Escolhe outro preset e volta ao Top: deve ter a curva nova, com o mesmo nome e sem uma entrada duplicada. Confirma também depois de reiniciar a app.
4. Ajusta outra vez e usa Save as preset para guardar uma cópia com outro nome. O Top deve manter a curva que guardaste no passo anterior.
5. Experimenta Recommended e os presets de origem: o botão de substituir o Top não deve aparecer. Trocar de música ou fechar o painel também não deve conservar uma edição antiga.

Se o Top estiver associado ao carro ou a uns auscultadores, essa associação deve continuar. Com as duas apps na mesma conta, confirma que a alteração chega ao outro aparelho pela sincronização habitual.
