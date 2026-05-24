module Pinpoint
  class WidgetController < ActionController::Metal
    include ActionController::Rendering
    include ActionController::DataStreaming

    def show
      file_path = Pinpoint::Engine.root.join("app", "assets", "javascripts", "pinpoint", "widget.js")
      if File.exist?(file_path)
        self.content_type = "application/javascript"
        self.response_body = File.read(file_path)
      else
        self.status = 404
        self.response_body = ""
      end
    end
  end
end
