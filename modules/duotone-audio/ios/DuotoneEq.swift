import AVFoundation

/**
 * O equalizador de dez bandas, no audio que o AVPlayer ja esta a tocar.
 *
 * COMO. Um `MTAudioProcessingTap` pendurado no `audioMix` do AVPlayerItem: as
 * amostras passam por aqui antes de irem para a saida, e aplicamos-lhes uma
 * cascata de dez biquads -- as MESMAS duas prateleiras e oito bandas de pico
 * que o `lib/equalizer.ts` usa no PC. As formulas sao as do cookbook do Robert
 * Bristow-Johnson, que e o que o Web Audio implementa; foi assim que as duas
 * plataformas ficaram a soar igual, e a curva do lado do JS ja esta validada
 * digito a digito contra o browser.
 *
 * O QUE NAO APANHA. O tap precisa das faixas do asset, e um stream HLS nao as
 * expoe. Nesta app isso quase nao acontece: o resolver escolhe sempre mp4
 * progressivo primeiro e so cai no HLS quando nao ha formato progressivo
 * nenhum (ver o comentario em api/ytstream.ts). Nesses casos o audioMix nao se
 * instala e a faixa toca sem equalizador, em vez de nao tocar.
 *
 * PORQUE E QUE MUDAR OS GANHOS RECONSTROI O TAP. O `process` corre numa thread
 * de audio em tempo real, onde nao se pode bloquear nem alocar. Em vez de
 * mexer nos coeficientes por baixo dela, cada mudanca de perfil cria um tap
 * novo com os seus coeficientes ja fixos. Custa uma descontinuidade curta ao
 * trocar de perfil; em troca nao ha estado partilhado entre threads, que e
 * onde este tipo de codigo costuma estalar.
 */
enum DuotoneEq {
  /** As mesmas de `lib/equalizer.ts`. Se mudarem la, tem de mudar aqui. */
  enum TipoDeBanda { case lowshelf, peaking, highshelf }
  static let frequencias: [Float] = [105, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 10000]
  static let tipos: [TipoDeBanda] = [
    .lowshelf,
    .peaking, .peaking, .peaking, .peaking,
    .peaking, .peaking, .peaking, .peaking,
    .highshelf,
  ]
  static let q: Float = 1
  static var numeroDeBandas: Int { frequencias.count }

  static func normalizar(_ db: [Double]) -> [Float] {
    (0..<numeroDeBandas).map { i in
      let v = i < db.count ? db[i] : 0
      guard v.isFinite else { return 0 }
      return Float(max(-12, min(12, v)))
    }
  }

  static func ePlano(_ ganhos: [Float]) -> Bool {
    ganhos.allSatisfy { abs($0) < 0.05 }
  }

  /**
   * Constroi o audioMix para este item. Devolve nil quando nao ha faixa de
   * audio no asset -- o caso do HLS -- e ai a faixa toca sem equalizador.
   */
  static func mistura(para item: AVPlayerItem, ganhos: [Float], margem: Float) -> AVAudioMix? {
    // O `tracks(withMediaType:)` sincrono esta marcado como obsoleto desde o
    // iOS 16 a favor do `loadTracks`, que e assincrono. Fica o sincrono de
    // proposito: o alvo do pod e o iOS 15.1, isto tem de devolver um mix a um
    // chamador sincrono, e quem trata do caso "ainda nao carregou" e o modulo,
    // que espera pelo `readyToPlay` e volta a pedir. Trocar por `loadTracks`
    // sem mexer nessa parte trocava um aviso por uma corrida.
    guard let faixa = item.asset.tracks(withMediaType: .audio).first else { return nil }

    let estado = EstadoDoTap(ganhos: ganhos, margem: margem)
    var callbacks = MTAudioProcessingTapCallbacks(
      version: kMTAudioProcessingTapCallbacksVersion_0,
      clientInfo: UnsafeMutableRawPointer(Unmanaged.passRetained(estado).toOpaque()),
      init: tapInit,
      finalize: tapFinalize,
      prepare: tapPrepare,
      unprepare: tapUnprepare,
      process: tapProcess
    )

    // O `MTAudioProcessingTapCreate` do Swift moderno devolve um
    // `MTAudioProcessingTap?` ja gerido — nao um `Unmanaged`. Nao ha
    // `release` a fazer sobre o tap; o que E preciso libertar a mao e o
    // `passRetained` do estado, e so no caminho de erro (fora dele, quem o
    // liberta e o `tapFinalize`).
    var tap: MTAudioProcessingTap?
    let estadoDaCriacao = MTAudioProcessingTapCreate(
      kCFAllocatorDefault,
      &callbacks,
      kMTAudioProcessingTapCreationFlag_PreEffects,
      &tap
    )
    guard estadoDaCriacao == noErr, let tap else {
      Unmanaged<EstadoDoTap>.fromOpaque(callbacks.clientInfo!).release()
      return nil
    }

    let parametros = AVMutableAudioMixInputParameters(track: faixa)
    parametros.audioTapProcessor = tap

    let mix = AVMutableAudioMix()
    mix.inputParameters = [parametros]
    return mix
  }
}

