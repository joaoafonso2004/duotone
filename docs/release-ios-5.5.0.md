Duotone iOS 5.5.0 — o AutoMix já não dá um degrau de velocidade

Corrigido:
- AutoMix na batida: a faixa que entra voltava à velocidade dela de uma vez no fim da passagem, num degrau que podia chegar a 4 %. Agora volta aos poucos.
- O relatório de reprodução já mede quanto o JavaScript aloca por minuto (MB, recolhas e tempo de recolha) mesmo quando vais e voltas entre apps. Antes, essa linha ficava em branco (vinha da 5.4.6, que não chegou a sair).
- Nada muda no motor de áudio, no Swift nem na interface do iPhone.

Verificações recomendadas: https://github.com/joaoafonso2004/duotone/blob/ios-v5.5.0/docs/VERIFICAR-5.5.0.md
Comparar com iOS 5.4.5: https://github.com/joaoafonso2004/duotone/compare/ios-v5.4.5...ios-v5.5.0
