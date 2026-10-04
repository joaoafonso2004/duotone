import Foundation

/**
 * O código puro do `modules/duotone-download` (ios/Puro/) contra o JavaScript:
 * cada caso de `gerar-casos-download.ts` diz o que o JS deu, e o Swift tem de
 * dar o mesmo -- o MP4 byte a byte, os segundos, a frase do erro, e a frase da
 * validação de cada bocado. Um índice fora do array no Swift não é um erro, é
 * um crash da app: os casos ao acaso existem para o apanhar aqui.
 *
 * O Windows não compila Swift; corre no CI (`.github/workflows/swift-puro.yml`):
 *   swiftc -O -parse-as-library modules/duotone-download/ios/Puro/*.swift scripts/swift/teste-download.swift -o teste
 *   ./teste <pasta dos casos>
 */

/** O caso a correr, para um crash dizer qual foi. */
var casoAtual = ""

func aoRebentar(_ sinal: Int32) {
  fputs("\n  REBENTOU no caso \(casoAtual) (sinal \(sinal))\n", stderr)
  _exit(3)
}

func numero(_ v: Any?) -> Double? {
  if let n = v as? NSNumber { return n.doubleValue }
  if let d = v as? Double { return d }
  if let i = v as? Int { return Double(i) }
  return nil
}

func fnv1a(_ b: [UInt8]) -> UInt32 {
  var h: UInt32 = 0x811c9dc5
  for x in b { h ^= UInt32(x); h = h &* 0x01000193 }
  return h
}

func lerJson(_ url: URL) -> [[String: Any]] {
  guard let dados = try? Data(contentsOf: url),
        let lista = try? JSONSerialization.jsonObject(with: dados) as? [[String: Any]]
  else { fatalError("não li \(url.path)") }
  return lista
}

@main
struct TesteDownload {
  static func main() {
    signal(SIGILL, aoRebentar)
    signal(SIGTRAP, aoRebentar)
    signal(SIGSEGV, aoRebentar)
    signal(SIGBUS, aoRebentar)

    let args = CommandLine.arguments
    guard args.count == 2 else { print("uso: teste-download <pasta dos casos>"); exit(2) }
    let pasta = URL(fileURLWithPath: args[1])
    var falhas = 0
    func falhou(_ s: String) {
      falhas += 1
      if falhas <= 25 { print("  FALHOU - \(s)") }
    }

    // ---- WebM -> MP4 -------------------------------------------------------
    let casos = lerJson(pasta.appendingPathComponent("casos.json"))
    var webms: [String: [UInt8]] = [:]
    var convertidos = 0, recusados = 0
    for caso in casos {
      let nome = caso["nome"] as! String
      casoAtual = nome
      let webmNome = caso["webm"] as! String
      if webms[webmNome] == nil {
        webms[webmNome] = [UInt8](try! Data(contentsOf: pasta.appendingPathComponent(webmNome)))
      }
      var b = webms[webmNome]!
      if let corte = numero(caso["corte"]) { b = Array(b.prefix(Int(corte))) }
      if let mutacoes = caso["mutacoes"] as? [Any] {
        for m in mutacoes {
          let par = m as! [Any]
          let pos = Int(numero(par[0])!), val = UInt8(numero(par[1])!)
          if pos < b.count { b[pos] = val }
        }
      }
      let kbps = numero(caso["kbps"]) ?? 0
      let esperado = caso["esperado"] as! [String: Any]

      let resultado: Result<(mp4: [UInt8], segundos: Double), ErroDoOpus>
      do { resultado = .success(try converterWebmParaMp4(b, kbps: kbps)) }
      catch let e as ErroDoOpus { resultado = .failure(e) }
      catch { falhou("\(nome): erro que não é ErroDoOpus (\(error))"); continue }

      if let erro = esperado["erro"] as? String {
        switch resultado {
        case .success: falhou("\(nome): o JS atirou \"\(erro)\" e o Swift converteu")
        case .failure(let e):
          if e.description != erro { falhou("\(nome): \"\(e.description)\" em vez de \"\(erro)\"") }
          recusados += 1
        }
        continue
      }
      guard case .success(let r) = resultado else {
        if case .failure(let e) = resultado { falhou("\(nome): o JS converteu e o Swift atirou \"\(e.description)\"") }
        continue
      }
      let segundos = numero(esperado["segundos"])!
      if r.segundos != segundos { falhou("\(nome): \(r.segundos) s em vez de \(segundos) s") }
      if let mp4Nome = esperado["mp4"] as? String {
        let mp4 = [UInt8](try! Data(contentsOf: pasta.appendingPathComponent(mp4Nome)))
        if r.mp4 != mp4 {
          let n = min(r.mp4.count, mp4.count)
          let primeira = (0..<n).first { r.mp4[$0] != mp4[$0] } ?? n
          falhou("\(nome): MP4 diferente (\(r.mp4.count) vs \(mp4.count) bytes, primeira diferença no byte \(primeira))")
        }
      } else {
        let tamanho = Int(numero(esperado["tamanho"])!), fnv = UInt32(numero(esperado["fnv"])!)
        if r.mp4.count != tamanho || fnv1a(r.mp4) != fnv {
          falhou("\(nome): MP4 diferente (\(r.mp4.count) vs \(tamanho) bytes)")
        }
      }
      convertidos += 1
    }
    print("  conversão: \(casos.count) casos, \(convertidos) convertidos e \(recusados) recusados como o JS")

    // ---- a validação de um bocado -----------------------------------------
    casoAtual = "bocados"
    let bocados = lerJson(pasta.appendingPathComponent("bocados.json"))
    for b in bocados {
      let status = Int(numero(b["status"])!)
      let cl = b["contentLength"] as? String
      let cr = b["contentRange"] as? String
      let inicio = Int64(numero(b["inicio"])!), fim = Int64(numero(b["fim"])!), total = Int64(numero(b["total"])!)
      let esperado = b["esperado"] as? String
      let r = problemaDoBocado(status: status, contentLength: cl, contentRange: cr, inicio: inicio, fim: fim, total: total)
      if r != esperado {
        falhou("bocado \(status) \(cl ?? "-") \(cr ?? "-") \(inicio)-\(fim)/\(total): \(r ?? "aceite") em vez de \(esperado ?? "aceite")")
      }
    }
    print("  bocados: \(bocados.count) respostas")

    if falhas > 0 {
      print("\n  \(falhas) caso(s) falharam.")
      exit(1)
    }
    print("\n  O Swift dá o mesmo que o JavaScript em todos os casos.")
  }
}
