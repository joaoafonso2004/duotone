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
      // Os 120 Hz das animações (3/10, DuotoneFluidez.swift): antes da primeira.
      DispatchQueue.main.async { DuotoneFluidez.instalar() }
    }

    /**
     * Pede (ou larga) os 120 Hz para o relógio das animações do React Native.
     * O JS chama-o no início e no fim das transições e dos gestos
     * (src/state/fluidez.ts).
     */
    Function("definirFluidez") { (alta: Bool) in
      DispatchQueue.main.async {
        DuotoneFluidez.instalar()
        DuotoneFluidez.definir(alta: alta)
      }
    }

    /** Os resumos guardados, em JSON, e apaga-os. */
    Function("lerEApagar") { () -> String in
      return DuotoneRecolhaDeDiagnosticos.shared.lerEApagar()
    }

    /**
     * O CPU que o processo gastou ate agora, no total e por thread viva, e o
     * estado termico (1/10). O JS tira um retrato ao ir para segundo plano e
     * outro ao voltar: a diferenca diz quanto custou a musica com o ecra
     * desligado, e em que -- o JavaScript, o audio, a rede. So numeros e nomes
     * de threads; nada do que se ouve.
     */
    Function("cpuDoProcesso") { () -> String in
      return DuotoneCpuDoProcesso.retrato()
    }

    /**
     * So o estado termico e o modo de poupanca (2/10), sem o retrato das
     * threads: leve, para o Smart Cache decidir quantas musicas adianta (ver
     * src/lib/adiantarFaixas.ts).
     */
    Function("estadoDeEnergia") { () -> [String: Any] in
      return [
        "termico": DuotoneCpuDoProcesso.termico(),
        "poupanca": ProcessInfo.processInfo.isLowPowerModeEnabled,
      ]
    }
  }
}

enum DuotoneCpuDoProcesso {
  static func termico() -> String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }

  static func retrato() -> String {
    var uso = rusage()
    getrusage(RUSAGE_SELF, &uso)
    let totalMs = Double(uso.ru_utime.tv_sec + uso.ru_stime.tv_sec) * 1000
      + Double(uso.ru_utime.tv_usec + uso.ru_stime.tv_usec) / 1000

    var threads: [[String: Any]] = []
    var lista: thread_act_array_t?
    var quantas: mach_msg_type_number_t = 0
    if task_threads(mach_task_self_, &lista, &quantas) == KERN_SUCCESS, let lista {
      for i in 0..<Int(quantas) {
        let thread = lista[i]
        var info = thread_basic_info()
        var tamanho = mach_msg_type_number_t(
          MemoryLayout<thread_basic_info>.size / MemoryLayout<natural_t>.size
        )
        let capacidade = Int(tamanho)
        let estado = withUnsafeMutablePointer(to: &info) { ponteiro in
          ponteiro.withMemoryRebound(to: integer_t.self, capacity: capacidade) {
            thread_info(thread, thread_flavor_t(THREAD_BASIC_INFO), $0, &tamanho)
          }
        }
        if estado == KERN_SUCCESS {
          // O nome pelo pthread (publico); uma thread sem pthread fica sem nome.
          var nome = ""
          if let pthread = pthread_from_mach_thread_np(thread) {
            var buffer = [CChar](repeating: 0, count: 64)
            if pthread_getname_np(pthread, &buffer, buffer.count) == 0 {
              nome = buffer.withUnsafeBufferPointer { String(cString: $0.baseAddress!) }
            }
          }
          let ms = Double(info.user_time.seconds + info.system_time.seconds) * 1000
            + Double(info.user_time.microseconds + info.system_time.microseconds) / 1000
          threads.append(["nome": nome, "ms": ms])
        }
        mach_port_deallocate(mach_task_self_, thread)
      }
      vm_deallocate(
        mach_task_self_,
        vm_address_t(UInt(bitPattern: lista)),
        vm_size_t(Int(quantas) * MemoryLayout<thread_t>.stride)
      )
    }

    let retrato: [String: Any] = [
      "totalMs": totalMs,
      "threads": threads,
      "termico": termico(),
      "poupanca": ProcessInfo.processInfo.isLowPowerModeEnabled,
    ]
    guard let dados = try? JSONSerialization.data(withJSONObject: retrato, options: []),
          let texto = String(data: dados, encoding: .utf8) else { return "{}" }
    return texto
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
