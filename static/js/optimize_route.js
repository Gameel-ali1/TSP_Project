// Initialize graph variables
let routeGraph = null;
let graphSvg = null;
let graphNodes = [];
let graphLinks = [];

// Check if D3.js is available
if (typeof d3 === 'undefined') {
    console.warn('D3.js is not loaded yet. Make sure D3.js script is included before this script.');
}

// Get CSRF token from cookie
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Clear existing graph
function clearGraph() {
    if (graphSvg) {
        graphSvg.selectAll("*").remove();
    }
    graphNodes = [];
    graphLinks = [];
}

// Display route as a graph
function displayRouteGraph(routeData) {
    // Check if D3.js is loaded
    if (typeof d3 === 'undefined') {
        console.error('D3.js is not loaded. Please ensure D3.js is included in the page.');
        const container = document.getElementById('routeGraph');
        if (container) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #dc3545;">Error: D3.js library is not loaded. Please refresh the page.</div>';
        }
        return;
    }
    
    clearGraph();
    
    if (!routeData.coordinates || routeData.coordinates.length === 0) {
        return;
    }
    
    const coordinates = routeData.coordinates;
    const route = routeData.route;
    
    // Get container dimensions
    const container = document.getElementById('routeGraph');
    if (!container) return;
    
    // Use actual container size
    const containerRect = container.getBoundingClientRect();
    const width = containerRect.width || 600;
    const height = containerRect.height || 500;
    
    // Remove existing SVG
    d3.select('#routeGraph').selectAll('svg').remove();
    
    // Create SVG with viewBox for responsiveness
    graphSvg = d3.select('#routeGraph')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    
    // Create nodes (cities) - handle duplicates when returning to start
    graphNodes = route.map((cityName, index) => {
        const isStart = index === 0;
        const isEnd = index === coordinates.length - 1 && 
                     route.length > 1 && 
                     route[0] === route[route.length - 1] &&
                     index === coordinates.length - 1;
        
        // For duplicate cities (return to start), show both but mark appropriately
        const nodeId = isEnd && route[0] === route[route.length - 1] && index === route.length - 1 
            ? `end-${index}` 
            : index;
        
        return {
            id: nodeId,
            originalIndex: index,
            name: cityName,
            rank: index + 1,
            isStart: isStart,
            isEnd: isEnd && !isStart,
            x: width / 2 + (Math.random() - 0.5) * 100,
            y: height / 2 + (Math.random() - 0.5) * 100
        };
    });
    
    // Create links (edges) with distances
    graphLinks = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
        const distance = calculateDistance(coordinates[i], coordinates[i + 1]);
        graphLinks.push({
            source: graphNodes[i],
            target: graphNodes[i + 1],
            distance: distance.toFixed(1)
        });
    }
    
    // Create force simulation with better layout
    const simulation = d3.forceSimulation(graphNodes)
        .force('link', d3.forceLink(graphLinks).id(d => d.id).distance(d => {
            // Adjust distance based on actual route distance
            return 120 + Math.min(parseFloat(d.distance) / 10, 80);
        }))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(70))
        .alphaDecay(0.05);
    
    // Create edges (links) - black and white theme
    const link = graphSvg.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(graphLinks)
        .enter()
        .append('line')
        .attr('stroke', 'rgba(255, 255, 255, 0.5)')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.6)
        .attr('marker-end', 'url(#arrowhead)');
    
    // Add arrow marker for directed edges
    graphSvg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'rgba(255, 255, 255, 0.5)');
    
    // Add distance labels on edges
    const linkLabels = graphSvg.append('g')
        .attr('class', 'link-labels')
        .selectAll('text')
        .data(graphLinks)
        .enter()
        .append('text')
        .attr('class', 'link-label')
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', 'rgba(255, 255, 255, 0.8)')
        .attr('font-weight', '500')
        .text(d => d.distance + ' km');
    
    // Create nodes (cities)
    const node = graphSvg.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(graphNodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));
    
    // Add circles for nodes - black and white theme
    node.append('circle')
        .attr('r', 35)
        .attr('fill', d => {
            if (d.isStart) return '#ffffff'; // White for start
            if (d.isEnd) return '#ffffff'; // White for end
            return '#ffffff'; // White for all nodes
        })
        .attr('stroke', d => {
            if (d.isStart) return '#000000'; // Black border for start
            if (d.isEnd) return '#000000'; // Black border for end
            return '#000000'; // Black border for intermediate
        })
        .attr('stroke-width', d => {
            if (d.isStart || d.isEnd) return 4; // Thicker border for start/end
            return 3; // Normal border for intermediate
        })
        .attr('opacity', 0.95);
    
    // Add rank number - black text on white background
    node.append('text')
        .attr('class', 'rank-number')
        .attr('text-anchor', 'middle')
        .attr('dy', 5)
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('fill', '#000000')
        .attr('stroke', 'none')
        .text(d => d.rank);
    
    // Add city name labels
    node.append('text')
        .attr('class', 'city-name')
        .attr('text-anchor', 'middle')
        .attr('dy', 55)
        .attr('font-size', '12px')
        .attr('font-weight', '500')
        .attr('fill', '#ffffff')
        .text(d => {
            // Truncate long names
            const maxLength = 15;
            return d.name.length > maxLength ? d.name.substring(0, maxLength) + '...' : d.name;
        });
    
    // Add tooltips
    node.append('title')
        .text(d => `${d.rank}. ${d.name}`);
    
    // Update positions on simulation tick
    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        linkLabels
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);
        
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    
    // Drag functions
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('optimizeForm');
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const results = document.getElementById('results');
    const routeList = document.getElementById('routeList');
    const totalDistance = document.getElementById('totalDistance');
    
    if (!form) return;
    
    // Handle algorithm select description update
    const algorithmSelect = document.getElementById('algorithm');
    const algorithmDescription = document.getElementById('algorithm-description');
    
    const algorithmDescriptions = {
        'approximate': 'Visits the closest unvisited city at each step. Fast and works for any number of cities. Great for quick planning, though may not always find the absolute shortest route.',
        'exact': 'Calculates the absolute shortest route by comparing all possible paths. Guarantees the minimum total distance. Best for up to 20 cities. Takes longer to calculate but gives the optimal result.'
    };
    
    if (algorithmSelect && algorithmDescription) {
        algorithmSelect.addEventListener('change', function() {
            algorithmDescription.textContent = algorithmDescriptions[this.value] || '';
        });
        
        // Set initial description
        algorithmDescription.textContent = algorithmDescriptions[algorithmSelect.value] || '';
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset UI
        error.classList.remove('show');
        results.classList.remove('show');
        loading.classList.add('show');
        submitBtn.disabled = true;
        
        // Get form data
        const formData = new FormData(form);
        const algorithm = formData.get('algorithm') || 'approximate';
        const data = {
            starting_location: formData.get('starting_location'),
            city_list: formData.get('city_list'),
            return_to_start: formData.get('return_to_start') === 'on',
            algorithm: algorithm
        };
        
        try {
            const csrftoken = getCookie('csrftoken');
            const optimizeUrl = form.getAttribute('data-optimize-url') || '/optimize/';
            
            const response = await fetch(optimizeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            loading.classList.remove('show');
            submitBtn.disabled = false;
            
            if (!response.ok || result.error) {
                error.textContent = result.error || 'An error occurred';
                error.classList.add('show');
                return;
            }
            
            // Display route list
            routeList.innerHTML = '';
            result.route.forEach((location, index) => {
                const li = document.createElement('li');
                li.textContent = `${index + 1}. ${location}`;
                routeList.appendChild(li);
            });
            
            // Display total distance and algorithm used
            const algorithmText = result.algorithm_used === 'exact' ? 'Minimize Overall Cost' : 'Sort by Nearest City';
            totalDistance.innerHTML = `
                <div class="distance-value">Total Distance: ${result.total_distance} km</div>
                <div class="algorithm-info">Method: ${algorithmText}</div>
            `;
            
            // Display route as graph
            displayRouteGraph(result);
            
            // Show results
            results.classList.add('show');
            
            // Scroll to results
            results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
        } catch (err) {
            loading.classList.remove('show');
            submitBtn.disabled = false;
            // Provide more helpful error messages
            let errorMsg = 'An error occurred: ' + err.message;
            if (err.message.includes('L is not defined') || err.message.includes('d3 is not defined')) {
                errorMsg = 'Library loading error. Please refresh the page to reload required libraries.';
            } else if (err.message.includes('Network')) {
                errorMsg = 'Network error: ' + err.message;
            }
            error.textContent = errorMsg;
            error.classList.add('show');
            console.error('Error details:', err);
        }
    });
});

