module Pinpoint
  class Pin < ApplicationRecord
    self.table_name = "pinpoint_pins"

    has_many :comments, class_name: "Pinpoint::Comment", foreign_key: :pin_id, dependent: :destroy
    has_one_attached :screenshot

    validates :page_url, presence: true
    validates :x_percent, presence: true, numericality: { in: 0..100 }
    validates :y_percent, presence: true, numericality: { in: 0..100 }
    validates :viewport_width, presence: true, numericality: { greater_than: 0 }
    validates :viewport_height, presence: true, numericality: { greater_than: 0 }
    validates :creator, presence: true
    validates :status, presence: true, inclusion: { in: %w[open acknowledged resolved] }

    scope :by_page, ->(url) { where(page_url: url) }
    scope :open, -> { where(status: "open") }
    scope :acknowledged, -> { where(status: "acknowledged") }
    scope :resolved, -> { where(status: "resolved") }
    scope :recent, -> { order(created_at: :desc) }
  end
end
