"""
Utility functions for tour optimization using the Traveling Salesman Problem.
"""
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from typing import List, Tuple, Optional, Dict
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


def exact_tsp(
    starting_location: str,
    city_names: List[str],
    return_to_start: bool = True
) -> Tuple[List[str], float, List[Tuple[float, float]]]:
    """
    Solve the Traveling Salesman Problem using the Held-Karp algorithm (exact solution).
    This uses dynamic programming to find the optimal route.
    
    Note: This algorithm has O(2^n * n^2) time complexity, so it's only practical
    for small to medium-sized problems (typically up to 20 cities).
    
    Args:
        starting_location: Name of the starting location
        city_names: List of city/location names to visit
        return_to_start: If True, return to starting location at the end
    
    Returns:
        Tuple containing:
        - List of location names in optimized order
        - Total distance in kilometers
        - List of coordinates for each location in order
    
    Raises:
        ValueError: If there are too many cities (more than 20) or geocoding fails
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
    
    num_cities = len(city_coords)
    
    # Warn if too many cities (exact solution becomes impractical)
    if num_cities > 20:
        raise ValueError(
            f"Exact TSP solver is not practical for {num_cities} cities. "
            f"Please use the approximate algorithm for problems with more than 20 cities."
        )
    
    # Build distance matrix
    all_locations = [starting_location] + list(city_coords.keys())
    all_coords = [start_coords] + [city_coords[city] for city in city_coords.keys()]
    n = len(all_locations)
    
    # Create distance matrix
    dist_matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                dist_matrix[i][j] = calculate_distance(all_coords[i], all_coords[j])
    
    # Held-Karp algorithm
    # dp[mask][last] = minimum cost to visit all cities in mask ending at last
    # mask is a bitmask representing visited cities
    # We'll use a dictionary for memoization
    dp: Dict[Tuple[int, int], Tuple[float, Optional[int]]] = {}
    
    # Base case: starting at city 0 (starting_location)
    # mask = 1 means only city 0 is visited
    dp[(1, 0)] = (0.0, None)
    
    # Fill DP table
    for mask in range(1, 1 << n):
        # Only process masks that include the starting city (bit 0)
        if not (mask & 1):
            continue
            
        for last in range(n):
            if not (mask & (1 << last)):
                continue
                
            if (mask, last) not in dp:
                continue
            
            current_cost, _ = dp[(mask, last)]
            
            # Try visiting each unvisited city
            for next_city in range(n):
                if mask & (1 << next_city):
                    continue  # Already visited
                
                new_mask = mask | (1 << next_city)
                new_cost = current_cost + dist_matrix[last][next_city]
                
                if (new_mask, next_city) not in dp or new_cost < dp[(new_mask, next_city)][0]:
                    dp[(new_mask, next_city)] = (new_cost, last)
    
    # Find the optimal tour
    # All cities must be visited (mask = (1 << n) - 1)
    full_mask = (1 << n) - 1
    min_cost = float('inf')
    best_last = None
    
    # Try all possible ending cities
    for last in range(n):
        if (full_mask, last) not in dp:
            continue
        
        cost = dp[(full_mask, last)][0]
        if return_to_start:
            # Add cost to return to starting city
            cost += dist_matrix[last][0]
        
        if cost < min_cost:
            min_cost = cost
            best_last = last
    
    if best_last is None:
        raise ValueError("Could not find optimal solution")
    
    # Reconstruct the path by tracing back through the DP table
    route_indices = []
    current_mask = full_mask
    current_city = best_last
    
    # Trace back the path
    while True:
        route_indices.append(current_city)
        
        if (current_mask, current_city) not in dp:
            break
        
        _, prev_city = dp[(current_mask, current_city)]
        
        if prev_city is None:
            # Reached the starting city (city 0)
            if current_city != 0:
                route_indices.append(0)
            break
        
        # Remove current city from mask before looking up previous
        current_mask = current_mask & ~(1 << current_city)
        current_city = prev_city
    
    # Reverse to get the path from start to end
    route_indices.reverse()
    
    # Ensure we start at city 0 (starting_location)
    if not route_indices or route_indices[0] != 0:
        route_indices.insert(0, 0)
    
    # If returning to start, add it at the end (if not already there)
    if return_to_start and (not route_indices or route_indices[-1] != 0):
        route_indices.append(0)
    
    # Convert indices to location names and coordinates
    route = [all_locations[i] for i in route_indices]
    route_coords = [all_coords[i] for i in route_indices]
    
    return route, min_cost, route_coords

