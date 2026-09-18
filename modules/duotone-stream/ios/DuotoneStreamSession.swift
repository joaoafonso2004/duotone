import AVFoundation
import Foundation

/**
 * Uma faixa a tocar enquanto descarrega.
 *
 * O AVPlayer pede intervalos de bytes; da-se-lhe o que ja esta no disco e os
 * pedidos que vao alem disso ficam a espera ate o JS dizer que o ficheiro
 * cresceu (`cresceu`). Tudo corre numa fila so -- a mesma em que o AVFoundation
 * chama o delegate --, por isso nao ha estado partilhado entre threads.
 *
 * Os bytes saem as rondas, com um teto por pedido: um pedido "ate ao fim" de um
 * ficheiro ja completo despejava-o todo de uma vez, e o AVFoundation so
 * consegue cancelar entre rondas (o cancelamento chega por esta mesma fila).
 */
final class DuotoneStreamSession: NSObject, AVAssetResourceLoaderDelegate {
  let id: String
  let fila = DispatchQueue(label: "duotone.stream.sessao")

  private static let porLeitura: Int64 = 256 * 1024
  private static let porRonda: Int64 = 1024 * 1024
  private static let pedidosNoRelatorio = 12

  private let total: Int64
  private var leitor: FileHandle?
  private var disponiveis: Int64 = 0
  private var fechada = false
  private var rondaMarcada = false
  private var pendentes: [AVAssetResourceLoadingRequest] = []
  private var pedidosVistos: [[String: Any]] = []
  private var servidos: Int64 = 0
  private let abertaEm = Date()

  init(id: String, ficheiro: URL, total: Int64) throws {
    self.id = id
    self.total = total
    // Aberto ja: o JS pode apagar o `.part` (um ficheiro que nao se publica), e
    // quem o tem aberto continua a le-lo.
    self.leitor = try FileHandle(forReadingFrom: ficheiro)
    super.init()
  }

  // MARK: - Chamado pelo JS

  func cresceu(_ bytes: Int64) {
    fila.async {
      guard !self.fechada else { return }
      self.disponiveis = max(self.disponiveis, min(bytes, self.total))
      self.servir()
    }
  }

  func concluir() {
    fila.async {
      guard !self.fechada else { return }
      self.disponiveis = self.total
      self.servir()
    }
  }

  func fechar() {
    fila.async {
      guard !self.fechada else { return }
      self.fechada = true
      let erro = NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled, userInfo: nil)
      let aFechar = self.pendentes
      self.pendentes.removeAll()
      for pedido in aFechar where !pedido.isFinished && !pedido.isCancelled {
        pedido.finishLoading(with: erro)
      }
      try? self.leitor?.close()
      self.leitor = nil
    }
  }

  func diagnostico() -> String {
    return fila.sync { () -> String in
      let info: [String: Any] = [
        "pedidos": pedidosVistos,
        "servidos": Int(servidos),
        "disponiveis": Int(disponiveis),
        "total": Int(total),
        "pendentes": pendentes.count,
        "fechada": fechada,
      ]
      guard let dados = try? JSONSerialization.data(withJSONObject: info, options: []),
            let texto = String(data: dados, encoding: .utf8) else {
        return ""
      }
      return texto
    }
  }

  // MARK: - AVAssetResourceLoaderDelegate

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    guard !fechada else {
      return false
    }
    anotar(loadingRequest)
    if let info = loadingRequest.contentInformationRequest {
      info.contentType = AVFileType.m4a.rawValue
      info.contentLength = total
      info.isByteRangeAccessSupported = true
    }
    pendentes.append(loadingRequest)
    servir()
    return true
  }

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    didCancel loadingRequest: AVAssetResourceLoadingRequest
  ) {
    pendentes.removeAll { $0 === loadingRequest }
  }

  // MARK: - Servir

  private func servir() {
    rondaMarcada = false
    guard !fechada else { return }
    // Sobre uma copia: a lista so muda depois de se ter falado com todos.
    var haMais = false
    var arrumados: [AVAssetResourceLoadingRequest] = []
    for pedido in pendentes {
      if pedido.isCancelled || pedido.isFinished {
        arrumados.append(pedido)
        continue
      }
      let resultado = responder(pedido)
      if resultado.acabou {
        arrumados.append(pedido)
      } else if resultado.haMais {
        haMais = true
      }
    }
    if !arrumados.isEmpty {
      pendentes.removeAll { pedido in arrumados.contains { $0 === pedido } }
    }
    if haMais && !rondaMarcada {
      rondaMarcada = true
      fila.async { [weak self] in
        self?.servir()
      }
    }
  }

  /**
   * Da ao pedido, no maximo, uma ronda do que ja ha no disco. `acabou` quando
   * ficou completo; `haMais` quando ha bytes prontos que ficaram para a ronda
   * seguinte.
   */
  private func responder(_ pedido: AVAssetResourceLoadingRequest) -> (acabou: Bool, haMais: Bool) {
    guard let dados = pedido.dataRequest else {
      pedido.finishLoading()
      return (true, false)
    }
    let pedidoAte: Int64 = dados.requestsAllDataToEndOfResource
      ? total
      : dados.requestedOffset + Int64(dados.requestedLength)
    let fim = min(pedidoAte, total)
    var cursor = dados.currentOffset
    if cursor >= fim {
      pedido.finishLoading()
      return (true, false)
    }
    let pronto = min(fim, disponiveis)
    let ate = min(pronto, cursor + DuotoneStreamSession.porRonda)
    while cursor < ate {
      let quantos = Int(min(ate - cursor, DuotoneStreamSession.porLeitura))
      guard let bytes = ler(desde: cursor, quantos: quantos), !bytes.isEmpty else {
        break
      }
      dados.respond(with: bytes)
      cursor += Int64(bytes.count)
      servidos += Int64(bytes.count)
    }
    if cursor >= fim {
      pedido.finishLoading()
      return (true, false)
    }
    return (false, cursor < pronto)
  }

  private func ler(desde: Int64, quantos: Int) -> Data? {
    guard let leitor = leitor, desde >= 0 else {
      return nil
    }
    do {
      try leitor.seek(toOffset: UInt64(desde))
      return try leitor.read(upToCount: quantos)
    } catch {
      return nil
    }
  }

  /** Os primeiros pedidos de cada sessao: e por eles que se ve, no aparelho, o que o AVPlayer fez. */
  private func anotar(_ pedido: AVAssetResourceLoadingRequest) {
    guard pedidosVistos.count < DuotoneStreamSession.pedidosNoRelatorio else { return }
    var linha: [String: Any] = [
      "ms": Int(Date().timeIntervalSince(abertaEm) * 1000),
      "info": pedido.contentInformationRequest != nil,
      "havia": Int(disponiveis),
    ]
    if let dados = pedido.dataRequest {
      linha["de"] = Int(dados.requestedOffset)
      linha["quantos"] = dados.requestsAllDataToEndOfResource ? -1 : dados.requestedLength
    }
    pedidosVistos.append(linha)
  }
}
