import ExpoModulesCore
import Foundation

/**
 * Os bocados a decorrer. Tudo o que mexe no estado corre na `fila` (a do
 * delegate do URLSession, uma de cada vez): os temporizadores e o `cancelar`
 * do JS entram nela tambem, e por isso nao ha cadeados.
 */
final class Transferencias: NSObject, URLSessionDataDelegate {
  static let shared = Transferencias()

  private let fila: OperationQueue = {
    let q = OperationQueue()
    q.maxConcurrentOperationCount = 1
    q.name = "duotone.download"
    q.qualityOfService = .userInitiated
    return q
  }()

  private lazy var sessao: URLSession = {
    let c = URLSessionConfiguration.default
    c.requestCachePolicy = .reloadIgnoringLocalCacheData
    c.urlCache = nil
    c.httpMaximumConnectionsPerHost = 4
    c.waitsForConnectivity = false
    return URLSession(configuration: c, delegate: self, delegateQueue: fila)
  }()

  private var porTarefa: [Int: Transferencia] = [:]
  private var porId: [String: Transferencia] = [:]

  func comecar(_ pedido: PedidoDeBocado, promise: Promise) {
    fila.addOperation { self.comecarNaFila(pedido, promise) }
  }

  func cancelar(_ id: String) {
    fila.addOperation {
      guard let t = self.porId[id] else { return }
      self.acabar(t, .falha("ERR_CANCELADO", "download aborted"))
    }
  }

  private func comecarNaFila(_ pedido: PedidoDeBocado, _ promise: Promise) {
    let inicio = Int64(pedido.inicio), fim = Int64(pedido.fim), total = Int64(pedido.total)
    guard let url = URL(string: pedido.url), inicio >= 0, fim >= inicio, total > fim else {
      promise.reject("ERR_PEDIDO", "Intervalo de áudio inválido")
      return
    }
    var req = URLRequest(url: url)
    req.httpMethod = "GET"
    req.setValue("bytes=\(inicio)-\(fim)", forHTTPHeaderField: "Range")
    // O tempo sem bytes: o `timeoutInterval` do URLSession e de inatividade.
    req.timeoutInterval = max(1, pedido.prazoSemBytesMs / 1000)
    let tarefa = sessao.dataTask(with: req)
    let t = Transferencia(id: pedido.id, inicio: inicio, fim: fim, total: total,
                          ficheiro: urlDoCaminho(pedido.caminho), promise: promise, tarefa: tarefa)
    porTarefa[tarefa.taskIdentifier] = t
    porId[pedido.id] = t
    agendar(t, depoisDe: pedido.prazoRespostaMs) { t in
      if !t.respondeu { self.acabar(t, .falha("ERR_SEM_RESPOSTA", "Sem resposta do servidor")) }
    }
    agendar(t, depoisDe: pedido.prazoTotalMs) { t in
      self.acabar(t, .falha("ERR_PRAZO", "Download sem resposta dentro do prazo"))
    }
    tarefa.resume()
  }

