from django.urls import path
from . import views

app_name = 'tour_optimizer'

urlpatterns = [
    path('', views.index, name='index'),
    path('optimize/', views.optimize_route, name='optimize_route'),
    path('view-graph/', views.view_graph, name='view_graph'),
]

