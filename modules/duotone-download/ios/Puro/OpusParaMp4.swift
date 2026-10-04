import Foundation

/**
 * WebM (itag 251) -> MP4 com os mesmos pacotes Opus, sem recodificar.
 *
 * Traducao do `src/lib/webmOpus.ts` + `src/lib/opusMp4.ts`, linha a linha e com
 * as mesmas regras: o resultado tem de ser IGUAL byte a byte ao do JavaScript.
 * Quem o prova e o `scripts/swift/teste-download.swift`, que o CI compila em
 * Linux com este ficheiro e compara com o que o JS escreve para os mesmos
 * WebM (`scripts/swift/gerar-casos-download.ts`, com cortes e bytes trocados ao
 * acaso: um indice fora do array aqui e um crash da app, la e so `undefined`).
 *
 * Aqui so Foundation. Atira `ErroDoOpus.invalido` com a mesma frase do JS
 * (`WebM/Opus inválido: ...`): quem chama volta ao AAC.
 */

public let OPUS_INVALIDO = "WebM/Opus inválido"

public enum ErroDoOpus: Error, CustomStringConvertible {
  case invalido(String)
  public var description: String {
    switch self { case .invalido(let motivo): return "\(OPUS_INVALIDO): \(motivo)" }
  }
}

private func falhar(_ motivo: String) -> ErroDoOpus { .invalido(motivo) }

private enum ID {
  static let EBML = 0x1a45dfa3
  static let Segment = 0x18538067
  static let Info = 0x1549a966
  static let Tracks = 0x1654ae6b
  static let TrackEntry = 0xae
  static let TrackNumber = 0xd7
  static let CodecID = 0x86
  static let CodecPrivate = 0x63a2
  static let Cluster = 0x1f43b675
  static let SimpleBlock = 0xa3
  static let BlockGroup = 0xa0
  static let Block = 0xa1
}

/** Os filhos directos do Segment: um Cluster de tamanho desconhecido acaba no primeiro destes. */
private let DO_SEGMENTO: Set<Int> = [0x114d9b74, ID.Info, ID.Tracks, ID.Cluster, 0x1c53bb6b, 0x1941a469, 0x1043a770, 0x1254c367]
private let TAMANHO_DESCONHECIDO = -1
private let MAX_AMOSTRAS_POR_PACOTE = 5760
public let TAXA_OPUS = 48_000
public let PACOTES_POR_FRAGMENTO = 250

public struct CabecalhoOpus: Equatable {
  public var canais: Int
  public var preSkip: Int
  public var taxaDeEntrada: Int
  public var ganhoDeSaida: Int
}

/** Um pacote: onde esta no WebM (sem copia) e quantas amostras tem. */
struct PacoteOpus {
  let inicio: Int
  let tamanho: Int
  let amostras: Int
}

/** Os primeiros bytes sao um cabecalho EBML (WebM), e nao um MP4? */
public func pareceWebm(_ b: [UInt8]) -> Bool {
  return b.count >= 4 && b[0] == 0x1a && b[1] == 0x45 && b[2] == 0xdf && b[3] == 0xa3
}

/** Um VINT (RFC 8794): o ID fica com o marcador, o tamanho sem ele. */
private func lerVint(_ b: [UInt8], _ o: Int, comMarcador: Bool) throws -> (valor: Int, bytes: Int) {
  if o >= b.count { throw falhar("fim inesperado") }
  let primeiro = Int(b[o])
  var n = 1
  while n <= 8 && (primeiro & (0x80 >> (n - 1))) == 0 { n += 1 }
  if n > 8 { throw falhar("VINT sem marcador") }
  if o + n > b.count { throw falhar("VINT cortado") }
  // Em 64 bits sem sinal: oito bytes cabem sempre, e o "tudo a uns" (o
  // tamanho desconhecido que o YouTube usa no Segment e no Cluster) tem de ser
  // visto ANTES do teto dos 2^53, como no JS.
  var valor = UInt64(comMarcador ? primeiro : primeiro & (0xff >> n))
  var tudoUns = (primeiro & (0xff >> n)) == (0xff >> n)
  if n > 1 {
    for i in 1..<n {
      valor = valor &* 256 &+ UInt64(b[o + i])
      if b[o + i] != 0xff { tudoUns = false }
    }
  }
  if !comMarcador && tudoUns { return (TAMANHO_DESCONHECIDO, n) }
  if valor > (UInt64(1) << 53) - 1 { throw falhar("VINT demasiado grande") }
  return (Int(valor), n)
}

