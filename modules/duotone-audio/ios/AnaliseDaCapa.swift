import AVFoundation
import QuartzCore
import os

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
    for band in 0..<8 { published[band] = min(1, sqrtf(powers[band] / Float(samples)) * 5) }
    publishedBeat = envelope; publishedAt = CACurrentMediaTime()
  }
}
