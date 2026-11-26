Pod::Spec.new do |s|
  s.name           = 'DuotoneSessaoWeb'
  s.version        = '1.0.0'
  s.summary        = 'Esquecer a sessão do Spotify nas WebViews'
  s.description    = 'Apaga os cookies e os dados do Spotify do armazém por omissão do WKWebView (WKWebsiteDataStore).'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WebKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
