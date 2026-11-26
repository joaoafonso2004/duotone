Pod::Spec.new do |s|
  s.name           = 'DuotoneVolta'
  s.version        = '1.0.0'
  s.summary        = 'O voltar a deslizar das páginas que abrem por um quadrado'
  s.description    = 'Começa e acaba um pop interativo da pilha nativa, para a página de trás estar na janela enquanto a da frente encolhe com o dedo.'
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
