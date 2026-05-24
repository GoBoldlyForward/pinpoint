require "rails/generators"
require "rails/generators/active_record"

module Pinpoint
  module Generators
    class InstallGenerator < Rails::Generators::Base
      include ActiveRecord::Generators::Migration

      source_root File.expand_path("templates", __dir__)

      desc "Creates Pinpoint migration files and initializer."

      def create_migration_file
        migration_template "create_pinpoint_pins.rb.erb",
          File.join(db_migrate_path, "create_pinpoint_pins.rb")
        migration_template "create_pinpoint_comments.rb.erb",
          File.join(db_migrate_path, "create_pinpoint_comments.rb")
      end

      def create_initializer
        template "initializer.rb.erb", "config/initializers/pinpoint.rb"
      end

      def mount_engine
        route 'mount Pinpoint::Engine, at: "/pinpoint"'
      end

      private

      def db_migrate_path
        "db/migrate"
      end
    end
  end
end
