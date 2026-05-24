module Pinpoint
  module Api
    class PinsController < BaseController
      def index
        # Always require page_url — never return pins for all pages
        if params[:page_url].blank?
          render json: [] and return
        end

        pins = Pin.recent.by_page(params[:page_url])
        pins = pins.where(status: params[:status]) if params[:status].present?

        Rails.logger.info "[Pinpoint] Loading pins for page_url=#{params[:page_url].inspect} — found #{pins.count}"

        render json: pins.includes(:comments).map { |pin| pin_json(pin) }
      end

      def create
        pin = Pin.new(pin_params)
        pin.creator = current_pinpoint_user

        if params[:screenshot].present?
          pin.screenshot.attach(
            io: StringIO.new(Base64.decode64(params[:screenshot])),
            filename: "pin_#{Time.current.to_i}.png",
            content_type: "image/png"
          )
        end

        if pin.save
          render json: pin_json(pin), status: :created
        else
          render json: { errors: pin.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        pin = Pin.find(params[:id])

        if pin.update(status_params)
          render json: pin_json(pin)
        else
          render json: { errors: pin.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        pin = Pin.find(params[:id])
        pin.destroy
        head :no_content
      end

      private

      def pin_params
        params.permit(
          :page_url, :page_title, :x_percent, :y_percent,
          :viewport_width, :viewport_height, :page_width, :page_height, :body
        )
      end

      def status_params
        params.permit(:status)
      end

      def pin_json(pin)
        {
          id: pin.id,
          page_url: pin.page_url,
          page_title: pin.page_title,
          x_percent: pin.x_percent,
          y_percent: pin.y_percent,
          viewport_width: pin.viewport_width,
          viewport_height: pin.viewport_height,
          body: pin.body,
          status: pin.status,
          creator: pin.creator,
          screenshot_url: pin.screenshot.attached? ? rails_blob_url(pin.screenshot, only_path: true) : nil,
          comments: pin.comments.recent.map { |c| comment_json(c) },
          created_at: pin.created_at,
          updated_at: pin.updated_at
        }
      end

      def comment_json(comment)
        {
          id: comment.id,
          body: comment.body,
          creator: comment.creator,
          created_at: comment.created_at
        }
      end
    end
  end
end
