"""
Utility functions for tour optimization using the Traveling Salesman Problem.
"""
import json
import os
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import math
import time

# Offline data cache
_CITY_DATA: Optional[List[Dict]] = None
OFFLINE_MODE = os.getenv("OFFLINE_MODE", "false").lower() in ("1", "true", "yes", "on")
CITY_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "cities.json"


def _normalize(text: str) -> str:
    """Normalize text for matching (lowercase, strip, remove accents)."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join([c for c in text if not unicodedata.combining(c)])
    return text.lower().strip()


def _load_city_data() -> List[Dict]:
    """Load city coordinate data once from disk."""
    global _CITY_DATA
    if _CITY_DATA is not None:
        return _CITY_DATA

    if not CITY_DATA_PATH.exists():
        _CITY_DATA = []
        return _CITY_DATA

    try:
        with CITY_DATA_PATH.open("r", encoding="utf-8") as f:
            _CITY_DATA = json.load(f)
    except Exception as exc:
        print(f"Error loading city data from {CITY_DATA_PATH}: {exc}")
        _CITY_DATA = []
    return _CITY_DATA


def generate_and_write_cities(rows: int = 30, cols: int = 40) -> None:
    """Generate a grid of synthetic cities and write to `cities.json`.

    This creates `rows * cols` cities (default 30x40 = 1200) with
    deterministic coordinates distributed across valid lat/lon ranges.
    """
    step_lat = 170.0 / (rows - 1)
    step_lon = 360.0 / (cols - 1)
    cities = []
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c + 1
            lat = -85 + r * step_lat
            lon = -180 + c * step_lon
            cities.append({
                "name": f"City {i:04d}",
                "country": f"Country {r % 10}",
                "lat": round(lat, 6),
                "lng": round(lon, 6),
                "alt_names": []
            })

    try:
        CITY_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CITY_DATA_PATH.open("w", encoding="utf-8") as f:
            json.dump(cities, f, indent=2, ensure_ascii=False)
        # refresh cache
        global _CITY_DATA
        _CITY_DATA = cities
        print(f"Wrote {len(cities)} synthetic cities to {CITY_DATA_PATH}")
    except Exception as exc:
        print(f"Failed to write synthetic cities to {CITY_DATA_PATH}: {exc}")


def offline_geocode(location_name: str) -> Optional[Tuple[float, float]]:
    """
    Lookup coordinates from the bundled city data without making network calls.

    Matching strategy (in order):
    - Exact match on normalized "city, country" if the input contains a comma
    - Exact match on city name alone
    - Match against alternate names
    """
    if not location_name:
        return None

    data = _load_city_data()
    if not data:
        return None

    norm_input = _normalize(location_name)
    city_part = norm_input
    country_part = ""
    if "," in norm_input:
        parts = [p.strip() for p in norm_input.split(",", 1)]
        city_part = parts[0]
        country_part = parts[1]

    # 1) match "city, country"
    if country_part:
        for entry in data:
            if _normalize(entry.get("name", "")) == city_part and _normalize(entry.get("country", "")) == country_part:
                return (float(entry["lat"]), float(entry["lng"]))

    # 2) match city name only
    for entry in data:
        if _normalize(entry.get("name", "")) == city_part:
            return (float(entry["lat"]), float(entry["lng"]))

    # 3) match alt names
    for entry in data:
        for alt in entry.get("alt_names", []) or []:
            if _normalize(alt) == norm_input or _normalize(alt) == city_part:
                return (float(entry["lat"]), float(entry["lng"]))

    return None


def geocode_location(location_name: str, geolocator: Optional[object] = None) -> Optional[Tuple[float, float]]:
    """
    Geocode a location name to get its latitude and longitude.
    Only local data is used (no network/geopy).
    """
    # Always try offline data first
    coords = offline_geocode(location_name)
    if coords:
        return coords
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
    # Haversine formula
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    # convert degrees to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    R = 6371.0088  # mean Earth radius in kilometers
    return R * c


def nearest_neighbor_tsp(
    starting_location: str,
    city_names: List[str],
    return_to_start: bool = True
) -> Tuple[List[str], float, List[Tuple[float, float]]]:
    # sho8l coordinates el awl 
    start_coords = geocode_location(starting_location)
    if start_coords is None:
        raise ValueError(f"error f decoding 2bl el coodrinates check: {starting_location}")
    
    # decode el cities to coordinates 2bl ma nsht8l
    city_coords = {}
    for city in city_names:
        coords = geocode_location(city)
        if coords is None:
            print(f"Coordinates error mn nearest {city}, hn3deha w check elly b3dha ")
            continue
        city_coords[city] = coords
        time.sleep(0.5)
    
    if not city_coords:
        raise ValueError("kol el cities failed in geocode, check script")
    
    # algorithm start hna 
    unvisited = set(city_coords.keys()) # set 3shan unique value 
    route = [starting_location]
    route_coords = [start_coords]
    current_coords = start_coords
    total_distance = 0.0 # d 3shan dubugging w front end bs 
    
    # loop over unvisited cities 
    while unvisited:
        nearest_city = None
        nearest_distance = float('inf') # ebd2 nearest distance with infinite 
        
        for city in unvisited:
            distance = calculate_distance(current_coords, city_coords[city])
            if distance < nearest_distance:
                nearest_distance = distance
                nearest_city = city
        # append el nearest l el route w distance w change el coords w remove mn unvisited
        if nearest_city:
            route.append(nearest_city)
            route_coords.append(city_coords[nearest_city])
            total_distance += nearest_distance
            current_coords = city_coords[nearest_city]
            unvisited.remove(nearest_city)
    
    # lw option el return to start enabled hn3ml append for one more trip from current to start tany 
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
        heavy stuff hna el exact b2a 
    """
    
    # zy 2bl kda blzbt more professional errors bs considering frontend view
    start_coords = geocode_location(starting_location)
    if start_coords is None:
        raise ValueError(f"Could not geocode starting location: {starting_location}")
    

    city_coords = {}
    for city in city_names:
        coords = geocode_location(city)
        if coords is None:
            print(f"Warning: Could not geocode {city}, skipping...")
            continue
        city_coords[city] = coords

        time.sleep(0.5)
    
    if not city_coords:
        raise ValueError("No cities could be geocoded successfully")
    
    num_cities = len(city_coords)
    
    # check lw aktr mn 20 city 3sha Efficiency 
    if num_cities > 20:
        raise ValueError(
            f"Exact TSP solver is not practical for {num_cities} cities. "
            f"Please use the approximate algorithm for problems with more than 20 cities."
        )
    
    # start distance matrix hna 
    all_locations = [starting_location] + list(city_coords.keys())
    all_coords = [start_coords] + [city_coords[city] for city in city_coords.keys()]
    n = len(all_locations)
    
    # initialize distance matrix 
    dist_matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j: # no need to calc distance to the cityiself so we just calc to others
                dist_matrix[i][j] = calculate_distance(all_coords[i], all_coords[j])
    
    # dp[mask][last] = minimum cost to visit all cities in mask ending at last
    # initalize 
    dp: Dict[Tuple[int, int], Tuple[float, Optional[int]]] = {}
    
    # Base case: hnbd2 mn 0 elly hya starting city 
    # mask = 1 lw city visited 
    dp[(1, 0)] = (0.0, None)
    
    # loop over masks 
    for mask in range(1, 1 << n):
        # ignore lw el city doesn't start with base case 
        if not (mask & 1):
            continue
            
        for last in range(n):
            if not (mask & (1 << last)):
                continue
            
            # mtnsa4 tskip el impossible combinatios 
            if (mask, last) not in dp:
                continue
            
            current_cost, _ = dp[(mask, last)]
            
            #try visiting each unvisited city
            for next_city in range(n):
                if mask & (1 << next_city):
                    continue  # continue lw visited already 
                
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

