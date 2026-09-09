import AVFoundation
import os

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
 * MUDAR OS GANHOS JA NAO RECONSTROI O TAP -- e essa foi a correcao.
 *
 * Reconstruia. Cada mudanca criava um tap novo com os coeficientes ja fixos, e
 * instalar um `audioMix` num item que JA esta a tocar faz o AVFoundation
 * desmontar e voltar a preparar a cadeia: era o meio segundo de silencio que se
 * ouvia ao mexer num deslizador. E num ARRASTO nao era um corte, eram vinte --
 * o deslizador anda em passos de meio dB e cada passo reconstruia tudo.
 *
 * O tap passa a viver enquanto o item viver, e os coeficientes trocam-se por
 * baixo dele. As duas regras da thread de audio continuam de pe:
 *
 *  - **Nao bloqueia.** A troca e protegida por um `os_unfair_lock`, mas do lado
 *    do audio so se faz `trylock`: se a thread principal estiver a escrever
 *    naquele instante, o bloco salta a actualizacao e continua com os
 *    coeficientes que tinha. Um bloco de atraso sao dez milissegundos.
 *  - **Nao aloca.** Os arrays sao dimensionados uma vez no `prepare`, para as
 *    DEZ bandas, e nunca mudam de tamanho. Uma banda a zero passa a ser a
 *    identidade em vez de desaparecer da lista -- era o desaparecer que
 *    obrigava a realocar quando um ganho cruzava o zero.
 *
 * E os coeficientes nao saltam para o valor novo: caminham para la com a MESMA
 * constante de tempo que o PC usa (`setTargetAtTime(..., 0.02)`), aplicada uma
 * vez por bloco. Vinte milissegundos de aproximacao exponencial e o que torna a
 * mudanca inaudivel em vez de um estalo.
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
  static func mistura(
    para item: AVPlayerItem, ganhos: [Float], margem: Float
  ) -> (mix: AVAudioMix, estado: EstadoDoTap)? {
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
    // O ESTADO sai junto com a mistura. E por ele que os ganhos seguintes
    // chegam ao tap sem o reconstruir -- ver `actualizar`. Quem o guarda tem
    // de o guardar `weak`: quem o mantem vivo e o `passRetained` de cima, e
    // quem o larga e o `tapFinalize`.
    return (mix, estado)
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
  let analise = AnaliseDaCapa()
  /**
   * O cadeado que separa quem escreve de quem le.
   *
   * A thread principal fecha-o para deixar ganhos novos; a de audio so TENTA
   * (`trylock`) e desiste se estiver ocupado. E isso que o torna seguro em
   * tempo real: do lado do audio isto nunca bloqueia. Perder uma actualizacao
   * num bloco custa dez milissegundos de atraso, que ninguem ouve; bloquear a
   * thread de audio custa um estalo, que toda a gente ouve.
   *
   * ALOCADO, e nao uma propriedade com `&`. A Apple avisa: passar `&` sobre
   * uma variavel Swift a estas funcoes pode entregar-lhes uma COPIA
   * temporaria, e um cadeado que tranca uma copia nao tranca nada -- falharia
   * em silencio, e so se veria como estalos raros e irreproduziveis. Com o
   * ponteiro proprio, e sempre a mesma memoria.
   */
  private let cadeado: UnsafeMutablePointer<os_unfair_lock> = {
    let p = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
    p.initialize(to: os_unfair_lock())
    return p
  }()

  deinit {
    cadeado.deinitialize(count: 1)
    cadeado.deallocate()
  }

  /** O que a thread principal deixou por levantar. */
  private var ganhosPendentes: [Float]
  private var margemPendente: Float
  private var haNovidade = true

  /** Para onde os coeficientes caminham, e onde estao agora. Sempre DEZ,
   *  mesmo os que estao a zero -- ver a identidade no `recolherNovidade`. */
  private var destino: [Coeficientes] = []
  private var atual: [Coeficientes] = []
  private var margemDestino: Float = 1
  private var margemAtual: Float = 1
  /**
   * Nada a fazer a este bloco: curva plana e margem cheia.
   *
   * Antes, uma curva plana nem sequer instalava tap -- "um tap tem custo por
   * amostra, e uma curva plana nao muda nada". Agora o tap fica montado para
   * poder receber ganhos sem se reconstruir, e e esta bandeira que lhe tira o
   * custo: plano, nao se percorre uma unica amostra.
   */
  private var inerte = true

  private var z1: [Float] = []
  private var z2: [Float] = []
  private var canais = 0
  private var taxa: Float = 48000
  /** Peak limiter estereo ligado depois do EQ. A margem e unidade nas versoes
   * atuais; o limiter so impede que conteudo reforcado ultrapasse a saida
   * digital. */
  private let teto: Float = powf(10, -0.1 / 20)
  private var ganhoDoLimitador: Float = 1
  private var coeficienteDeRelease: Float = 0

  init(ganhos: [Float], margem: Float) {
    self.ganhosPendentes = ganhos
    self.margemPendente = margem
  }

  /**
   * Ganhos novos, vindos da thread principal.
   *
   * Nao toca nos coeficientes: so deixa o pedido. Quem os recalcula e a thread
   * de audio, no inicio do proximo bloco -- sao dez biquads, umas dezenas de
   * `sinf`/`cosf`, uns microsegundos dentro de um bloco de dez milissegundos.
   * Nao aloca nada: os arrays ja tem o tamanho final desde o `preparar`.
   */
  func actualizar(ganhos: [Float], margem: Float) {
    os_unfair_lock_lock(cadeado)
    ganhosPendentes = ganhos
    margemPendente = margem
    haNovidade = true
    os_unfair_lock_unlock(cadeado)
  }

  func preparar(taxa: Float, canais: Int) {
    analise.prepare(rate: taxa, channels: canais)
    self.canais = max(1, canais)
    self.taxa = max(1, taxa)
    // 150 ms: abaixo disto a recuperacao comeca a modular a propria onda dos
    // graves e ouve-se como distorcao. Ataque instantaneo para nunca cortar.
    coeficienteDeRelease = expf(-1 / (0.15 * max(1, taxa)))
    ganhoDoLimitador = 1
    // Espaco para as DEZ bandas, de uma vez. O tamanho nunca mais muda, e e
    // isso que permite trocar ganhos sem alocar dentro do callback.
    let total = self.canais * DuotoneEq.numeroDeBandas
    z1 = Array(repeating: 0, count: total)
    z2 = Array(repeating: 0, count: total)
    // Dois arrays SEPARADOS, e nao `atual = destino`.
    //
    // Em Swift, `atual = destino` poe os dois a partilhar a mesma memoria, e a
    // primeira escrita em `atual` dentro da rampa dispararia um copy-on-write
    // -- uma ALOCACAO no meio do callback de audio, que e exactamente o que
    // aqui nao se pode fazer. Cada um nasce com o seu buffer e nunca mais o
    // troca; daqui para a frente copia-se elemento a elemento.
    destino = Array(repeating: Coeficientes(), count: DuotoneEq.numeroDeBandas)
    atual = Array(repeating: Coeficientes(), count: DuotoneEq.numeroDeBandas)
    // A primeira vez nao leva rampa: a faixa comeca ja com o perfil dela.
    recolherNovidade(comRampa: false)
  }

  /**
   * Levanta o que a thread principal tenha deixado. So do lado do audio.
   *
   * `trylock` e nao `lock`: se a principal estiver a escrever neste instante,
   * este bloco fica com os coeficientes de antes e leva o valor novo no
   * seguinte.
   */
  func recolherNovidade(comRampa: Bool = true) {
    guard os_unfair_lock_trylock(cadeado) else { return }
    defer { os_unfair_lock_unlock(cadeado) }
    guard haNovidade, !destino.isEmpty else { return }
    haNovidade = false

    for i in 0..<DuotoneEq.numeroDeBandas {
      let db = i < ganhosPendentes.count ? ganhosPendentes[i] : 0
      // Abaixo de 0,05 dB nao se ouve: fica a IDENTIDADE (b0 = 1, o resto a
      // zero), e nao fora da lista. Sair da lista mudava o numero de bandas e
      // obrigava a realocar os estados no meio do callback.
      destino[i] = abs(db) < 0.05
        ? Coeficientes()
        : Coeficientes.criar(
            tipo: DuotoneEq.tipos[i], frequencia: DuotoneEq.frequencias[i],
            ganhoDb: db, q: DuotoneEq.q, taxa: taxa
          )
    }
    margemDestino = margemPendente
    if !comRampa {
      // Elemento a elemento, pela mesma razao do `preparar`: uma atribuicao de
      // array inteiro punha os dois a partilhar memoria e a rampa seguinte
      // alocava dentro do callback.
      for i in 0..<atual.count { atual[i] = destino[i] }
      margemAtual = margemDestino
    }
    recalcularInercia()
  }

  /**
   * Um passo da rampa, uma vez por bloco.
   *
   * A mesma matematica do `setTargetAtTime(v, t, 0.02)` que o PC usa no Web
   * Audio: aproximacao exponencial com constante de tempo de 20 ms. O passo
   * sai do numero de amostras do bloco, por isso a rampa dura o mesmo seja
   * qual for o tamanho que o AVFoundation escolher.
   *
   * Por bloco e nao por amostra de proposito: por amostra obrigava a
   * interpolar dez biquads a cada uma das 48 000 amostras por segundo, e a
   * diferenca nao se ouve -- os blocos sao de milissegundos e o degrau de cada
   * um e uma fraccao do total.
   */
  func avancarRampa(frames: Int) {
    guard !destino.isEmpty, frames > 0 else { return }
    let alfa = min(1, 1 - expf(-Float(frames) / (0.02 * taxa)))
    var mudou = false
    for i in 0..<atual.count {
      let a = atual[i], d = destino[i]
      if a.b0 == d.b0 && a.b1 == d.b1 && a.b2 == d.b2 && a.a1 == d.a1 && a.a2 == d.a2 { continue }
      atual[i] = Coeficientes(
        b0: a.b0 + (d.b0 - a.b0) * alfa,
        b1: a.b1 + (d.b1 - a.b1) * alfa,
        b2: a.b2 + (d.b2 - a.b2) * alfa,
        a1: a.a1 + (d.a1 - a.a1) * alfa,
        a2: a.a2 + (d.a2 - a.a2) * alfa
      )
      mudou = true
    }
    if margemAtual != margemDestino {
      margemAtual += (margemDestino - margemAtual) * alfa
      mudou = true
    }
    if mudou { recalcularInercia() }
  }

  /** Vale a pena percorrer as amostras deste bloco? */
  private func recalcularInercia() {
    if margemAtual < 0.999 { inerte = false; return }
    for c in atual {
      if abs(c.b0 - 1) > 1e-4 || abs(c.b1) > 1e-4 || abs(c.b2) > 1e-4
        || abs(c.a1) > 1e-4 || abs(c.a2) > 1e-4 {
        inerte = false
        return
      }
    }
    inerte = true
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
    guard quantas > 0, canal < canais, !inerte else { return }
    let bandas = atual.count
    guard bandas > 0 else { return }
    z1.withUnsafeMutableBufferPointer { e1 in
      z2.withUnsafeMutableBufferPointer { e2 in
        for banda in 0..<bandas {
          let c = atual[banda]
          // Uma banda na identidade nao muda uma amostra: salta-se, e o estado
          // dela fica onde estava. E o que devolve o custo de uma banda a zero
          // a exactamente zero, agora que elas ja nao saem da lista.
          if c.b0 == 1 && c.b1 == 0 && c.b2 == 0 && c.a1 == 0 && c.a2 == 0 { continue }
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
   * estereo. A descida e instantanea; a recuperacao demora 150 ms. */
  private func ganhoParaOPico(_ pico: Float) -> Float {
    let desejado = pico > teto ? teto / pico : 1
    let recuperado = 1 + coeficienteDeRelease * (ganhoDoLimitador - 1)
    ganhoDoLimitador = min(desejado, recuperado)
    return margemAtual * ganhoDoLimitador
  }

  /** Saida planar: um AudioBuffer por canal (o caso normal do AVPlayer). */
  func finalizarNaoEntrelacado(_ lista: UnsafeMutableAudioBufferListPointer) {
    guard !lista.isEmpty, !inerte else { return }
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
        let x = dados.assumingMemoryBound(to: Float.self)[frame] * margemAtual
        pico = max(pico, abs(x))
      }
      let g = ganhoParaOPico(pico)
      for buffer in lista {
        guard let dados = buffer.mData else { continue }
        dados.assumingMemoryBound(to: Float.self)[frame] *= g
      }
    }
  }

  /** Saida intercalada: L,R,L,R... dentro de um unico AudioBuffer. */
  func finalizarEntrelacado(
    _ amostras: UnsafeMutablePointer<Float>,
    frames: Int,
    canais: Int
  ) {
    guard frames > 0, canais > 0, !inerte else { return }
    for frame in 0..<frames {
      let inicio = frame * canais
      var pico: Float = 0
      for canal in 0..<canais {
        pico = max(pico, abs(amostras[inicio + canal] * margemAtual))
      }
      let g = ganhoParaOPico(pico)
      for canal in 0..<canais { amostras[inicio + canal] *= g }
    }
  }
}

/**
 * Quantas amostras POR CANAL traz este bloco.
 *
 * A rampa precisa deste numero: e dele que sai o tamanho do passo, e e o que
 * faz a aproximacao durar os mesmos 20 ms independentemente do tamanho de
 * bloco que o AVFoundation escolher -- que nao e fixo nem anunciado.
 */
private func quantasAmostras(_ lista: UnsafeMutableAudioBufferListPointer) -> Int {
  guard let primeiro = lista.first else { return 0 }
  let total = Int(primeiro.mDataByteSize) / MemoryLayout<Float>.size
  // Num buffer so, os canais vem entrelacados la dentro.
  return lista.count > 1 ? total : total / max(1, Int(primeiro.mNumberChannels))
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

  // UMA VEZ POR BLOCO, e antes de tocar numa amostra: levantar os ganhos que a
  // thread principal tenha deixado, e dar um passo da rampa para eles. E isto
  // que substitui a reconstrucao do tap -- e, com ela, o meio segundo de
  // silencio que se ouvia ao mexer num deslizador.
  estado.recolherNovidade()
  estado.avancarRampa(frames: quantasAmostras(lista))
  estado.analise.process(lista, frames: min(Int(quantidadeSaida.pointee), quantasAmostras(lista)))

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
