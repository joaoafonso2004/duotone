import ExpoModulesCore
import AVFoundation

/**
 * Tom e equalizador por cima do AVPlayer que o expo-video ja esta a tocar.
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
 */
public class DuotoneAudioModule: Module {
  private var observacao: NSKeyValueObservation?
  private weak var player: AVPlayer?
  /** Ultimos ganhos pedidos, para reaplicar quando a faixa muda. */
  private var ganhos: [Float] = Array(repeating: 0, count: DuotoneEq.numeroDeBandas)
  private var margem: Float = 1

  public func definition() -> ModuleDefinition {
    Name("DuotoneAudio")

    /**
     * Liga-se ao player e passa a tratar de cada item que ele tocar.
     * Chama-se uma vez, quando o player e criado.
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
     */
    Function("aplicarEqualizador") { (db: [Double], margem: Double) in
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.ganhos = DuotoneEq.normalizar(db)
        self.margem = margem.isFinite && margem > 0 && margem <= 1 ? Float(margem) : 1
        self.aplicarNoItem(self.player?.currentItem)
      }
    }

    OnDestroy {
      DispatchQueue.main.async { [weak self] in
        self?.observacao?.invalidate()
        self?.observacao = nil
      }
    }
  }

  private func ligar(_ p: AVPlayer) {
    guard player !== p else { return }
    player = p
    observacao?.invalidate()
    // `.initial` para apanhar o item que ja la esteja quando isto corre.
    // O KVO dispara na thread de quem escreveu a propriedade — que aqui e o
    // expo-video, e nao temos garantia de qual e — por isso volta-se sempre a
    // main antes de mexer no item.
    observacao = p.observe(\.currentItem, options: [.initial, .new]) { [weak self] jogador, _ in
      let item = jogador.currentItem
      DispatchQueue.main.async { self?.aplicarNoItem(item) }
    }
  }

  private func aplicarNoItem(_ item: AVPlayerItem?) {
    guard let item else { return }

    // 1. O TOM ACOMPANHA A VELOCIDADE.
    //
    // Os valores por omissao (.spectral, .timeDomain) preservam o tom, o que
    // significa esticar o tempo -- e a 0,5x um time-stretch tem de inventar
    // metade do sinal, que e exatamente o que se ouvia como artefactos. Com
    // .varispeed o tom desce com a velocidade, como abrandar uma fita. E a
    // mesma correcao que ja fizemos no PC com `preservesPitch = false`.
    item.audioTimePitchAlgorithm = .varispeed

    // 2. O EQUALIZADOR.
    //
    // Sem ganhos nenhuns nao se instala tap nenhum: um tap tem custo por
    // amostra, e uma curva plana nao muda nada.
    if DuotoneEq.ePlano(ganhos) && margem >= 1 {
      item.audioMix = nil
      return
    }
    item.audioMix = DuotoneEq.mistura(para: item, ganhos: ganhos, margem: margem)
  }
}