// ---------------------------------------------------------------- biquad ---

/** Um biquad em forma direta II transposta: dois estados por canal. */
struct Coeficientes {
  var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0

  /** Peaking do cookbook RBJ, normalizado por a0 -- as mesmas contas do
   * `magnitudeDeUm` no lib/equalizer.ts. */
  static func peaking(frequencia f0: Float, ganhoDb: Float, q: Float, taxa: Float) -> Coeficientes {
    var c = Coeficientes()
    guard ganhoDb != 0, taxa > 0, f0 < taxa / 2 else { return c }
    let A = powf(10, ganhoDb / 40)
    let w0 = 2 * Float.pi * f0 / taxa
    let alfa = sinf(w0) / (2 * q)
    let cos0 = cosf(w0)

    let a0 = 1 + alfa / A
    c.b0 = (1 + alfa * A) / a0
    c.b1 = (-2 * cos0) / a0
    c.b2 = (1 - alfa * A) / a0
    c.a1 = (-2 * cos0) / a0
    c.a2 = (1 - alfa / A) / a0
    return c
  }

  /** Prateleiras RBJ com slope S=1, iguais ao BiquadFilterNode do browser. */
  static func shelf(
    frequencia f0: Float,
    ganhoDb: Float,
    taxa: Float,
    alto: Bool
  ) -> Coeficientes {
    var c = Coeficientes()
    guard ganhoDb != 0, taxa > 0, f0 < taxa / 2 else { return c }
    let A = powf(10, ganhoDb / 40)
    let w0 = 2 * Float.pi * f0 / taxa
    let cos0 = cosf(w0)
    let alfa = (sinf(w0) / 2) * sqrtf(2)
    let raizA = sqrtf(A)
    let doisRaizAAlfa = 2 * raizA * alfa
    var b0: Float, b1: Float, b2: Float, a0: Float, a1: Float, a2: Float

    if alto {
      b0 = A * (A + 1 + (A - 1) * cos0 + doisRaizAAlfa)
      b1 = -2 * A * (A - 1 + (A + 1) * cos0)
      b2 = A * (A + 1 + (A - 1) * cos0 - doisRaizAAlfa)
      a0 = A + 1 - (A - 1) * cos0 + doisRaizAAlfa
      a1 = 2 * (A - 1 - (A + 1) * cos0)
      a2 = A + 1 - (A - 1) * cos0 - doisRaizAAlfa
    } else {
      b0 = A * (A + 1 - (A - 1) * cos0 + doisRaizAAlfa)
      b1 = 2 * A * (A - 1 - (A + 1) * cos0)
      b2 = A * (A + 1 - (A - 1) * cos0 - doisRaizAAlfa)
      a0 = A + 1 + (A - 1) * cos0 + doisRaizAAlfa
      a1 = -2 * (A - 1 + (A + 1) * cos0)
      a2 = A + 1 + (A - 1) * cos0 - doisRaizAAlfa
    }

    c.b0 = b0 / a0
    c.b1 = b1 / a0
    c.b2 = b2 / a0
    c.a1 = a1 / a0
    c.a2 = a2 / a0
    return c
  }

  static func criar(
    tipo: DuotoneEq.TipoDeBanda,
    frequencia: Float,
    ganhoDb: Float,
    q: Float,
    taxa: Float
  ) -> Coeficientes {
    switch tipo {
    case .lowshelf:
      return shelf(frequencia: frequencia, ganhoDb: ganhoDb, taxa: taxa, alto: false)
    case .highshelf:
      return shelf(frequencia: frequencia, ganhoDb: ganhoDb, taxa: taxa, alto: true)
    case .peaking:
      return peaking(frequencia: frequencia, ganhoDb: ganhoDb, q: q, taxa: taxa)
    }
  }
}

