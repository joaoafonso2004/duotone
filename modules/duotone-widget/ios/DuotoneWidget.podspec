Pod::Spec.new do |s|
  s.name           = 'DuotoneWidget'
  s.version        = '1.0.0'
  s.summary        = 'Estado partilhado com o widget do ecra inicial'
  s.description    = 'Escreve a faixa a tocar e quem dos amigos esta a ouvir no App Group, e manda o WidgetKit redesenhar.'
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
