import ExpoModulesCore
import Foundation
import MetricKit

/**
 * Os crashes e bloqueios que o proprio iOS regista (MetricKit).
 *
 * Um crash nativo mata o processo antes de o JS poder dizer alguma coisa. O
 * sistema guarda-o e entrega-o numa abertura seguinte; aqui fica um resumo sem
 * conteudo (sinal, tipo de excecao, os binarios do topo da pilha) que o JS le
 * e manda para o `app_events` (ver src/lib/saudeDaApp.ts).
 */
public class DuotoneDiagnosticoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneDiagnostico")

    OnCreate {
      DuotoneRecolhaDeDiagnosticos.shared.ligar()
    }

    /** Os resumos guardados, em JSON, e apaga-os. */
    Function("lerEApagar") { () -> String in
      return DuotoneRecolhaDeDiagnosticos.shared.lerEApagar()
    }
  }
}

final class DuotoneRecolhaDeDiagnosticos: NSObject, MXMetricManagerSubscriber {
  static let shared = DuotoneRecolhaDeDiagnosticos()

  private let chavePendentes = "duotone.diagnosticos.pendentes"
  private let chaveVistos = "duotone.diagnosticos.vistos"
  private let maximo = 20
  private let trinco = NSLock()
  private var ligado = false

  func ligar() {
    trinco.lock()
    let jaEstava = ligado
    ligado = true
    trinco.unlock()
    if jaEstava { return }
    MXMetricManager.shared.add(self)
    // O que o sistema entregou nas ultimas 24 h pode ter chegado antes de haver
    // subscritor. Os ja vistos nao se repetem (ver `guardar`).
    guardar(MXMetricManager.shared.pastDiagnosticPayloads)
  }

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    guardar(payloads)
  }

  func lerEApagar() -> String {
    trinco.lock()
    defer { trinco.unlock() }
    let defaults = UserDefaults.standard
    let lista = defaults.array(forKey: chavePendentes) ?? []
    defaults.removeObject(forKey: chavePendentes)
    guard let dados = try? JSONSerialization.data(withJSONObject: lista, options: []),
          let texto = String(data: dados, encoding: .utf8) else {
      return "[]"
    }
    return texto
  }

  private func guardar(_ payloads: [MXDiagnosticPayload]) {
    var novos: [[String: Any]] = []
    for payload in payloads {
      let quando = payload.timeStampEnd
      for crash in payload.crashDiagnostics ?? [] {
        novos.append(resumoDoCrash(crash, quando: quando))
      }
      for bloqueio in payload.hangDiagnostics ?? [] {
        novos.append(resumoDoBloqueio(bloqueio, quando: quando))
      }
    }
    if novos.isEmpty { return }

    trinco.lock()
    defer { trinco.unlock() }
    let defaults = UserDefaults.standard
    var vistos = Set(defaults.stringArray(forKey: chaveVistos) ?? [])
    var lista = defaults.array(forKey: chavePendentes) ?? []
    for linha in novos {
      let id = (linha["id"] as? String) ?? ""
      if vistos.contains(id) { continue }
      vistos.insert(id)
      lista.append(linha)
    }
    defaults.set(Array(lista.suffix(maximo)), forKey: chavePendentes)
    let vistosOrdenados: [String] = vistos.sorted()
    defaults.set(Array(vistosOrdenados.suffix(200)), forKey: chaveVistos)
  }

  private func resumoDoCrash(_ crash: MXCrashDiagnostic, quando: Date) -> [String: Any] {
    let pilha = primeirasLinhas(crash.callStackTree)
    var linha = base(tipo: "crash", quando: quando, versao: crash.applicationVersion, pilha: pilha)
    if let sinal = crash.signal {
      linha["sinal"] = sinal.intValue
    }
    if let excecao = crash.exceptionType {
      linha["excecao"] = excecao.intValue
    }
    if let codigo = crash.exceptionCode {
      linha["codigo"] = codigo.intValue
    }
    if let razao = crash.terminationReason {
      linha["razao"] = String(razao.prefix(200))
    }
    return linha
  }

  private func resumoDoBloqueio(_ bloqueio: MXHangDiagnostic, quando: Date) -> [String: Any] {
    let pilha = primeirasLinhas(bloqueio.callStackTree)
    var linha = base(tipo: "bloqueio", quando: quando, versao: bloqueio.applicationVersion, pilha: pilha)
    linha["duracaoMs"] = bloqueio.hangDuration.converted(to: UnitDuration.milliseconds).value
    return linha
  }

  private func base(tipo: String, quando: Date, versao: String, pilha: [String]) -> [String: Any] {
    let quandoMs = Int(quando.timeIntervalSince1970 * 1000)
    var linha: [String: Any] = [
      "tipo": tipo,
      "quando": quandoMs,
      "versao": versao,
      "pilha": pilha,
      "id": "\(tipo)-\(quandoMs)-\(pilha.joined(separator: ","))",
    ]
    if let primeira = pilha.first, let binario = primeira.components(separatedBy: "+").first {
      linha["binario"] = binario
    }
    return linha
  }

  /** O topo da pilha da thread que morreu, como "binario+deslocamento". */
  private func primeirasLinhas(_ arvore: MXCallStackTree) -> [String] {
    guard
      let objeto = try? JSONSerialization.jsonObject(with: arvore.jsonRepresentation(), options: []),
      let json = objeto as? [String: Any],
      let pilhas = json["callStacks"] as? [[String: Any]]
    else {
      return []
    }
    let atribuida = pilhas.first(where: { ($0["threadAttributed"] as? Bool) == true }) ?? pilhas.first
    var frame: [String: Any]? = (atribuida?["callStackRootFrames"] as? [[String: Any]])?.first
    var saida: [String] = []
    while let atual = frame, saida.count < 5 {
      let nome = (atual["binaryName"] as? String) ?? "?"
      let deslocamento = (atual["offsetIntoBinaryTextSegment"] as? NSNumber)?.intValue ?? 0
      saida.append("\(nome)+\(deslocamento)")
      frame = (atual["subFrames"] as? [[String: Any]])?.first
    }
    return saida
  }
}
