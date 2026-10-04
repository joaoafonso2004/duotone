import ExpoModulesCore
import Foundation

/** Um bocado: um pedido Range escrito direto no ficheiro, a partir de `inicio`. */
struct PedidoDeBocado: Record {
  @Field var id: String = ""
  @Field var url: String = ""
  @Field var inicio: Double = 0
  @Field var fim: Double = 0
  @Field var total: Double = 0
  @Field var caminho: String = ""
  @Field var prazoRespostaMs: Double = 8000
  @Field var prazoSemBytesMs: Double = 10000
  @Field var prazoTotalMs: Double = 30000
}

/**
 * O download do audio fora da thread de JavaScript (auditoria 4.1, 4/10).
 *
 * O JS continua a decidir tudo o que ja estava testado -- a fila, as
 * renovacoes depois de um 403, o encolher dos bocados, o cancelamento num
 * skip (`pedirBocados`, src/lib/youtubeCache.ts). Muda o transporte: cada
 * bocado e um pedido do URLSession que escreve os bytes no `.part` a medida
 * que chegam, e ao JS volta so o estado HTTP e quantos bytes ficaram escritos.
 * A conversao do Opus (WebM -> MP4) tambem passou para aqui
 * (`Puro/OpusParaMp4.swift`, igual ao JS byte a byte).
 *
 * Os prazos sao os do JS: sem resposta em `prazoRespostaMs`, sem bytes em
 * `prazoSemBytesMs` (aqui conta tambem em segundo plano: o URLSession recebe
 * os bytes com a app escondida, ao contrario do JS), e `prazoTotalMs` no total.
 */
public class DuotoneDownloadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneDownload")

    AsyncFunction("bocado") { (pedido: PedidoDeBocado, promise: Promise) in
      Transferencias.shared.comecar(pedido, promise: promise)
    }

    Function("cancelar") { (id: String) in
      Transferencias.shared.cancelar(id)
    }

    /**
     * WebM -> MP4, de ficheiro para ficheiro. Devolve os bytes escritos, os
     * segundos de audio e quanto tempo levou (para o relatorio).
     */
    AsyncFunction("converterOpus") { (origem: String, destino: String) throws -> [String: Any] in
      let inicio = Date()
      let resultado: (mp4: [UInt8], segundos: Double)
      do {
        // O WebM só vive aqui dentro: numa mistura longa são dezenas de MB, e
        // não precisa de ficar em memória enquanto o MP4 é escrito.
        let entrada = [UInt8](try Data(contentsOf: urlDoCaminho(origem)))
        resultado = try converterWebmParaMp4(entrada)
      } catch let erro as ErroDoOpus {
        throw OpusInvalidoException(erro.description)
      }
      try Data(resultado.mp4).write(to: urlDoCaminho(destino), options: .atomic)
      return [
        "bytes": resultado.mp4.count,
        "segundos": resultado.segundos,
        "ms": Int(Date().timeIntervalSince(inicio) * 1000),
      ]
    }
  }
}

/** O caminho que o JS conhece (a `uri` do expo-file-system) ou um caminho simples. */
func urlDoCaminho(_ caminho: String) -> URL {
  if let url = URL(string: caminho), url.isFileURL { return url }
  return URL(fileURLWithPath: caminho)
}

/** A frase começa por "WebM/Opus inválido": é por ela que o JS volta ao AAC. */
final class OpusInvalidoException: GenericException<String> {
  override var reason: String { param }
}
