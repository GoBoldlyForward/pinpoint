class CreatePinpointPins < ActiveRecord::Migration[8.1]
  def change
    create_table :pinpoint_pins do |t|
      t.string  :page_url,        null: false
      t.string  :page_title
      t.float   :x_percent,       null: false
      t.float   :y_percent,       null: false
      t.integer :viewport_width,  null: false
      t.integer :viewport_height, null: false
      t.integer :page_width
      t.integer :page_height
      t.text    :body
      t.string  :status,          null: false, default: "open"
      t.string  :creator,         null: false
      t.timestamps
    end

    add_index :pinpoint_pins, :page_url
    add_index :pinpoint_pins, :status
    add_index :pinpoint_pins, :creator
    add_index :pinpoint_pins, :created_at
  end
end
