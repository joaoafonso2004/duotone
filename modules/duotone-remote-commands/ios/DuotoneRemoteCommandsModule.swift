import ExpoModulesCore
import MediaPlayer
import UIKit

/**
 * Comandos remotos de faixa e capa do Lock Screen / CarPlay / auscultadores.
 *
 * Duas coisas que o expo-video não faz:
 *
 *  1. nextTrackCommand/previousTrackCommand — para o iOS cada música é um item
 *     isolado, não uma fila. Registamo-los aqui e reencaminhamo-los para o JS,
 *     que é quem conhece a fila.
 *  2. A capa sem barras — ver `semBarras` mais abaixo.
 */
public class DuotoneRemoteCommandsModule: Module {
  private var nextTarget: Any?
  private var prevTarget: Any?

  private var playTarget: Any?
  private var pauseTarget: Any?
  private var aObservarPlayPause = false

  private var capaTask: URLSessionDataTask?
  private var capaUrlAtual: String?
  private var capaCache: [String: MPMediaItemArtwork] = [:]

  public func definition() -> ModuleDefinition {
    Name("DuotoneRemoteCommands")

    Events("onNextTrack", "onPreviousTrack", "onPlayCommand", "onPauseCommand")

    Function("setCommandsEnabled") { (next: Bool, previous: Bool) in
      DispatchQueue.main.async { [weak self] in
        self?.apply(next: next, previous: previous)
      }
    }

    // Fontes por ordem de preferência; fica a primeira que responder.
    Function("setArtwork") { (urls: [String]) in
      DispatchQueue.main.async { [weak self] in
        self?.definirCapa(urls)
      }
    }

    /**
     * A capa reduzida a uma grelha de médias, para dela sair a cor.
     *
     * O lado do PC faz isto com `canvas`: desenha a imagem em 4x4 e lê as
     * dezasseis células. No telemóvel usava-se um blurhash, que NÃO é a mesma
     * coisa -- é uma reconstrução por cossenos, com oscilação, e inventa cores
     * que a foto não tem. Como quem escolhe o tom fica com a célula mais
     * saturada, bastava um artefacto para o perfil ficar roxo de uma fotografia
     * castanha, e o mesmo ficheiro dava tons diferentes nas duas plataformas.
     *
     * Devolve r,g,b seguidos, saltando o que vier translúcido -- exactamente o
     * que o `celulasDaCapa.web.ts` faz.
     */
    AsyncFunction("sampleCells") { (url: String, colunas: Int, linhas: Int, promise: Promise) in
      guard let endereco = URL(string: url), colunas > 0, linhas > 0 else {
        promise.resolve([Int]())
        return
      }
      URLSession.shared.dataTask(with: endereco) { [weak self] dados, resposta, _ in
        guard let self = self,
              (resposta as? HTTPURLResponse)?.statusCode == 200,
              let dados = dados,
              let imagem = UIImage(data: dados),
              let cg = imagem.cgImage
        else {
          promise.resolve([Int]())
          return
        }
        promise.resolve(self.amostrar(cg, colunas, linhas))
      }.resume()
    }

    OnDestroy {
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        self.apply(next: false, previous: false)
        self.capaTask?.cancel()
        let center = MPRemoteCommandCenter.shared()
        if let t = self.playTarget { center.playCommand.removeTarget(t) }
        if let t = self.pauseTarget { center.pauseCommand.removeTarget(t) }
        self.playTarget = nil
        self.pauseTarget = nil
        self.aObservarPlayPause = false
      }
    }
  }

  /**
   * O play/pause do Lock Screen e do carro é tratado pelo expo-video, que mexe
   * no AVPlayer directamente e nunca passa pela store. Resultado: a app ficava
   * a pensar que ainda queria tocar depois de o utilizador pausar por fora.
   *
   * Isso importa mais do que parece. O `isPlaying` do expo-video é
   * `timeControlStatus == .playing`, que dá falso tanto numa pausa como num
   * stream encravado — em JS os dois casos são indistinguíveis. Saber que veio
   * mesmo uma ORDEM de pausa é o que os separa, e é o que impede o watchdog de
   * fim de faixa de confundir uma pausa nos últimos segundos com uma faixa
   * presa.
   *
   * Um MPRemoteCommand aceita vários alvos e chama-os todos, por isso isto
   * observa sem tirar nada ao expo-video.
   */
  private func observarPlayPause() {
    if aObservarPlayPause { return }
    aObservarPlayPause = true
    let center = MPRemoteCommandCenter.shared()

    playTarget = center.playCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPlayCommand")
      return .success
    }
    pauseTarget = center.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPauseCommand")
      return .success
    }
  }

  private func apply(next: Bool, previous: Bool) {
    let center = MPRemoteCommandCenter.shared()
    observarPlayPause()

    if let t = nextTarget {
      center.nextTrackCommand.removeTarget(t)
      nextTarget = nil
    }
    if let t = prevTarget {
      center.previousTrackCommand.removeTarget(t)
      prevTarget = nil
    }

    // O expo-video ativa skipForward/skipBackward (+/-10s) sempre que reconstrói
    // os alvos do Now Playing, e o iOS dá-lhes os slots do Lock Screen por cima
    // de next/previousTrack. Com os nossos comandos de faixa ativos, desativamos
    // os saltos. Quem reafirma isto é src/lib/comandosDeFaixa.ts, a partir dos
    // eventos do próprio player — não por temporizador.
    let takeover = next || previous
    center.skipForwardCommand.isEnabled = !takeover
    center.skipBackwardCommand.isEnabled = !takeover

    center.nextTrackCommand.isEnabled = next
    if next {
      nextTarget = center.nextTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onNextTrack")
        return .success
      }
    }

    center.previousTrackCommand.isEnabled = previous
    if previous {
      prevTarget = center.previousTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onPreviousTrack")
        return .success
      }
    }
  }

  // MARK: - Capa

  /**
   * O JS deixa de passar `artwork` nos metadados do expo-video, por isso ele
   * nunca escreve MPMediaItemPropertyArtwork — e como funde sempre com o
   * nowPlayingInfo existente em vez de o substituir, a capa que pomos aqui
   * sobrevive às atualizações dele.
   */
  private func definirCapa(_ urls: [String]) {
    let chave = urls.first ?? ""

    if chave.isEmpty {
      capaTask?.cancel()
      capaTask = nil
      capaUrlAtual = nil
      escreverCapa(nil)
      return
    }

    // Mesma faixa E a capa ainda lá está: não há nada a fazer. A segunda
    // condição importa — quando o último player se desregista, o expo-video
    // limpa o nowPlayingInfo todo, e sem ela a capa nunca voltaria ao remontar
    // na mesma música.
    let jaTemCapa = MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyArtwork] != nil
    if chave == capaUrlAtual, jaTemCapa { return }
    capaUrlAtual = chave
    capaTask?.cancel()
    capaTask = nil

    if let guardada = capaCache[chave] {
      escreverCapa(guardada)
      return
    }

    // Não deixar ficar a capa da faixa anterior à espera do download.
    escreverCapa(nil)
    descarregar(urls, indice: 0, chave: chave)
  }

  private func descarregar(_ urls: [String], indice: Int, chave: String) {
    guard indice < urls.count, let url = URL(string: urls[indice]) else { return }

    let task = URLSession.shared.dataTask(with: url) { [weak self] dados, resposta, _ in
      guard let self = self else { return }

      let codigo = (resposta as? HTTPURLResponse)?.statusCode ?? 0
      guard codigo == 200, let dados = dados, let imagem = UIImage(data: dados) else {
        // Um 404 no maxresdefault é o caso normal, não uma avaria: segue para a
        // fonte seguinte.
        DispatchQueue.main.async {
          guard self.capaUrlAtual == chave else { return }
          self.descarregar(urls, indice: indice + 1, chave: chave)
        }
        return
      }

      let limpa = self.semBarras(imagem)
      let arte = MPMediaItemArtwork(boundsSize: limpa.size) { _ in limpa }

      DispatchQueue.main.async {
        // A faixa pode ter mudado enquanto isto descarregava.
        guard self.capaUrlAtual == chave else { return }
        if self.capaCache.count > 40 { self.capaCache.removeAll() }
        self.capaCache[chave] = arte
        self.escreverCapa(arte)
      }
    }
    capaTask = task
    task.resume()
  }

  private func escreverCapa(_ arte: MPMediaItemArtwork?) {
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    if let arte = arte {
      info[MPMediaItemPropertyArtwork] = arte
    } else {
      info.removeValue(forKey: MPMediaItemPropertyArtwork)
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  /**
   * Corta as margens uniformes dos quatro lados e devolve o maior quadrado
   * centrado do que sobra.
   *
   * O YouTube põe a capa quadrada dentro de um quadro 16:9 (barras aos lados) e
   * o thumbnail 4:3 acrescenta barras em cima e em baixo — daí a capa chegar
   * pequena no meio de um retângulo preto. Num vídeo de música a sério, onde
   * não há barras nenhumas, isto degenera no quadrado central, que é o que
   * qualquer app de música mostra.
   *
   * A deteção corre numa amostra de 96 px: chega para achar margens e evita
   * percorrer 1280x720 píxeis.
   */
  private func semBarras(_ imagem: UIImage) -> UIImage {
    guard let cg = imagem.cgImage, cg.width > 16, cg.height > 16 else { return imagem }
    let larguraTotal = cg.width
    let alturaTotal = cg.height
    let tudo = CGRect(x: 0, y: 0, width: larguraTotal, height: alturaTotal)

    let maiorLado = 96.0
    let escala = min(1.0, maiorLado / Double(max(larguraTotal, alturaTotal)))
    let w = max(8, Int((Double(larguraTotal) * escala).rounded()))
    let h = max(8, Int((Double(alturaTotal) * escala).rounded()))

    var pixeis = [UInt8](repeating: 0, count: w * h * 4)

    let desenhou: Bool = pixeis.withUnsafeMutableBytes { buffer -> Bool in
      guard let base = buffer.baseAddress,
            let ctx = CGContext(
              data: base,
              width: w,
              height: h,
              bitsPerComponent: 8,
              bytesPerRow: w * 4,
              space: CGColorSpaceCreateDeviceRGB(),
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
      else { return false }
      // Sem esta inversão a linha 0 do buffer seria a de BAIXO da imagem e o
      // "topo" calculado a seguir sairia trocado com o fundo.
      ctx.translateBy(x: 0, y: CGFloat(h))
      ctx.scaleBy(x: 1, y: -1)
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }

    if !desenhou { return quadradoCentral(cg, tudo) ?? imagem }

    // Uma margem é barra quando a linha inteira é praticamente da mesma cor.
    // Tolerância de 12 por canal: aguenta o ruído do JPEG sem apagar capas de
    // fundo liso.
    let tolerancia = 12

    func uniforme(_ inicio: Int, _ fim: Int, _ passo: Int) -> Bool {
      var minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
      var i = inicio
      while i <= fim {
        let r = Int(pixeis[i]), g = Int(pixeis[i + 1]), b = Int(pixeis[i + 2])
        if r < minR { minR = r }
        if r > maxR { maxR = r }
        if g < minG { minG = g }
        if g > maxG { maxG = g }
        if b < minB { minB = b }
        if b > maxB { maxB = b }
        i += passo
      }
      return (maxR - minR) <= tolerancia
        && (maxG - minG) <= tolerancia
        && (maxB - minB) <= tolerancia
    }

    func linhaUniforme(_ y: Int) -> Bool {
      uniforme(y * w * 4, (y * w + w - 1) * 4, 4)
    }
    func colunaUniforme(_ x: Int) -> Bool {
      uniforme(x * 4, ((h - 1) * w + x) * 4, w * 4)
    }

    var topo = 0
    while topo < h / 2, linhaUniforme(topo) { topo += 1 }
    var fundo = h - 1
    while fundo > h / 2, linhaUniforme(fundo) { fundo -= 1 }
    var esquerda = 0
    while esquerda < w / 2, colunaUniforme(esquerda) { esquerda += 1 }
    var direita = w - 1
    while direita > w / 2, colunaUniforme(direita) { direita -= 1 }

    let larguraUtil = direita - esquerda + 1
    let alturaUtil = fundo - topo + 1

    // Se sobrou pouco, a deteção enganou-se (uma capa mesmo escura, por
    // exemplo). Mais vale o quadrado central da imagem inteira do que um
    // recorte errado.
    if larguraUtil < w / 3 || alturaUtil < h / 3 {
      return quadradoCentral(cg, tudo) ?? imagem
    }

    let fx = Double(larguraTotal) / Double(w)
    let fy = Double(alturaTotal) / Double(h)
    let util = CGRect(
      x: (Double(esquerda) * fx).rounded(.down),
      y: (Double(topo) * fy).rounded(.down),
      width: (Double(larguraUtil) * fx).rounded(.down),
      height: (Double(alturaUtil) * fy).rounded(.down)
    ).intersection(tudo)

    if util.isEmpty { return quadradoCentral(cg, tudo) ?? imagem }
    return quadradoCentral(cg, util) ?? imagem
  }

  /// A imagem desenhada numa grelha pequena, uma média por célula.
  private func amostrar(_ cg: CGImage, _ colunas: Int, _ linhas: Int) -> [Int] {
    var pixeis = [UInt8](repeating: 0, count: colunas * linhas * 4)

    let desenhou: Bool = pixeis.withUnsafeMutableBytes { buffer -> Bool in
      guard let base = buffer.baseAddress,
            let ctx = CGContext(
              data: base,
              width: colunas,
              height: linhas,
              bitsPerComponent: 8,
              bytesPerRow: colunas * 4,
              space: CGColorSpaceCreateDeviceRGB(),
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
      else { return false }
      // Sem isto a redução apanha um pixel a cada salto em vez da média da
      // área, e uma capa com detalhe fino dava cores que lá não estão.
      ctx.interpolationQuality = .high
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: colunas, height: linhas))
      return true
    }

    guard desenhou else { return [] }

    var saida: [Int] = []
    saida.reserveCapacity(colunas * linhas * 3)
    for i in stride(from: 0, to: pixeis.count, by: 4) {
      // Margens translúcidas de um PNG não são cor da capa.
      if pixeis[i + 3] < 200 { continue }
      saida.append(Int(pixeis[i]))
      saida.append(Int(pixeis[i + 1]))
      saida.append(Int(pixeis[i + 2]))
    }
    return saida
  }

  /// O maior quadrado centrado dentro de `zona`, já recortado da imagem.
  private func quadradoCentral(_ cg: CGImage, _ zona: CGRect) -> UIImage? {
    let lado = min(zona.width, zona.height).rounded(.down)
    if lado < 1 { return nil }
    let quadrado = CGRect(
      x: (zona.midX - lado / 2).rounded(.down),
      y: (zona.midY - lado / 2).rounded(.down),
      width: lado,
      height: lado
    )
    guard let cortada = cg.cropping(to: quadrado) else { return nil }
    return UIImage(cgImage: cortada)
  }
}