private struct Elemento {
  let id: Int
  let dados: Int
  let fim: Int
  let desconhecido: Bool
}

private func lerElemento(_ b: [UInt8], _ o: Int, _ limite: Int) throws -> Elemento {
  let id = try lerVint(b, o, comMarcador: true)
  let tam = try lerVint(b, o + id.bytes, comMarcador: false)
  let dados = o + id.bytes + tam.bytes
  if tam.valor == TAMANHO_DESCONHECIDO { return Elemento(id: id.valor, dados: dados, fim: limite, desconhecido: true) }
  let fim = dados + tam.valor
  if fim > limite { throw falhar("elemento 0x\(String(id.valor, radix: 16)) passa do fim") }
  return Elemento(id: id.valor, dados: dados, fim: fim, desconhecido: false)
}

private func lerUint(_ b: [UInt8], _ de: Int, _ ate: Int) throws -> Int {
  if ate - de > 7 { throw falhar("inteiro demasiado grande") }
  var v = 0
  var i = de
  while i < ate { v = v * 256 + Int(b[i]); i += 1 }
  return v
}

/** Amostras (a 48 kHz) de um pacote, pelo TOC. RFC 6716, §3.1. */
func amostrasDoPacote(_ b: [UInt8], _ inicio: Int, _ tamanho: Int) throws -> Int {
  if tamanho < 1 { throw falhar("pacote vazio") }
  let toc = Int(b[inicio])
  let config = toc >> 3
  let porTrama: Int
  if config < 12 { porTrama = [480, 960, 1920, 2880][config & 3] }
  else if config < 16 { porTrama = [480, 960][config & 1] }
  else { porTrama = [120, 240, 480, 960][config & 3] }
  let codigo = toc & 3
  var tramas: Int
  if codigo == 0 { tramas = 1 }
  else if codigo == 1 || codigo == 2 { tramas = 2 }
  else {
    if tamanho < 2 { throw falhar("pacote de código 3 sem contagem") }
    tramas = Int(b[inicio + 1]) & 0x3f
    if tramas == 0 { throw falhar("pacote sem tramas") }
  }
  let total = porTrama * tramas
  if total > MAX_AMOSTRAS_POR_PACOTE { throw falhar("pacote com mais de 120 ms") }
  return total
}

