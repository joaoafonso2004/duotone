Pod::Spec.new do |s|
  s.name           = 'DuotoneCapa'
  s.version        = '1.0.0'
  s.summary        = 'O recuo da capa no skip, no Core Animation'
  s.description    = 'Uma vista à volta da capa 3D do leitor que anima o recuo do skip no servidor de desenho do iOS, fora da thread principal da app.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'QuartzCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
