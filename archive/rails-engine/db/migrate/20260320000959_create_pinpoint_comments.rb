class CreatePinpointComments < ActiveRecord::Migration[8.1]
  def change
    create_table :pinpoint_comments do |t|
      t.references :pin, null: false, foreign_key: { to_table: :pinpoint_pins }
      t.text       :body, null: false
      t.string     :creator, null: false
      t.timestamps
    end
  end
end