/** Os pacotes de um bloco, desfeito o lacing: (inicio, tamanho) de cada um. */
private func pacotesDoBloco(_ b: [UInt8], _ de: Int, _ ate: Int) throws -> (pista: Int, pacotes: [(Int, Int)]) {
  let pista = try lerVint(b, de, comMarcador: false)
  var o = de + pista.bytes + 2 // + timestamp relativo (int16)
  if o >= ate { throw falhar("bloco cortado") }
  let flags = Int(b[o]); o += 1
  let lacing = (flags >> 1) & 3
  if lacing == 0 { return (pista.valor, [(o, ate - o)]) }

  // Um bloco no fim do ficheiro, sem a contagem: o JS le `undefined` (NaN) e
  // falha mais a frente com uma destas frases; aqui ler era sair do array.
  guard o < b.count else {
    if lacing == 1 { throw falhar("lacing passa do bloco") }
    if lacing == 3 { throw falhar("fim inesperado") }
    throw falhar("lacing fixo desigual")
  }
  let quantos = Int(b[o]) + 1; o += 1
  var tamanhos: [Int] = []
  if lacing == 1 {
    // Xiph: cada tamanho e uma soma de bytes ate um que nao seja 255.
    for _ in 0..<(quantos - 1) {
      var t = 0
      while true {
        if o >= ate { throw falhar("lacing Xiph cortado") }
        let v = Int(b[o]); o += 1
        t += v
        if v != 255 { break }
      }
      tamanhos.append(t)
    }
  } else if lacing == 3 {
    // EBML: o primeiro por inteiro, os outros como diferenca com sinal.
    let primeiro = try lerVint(b, o, comMarcador: false)
    o += primeiro.bytes
    tamanhos.append(primeiro.valor)
    if quantos - 1 > 1 {
      for i in 1..<(quantos - 1) {
        let d = try lerVint(b, o, comMarcador: false)
        o += d.bytes
        let meio = (1 << (7 * d.bytes - 1)) - 1
        let t = tamanhos[i - 1] + (d.valor - meio)
        if t < 0 { throw falhar("lacing EBML negativo") }
        tamanhos.append(t)
      }
    }
  } else {
    // Fixo: todos iguais.
    let resto = ate - o
    if resto % quantos != 0 { throw falhar("lacing fixo desigual") }
    for _ in 0..<(quantos - 1) { tamanhos.append(resto / quantos) }
  }
  var pacotes: [(Int, Int)] = []
  for t in tamanhos {
    if o + t > ate { throw falhar("lacing passa do bloco") }
    pacotes.append((o, t))
    o += t
  }
  if o > ate { throw falhar("lacing passa do bloco") }
  pacotes.append((o, ate - o))
  return (pista.valor, pacotes)
}

/** O `OpusHead` do CodecPrivate. So mapping family 0 (mono/estereo). */
private func lerOpusHead(_ b: [UInt8], _ de: Int, _ ate: Int) throws -> CabecalhoOpus {
  let n = ate - de
  if n < 19 { throw falhar("OpusHead curto") }
  let magia = String(decoding: b[de..<(de + 8)], as: UTF8.self)
  if magia != "OpusHead" { throw falhar("sem OpusHead") }
  if (b[de + 8] & 0xf0) != 0 { throw falhar("OpusHead versão \(b[de + 8])") }
  let canais = Int(b[de + 9])
  let familia = Int(b[de + 18])
  if familia != 0 || canais < 1 || canais > 2 { throw falhar("mapping family \(familia) com \(canais) canais") }
  let ganho = Int(b[de + 16]) | (Int(b[de + 17]) << 8)
  let taxa = Int(b[de + 12]) | (Int(b[de + 13]) << 8) | (Int(b[de + 14]) << 16) | (Int(b[de + 15]) << 24)
  return CabecalhoOpus(
    canais: canais,
    preSkip: Int(b[de + 10]) | (Int(b[de + 11]) << 8),
    taxaDeEntrada: taxa,
    ganhoDeSaida: ganho >= 0x8000 ? ganho - 0x10000 : ganho
  )
}

