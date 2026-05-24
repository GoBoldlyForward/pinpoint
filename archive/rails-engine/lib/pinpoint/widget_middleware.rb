module Pinpoint
  # Rack middleware that auto-injects the Pinpoint widget script into HTML responses.
  # This provides zero-config setup — no need to manually add a helper to layouts.
  class WidgetMiddleware
    def initialize(app)
      @app = app
    end

    def call(env)
      status, headers, response = @app.call(env)

      # Only inject into HTML responses
      return [status, headers, response] unless injectable?(status, headers, env)

      body = ""
      response.each { |chunk| body << chunk }
      response.close if response.respond_to?(:close)

      # Check if pinpoint is enabled for this request
      request = ActionDispatch::Request.new(env)
      return [status, headers, [body]] unless Pinpoint.config.enabled_for?(request)

      # Don't inject into the Pinpoint dashboard itself
      return [status, headers, [body]] if env["PATH_INFO"]&.start_with?("/pinpoint")

      # Inject the widget script before </body>
      if body.include?("</body>")
        trigger_key = Pinpoint.config.trigger_key
        mount_path = "/pinpoint"
        widget_script = <<~HTML
          <script src="#{mount_path}/widget.js" data-pinpoint="true" data-api-base="#{mount_path}/api" data-trigger-key="#{trigger_key}" defer></script>
        HTML
        body.sub!("</body>", "#{widget_script}</body>")

        # Update content length
        headers["Content-Length"] = body.bytesize.to_s if headers["Content-Length"]
      end

      [status, headers, [body]]
    end

    private

    def injectable?(status, headers, env)
      return false unless status == 200
      return false unless headers["Content-Type"]&.include?("text/html")
      # Don't inject into XHR/fetch responses
      return false if env["HTTP_X_REQUESTED_WITH"] == "XMLHttpRequest"
      true
    end
  end
end
