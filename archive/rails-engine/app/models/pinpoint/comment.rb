module Pinpoint
  class Comment < ApplicationRecord
    self.table_name = "pinpoint_comments"

    belongs_to :pin, class_name: "Pinpoint::Pin"

    validates :body, presence: true
    validates :creator, presence: true

    scope :recent, -> { order(created_at: :asc) }
  end
end
