# -*- encoding: utf-8 -*-
# stub: jekyll-roman 0.0.3 ruby lib

Gem::Specification.new do |s|
  s.name = "jekyll-roman".freeze
  s.version = "0.0.3"

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.require_paths = ["lib".freeze]
  s.authors = ["Paul Robert Lloyd".freeze]
  s.date = "2020-07-07"
  s.description = "A liquid filter for Jekyll that converts numbers into Roman numerals.".freeze
  s.email = "me+rubygems@paulrobertlloyd.com".freeze
  s.homepage = "https://github.com/paulrobertlloyd/jekyll-roman".freeze
  s.licenses = ["MIT".freeze]
  s.rubygems_version = "3.3.7".freeze
  s.summary = "Jekyll plugin that converts numbers into Roman numerals.".freeze

  s.installed_by_version = "3.3.7" if s.respond_to? :installed_by_version

  if s.respond_to? :specification_version then
    s.specification_version = 4
  end

  if s.respond_to? :add_runtime_dependency then
    s.add_development_dependency(%q<jekyll>.freeze, [">= 3.0", "< 5.0"])
    s.add_development_dependency(%q<rspec>.freeze, ["~> 3.0"])
    s.add_development_dependency(%q<rake>.freeze, ["~> 13.0.1"])
    s.add_development_dependency(%q<bundler>.freeze, ["~> 2.1"])
  else
    s.add_dependency(%q<jekyll>.freeze, [">= 3.0", "< 5.0"])
    s.add_dependency(%q<rspec>.freeze, ["~> 3.0"])
    s.add_dependency(%q<rake>.freeze, ["~> 13.0.1"])
    s.add_dependency(%q<bundler>.freeze, ["~> 2.1"])
  end
end
