import ExpoModulesCore
import AVFoundation

/**
 * Tom e equalizador por cima dos AVPlayer que o expo-video ja esta a tocar.
 *
 * COMO E QUE CHEGAMOS AO PLAYER DELE. O expo-video declara
 * `internal final class VideoPlayer: SharedRef<AVPlayer>`, e um `SharedRef`
 * existe -- nas palavras do proprio comentario do Expo -- para "passar
 * referencias a objetos nativos entre bibliotecas independentes". O objeto que
 * o `useVideoPlayer` devolve ao JS entra aqui como argumento e do outro lado
 * sai o AVPlayer verdadeiro. Nao e um truque: e o mecanismo documentado, e e o
 * que torna isto barato.
 *
 * ADITIVO, como o duotone-remote-commands: nao substituimos o player nem a
 * sessao de audio. O expo-video continua dono do Now Playing, do segundo plano
 * e do ecra bloqueado. So acrescentamos duas coisas ao ITEM que esta a tocar.
 *
 * Porque e que tem de ser a cada item: cada `replaceAsync` no JS cria um
 * AVPlayerItem novo, e as duas propriedades vivem no item, nao no player. Por
 * isso observamos o `currentItem` em vez de aplicar uma vez.
 *
 * PORQUE E QUE SAO VARIOS MOTORES, E CADA UM COM O SEU PERFIL. O crossfade poe
 * dois AVPlayer a soar ao mesmo tempo, e o equalizador desta app e POR FAIXA
 * (ver `aoTocar` no lib/equalizer.ts). Com um motor so registado, a musica que
 * entrava tocava a passagem inteira sem equalizador e sem a margem do
 * limitador, e apanhava os dois de golpe no instante da troca -- mais um salto
 * de tom, com a velocidade fora de 1x. Guardando o perfil no MOTOR e nao no
 * modulo, cada faixa soa com o que e dela desde a primeira amostra, e as duas
 * podem soar ao mesmo tempo com perfis diferentes.
 */
public class DuotoneAudioModule: Module {
  /**
   * Um motor ligado: o player, o perfil dele, e o que se anda a observar.
   *
   * As observacoes sao POR MOTOR e nao partilhadas. Com uma so, registar o
   * segundo motor apagava a espera do primeiro e a faixa dele ficava sem
   * equalizador -- em silencio, que e o pior dos casos.
   */
  private final class Motor {
    weak var player: AVPlayer?
    /** Ultimos ganhos pedidos PARA ESTE motor, para reaplicar a cada item. */
    var ganhos: [Float] = Array(repeating: 0, count: DuotoneEq.numeroDeBandas)
    var margem: Float = 1
    var noItemAtual: NSKeyValueObservation?
    /** Ver `aplicarNoItem`: as faixas do asset podem ainda nao estar
     * carregadas quando o item aparece, e ai espera-se que ele fique pronto. */
    var aEsperarPeloItem: NSKeyValueObservation?
    /**
     * O tap que esta instalado agora, e em que item.
     *
     * E o que permite mudar os ganhos SEM reconstruir nada: com o tap vivo,
     * `aplicarEqualizador` fala com ele em vez de montar um `audioMix` novo --
     * e era instalar um `audioMix` num item ja a tocar que fazia o
     * AVFoundation desmontar a cadeia e calar o som por meio segundo.
     *
     * As duas sao `weak` de proposito. Quem mantem o estado vivo e o
     * `passRetained` que o tap fez, e quem o larga e o `tapFinalize`; uma
     * referencia forte aqui atrasava essa libertacao e guardava um item que
     * ja nao toca.
     */
    weak var tapVivo: EstadoDoTap?
    weak var itemDoTap: AVPlayerItem?

    init(_ player: AVPlayer) {
      self.player = player
    }

    func largar() {
      noItemAtual?.invalidate()
      noItemAtual = nil
      aEsperarPeloItem?.invalidate()
      aEsperarPeloItem = nil
    }
  }

  /** Dois com o crossfade ligado, um sem ele. */
  private var motores: [Motor] = []
  /** Ver `definirTomDaVelocidade`. Falso = `.varispeed`, como sempre foi. */
  private var mantemTom = false

