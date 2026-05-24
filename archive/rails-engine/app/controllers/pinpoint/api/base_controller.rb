module Pinpoint
  module Api
    class BaseController < ::ApplicationController
      skip_before_action :verify_authenticity_token
      before_action :verify_csrf_via_header
      before_action :verify_pinpoint_enabled

      private

      def current_pinpoint_user
        Pinpoint.config.resolve_user(request)
      end

      def verify_pinpoint_enabled
        unless Pinpoint.config.enabled_for?(request)
          render json: { error: "Pinpoint is not enabled" }, status: :forbidden
        end
      end

      # Verify CSRF manually via the X-CSRF-Token header.
      # This is the same token Rails injects via csrf_meta_tags,
      # which the widget JS reads and sends with every request.
      def verify_csrf_via_header
        unless valid_authenticity_token?(session, request.headers["X-CSRF-Token"])
          render json: { error: "Invalid CSRF token" }, status: :unprocessable_entity
        end
      end
    end
  end
end
