module Pinpoint
  module WidgetHelper
    def pinpoint_widget_tag
      return unless Pinpoint.config.enabled_for?(request)

      api_base = pinpoint.api_pins_path rescue "/pinpoint/api/pins"
      # Strip trailing /pins to get the API namespace root
      api_base = api_base.sub(/\/pins$/, "")

      trigger_key = Pinpoint.config.trigger_key

      content_tag(:script, nil,
        src: pinpoint_widget_js_path,
        data: {
          pinpoint: true,
          api_base: api_base,
          trigger_key: trigger_key
        },
        defer: true
      )
    end

    private

    def pinpoint_widget_js_path
      if respond_to?(:pinpoint) && pinpoint.respond_to?(:root_path)
        "#{pinpoint.root_path}widget.js".gsub("//", "/")
      else
        "/pinpoint/widget.js"
      end
    end
  end
end