/**
 * O estado que o tap carrega consigo. Criado antes de o tap existir e
 * libertado no `finalize`; entre o `prepare` e o `unprepare` so e tocado pela
 * thread de audio, e mais ninguem lhe mexe.
 */
final class EstadoDoTap {
  let ganhos: [Float]
  let margem: Float

  /** So as bandas que fazem alguma coisa. Uma banda a zero e a identidade, e
   * filtrar por ela era gastar por nada -- o normal e o utilizador mexer em
   * duas ou tres. */
  private(set) var coeficientes: [Coeficientes] = []
  /** Dois estados por banda e por canal, num array PLANO
   * (`canal * bandas + banda`). Plano e nao aninhado de proposito: um
   * `[[Float]]` faz uma verificacao de copia por acesso, e isto corre dentro
   * da thread de audio. */
  private var z1: [Float] = []
  private var z2: [Float] = []
  private var canais = 0
  /** Peak limiter estéreo ligado depois do EQ. A margem é unidade nas versões
   * atuais; o limiter só impede que conteúdo reforçado ultrapasse a saída
   * digital. */
  private let teto: Float = powf(10, -0.1 / 20)
  private var ganhoDoLimitador: Float = 1
  private var coeficienteDeRelease: Float = 0

  init(ganhos: [Float], margem: Float) {
    self.ganhos = ganhos
    self.margem = margem
  }

  func preparar(taxa: Float, canais: Int) {
    self.canais = max(1, canais)
    // 150 ms: abaixo disto a recuperação começa a modular a própria onda dos
    // graves e ouve-se como distorção. Ataque instantâneo para nunca cortar.
    coeficienteDeRelease = expf(-1 / (0.15 * max(1, taxa)))
    ganhoDoLimitador = 1
    coeficientes = (0..<DuotoneEq.numeroDeBandas).compactMap { i in
      let db = i < ganhos.count ? ganhos[i] : 0
      guard abs(db) >= 0.05 else { return nil }
      return Coeficientes.criar(
        tipo: DuotoneEq.tipos[i],
        frequencia: DuotoneEq.frequencias[i], ganhoDb: db, q: DuotoneEq.q, taxa: taxa
      )
    }
    let total = self.canais * max(1, coeficientes.count)
    z1 = Array(repeating: 0, count: total)
    z2 = Array(repeating: 0, count: total)
  }

  /**
   * Filtra UM canal, no proprio buffer, com passo.
   *
   * O passo existe por causa do audio entrelacado, onde as amostras de um
   * canal estao de N em N. Sem ele, a alternativa era desentrelacar para um
   * buffer temporario -- e alocar dentro de um callback de tempo real e
   * exatamente o que nao se pode fazer.
   */
  func filtrar(
    _ base: UnsafeMutablePointer<Float>,
    quantas: Int,
    passo: Int,
    canal: Int
  ) {
    guard quantas > 0, canal < canais else { return }
    let bandas = coeficientes.count
    guard bandas > 0 else { return }
    z1.withUnsafeMutableBufferPointer { e1 in
      z2.withUnsafeMutableBufferPointer { e2 in
        for banda in 0..<bandas {
          let c = coeficientes[banda]
          let indice = canal * bandas + banda
          // Forma direta II transposta: dois estados, uma multiplicacao a
          // menos por amostra do que a forma I.
          var s1 = e1[indice]
          var s2 = e2[indice]
          var p = 0
          for _ in 0..<quantas {
            let x = base[p]
            let y = c.b0 * x + s1
            s1 = c.b1 * x - c.a1 * y + s2
            s2 = c.b2 * x - c.a2 * y
            base[p] = y
            p += passo
          }
          e1[indice] = s1
          e2[indice] = s2
        }
      }
    }
  }

  /** Ganho comum aos canais: baixar L/R de forma diferente deslocaria a imagem
   * estéreo. A descida é instantânea; a recuperação demora 150 ms. */
  private func ganhoParaOPico(_ pico: Float) -> Float {
    let desejado = pico > teto ? teto / pico : 1
    let recuperado = 1 + coeficienteDeRelease * (ganhoDoLimitador - 1)
    ganhoDoLimitador = min(desejado, recuperado)
    return margem * ganhoDoLimitador
  }

