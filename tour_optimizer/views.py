from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie
import json
from .utils import nearest_neighbor_tsp, exact_tsp


@require_http_methods(["GET", "POST"])
def view_graph(request):
    """Render an animated view of a calculated route.

    This view expects a POST with a `route_data` form field containing
    a JSON string produced by the optimize response. It will render a
    page that animates the path. GET will render a small instructions
    page explaining how to open the view (or show an error).
    """
    if request.method == 'POST':
        route_data_raw = request.POST.get('route_data') or request.POST.get('data')
        if not route_data_raw:
            return render(request, 'tour_optimizer/view_graph.html', {
                'error': 'No route data provided. Please open the view via the "Watch Graph" button.'
            })

        try:
            parsed = json.loads(route_data_raw)
        except Exception as e:
            return render(request, 'tour_optimizer/view_graph.html', {
                'error': f'Invalid route data: {e}'
            })

        # Pass JSON safely to template
        route_json = json.dumps(parsed)
        return render(request, 'tour_optimizer/view_graph.html', {
            'route_json': route_json
        })

    # GET: show instructions
    return render(request, 'tour_optimizer/view_graph.html', {})


def index(request):
    """Home page view."""
    return render(request, 'tour_optimizer/index.html')


@ensure_csrf_cookie
@require_http_methods(["GET", "POST"])
def optimize_route(request):
    """
    Handle route optimization requests.
    GET: Display the form
    POST: Calculate optimized route and return JSON response
    """
    if request.method == 'GET':
        return render(request, 'tour_optimizer/optimize_route.html')
    
    elif request.method == 'POST':
        try:
            # Parse JSON data from request body
            if request.content_type == 'application/json':
                data = json.loads(request.body)
            else:
                # Handle form data
                data = request.POST
            
            # Get form data
            starting_location = str(data.get('starting_location', '')).strip()
            city_list_text = str(data.get('city_list', '')).strip()
            
            # Handle return_to_start - can be boolean (from JSON) or string (from form)
            return_to_start_val = data.get('return_to_start', True)
            if isinstance(return_to_start_val, bool):
                return_to_start = return_to_start_val
            elif isinstance(return_to_start_val, str):
                return_to_start = return_to_start_val.lower() in ('true', 'on', '1', 'yes')
            else:
                return_to_start = True  # Default to True
            
            # Handle algorithm selection - 'exact' or 'approximate' (default)
            algorithm = data.get('algorithm', 'approximate').lower().strip()
            if algorithm not in ['exact', 'approximate']:
                algorithm = 'approximate'  # Default to approximate
            
            # Validate inputs
            if not starting_location:
                return JsonResponse({
                    'error': 'Starting location is required'
                }, status=400)
            
            if not city_list_text:
                return JsonResponse({
                    'error': 'City list is required'
                }, status=400)
            
            # Parse city list from textarea (one per line or comma-separated)
            city_names = []
            for line in city_list_text.split('\n'):
                line = line.strip()
                if line:
                    # Handle comma-separated cities on same line
                    cities = [c.strip() for c in line.split(',') if c.strip()]
                    city_names.extend(cities)
            
            if not city_names:
                return JsonResponse({
                    'error': 'At least one city must be provided'
                }, status=400)
            
            # Call the appropriate optimization algorithm
            if algorithm == 'exact':
                try:
                    route, total_distance, route_coords = exact_tsp(
                        starting_location=starting_location,
                        city_names=city_names,
                        return_to_start=return_to_start
                    )
                except ValueError as e:
                    # If exact algorithm fails (e.g., too many cities), fall back to approximate
                    if "not practical" in str(e).lower() or "too many" in str(e).lower():
                        return JsonResponse({
                            'error': str(e) + ' Please use the approximate algorithm instead.'
                        }, status=400)
                    raise
            else:
                route, total_distance, route_coords = nearest_neighbor_tsp(
                    starting_location=starting_location,
                    city_names=city_names,
                    return_to_start=return_to_start
                )
            
            # Prepare response data
            response_data = {
                'success': True,
                'route': route,
                'total_distance': round(total_distance, 2),
                'algorithm_used': algorithm,
                'coordinates': [
                    {'lat': coord[0], 'lng': coord[1]} 
                    for coord in route_coords
                ],
                'route_with_coords': [
                    {
                        'location': route[i],
                        'lat': route_coords[i][0],
                        'lng': route_coords[i][1]
                    }
                    for i in range(len(route))
                ]
            }
            
            return JsonResponse(response_data)
            
        except ValueError as e:
            return JsonResponse({
                'error': str(e)
            }, status=400)
        
        except Exception as e:
            return JsonResponse({
                'error': f'An error occurred: {str(e)}'
            }, status=500)