/** Le o ficheiro inteiro. Atira `ErroDoOpus` se nao for o que se aceita. */
func lerWebmOpus(_ b: [UInt8]) throws -> (cabecalho: CabecalhoOpus, pacotes: [PacoteOpus], amostras: Int) {
  if !pareceWebm(b) { throw falhar("não é EBML") }
  var o = 0
  let ebml = try lerElemento(b, o, b.count)
  if ebml.id != ID.EBML { throw falhar("não é EBML") }
  o = ebml.fim
  var segmento: Elemento? = nil
  while o < b.count {
    let e = try lerElemento(b, o, b.count)
    if e.id == ID.Segment { segmento = e; break }
    o = e.fim
  }
  guard let seg = segmento else { throw falhar("sem Segment") }

  var cabecalho: CabecalhoOpus? = nil
  var pistaOpus: Int? = nil
  var pacotes: [PacoteOpus] = []
  var amostras = 0

  func guardarBloco(_ de: Int, _ ate: Int) throws {
    guard let pistaDoOpus = pistaOpus else { throw falhar("bloco antes das Tracks") }
    let bloco = try pacotesDoBloco(b, de, ate)
    if bloco.pista != pistaDoOpus { return }
    for (inicio, tamanho) in bloco.pacotes {
      let n = try amostrasDoPacote(b, inicio, tamanho)
      pacotes.append(PacoteOpus(inicio: inicio, tamanho: tamanho, amostras: n))
      amostras += n
    }
  }

  func lerTracks(_ de: Int, _ ate: Int) throws {
    var p = de
    while p < ate {
      let e = try lerElemento(b, p, ate)
      if e.id == ID.TrackEntry {
        var numero: Int? = nil
        var codec = ""
        var privado: (Int, Int)? = nil
        var q = e.dados
        while q < e.fim {
          let f = try lerElemento(b, q, e.fim)
          if f.id == ID.TrackNumber { numero = try lerUint(b, f.dados, f.fim) }
          else if f.id == ID.CodecID {
            var texto = String(decoding: b[f.dados..<f.fim], as: UTF8.self)
            while texto.hasSuffix("\0") { texto.removeLast() }
            codec = texto
          }
          else if f.id == ID.CodecPrivate { privado = (f.dados, f.fim) }
          q = f.fim
        }
        if codec == "A_OPUS" {
          if pistaOpus != nil { throw falhar("mais do que uma faixa Opus") }
          guard let n = numero, let pr = privado else { throw falhar("faixa Opus sem número ou sem OpusHead") }
          pistaOpus = n
          cabecalho = try lerOpusHead(b, pr.0, pr.1)
        }
      }
      p = e.fim
    }
  }

  func lerCluster(_ de: Int, _ limite: Int, _ desconhecido: Bool) throws -> Int {
    var p = de
    while p < limite {
      let e = try lerElemento(b, p, limite)
      if desconhecido && DO_SEGMENTO.contains(e.id) { return p }
      if e.desconhecido { throw falhar("filho de Cluster com tamanho desconhecido") }
      if e.id == ID.SimpleBlock { try guardarBloco(e.dados, e.fim) }
      else if e.id == ID.BlockGroup {
        var q = e.dados
        while q < e.fim {
          let f = try lerElemento(b, q, e.fim)
          if f.id == ID.Block { try guardarBloco(f.dados, f.fim) }
          q = f.fim
        }
      }
      p = e.fim
    }
    return p
  }

  let fimDoSegmento = seg.fim
  var p = seg.dados
  while p < fimDoSegmento {
    let e = try lerElemento(b, p, fimDoSegmento)
    if e.id == ID.Tracks { try lerTracks(e.dados, e.fim) }
    if e.id == ID.Cluster {
      if e.desconhecido { p = try lerCluster(e.dados, fimDoSegmento, true) }
      else { _ = try lerCluster(e.dados, e.fim, false); p = e.fim }
      continue
    }
    if e.desconhecido { throw falhar("0x\(String(e.id, radix: 16)) com tamanho desconhecido") }
    p = e.fim
  }

  guard let cab = cabecalho, !pacotes.isEmpty else { throw falhar("sem faixa Opus ou sem pacotes") }
  return (cab, pacotes, amostras)
}

// MARK: - o MP4

/** Bytes em big-endian, como o `Escritor` do JS. */
private struct Escritor {
  var b: [UInt8] = []
  mutating func u8(_ v: Int) { b.append(UInt8(truncatingIfNeeded: v)) }
  mutating func u16(_ v: Int) { b.append(UInt8(truncatingIfNeeded: v >> 8)); b.append(UInt8(truncatingIfNeeded: v)) }
  mutating func u32(_ v: Int) {
    b.append(UInt8(truncatingIfNeeded: v >> 24)); b.append(UInt8(truncatingIfNeeded: v >> 16))
    b.append(UInt8(truncatingIfNeeded: v >> 8)); b.append(UInt8(truncatingIfNeeded: v))
  }
  mutating func u64(_ v: Int) { u32(v / (1 << 32)); u32(v % (1 << 32)) }
  mutating func texto(_ s: String) { b.append(contentsOf: Array(s.utf8)) }
  mutating func zeros(_ n: Int) { b.append(contentsOf: [UInt8](repeating: 0, count: n)) }
  mutating func bytes(_ x: [UInt8]) { b.append(contentsOf: x) }
}

