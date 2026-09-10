import Accelerate
import AVFoundation
import QuartzCore
import os

/**
 * A FFT, e porque ela e que faltava.
 *
 * O shader le o espectro POR LINHA do ecra: `texture2D(uEspetro, 1 - vUv.y)`,
 * e o desvio de cada linha e `floor(banda/20 + 0,5)`. Com oito passa-bandas
 * esticadas para 256 texels, linhas vizinhas recebem quase o mesmo valor --
 * e o que se ve sao dois ou tres blocos a deslizar todos juntos. No PC, cada
 * linha le um bin diferente de uma FFT de 1024 e o desvio muda de linha para
 * linha: e disso que vem o pente irregular que faz o efeito parecer o efeito.
 *
 * Os mesmos numeros do `beat.web.ts`: 1024 pontos, suavizacao 0,68, e a
 * conversao para byte do `getByteFrequencyData` do Web Audio -- -100 a -30
 * dBFS mapeados em 0..255. Assim o nivel e os agudos podem sair DOS BINS, com
 * as formulas do PC, em vez de uma escala calibrada a mao deste lado.
 *
 * Custa menos do que parece: uma FFT de 1024 por bloco sao ~10 mil operacoes,
 * menos do que as oito biquads que ja la estavam. E nao aloca -- o `setup`, as
 * janelas e os buffers nascem todos no `prepare`.
 */
private let FFT_LOG2: vDSP_Length = 10
private let FFT_N = 1024
private let BINS = 256
/** A janela do `getByteFrequencyData`. */
private let DB_MIN: Float = -100
private let DB_MAX: Float = -30
private let SUAVIZACAO: Float = 0.68


/** Leitura do tap existente. Nunca escreve nas amostras nem espera por um lock
 * na thread de áudio. Os oito filtros e os buffers nascem no prepare. */
final class AnaliseDaCapa {
  private let lock: UnsafeMutablePointer<os_unfair_lock> = {
    let p = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
    p.initialize(to: os_unfair_lock()); return p
  }()
  private var enabled = false
  private var reset = true
  private var publishedAt: Double = 0
  private var publishedBeat: Float = 0
  private var coefficients = [Coeficientes]()
  private var z1 = [Float](), z2 = [Float]()
  private var powers = [Float]()
  private var rate: Float = 48000
  private var channels = 0
  private var average: Float = 0, previous: Float = 0, envelope: Float = 0
  private var sinceBeat: Float = 1

  // --- a FFT do espectro visual (ver o cabecalho do ficheiro) --------------
  private var fftSetup: FFTSetup?
  private var janela = [Float]()
  /** Anel de mono, sempre com as ultimas FFT_N amostras. */
  private var anel = [Float]()
  private var escrita = 0
  private var janelado = [Float]()
  private var parteReal = [Float](), parteImag = [Float]()
  private var magnitudes = [Float]()
  private let bins = UnsafeMutablePointer<Float>.allocate(capacity: BINS)

