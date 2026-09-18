import ExpoModulesCore
import ExpoVideo
import Foundation

/**
 * Tocar enquanto descarrega.
 *
 * O download continua no JS (`transmitirAudio`, em src/lib/youtubeCache.ts):
 * e la que vivem as renovacoes depois de um 403, o encolher dos bocados, a fila
 * e o cancelamento, todos testados. A diferenca e que os bocados vao para um
 * `.part` a medida que chegam, e este modulo serve esse ficheiro ao AVPlayer
 * enquanto ele cresce.
 *
 * A entrada no expo-video e publica: o `VideoAssetTransportRegistry` deixa um
 * modulo de fora dar o `AVAssetResourceLoaderDelegate` de um esquema proprio
 * (`duotone-stream://`) antes de o asset comecar a carregar. Nao se mexe no
 * codigo do expo-video, e o Now Playing, o segundo plano e o EQ (que vive no
 * item) continuam a ser os de sempre.
 *
 * A correcao da duracao (mp4Fixer) ja vem feita do JS: o que chega ao disco e
 * exatamente o que o AVPlayer le.
 */
public class DuotoneStreamModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneStream")

    OnCreate {
      VideoAssetTransportRegistry.registerProvider(DuotoneStreamProvider.shared)
    }

    /** Abre uma sessao sobre o `.part` e devolve a uri a dar ao motor. */
    Function("abrir") { (sessao: String, caminho: String, total: Int) throws -> String in
      let url = URL(string: caminho)
      let ficheiro = (url?.isFileURL ?? false) ? url! : URL(fileURLWithPath: caminho)
      let nova = try DuotoneStreamSession(id: sessao, ficheiro: ficheiro, total: Int64(total))
      DuotoneStreamSessoes.shared.guardar(nova)
      return "\(DuotoneStreamProvider.esquema)://audio/\(sessao).m4a"
    }

    Function("cresceu") { (sessao: String, disponiveis: Int) in
      guard let aberta = DuotoneStreamSessoes.shared.obter(sessao) else { return }
      aberta.cresceu(Int64(disponiveis))
    }

    Function("concluir") { (sessao: String) in
      guard let aberta = DuotoneStreamSessoes.shared.obter(sessao) else { return }
      aberta.concluir()
    }

    Function("fechar") { (sessao: String) in
      guard let aberta = DuotoneStreamSessoes.shared.remover(sessao) else { return }
      aberta.fechar()
    }

    /** O que o AVPlayer pediu e o que se lhe deu, em JSON, para o relatorio. */
    Function("diagnostico") { (sessao: String) -> String in
      guard let aberta = DuotoneStreamSessoes.shared.obter(sessao) else { return "" }
      return aberta.diagnostico()
    }
  }
}

/** Da o delegate a quem pedir uma uri `duotone-stream://audio/<sessao>.m4a`. */
final class DuotoneStreamProvider: VideoAssetTransportProvider {
  static let shared = DuotoneStreamProvider()
  static let esquema = "duotone-stream"

  let identifier = "duotone.stream"
  let priority = 100

  func makeLoadPlan(for source: VideoAssetSourceDescriptor) -> VideoAssetLoadPlan? {
    guard source.url.scheme == DuotoneStreamProvider.esquema else {
      return nil
    }
    let id = source.url.deletingPathExtension().lastPathComponent
    // Sem sessao o asset falha a carregar, e o JS cai no ficheiro.
    guard let sessao = DuotoneStreamSessoes.shared.obter(id) else {
      return nil
    }
    return VideoAssetLoadPlan(
      assetURL: source.url,
      reportedContentTypeHint: .progressive,
      resourceLoaderDelegate: sessao,
      resourceLoaderQueue: sessao.fila,
      retainedObjects: [sessao]
    )
  }
}

/** As sessoes abertas. Poucas: o JS fecha-as ao trocar de faixa. */
final class DuotoneStreamSessoes {
  static let shared = DuotoneStreamSessoes()

  /** Mais do que isto so pode ser uma sessao esquecida: a mais velha sai. */
  private let maximo = 8
  private let trinco = NSLock()
  private var porId: [String: DuotoneStreamSession] = [:]
  private var ordem: [String] = []

  func guardar(_ sessao: DuotoneStreamSession) {
    var velhas: [DuotoneStreamSession] = []
    trinco.lock()
    porId[sessao.id] = sessao
    ordem.removeAll { $0 == sessao.id }
    ordem.append(sessao.id)
    while ordem.count > maximo {
      let id = ordem.removeFirst()
      if let velha = porId.removeValue(forKey: id) {
        velhas.append(velha)
      }
    }
    trinco.unlock()
    velhas.forEach { $0.fechar() }
  }

  func obter(_ id: String) -> DuotoneStreamSession? {
    trinco.lock()
    defer { trinco.unlock() }
    return porId[id]
  }

  func remover(_ id: String) -> DuotoneStreamSession? {
    trinco.lock()
    defer { trinco.unlock() }
    ordem.removeAll { $0 == id }
    return porId.removeValue(forKey: id)
  }
}