private func caixa(_ tipo: String, _ corpo: (inout Escritor) -> Void) -> [UInt8] {
  var dentro = Escritor()
  corpo(&dentro)
  var e = Escritor()
  e.u32(8 + dentro.b.count)
  e.texto(tipo)
  e.bytes(dentro.b)
  return e.b
}

private func caixaFull(_ tipo: String, _ versao: Int, _ flags: Int, _ corpo: (inout Escritor) -> Void) -> [UInt8] {
  return caixa(tipo) { e in
    e.u8(versao)
    e.u8(flags >> 16); e.u8(flags >> 8); e.u8(flags)
    corpo(&e)
  }
}

private let MATRIZ = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]

private func dOps(_ c: CabecalhoOpus) -> [UInt8] {
  return caixa("dOps") { e in
    e.u8(0)
    e.u8(c.canais)
    e.u16(c.preSkip)
    e.u32(c.taxaDeEntrada)
    e.u16(c.ganhoDeSaida & 0xffff)
    e.u8(0)
  }
}

private func inicio(_ c: CabecalhoOpus, _ kbps: Double) -> [UInt8] {
  let ftyp = caixa("ftyp") { e in e.texto("iso5"); e.u32(512); e.texto("iso5iso6mp41") }
  let mvhd = caixaFull("mvhd", 0, 0) { e in
    e.u32(0); e.u32(0)
    e.u32(1000)
    e.u32(0) // duracao: ZERO (ver o opusMp4.ts)
    e.u32(0x00010000); e.u16(0x0100); e.zeros(10)
    for m in MATRIZ { e.u32(m) }
    e.zeros(24)
    e.u32(2)
  }
  let tkhd = caixaFull("tkhd", 0, 3) { e in
    e.u32(0); e.u32(0); e.u32(1); e.u32(0)
    e.u32(0)
    e.zeros(8); e.u16(0); e.u16(0); e.u16(0x0100); e.u16(0)
    for m in MATRIZ { e.u32(m) }
    e.u32(0); e.u32(0)
  }
  let mdhd = caixaFull("mdhd", 0, 0) { e in
    e.u32(0); e.u32(0); e.u32(TAXA_OPUS)
    e.u32(0)
    e.u16(0x55c4)
    e.u16(0)
  }
  let hdlr = caixaFull("hdlr", 0, 0) { e in e.u32(0); e.texto("soun"); e.zeros(12); e.texto("SoundHandler"); e.u8(0) }
  let smhd = caixaFull("smhd", 0, 0) { e in e.u16(0); e.u16(0) }
  let dinf = caixa("dinf") { e in e.bytes(caixaFull("dref", 0, 0) { d in d.u32(1); d.bytes(caixaFull("url ", 0, 1) { _ in }) }) }
  // Math.round do JS (metade para cima).
  let bitrate = max(0, Int((kbps * 1000).rounded(.toNearestOrAwayFromZero)))
  let entrada = caixa("Opus") { e in
    e.zeros(6); e.u16(1)
    e.zeros(8)
    e.u16(c.canais); e.u16(16); e.u16(0); e.u16(0)
    e.u32(TAXA_OPUS * 65536)
    e.bytes(dOps(c))
    e.bytes(caixa("btrt") { x in x.u32(0); x.u32(bitrate); x.u32(bitrate) })
  }
  let stsd = caixaFull("stsd", 0, 0) { e in e.u32(1); e.bytes(entrada) }
  let vazia = { (tipo: String) in caixaFull(tipo, 0, 0) { e in e.u32(0) } }
  let stbl = caixa("stbl") { e in
    e.bytes(stsd); e.bytes(vazia("stts")); e.bytes(vazia("stsc"))
    e.bytes(caixaFull("stsz", 0, 0) { s in s.u32(0); s.u32(0) })
    e.bytes(vazia("stco"))
  }
  let minf = caixa("minf") { e in e.bytes(smhd); e.bytes(dinf); e.bytes(stbl) }
  let mdia = caixa("mdia") { e in e.bytes(mdhd); e.bytes(hdlr); e.bytes(minf) }
  let trak = caixa("trak") { e in e.bytes(tkhd); e.bytes(mdia) }
  let mvex = caixa("mvex") { e in e.bytes(caixaFull("trex", 0, 0) { t in t.u32(1); t.u32(1); t.u32(0); t.u32(0); t.u32(0) }) }
  let moov = caixa("moov") { e in e.bytes(mvhd); e.bytes(trak); e.bytes(mvex) }
  return ftyp + moov
}