  /**
   * Os leitores a quem `aplicarVelocidade` desligou a espera do buffer, com a
   * observação que a volta a ligar (ver `semEsperar`). Escrito na thread do JS
   * e lido no KVO, que corre noutra: daí o cadeado.
   */
  private var esperasSuspensas: [ObjectIdentifier: NSKeyValueObservation] = [:]
  private let cadeadoDaVelocidade = NSLock()

  /**
   * O nivel da cauda de um ficheiro local, em blocos.
   *
   * Devolve o RMS de cada bloco em dBFS, do mais antigo para o mais recente.
   * Le so o fim do ficheiro -- nao o ficheiro todo -- porque a pergunta e "onde
   * acaba a musica", e essa vive nos ultimos segundos.
   *
   * NAO decide nada. O limiar, quantos blocos calados contam e o que fazer com
   * um fade gravado sao decisoes, e vivem em src/lib/fimDaFaixa.ts, onde ha
   * testes. Aqui so se leem amostras, que e a unica coisa que o JS nao alcanca.
   *
   * RMS e nao pico: o audio e AAC, e em compressao com perdas o silencio traz
   * ruido de codificacao. Um pico isolado nao diz nada sobre o bloco.
   */
  private static func niveisDaCauda(_ url: URL, segundos: Double, porBloco: Double) throws -> [Double] {
    let ficheiro = try AVAudioFile(forReading: url)
    let formato = ficheiro.processingFormat
    let taxa = formato.sampleRate
    guard taxa > 0, ficheiro.length > 0, porBloco > 0 else { return [] }

    let quadrosPorBloco = AVAudioFrameCount(max(1, (porBloco * taxa).rounded()))
    let quadrosDaCauda = AVAudioFramePosition(min(Double(ficheiro.length), segundos * taxa))
    ficheiro.framePosition = max(0, ficheiro.length - quadrosDaCauda)

    guard let buffer = AVAudioPCMBuffer(pcmFormat: formato, frameCapacity: quadrosPorBloco) else {
      return []
    }

    var niveis: [Double] = []
    while ficheiro.framePosition < ficheiro.length {
      try ficheiro.read(into: buffer, frameCount: quadrosPorBloco)
      let quadros = Int(buffer.frameLength)
      if quadros == 0 { break }
      guard let canais = buffer.floatChannelData else { break }

      // Media das potencias de todos os canais: um bloco so e silencio quando
      // esta calado dos dois lados.
      var soma = 0.0
      let numeroDeCanais = Int(formato.channelCount)
      for canal in 0..<numeroDeCanais {
        let amostras = canais[canal]
        for i in 0..<quadros {
          let v = Double(amostras[i])
          soma += v * v
        }
      }
      let media = soma / Double(max(1, quadros * numeroDeCanais))
      let rms = media.squareRoot()
      // -160 e o chao que se usa para "zero" em vez de -infinito, que nao
      // atravessa a ponte para o JS como numero.
      niveis.append(rms > 0 ? 20 * log10(rms) : -160)
    }
    return niveis
  }

