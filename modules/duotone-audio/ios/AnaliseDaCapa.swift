import AVFoundation
import QuartzCore
import os

/**
 * A JANELA em dB, e porque nao e a do Web Audio.
 *
 * O PC le `getByteFrequencyData`, que mapeia -100..-30 dBFS em 0..255 -- mas
 * sobre BINS de uma FFT, cuja magnitude e muito menor do que o RMS de uma banda
 * inteira. Copiar esses numeros aqui punha o nivel encostado ao tecto o tempo
 * todo, que e como se ve: treme tudo, sempre, sem seguir a musica.
 *
 * Esta janela e a mesma ideia com os limites postos onde o RMS de uma banda
 * vive. Quarenta dB de amplitude, com o meio da musica a cair a meio:
 *
 *   -45 dB (uma passagem calada) ... 0,0
 *   -25 dB (o corpo de uma musica) . 0,5   -> levelAvg ~127, glitch de 3 px
 *   -14 dB (um refrao) ............. 0,78
 *    -5 dB (um pico) ............... 1,0
 *
 * O que importa nao e o valor absoluto -- e a DINAMICA. Com o nivel encostado
 * ao tecto, o `glitchCount` do shader passa de 3 px para 44 e o que se ve e
 * tremor constante que nao segue nada; e com a base a meio, o efeito fica
 * calmo e sao as BATIDAS que o empurram para cima (a batida vale 185 dos 255).
 * E a diferenca entre "treme tudo" e "anda colado a musica".
 */
private let SILENCIO_DB: Float = -45
private let CHEIO_DB: Float = -5

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
  private let published = UnsafeMutablePointer<Float>.allocate(capacity: 8)
  private var coefficients = [Coeficientes]()
  private var z1 = [Float](), z2 = [Float]()
  private var powers = [Float]()
  private var rate: Float = 48000
  private var channels = 0
  private var average: Float = 0, previous: Float = 0, envelope: Float = 0
  private var sinceBeat: Float = 1

  init() { published.initialize(repeating: 0, count: 8) }
  deinit {
    published.deinitialize(count: 8); published.deallocate()
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
    return (0..<8).map { Double(published[$0]) } + [Double(publishedBeat)]
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
    guard os_unfair_lock_trylock(lock) else { return }
    defer { os_unfair_lock_unlock(lock) }
    guard enabled, !reset else { return }
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
    for band in 0..<8 {
      let rms = sqrtf(powers[band] / Float(samples))
      let db = 20 * log10f(max(rms, 1e-5))
      published[band] = min(1, max(0, (db - SILENCIO_DB) / (CHEIO_DB - SILENCIO_DB)))
    }
    publishedBeat = envelope; publishedAt = CACurrentMediaTime()
  }
}