private func moofDoFragmento(_ sequencia: Int, _ inicioEmAmostras: Int, _ lote: ArraySlice<PacoteOpus>) -> [UInt8] {
  func moofCom(_ offset: Int) -> [UInt8] {
    return caixa("moof") { e in
      e.bytes(caixaFull("mfhd", 0, 0) { m in m.u32(sequencia) })
      e.bytes(caixa("traf") { t in
        t.bytes(caixaFull("tfhd", 0, 0x020020) { h in h.u32(1); h.u32(0x02000000) })
        t.bytes(caixaFull("tfdt", 1, 0) { d in d.u64(inicioEmAmostras) })
        t.bytes(caixaFull("trun", 0, 0x000301) { r in
          r.u32(lote.count)
          r.u32(offset)
          for p in lote { r.u32(p.amostras); r.u32(p.tamanho) }
        })
      })
    }
  }
  let moof = moofCom(0)
  return moofCom(moof.count + 8)
}

/**
 * O MP4 inteiro, escrito para `destino` (o audio e copiado uma vez, do WebM
 * para o ficheiro). Devolve os bytes escritos e a duracao em segundos.
 */
func escreverOpusMp4(_ b: [UInt8], _ cabecalho: CabecalhoOpus, _ pacotes: [PacoteOpus], kbps: Double = 0, porFragmento: Int = PACOTES_POR_FRAGMENTO) -> [UInt8] {
  var out = inicio(cabecalho, kbps)
  var decorrido = 0
  var sequencia = 1
  var i = 0
  while i < pacotes.count {
    let ate = min(pacotes.count, i + porFragmento)
    let lote = pacotes[i..<ate]
    out.append(contentsOf: moofDoFragmento(sequencia, decorrido, lote))
    sequencia += 1
    var dados = 0
    for p in lote { decorrido += p.amostras; dados += p.tamanho }
    let tam = 8 + dados
    out.append(UInt8(truncatingIfNeeded: tam >> 24)); out.append(UInt8(truncatingIfNeeded: tam >> 16))
    out.append(UInt8(truncatingIfNeeded: tam >> 8)); out.append(UInt8(truncatingIfNeeded: tam))
    out.append(contentsOf: [0x6d, 0x64, 0x61, 0x74]) // 'mdat'
    for p in lote { out.append(contentsOf: b[p.inicio..<(p.inicio + p.tamanho)]) }
    i = ate
  }
  return out
}

/** O WebM inteiro -> o MP4 inteiro (o `converterWebmParaMp4` do JS). */
public func converterWebmParaMp4(_ webm: [UInt8], kbps: Double = 0) throws -> (mp4: [UInt8], segundos: Double) {
  let lido = try lerWebmOpus(webm)
  return (escreverOpusMp4(webm, lido.cabecalho, lido.pacotes, kbps: kbps), Double(lido.amostras) / Double(TAXA_OPUS))
}