  public func definition() -> ModuleDefinition {
    Name("DuotoneAudio")

    /** Ver `niveisDaCauda`. Assincrona: le do disco. */
    AsyncFunction("analisarCauda") { (uri: String, segundos: Double, porBloco: Double) -> [Double] in
      guard let url = URL(string: uri) else { return [] }
      do {
        return try DuotoneAudioModule.niveisDaCauda(url, segundos: segundos, porBloco: porBloco)
      } catch {
        // Um ficheiro que nao se le nao e um erro a propagar: quem chama fica
        // sem analise e o crossfade conta do fim, como sempre contou.
        return []
      }
    }

    /**
     * Liga-se a um motor e passa a tratar de cada item que ele tocar.
     * Chama-se uma vez POR MOTOR; repetir com o mesmo nao faz nada.
     */
    Function("ligar") { (referencia: SharedRef<AVPlayer>) in
      let p = referencia.ref
      DispatchQueue.main.async { [weak self] in
        self?.ligar(p)
      }
    }

    /**
     * Os dez ganhos em dB e a margem (multiplicador de amplitude, <= 1) que
     * impede a curva de cortar a onda. Ambos vem do lib/equalizer.ts, que e
     * quem sabe quanto e que as bandas somam quando se sobrepoem.
     *
     * O MOTOR VAI A FRENTE porque o perfil e por faixa: durante uma passagem a
     * que sai e a que entra estao as duas a soar, cada uma com o seu.
     */
    Function("aplicarEqualizador") {
      (referencia: SharedRef<AVPlayer>, db: [Double], margem: Double) in
      let p = referencia.ref
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.arrumar()
        // Pedir o perfil antes de `ligar` e legitimo, e e o caso do motor em
        // espera: prepara-se o perfil no mesmo instante em que se lhe carrega
        // a faixa. Quem chegar primeiro cria o motor; o outro encontra-o.
        let motor = self.motores.first { $0.player === p } ?? self.registar(p)
        let novos = DuotoneEq.normalizar(db)
        let novaMargem = margem.isFinite && margem > 0 && margem <= 1 ? Float(margem) : 1

        // MESMO PERFIL, NAO SE MEXE.
        //
        // Instalar um `audioMix` reconstroi o tap (ver o cabecalho do
        // DuotoneEq), e num item que JA esta a tocar isso custa uma
        // descontinuidade audivel -- o proprio ficheiro avisa disso.
        //
        // No fim de uma passagem o motor que entra ja trazia este perfil desde
        // o `prepararSeguinte`, posto antes de ele soar uma amostra. Mas o
        // efeito do lado do JS volta a pedi-lo, porque o motor ativo mudou.
        // Sem esta guarda, cada crossfade acabava com um solavanco -- e o
        // trabalho todo era para deixar o item exatamente como ja estava.
        //
        // Um item NOVO nao passa por aqui: quem trata desse e o KVO do
        // `currentItem`, que aplica o perfil guardado no motor.
        if motor.ganhos == novos && motor.margem == novaMargem { return }

        motor.ganhos = novos
        motor.margem = novaMargem

        // O CAMINHO CURTO, e o que resolve o corte: se ja ha um tap montado
        // NESTE item, os ganhos vao la ter por dentro. O tap fica onde esta,
        // o `audioMix` nao e tocado, e o som nao se interrompe -- os
        // coeficientes caminham para os valores novos em 20 ms, que e o mesmo
        // que o PC faz com o `setTargetAtTime`.
        //
        // Repara que isto vale TAMBEM para voltar ao plano: antes, uma curva
        // plana punha `audioMix = nil` e isso era outra reconstrucao, com
        // outro corte. Agora o tap fica e passa a nao fazer nada (ver o
        // `inerte` no DuotoneEq).
        if let vivo = motor.tapVivo, motor.itemDoTap === motor.player?.currentItem {
          vivo.actualizar(ganhos: novos, margem: novaMargem)
          return
        }

        self.aplicarNoItem(motor.player?.currentItem, de: motor)
      }
    }

