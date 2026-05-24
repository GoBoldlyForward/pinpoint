module Pinpoint
  class Configuration
    attr_accessor :current_user, :trigger_key, :enabled, :screenshot_method

    def initialize
      @current_user      = ->(request) { "anonymous" }
      @trigger_key       = "shift+meta+f"
      @enabled           = ->(_request) { true }
      @screenshot_method = :html2canvas
    end

    def enabled_for?(request)
      case @enabled
      when Proc then @enabled.call(request)
      else !!@enabled
      end
    end

    def resolve_user(request)
      case @current_user
      when Proc then @current_user.call(request)
      else @current_user.to_s
      end
    end
  end
end