  /** Saída planar: um AudioBuffer por canal (o caso normal do AVPlayer). */
  func finalizarNaoEntrelacado(_ lista: UnsafeMutableAudioBufferListPointer) {
    guard !lista.isEmpty else { return }
    var frames = Int.max
    for buffer in lista {
      guard buffer.mData != nil else { continue }
      frames = min(frames, Int(buffer.mDataByteSize) / MemoryLayout<Float>.size)
    }
    guard frames != Int.max, frames > 0 else { return }

    for frame in 0..<frames {
      var pico: Float = 0
      for buffer in lista {
        guard let dados = buffer.mData else { continue }
        let x = dados.assumingMemoryBound(to: Float.self)[frame] * margem
        pico = max(pico, abs(x))
      }
      let g = ganhoParaOPico(pico)
      for buffer in lista {
        guard let dados = buffer.mData else { continue }
        dados.assumingMemoryBound(to: Float.self)[frame] *= g
      }
    }
  }

  /** Saída intercalada: L,R,L,R... dentro de um único AudioBuffer. */
  func finalizarEntrelacado(
    _ amostras: UnsafeMutablePointer<Float>,
    frames: Int,
    canais: Int
  ) {
    guard frames > 0, canais > 0 else { return }
    for frame in 0..<frames {
      let inicio = frame * canais
      var pico: Float = 0
      for canal in 0..<canais {
        pico = max(pico, abs(amostras[inicio + canal] * margem))
      }
      let g = ganhoParaOPico(pico)
      for canal in 0..<canais { amostras[inicio + canal] *= g }
    }
  }
}

// ------------------------------------------------------------- callbacks ---
// Sao ponteiros para funcoes C: nao podem capturar nada, e o estado viaja no
// `clientInfo` / `tapStorage`.

private let tapInit: MTAudioProcessingTapInitCallback = { _, clientInfo, tapStorageOut in
  tapStorageOut.pointee = clientInfo
}

private let tapFinalize: MTAudioProcessingTapFinalizeCallback = { tap in
  // Devolve o `passRetained` que foi feito ao criar o tap. Sem isto, cada
  // mudanca de perfil deixava um estado pendurado em memoria.
  Unmanaged<EstadoDoTap>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
}

private let tapPrepare: MTAudioProcessingTapPrepareCallback = { tap, _, formato in
  let estado = Unmanaged<EstadoDoTap>
    .fromOpaque(MTAudioProcessingTapGetStorage(tap))
    .takeUnretainedValue()
  estado.preparar(
    taxa: Float(formato.pointee.mSampleRate),
    canais: Int(formato.pointee.mChannelsPerFrame)
  )
}

private let tapUnprepare: MTAudioProcessingTapUnprepareCallback = { _ in }

private let tapProcess: MTAudioProcessingTapProcessCallback = {
  tap, quantidade, _, listaDeBuffers, quantidadeSaida, flagsSaida in

  let estadoDaLeitura = MTAudioProcessingTapGetSourceAudio(
    tap, quantidade, listaDeBuffers, flagsSaida, nil, quantidadeSaida
  )
  guard estadoDaLeitura == noErr else { return }

  let estado = Unmanaged<EstadoDoTap>
    .fromOpaque(MTAudioProcessingTapGetStorage(tap))
    .takeUnretainedValue()

  let lista = UnsafeMutableAudioBufferListPointer(listaDeBuffers)

  // Nao entrelacado (o caso normal aqui): um buffer por canal, passo 1.
  if lista.count > 1 {
    for (canal, buffer) in lista.enumerated() {
      guard let dados = buffer.mData else { continue }
      estado.filtrar(
        dados.assumingMemoryBound(to: Float.self),
        quantas: Int(buffer.mDataByteSize) / MemoryLayout<Float>.size,
        passo: 1,
        canal: canal
      )
    }
    estado.finalizarNaoEntrelacado(lista)
    return
  }

  // Um so buffer: mono (passo 1) ou canais entrelacados (passo = canais, e
  // cada canal comeca no seu deslocamento).
  guard let buffer = lista.first, let dados = buffer.mData else { return }
  let amostras = dados.assumingMemoryBound(to: Float.self)
  let total = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
  let canais = max(1, Int(buffer.mNumberChannels))
  let porCanal = total / canais
  for canal in 0..<canais {
    estado.filtrar(amostras + canal, quantas: porCanal, passo: canais, canal: canal)
  }
  estado.finalizarEntrelacado(amostras, frames: porCanal, canais: canais)
}
