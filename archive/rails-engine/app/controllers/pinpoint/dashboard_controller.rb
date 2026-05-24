module Pinpoint
  class DashboardController < ApplicationController
    def index
      @pins = Pin.recent.includes(:comments)
      @pins = @pins.by_page(params[:page_url]) if params[:page_url].present?
      @pins = @pins.where(status: params[:status]) if params[:status].present?
      @pins = @pins.where(creator: params[:creator]) if params[:creator].present?

      @page_urls = Pin.distinct.pluck(:page_url).sort
      @creators = Pin.distinct.pluck(:creator).sort
      @status_counts = Pin.group(:status).count
    end

    def show
      @pin = Pin.includes(:comments).find(params[:id])
    end

    def update
      @pin = Pin.find(params[:id])
      @pin.update(params.permit(:status))
      redirect_to dashboard_path(@pin), notice: "Pin updated."
    end

    def destroy
      @pin = Pin.find(params[:id])
      @pin.destroy
      redirect_to dashboard_index_path, notice: "Pin deleted."
    end
  end
end
