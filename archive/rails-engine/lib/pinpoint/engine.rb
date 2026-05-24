module Pinpoint
  class Engine < ::Rails::Engine
    isolate_namespace Pinpoint

    initializer "pinpoint.assets" do |app|
      # Serve the widget JS from the engine's asset path
      app.config.assets.paths << root.join("app", "assets", "javascripts") if app.config.respond_to?(:assets)
    end

    initializer "pinpoint.inject_widget" do |app|
      ActiveSupport.on_load(:action_controller_base) do
        # Add a helper method to inject the widget
        helper Pinpoint::WidgetHelper
      end

      # Auto-inject via middleware for zero-config setup
      app.middleware.use Pinpoint::WidgetMiddleware
    end

    initializer "pinpoint.active_storage" do
      ActiveSupport.on_load(:active_storage_blob) do
        # Ensure Active Storage is available for screenshot attachments
      end
    end
  end
end