    /**
     * Muda apenas a velocidade, no AVPlayer existente. Não reinstala o EQ,
     * não procura outra posição e não muda a sessão de áudio.
     *
     * O CORTE DE UM SEGUNDO (30/9). Um `rate = x` num leitor a tocar faz o
     * AVPlayer voltar a avaliar se o buffer aguenta a taxa nova
     * (`automaticallyWaitsToMinimizeStalling`), e enquanto avalia fica em
     * `waitingToPlayAtSpecifiedRate`, calado. Aqui o item vem de um
     * resource loader (`modules/duotone-stream`), cujo ritmo o AVPlayer não
     * sabe medir, e por isso a avaliação demorava quase um segundo mesmo com o
     * ficheiro todo no telemóvel. O `playImmediately` que devia evitar isso
     * nunca chegava a correr: estava num bloco para a thread principal, e o
     * setter do expo-video -- que o JS chama logo a seguir, e que corre JÁ, na
     * thread do JS -- fazia primeiro o `rate = x` lento. Quando o bloco
     * chegava, a taxa já era a pedida e ele não fazia nada.
     *
     * Por isso corre agora aqui, na thread do JS, antes de o JS olhar para o
     * expo-video, e por esta ordem:
     *
     *  1. A espera do buffer desliga-se (`semEsperar`) até o leitor deixar de
     *     tocar. Qualquer escrita da taxa pelo meio -- a do `defaultRate`, se
     *     mexer na corrente, ou a que o expo-video faz dentro do KVO -- passa a
     *     ser imediata também.
     *  2. O `defaultRate` primeiro. A vigia do expo-video adota o `defaultRate`
     *     a cada mudança da taxa (VideoPlayer.swift, `onRateChanged`); com ele
     *     já certo, adota o valor NOVO, fica em sintonia sozinha, e o JS já não
     *     tem de escrever no expo-video.
     *  3. O `playImmediately`, que muda a taxa com o áudio que já lá está.
     *
     * Com falta real de dados mantém-se a política normal de buffering, e uma
     * pausa nunca é convertida num play: em pausa só se guarda a escolha.
     *
     * Deixou de haver bloco na fila, e com ele o "fica um clique atrás" de
     * 23/9, que vinha de dois blocos a correr fora de ordem.
     */
    Function("aplicarVelocidade") { (referencia: SharedRef<AVPlayer>, velocidade: Double) -> Bool in
      guard #available(iOS 16.0, tvOS 16.0, *) else { return false }
      guard velocidade.isFinite, velocidade >= 0.5, velocidade <= 2 else { return false }
      let p = referencia.ref
      let nova = Float(velocidade)
      guard p.rate != 0 else {
        if p.defaultRate != nova { p.defaultRate = nova }
        return true
      }
      if p.timeControlStatus == .playing, let item = p.currentItem,
         item.status == .readyToPlay, !item.isPlaybackBufferEmpty {
        self.semEsperar(p) {
          if p.defaultRate != nova { p.defaultRate = nova }
          if abs(p.rate - nova) > 0.001 { p.playImmediately(atRate: nova) }
        }
      } else {
        // Já estava à espera de dados: aí esperar é o certo.
        if p.defaultRate != nova { p.defaultRate = nova }
        if abs(p.rate - nova) > 0.001 { p.rate = nova }
      }
      return true
    }

    /**
     * O tom acompanha a velocidade, ou fica onde está?
     *
     * `.varispeed` é o que a app usa desde sempre: reamostra, e o tom desce
     * com a velocidade como abrandar uma fita. Não inventa sinal nenhum, e foi
     * por isso que se escolheu -- um time-stretch a 0,5x tem de inventar
     * metade do sinal, e ouvia-se.
     *
     * Chegou a achar-se que reamostrar obrigava o AVFoundation a voltar a
     * preparar a cadeia de áudio, e que era esse o corte ao mexer na
     * velocidade. O corte de um segundo era outro -- a espera do buffer, ver
     * `aplicarVelocidade` -- e não depende do algoritmo do tom.
     *
     * `.spectral` preserva o tom, e por isso a taxa de saída não muda e não há
     * nada a voltar a preparar. Em troca, estica o tempo.
     *
     * Não há resposta certa: é uma escolha entre um corte e um artefacto, e
     * por isso é uma preferência e não uma decisão escrita no código. Aplica-se
     * já ao item que está a tocar, o que custa UM corte no momento em que se
     * muda o interruptor -- e nenhum a partir daí.
     */
    /**
     * O que o AVPlayer tem MESMO, para o relatório de reprodução (secção
     * "speed"). Só leitura, e só para diagnóstico: a taxa, o `defaultRate` e o
     * estado (0 pausado, 1 à espera, 2 a tocar).
     */
    Function("estadoDaVelocidade") { (referencia: SharedRef<AVPlayer>) -> String in
      let p = referencia.ref
      var texto = String(format: "rate=%.3f", p.rate)
      if #available(iOS 16.0, tvOS 16.0, *) { texto += String(format: " default=%.3f", p.defaultRate) }
      texto += " status=\(p.timeControlStatus.rawValue)"
      // Porque é que está à espera, e se a espera do buffer está ligada: é o
      // que confirma no aparelho que uma mudança já não passa pelo caminho lento.
      if let razao = p.reasonForWaitingToPlay { texto += " waiting=\(razao.rawValue)" }
      texto += " waits=\(p.automaticallyWaitsToMinimizeStalling ? 1 : 0)"
      return texto
    }

