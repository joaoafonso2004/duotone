Pod::Spec.new do |s|
  s.name           = 'DuotoneSeparadores'
  s.version        = '1.0.0'
  s.summary        = 'A barra de separadores do sistema, com o Liquid Glass'
  s.description    = 'Uma UITabBar do UIKit sozinha (sem UITabBarController): no iOS 26 traz o vidro, a lente que se arrasta entre separadores e a resposta ao toque.'
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