  init() {
    bins.initialize(repeating: 0, count: BINS)
  }
  deinit {
    bins.deinitialize(count: BINS); bins.deallocate()
    if let fftSetup { vDSP_destroy_fftsetup(fftSetup) }
    lock.deinitialize(count: 1); lock.deallocate()
  }
  func setEnabled(_ value: Bool) {
    os_unfair_lock_lock(lock); defer { os_unfair_lock_unlock(lock) }
    if enabled != value { enabled = value; reset = true; publishedAt = 0 }
  }
  /** Chamado fora da thread de áudio. A alocação do resultado pertence ao JS. */
  func read() -> [Double] {
    os_unfair_lock_lock(lock); defer { os_unfair_lock_unlock(lock) }
    guard enabled, publishedAt > 0, CACurrentMediaTime() - publishedAt < 0.25 else { return [] }
    // [0..<BINS] o espectro, e no fim o envelope da batida. O nivel e os agudos
    // saem dos bins do lado do JS, com as formulas do PC.
    var saida = [Double](repeating: 0, count: BINS + 1)
    for i in 0..<BINS { saida[i] = Double(bins[i]) }
    saida[BINS] = Double(publishedBeat)
    return saida
  }
  func prepare(rate: Float, channels: Int) {
    self.rate = max(1, rate); self.channels = max(1, channels)
    coefficients = [Float(64), 125, 250, 500, 1000, 2000, 4000, 8000].map { hz in
      // Biquad passa-banda, pico unitário, Q=1. Frequências acima de Nyquist
      // ficam abaixo dele, também nos ficheiros com baixa taxa de amostragem.
      let w = 2 * Float.pi * min(hz, self.rate * 0.45) / self.rate
      let alpha = sinf(w) / 2
      var c = Coeficientes()
      c.b0 = alpha / (1 + alpha); c.b1 = 0; c.b2 = -c.b0
      c.a1 = -2 * cosf(w) / (1 + alpha); c.a2 = (1 - alpha) / (1 + alpha)
      return c
    }
    z1 = Array(repeating: 0, count: self.channels * 8)
    z2 = Array(repeating: 0, count: self.channels * 8)
    powers = Array(repeating: 0, count: 8)
    average = 0; previous = 0; envelope = 0; sinceBeat = 1

    // Tudo o que a FFT precisa nasce AQUI: a thread de audio nao aloca.
    if fftSetup == nil { fftSetup = vDSP_create_fftsetup(FFT_LOG2, FFTRadix(kFFTRadix2)) }
    janela = [Float](repeating: 0, count: FFT_N)
    vDSP_hann_window(&janela, vDSP_Length(FFT_N), Int32(vDSP_HANN_NORM))
    anel = [Float](repeating: 0, count: FFT_N)
    janelado = [Float](repeating: 0, count: FFT_N)
    parteReal = [Float](repeating: 0, count: FFT_N / 2)
    parteImag = [Float](repeating: 0, count: FFT_N / 2)
    magnitudes = [Float](repeating: 0, count: BINS)
    escrita = 0
  }
  func process(_ buffers: UnsafeMutableAudioBufferListPointer, frames: Int) {
    guard frames > 0, channels > 0, os_unfair_lock_trylock(lock) else { return }
    let active = enabled, restarting = reset
    if active { reset = false }
    os_unfair_lock_unlock(lock)
    guard active else { return }
    if restarting {
      for i in z1.indices { z1[i] = 0; z2[i] = 0 }
      average = 0; previous = 0; envelope = 0; sinceBeat = 1
    }
    if restarting {
      for i in anel.indices { anel[i] = 0 }
      for i in magnitudes.indices { magnitudes[i] = 0 }
      escrita = 0
    }
    // O mono entra no anel primeiro: a FFT le a onda como ela chega, antes de
    // as biquads da deteccao lhe tocarem.
    somarAoAnel(buffers, frames: frames)

    for i in 0..<8 { powers[i] = 0 }
    var samples = 0
    for (bufferIndex, buffer) in buffers.enumerated() {
      guard let data = buffer.mData else { continue }
      let values = data.assumingMemoryBound(to: Float.self)
      let stride = max(1, Int(buffer.mNumberChannels))
      let count = min(frames, Int(buffer.mDataByteSize) / MemoryLayout<Float>.size / stride)
      for channel in 0..<stride {
        let index = buffers.count > 1 ? bufferIndex : channel
        guard index < channels else { continue }
        samples += count
        for band in 0..<8 {
          let c = coefficients[band], state = index * 8 + band
          var a = z1[state], b = z2[state], sum: Float = 0
          for frame in 0..<count {
            let raw = values[frame * stride + channel]
            let x: Float = raw.isFinite ? raw : 0
            let y = c.b0 * x + a
            a = -c.a1 * y + b; b = c.b2 * x - c.a2 * y
            sum += y * y
          }
          z1[state] = a; z2[state] = b; powers[band] += sum
        }
      }
    }
    guard samples > 0 else { return }
    let dt = Float(frames) / rate
    let bass = sqrtf((powers[0] + powers[1]) / Float(samples))
    sinceBeat += dt
    envelope *= expf(-dt / 0.085)
    let flux = max(0, bass - previous)
    if bass > 0.008 && flux > max(0.004, average * 0.25) && sinceBeat > 0.09 {
      envelope = min(1, flux * 14); sinceBeat = 0
    }
    average += (bass - average) * (1 - expf(-dt / 0.5)); previous = bass
    calcularEspectro()

    guard os_unfair_lock_trylock(lock) else { return }
    defer { os_unfair_lock_unlock(lock) }
    guard enabled, !reset else { return }
    for i in 0..<BINS { bins[i] = magnitudes[i] }
    // A MESMA escala do `getByteFrequencyData` do Web Audio, que e o que o
    // shader espera: dBFS de -100 a -30 mapeados em 0..1. Sem isto o iPhone
    // mandava um RMS LINEAR, que para musica normal fica em 0,05-0,2 -- e os
    // limiares do shader (220 para as caixas, 300 para as linhas) nunca eram
    // atingidos. O efeito ficava reduzido ao pulso da batida, e era isso que
    // se via de diferente do PC.
    //
    // A escala tambem muda o CARACTER: o linear e esguio e passa a maior parte
    // do tempo em baixo; o dB e comprimido e vive na parte de cima, que e o
    // que faz o efeito do PC estar continuamente vivo em vez de acordar so nas
    // batidas.
    publishedBeat = envelope; publishedAt = CACurrentMediaTime()
  }

