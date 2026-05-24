require "pinpoint/version"
require "pinpoint/configuration"
require "pinpoint/widget_middleware"
require "pinpoint/engine"

module Pinpoint
  class << self
    attr_accessor :configuration

    def configure
      self.configuration ||= Configuration.new
      yield(configuration)
    end

    def config
      self.configuration ||= Configuration.new
    end
  end
end
