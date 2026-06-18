require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "MoQ"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => '16.0' }
  s.source       = { :git => "https://github.com/software-mansion-labs/react-native-moq.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"

  install_modules_dependencies(s)

  spm_dependency(s,
    url: 'https://github.com/software-mansion-labs/moq-kit.git',
    requirement: { kind: 'exactVersion', version: '0.2.1' },
    products: ['MoQKit']
  )
end
