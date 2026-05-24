module Pinpoint
  class ApplicationController < ActionController::Base
    protect_from_forgery with: :exception

    private

    def current_pinpoint_user
      Pinpoint.config.resolve_user(request)
    end
    helper_method :current_pinpoint_user

    def pinpoint_enabled?
      Pinpoint.config.enabled_for?(request)
    end
    helper_method :pinpoint_enabled?
  end
end
