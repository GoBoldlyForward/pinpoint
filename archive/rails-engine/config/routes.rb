Pinpoint::Engine.routes.draw do
  # Widget JS served without asset pipeline dependency
  get "widget.js", to: "widget#show", as: :widget_js

  # API endpoints (used by the widget JS)
  namespace :api do
    resources :pins, only: [:index, :create, :update, :destroy] do
      resources :comments, only: [:create]
    end
  end

  # Dashboard (the Sidekiq-style internal UI)
  resources :dashboard, only: [:index, :show, :update, :destroy]

  root to: "dashboard#index"
end
