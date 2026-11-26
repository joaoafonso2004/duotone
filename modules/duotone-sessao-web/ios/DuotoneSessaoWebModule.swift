import ExpoModulesCore
import WebKit

/**
 * Sair da conta do Spotify no iPhone (26/11, um comentário no Reddit: "I logged
 * into my wrong Spotify account and didn't see a way to sign out"). A sessão do
 * leitor web e do login (`LeitorDoSpotify.tsx`) vive nos cookies do armazém por
 * omissão do WKWebView, que o react-native-webview usa e não deixa apagar. Aqui
 * apagam-se os registos do Spotify, e só esses: o resto das WebViews da app
 * (o BotGuard, por exemplo) fica como estava.
 */
public class DuotoneSessaoWebModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneSessaoWeb")

    // Para o JavaScript saber que o binário tem o módulo (modules/duotone-sessao-web/index.ts).
    Constant("versao") {
      1
    }

    /** Apaga os cookies e os dados dos sites do Spotify. Devolve quantos registos saíram. */
    AsyncFunction("esquecerSpotify") { (promise: Promise) in
      let armazem = WKWebsiteDataStore.default()
      let tipos = WKWebsiteDataStore.allWebsiteDataTypes()
      armazem.fetchDataRecords(ofTypes: tipos) { registos in
        let doSpotify = registos.filter { $0.displayName.lowercased().contains("spotify") }
        armazem.removeData(ofTypes: tipos, for: doSpotify) {
          promise.resolve(doSpotify.count)
        }
      }
    }.runOnQueue(.main)
  }
}