  private func agendar(_ t: Transferencia, depoisDe ms: Double, _ fazer: @escaping (Transferencia) -> Void) {
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .milliseconds(Int(max(0, ms)))) { [weak self, weak t] in
      self?.fila.addOperation {
        guard let t, !t.acabou else { return }
        fazer(t)
      }
    }
  }

  // MARK: URLSessionDataDelegate

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let t = porTarefa[dataTask.taskIdentifier], !t.acabou else { completionHandler(.cancel); return }
    t.respondeu = true
    let http = response as? HTTPURLResponse
    let estado = http?.statusCode ?? 0
    t.estado = estado
    // Um estado que nao e 2xx volta ao JS como estado, sem corpo: e ele que
    // decide renovar o URL (403) ou encolher o bocado.
    guard estado == 200 || estado == 206 else {
      completionHandler(.cancel)
      acabar(t, .estado(estado))
      return
    }
    if let problema = problemaDoBocado(status: estado,
                                       contentLength: http?.value(forHTTPHeaderField: "Content-Length"),
                                       contentRange: http?.value(forHTTPHeaderField: "Content-Range"),
                                       inicio: t.inicio, fim: t.fim, total: t.total) {
      completionHandler(.cancel)
      acabar(t, .falha("ERR_RANGE", problema))
      return
    }
    do {
      if !FileManager.default.fileExists(atPath: t.ficheiro.path) {
        FileManager.default.createFile(atPath: t.ficheiro.path, contents: nil)
      }
      let h = try FileHandle(forWritingTo: t.ficheiro)
      try h.seek(toOffset: UInt64(t.inicio))
      t.handle = h
    } catch {
      completionHandler(.cancel)
      acabar(t, .falha("ERR_ESCRITA", "Não foi possível abrir o ficheiro: \(error.localizedDescription)"))
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let t = porTarefa[dataTask.taskIdentifier], !t.acabou, let h = t.handle else { return }
    if t.escritos + Int64(data.count) > t.esperados {
      acabar(t, .falha("ERR_EXCEDE", "Corpo do audio excede o Range pedido"))
      return
    }
    do {
      try h.write(contentsOf: data)
      t.escritos += Int64(data.count)
    } catch {
      acabar(t, .falha("ERR_ESCRITA", "Escrita do áudio falhou: \(error.localizedDescription)"))
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let t = porTarefa[task.taskIdentifier] else { return }
    if t.acabou { esquecer(t); return }
    if let erro = error as NSError? {
      if erro.domain == NSURLErrorDomain && erro.code == NSURLErrorTimedOut {
        acabar(t, .falha("ERR_SEM_PROGRESSO", "Download sem progresso no corpo"))
      } else {
        acabar(t, .falha("ERR_REDE", erro.localizedDescription))
      }
      return
    }
    if t.escritos != t.esperados {
      acabar(t, .falha("ERR_INCOMPLETO", "Chunk incompleto (\(t.escritos)/\(t.esperados) bytes)"))
      return
    }
    acabar(t, .estado(t.estado))
  }

  // MARK: o fim, uma vez so

  private enum Fim {
    case estado(Int)
    case falha(String, String)
  }

  private func acabar(_ t: Transferencia, _ fim: Fim) {
    guard !t.acabou else { return }
    t.acabou = true
    try? t.handle?.close()
    t.handle = nil
    if t.tarefa.state == .running || t.tarefa.state == .suspended { t.tarefa.cancel() }
    switch fim {
    case .estado(let estado):
      t.promise.resolve(["status": estado, "escritos": Int(t.escritos)])
    case .falha(let codigo, let mensagem):
      t.promise.reject(codigo, mensagem)
    }
    porId.removeValue(forKey: t.id)
    // O `didCompleteWithError` de uma tarefa cancelada ainda chega: e ele
    // que a esquece de `porTarefa`.
    if t.tarefa.state == .completed { esquecer(t) }
  }

  private func esquecer(_ t: Transferencia) {
    porTarefa.removeValue(forKey: t.tarefa.taskIdentifier)
    if porId[t.id] === t { porId.removeValue(forKey: t.id) }
  }
}

final class Transferencia {
  let id: String
  let inicio: Int64
  let fim: Int64
  let total: Int64
  let ficheiro: URL
  let promise: Promise
  let tarefa: URLSessionDataTask
  var esperados: Int64 { fim - inicio + 1 }
  var handle: FileHandle?
  var escritos: Int64 = 0
  var respondeu = false
  var estado = 0
  var acabou = false

  init(id: String, inicio: Int64, fim: Int64, total: Int64, ficheiro: URL, promise: Promise, tarefa: URLSessionDataTask) {
    self.id = id
    self.inicio = inicio
    self.fim = fim
    self.total = total
    self.ficheiro = ficheiro
    self.promise = promise
    self.tarefa = tarefa
  }
}