  /** As amostras em mono, no anel circular. Sem alocar nada. */
  private func somarAoAnel(_ buffers: UnsafeMutableAudioBufferListPointer, frames: Int) {
    guard !anel.isEmpty else { return }
    let planar = buffers.count > 1
    for frame in 0..<frames {
      var soma: Float = 0
      var vozes = 0
      for buffer in buffers {
        guard let data = buffer.mData else { continue }
        let values = data.assumingMemoryBound(to: Float.self)
        let stride = max(1, Int(buffer.mNumberChannels))
        let disponiveis = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size / stride
        guard frame < disponiveis else { continue }
        if planar {
          let v = values[frame]
          soma += v.isFinite ? v : 0
          vozes += 1
        } else {
          for canal in 0..<stride {
            let v = values[frame * stride + canal]
            soma += v.isFinite ? v : 0
            vozes += 1
          }
        }
      }
      anel[escrita] = vozes > 0 ? soma / Float(vozes) : 0
      escrita = (escrita + 1) % FFT_N
    }
  }

  /**
   * As ultimas FFT_N amostras -> 256 bytes na escala do `getByteFrequencyData`.
   *
   * A suavizacao e a media entre fotogramas que o AnalyserNode faz por dentro
   * (0,68 no PC): sem ela o espectro pisca, com ela respira.
   */
  private func calcularEspectro() {
    guard let fftSetup, anel.count == FFT_N, magnitudes.count == BINS else { return }
    // Desenrola o anel pela ordem certa e aplica a janela de Hann no caminho.
    for i in 0..<FFT_N {
      janelado[i] = anel[(escrita + i) % FFT_N] * janela[i]
    }
    let escala = 2 / Float(FFT_N)
    parteReal.withUnsafeMutableBufferPointer { re in
      parteImag.withUnsafeMutableBufferPointer { im in
        var split = DSPSplitComplex(realp: re.baseAddress!, imagp: im.baseAddress!)
        janelado.withUnsafeBufferPointer { entrada in
          entrada.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: FFT_N / 2) { par in
            vDSP_ctoz(par, 2, &split, 1, vDSP_Length(FFT_N / 2))
          }
        }
        vDSP_fft_zrip(fftSetup, &split, 1, FFT_LOG2, FFTDirection(FFT_FORWARD))
        for k in 0..<BINS {
          // O bin 0 do zrip traz o Nyquist no imaginario: nao serve de nada
          // aqui e so faria a primeira linha saltar.
          let re0 = k == 0 ? re[0] : re[k]
          let im0 = k == 0 ? 0 : im[k]
          // O zrip devolve o dobro, e o ctoz ja empacotou a metade util.
          let mag = sqrtf(re0 * re0 + im0 * im0) * escala * 0.5
          let db = 20 * log10f(max(mag, 1e-7))
          let byte = max(0, min(255, 255 * (db - DB_MIN) / (DB_MAX - DB_MIN)))
          magnitudes[k] = magnitudes[k] * SUAVIZACAO + byte * (1 - SUAVIZACAO)
        }
      }
    }
  }
}
