module Pinpoint
  module Api
    class CommentsController < BaseController
      def create
        pin = Pin.find(params[:pin_id])
        comment = pin.comments.build(comment_params)
        comment.creator = current_pinpoint_user

        if comment.save
          render json: {
            id: comment.id,
            body: comment.body,
            creator: comment.creator,
            created_at: comment.created_at
          }, status: :created
        else
          render json: { errors: comment.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def comment_params
        params.permit(:body)
      end
    end
  end
end
