"""
Utility functions for tour optimization using the Traveling Salesman Problem.
"""
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from typing import List, Tuple, Optional
import time


def geocode_location(location_name: str, geolocator: Optional[Nominatim] = None) -> Optional[Tuple[float, float]]:
    """
    Geocode a location name to get its latitude and longitude.
    Supports international locations worldwide.
    
    Args:
        location_name: Name of the location (city, address, etc.)
                      Examples: "Cairo, Egypt", "Paris, France", "Tokyo, Japan"
                      More specific is better: "City, Country" format works best
        geolocator: Optional geolocator instance (to reuse for multiple calls)
    
    Returns:
        Tuple of (latitude, longitude) or None if geocoding fails
    """
    if geolocator is None:
        geolocator = Nominatim(user_agent="tour_optimizer")
    
    try:
        # Try geocoding with the provided location name
        location = geolocator.geocode(location_name, timeout=10, exactly_one=True)
        if location:
            return (location.latitude, location.longitude)
        return None
    except Exception as e:
        print(f"Error geocoding {location_name}: {e}")
        return None


def calculate_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """
    Calculate geodesic distance between two coordinates in kilometers.
    
    Args:
        coord1: Tuple of (latitude, longitude) for first location
        coord2: Tuple of (latitude, longitude) for second location
    
    Returns:
        Distance in kilometers
    """
    return geodesic(coord1, coord2).kilometers


def nearest_neighbor_tsp(
    starting_location: str,
    city_names: List[str],
    return_to_start: bool = True
) -> Tuple[List[str], float, List[Tuple[float, float]]]:
    """
    Solve the Traveling Salesman Problem using the Nearest Neighbor algorithm.
    
    Args:
        starting_location: Name of the starting location
        city_names: List of city/location names to visit
        return_to_start: If True, return to starting location at the end
    
    Returns:
        Tuple containing:
        - List of location names in optimized order
        - Total distance in kilometers
        - List of coordinates for each location in order
    """
    # Initialize geolocator
    geolocator = Nominatim(user_agent="tour_optimizer")
    
    # Geocode starting location
    start_coords = geocode_location(starting_location, geolocator)
    if start_coords is None:
        raise ValueError(f"Could not geocode starting location: {starting_location}")
    
    # Geocode all cities
    city_coords = {}
    for city in city_names:
        coords = geocode_location(city, geolocator)
        if coords is None:
            print(f"Warning: Could not geocode {city}, skipping...")
            continue
        city_coords[city] = coords
        # Be respectful to geocoding service - add small delay
        time.sleep(0.5)
    
    if not city_coords:
        raise ValueError("No cities could be geocoded successfully")
    
    # Nearest Neighbor algorithm
    unvisited = set(city_coords.keys())
    route = [starting_location]
    route_coords = [start_coords]
    current_coords = start_coords
    total_distance = 0.0
    
    # Visit all cities using nearest neighbor
    while unvisited:
        nearest_city = None
        nearest_distance = float('inf')
        
        for city in unvisited:
            distance = calculate_distance(current_coords, city_coords[city])
            if distance < nearest_distance:
                nearest_distance = distance
                nearest_city = city
        
        if nearest_city:
            route.append(nearest_city)
            route_coords.append(city_coords[nearest_city])
            total_distance += nearest_distance
            current_coords = city_coords[nearest_city]
            unvisited.remove(nearest_city)
    
    # Return to starting location if requested
    if return_to_start:
        distance_to_start = calculate_distance(current_coords, start_coords)
        total_distance += distance_to_start
        route.append(starting_location)
        route_coords.append(start_coords)
    
    return route, total_distance, route_coords

