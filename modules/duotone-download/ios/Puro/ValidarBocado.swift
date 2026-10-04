import Foundation

/**
 * A validacao da resposta a um pedido Range, a mesma do `validarRespostaParcial`
 * (src/lib/audioRange.ts), com as mesmas frases.
 *
 * Aqui so Foundation: o `scripts/swift/teste-download.swift` compila este
 * ficheiro em Linux (CI) e compara-o com casos tirados do teste do JS.
 *
 * Devolve `nil` quando a resposta serve, ou a frase do problema. Os bytes so
 * entram no ficheiro depois disto: uma resposta com o tamanho certo no offset
 * errado corrompia o audio em silencio.
 */
public func problemaDoBocado(
  status: Int,
  contentLength: String?,
  contentRange: String?,
  inicio: Int64,
  fim: Int64,
  total: Int64
) -> String? {
  guard inicio >= 0, fim >= inicio, fim < total else { return "Intervalo de áudio inválido" }
  let esperado = fim - inicio + 1

  // Content-Length, quando existe, tem de ser exatamente o pedido.
  if let declarado = contentLength {
    guard !declarado.isEmpty,
          declarado.unicodeScalars.allSatisfy({ $0.value >= 48 && $0.value <= 57 }),
          let n = Int64(declarado), n == esperado
    else { return "Comprimento HTTP inconsistente" }
  }

  // 200 so serve quando o pedido cobre o ficheiro inteiro.
  if status == 200 {
    if inicio == 0 && esperado == total { return nil }
    return "Resposta 200 a um pedido parcial"
  }
  guard status == 206 else { return "Estado HTTP inesperado (\(status))" }

  // Ha CDNs que respondem 206 sem Content-Range: aceita-se, como no JS.
  guard let bruto = contentRange else { return nil }
  guard let partes = lerContentRange(bruto),
        partes.inicio == inicio, partes.fim == fim, partes.total == total
  else { return "Content-Range não corresponde ao pedido" }
  return nil
}

/** "bytes A-B/C", exatamente (o `^bytes (\d+)-(\d+)\/(\d+)$` do JS). */
func lerContentRange(_ texto: String) -> (inicio: Int64, fim: Int64, total: Int64)? {
  let prefixo = "bytes "
  guard texto.hasPrefix(prefixo) else { return nil }
  let resto = texto.dropFirst(prefixo.count)
  let barra = resto.split(separator: "/", omittingEmptySubsequences: false)
  guard barra.count == 2 else { return nil }
  let traco = barra[0].split(separator: "-", omittingEmptySubsequences: false)
  guard traco.count == 2 else { return nil }
  func numero(_ s: Substring) -> Int64? {
    guard !s.isEmpty, s.unicodeScalars.allSatisfy({ $0.value >= 48 && $0.value <= 57 }) else { return nil }
    return Int64(s)
  }
  guard let a = numero(traco[0]), let b = numero(traco[1]), let c = numero(barra[1]) else { return nil }
  return (a, b, c)
}