    Function("definirTomDaVelocidade") { (mantemTom: Bool) in
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.mantemTom = mantemTom
        for motor in self.motores {
          motor.player?.currentItem?.audioTimePitchAlgorithm = mantemTom ? .spectral : .varispeed
        }
      }
    }

    OnDestroy {
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        for motor in self.motores {
          motor.largar()
        }
        self.motores.removeAll()
      }
      self.cadeadoDaVelocidade.lock()
      let vigias = Array(self.esperasSuspensas.values)
      self.esperasSuspensas.removeAll()
      self.cadeadoDaVelocidade.unlock()
      vigias.forEach { $0.invalidate() }
    }
  }

  /**
   * Faz `mudar` com a espera do buffer desligada, e deixa-a desligada até o
   * leitor deixar de tocar -- pausa, faixa nova ou falta de dados.
   *
   * Até lá, e não só durante a mudança, porque voltar a ligá-la com a música
   * a tocar pode fazer o AVPlayer reavaliar o buffer ali mesmo, e era o mesmo
   * corte, só que mais tarde. Parado não custa nada: a espera volta antes do
   * próximo play, e esse arranca com a política de sempre.
   *
   * O cadeado nunca está fechado enquanto se mexe no leitor: o KVO pode
   * disparar lá dentro, na mesma thread, e ir ao `reporEspera`.
   */
  private func semEsperar(_ p: AVPlayer, _ mudar: () -> Void) {
    let chave = ObjectIdentifier(p)
    cadeadoDaVelocidade.lock()
    let jaSuspensa = esperasSuspensas[chave] != nil
    cadeadoDaVelocidade.unlock()
    // Só se desliga o que estava ligado; quem a desligou por outra razão
    // (as `bufferOptions` do expo-video) não a vê religada por nós.
    let desligar = !jaSuspensa && p.automaticallyWaitsToMinimizeStalling
    if desligar { p.automaticallyWaitsToMinimizeStalling = false }
    mudar()
    guard desligar else { return }
    // A vigia só nasce DEPOIS da mudança: se o `playImmediately` passasse por
    // um estado intermédio, ela religava a espera a meio e o corte voltava.
    let vigia = p.observe(\.timeControlStatus, options: [.new]) { [weak self] jogador, _ in
      guard jogador.timeControlStatus != .playing else { return }
      self?.reporEspera(jogador)
    }
    cadeadoDaVelocidade.lock()
    esperasSuspensas[chave] = vigia
    cadeadoDaVelocidade.unlock()
    // Pode ter parado entre a mudança e a vigia.
    if p.timeControlStatus != .playing { reporEspera(p) }
  }

  private func reporEspera(_ p: AVPlayer) {
    cadeadoDaVelocidade.lock()
    let vigia = esperasSuspensas.removeValue(forKey: ObjectIdentifier(p))
    cadeadoDaVelocidade.unlock()
    guard let vigia else { return }
    vigia.invalidate()
    p.automaticallyWaitsToMinimizeStalling = true
  }

  /** Deita fora os motores cujo AVPlayer ja morreu -- o `weak` deixou-os a nil. */
  private func arrumar() {
    for motor in motores where motor.player == nil {
      motor.largar()
    }
    motores.removeAll { $0.player == nil }
  }

  private func ligar(_ p: AVPlayer) {
    arrumar()
    // O efeito do lado do JS pode voltar a correr. Ligar o mesmo motor outra
    // vez nao pode recriar as observacoes nem deitar fora o perfil que ele ja
    // tem -- seria perde-lo a meio de uma passagem.
    guard !motores.contains(where: { $0.player === p }) else { return }
    registar(p)
  }

  @discardableResult
  private func registar(_ p: AVPlayer) -> Motor {
    let motor = Motor(p)
    motores.append(motor)
    // `.initial` para apanhar o item que ja la esteja quando isto corre.
    // O KVO dispara na thread de quem escreveu a propriedade — que aqui e o
    // expo-video, e nao temos garantia de qual e — por isso volta-se sempre a
    // main antes de mexer no item.
    motor.noItemAtual = p.observe(\.currentItem, options: [.initial, .new]) {
      [weak self, weak motor] jogador, _ in
      let item = jogador.currentItem
      DispatchQueue.main.async {
        guard let self, let motor else { return }
        self.aplicarNoItem(item, de: motor)
      }
    }
    return motor
  }

  private func aplicarNoItem(_ item: AVPlayerItem?, de motor: Motor) {
    guard motor.player?.currentItem === item else { return }
    motor.aEsperarPeloItem?.invalidate()
    motor.aEsperarPeloItem = nil
    // Item novo, tap novo. Deixar aqui a referencia do anterior fazia o
    // caminho curto do `aplicarEqualizador` mandar ganhos para um tap que ja
    // nao esta a tocar nada -- e a faixa nova ficava sem equalizador, em
    // silencio, que e o pior dos casos.
    if motor.itemDoTap !== item {
      motor.tapVivo = nil
      motor.itemDoTap = nil
    }
    guard let item, motor.player?.currentItem === item else { return }
    if let tap = motor.tapVivo, motor.itemDoTap === item {
      tap.actualizar(ganhos: motor.ganhos, margem: motor.margem)
      return
    }

    // 1. O TOM ACOMPANHA A VELOCIDADE.
    //
    // Os valores por omissao (.spectral, .timeDomain) preservam o tom, o que
    // significa esticar o tempo -- e a 0,5x um time-stretch tem de inventar
    // metade do sinal, que e exatamente o que se ouvia como artefactos. Com
    // .varispeed o tom desce com a velocidade, como abrandar uma fita. E a
    // mesma correcao que ja fizemos no PC com `preservesPitch = false`.
    //
    // O JS pede o mesmo ao expo-video (`preservesPitch = false`, no
    // `configurarMotor`), que o estampa na propria criacao do item. Aqui e a
    // rede de seguranca: sem isso um item nasceria `.spectral` e ficava assim
    // ate este KVO chegar.
    item.audioTimePitchAlgorithm = mantemTom ? .spectral : .varispeed

    // Instala uma vez por item, mesmo com EQ plano. Em repouso o tap é um
    // bypass; assim ligar o efeito ou a primeira banda não reconstrói áudio.
    if let montado = DuotoneEq.mistura(para: item, ganhos: motor.ganhos, margem: motor.margem) {
      item.audioMix = montado.mix
      motor.tapVivo = montado.estado
      motor.itemDoTap = item
      return
    }

    // Nao ha faixa de audio no asset. Ou o item ainda nao carregou -- e ai
    // espera-se por ele -- ou e HLS, que nunca expoe faixas e onde nao ha
    // equalizador possivel. Sem esta espera, uma faixa apanhada cedo demais
    // ficava sem EQ EM SILENCIO, que e o pior dos dois mundos: nao falha,
    // so nao faz nada.
    guard item.status != .readyToPlay else { return }
    motor.aEsperarPeloItem = item.observe(\.status, options: [.new]) {
      [weak self, weak motor] observado, _ in
      guard observado.status == .readyToPlay else { return }
      DispatchQueue.main.async {
        guard let self, let motor, motor.player?.currentItem === observado else { return }
        motor.aEsperarPeloItem?.invalidate()
        motor.aEsperarPeloItem = nil
        let montado = DuotoneEq.mistura(
          para: observado, ganhos: motor.ganhos, margem: motor.margem
        )
        observado.audioMix = montado?.mix
        motor.tapVivo = montado?.estado
        motor.itemDoTap = montado == nil ? nil : observado
      }
    }
  }
}
