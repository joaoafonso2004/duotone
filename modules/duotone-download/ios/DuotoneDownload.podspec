Pod::Spec.new do |s|
  s.name           = 'DuotoneDownload'
  s.version        = '1.0.0'
  s.summary        = 'Download do audio fora do JavaScript'
  s.description    = 'Descarrega cada bocado de um pedido Range direto para o ficheiro, com URLSession: os bytes do audio nao passam pela thread de JavaScript.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
