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
        self.aplicarNoItem(motor.player?.currentItem, de: motor)
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
    }
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
    motor.aEsperarPeloItem?.invalidate()
    motor.aEsperarPeloItem = nil
    guard let item else { return }

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
    item.audioTimePitchAlgorithm = .varispeed

    // 2. O EQUALIZADOR.
    //
    // Sem ganhos nenhuns nao se instala tap nenhum: um tap tem custo por
    // amostra, e uma curva plana nao muda nada.
    if DuotoneEq.ePlano(motor.ganhos) && motor.margem >= 1 {
      item.audioMix = nil
      return
    }

    if let mix = DuotoneEq.mistura(para: item, ganhos: motor.ganhos, margem: motor.margem) {
      item.audioMix = mix
      return
    }

    // Nao ha faixa de audio no asset. Ou o item ainda nao carregou -- e ai
    // espera-se por ele -- ou e HLS, que nunca expoe faixas e onde nao ha
    // equalizador possivel. Sem esta espera, uma faixa apanhada cedo demais
    // ficava sem EQ EM SILENCIO, que e o pior dos dois mundos: nao falha,
    // so nao faz nada.
    guard item.status != .readyToPlay else { return }
    motor.aEsperarPeloItem = item.observe(\.status, options: [.new]) {
      [weak motor] observado, _ in
      guard observado.status == .readyToPlay else { return }
      DispatchQueue.main.async {
        guard let motor, motor.player?.currentItem === observado else { return }
        motor.aEsperarPeloItem?.invalidate()
        motor.aEsperarPeloItem = nil
        observado.audioMix = DuotoneEq.mistura(
          para: observado, ganhos: motor.ganhos, margem: motor.margem
        )
      }
    }
  }
}
