// Minimal graph state (no inline graph rendering in optimize page)
let graphSvg = null;
let zoomBehavior = null;

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
    graphLayer = null;
    zoomBehavior = null;
}

// Inline route graph rendering removed from optimize page.
// The detailed graph renderer was moved to the separate `/view-graph/` page.

// No-op re-render helper (inline renderer removed)
function rerenderLastRoute() {
    // intentionally empty; re-rendering happens on the `/view-graph/` page
}

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    // Ensure no leftover SVG or HTML remains from previous sessions or cached scripts
    try {
        const rg = document.getElementById('routeGraph');
        if (rg) {
            rg.innerHTML = '';
            if (typeof d3 !== 'undefined') d3.select('#routeGraph').selectAll('svg').remove();
        }
        const watchBtnInit = document.getElementById('watchGraphBtn');
        if (watchBtnInit) watchBtnInit.style.display = 'none';
    } catch (e) {
        // ignore
    }
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
            
            // Inline graph rendering removed: enable 'Watch Graph' button instead.

            // Enable Watch Graph button (posts the route to /view-graph/)
            const watchBtn = document.getElementById('watchGraphBtn');
            if (watchBtn) {
                // ensure visible and use a consistent display mode
                watchBtn.style.display = 'inline-block';
                // remove previous listeners by cloning
                const newBtn = watchBtn.cloneNode(true);
                watchBtn.parentNode.replaceChild(newBtn, watchBtn);
                newBtn.addEventListener('click', () => {
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = '/view-graph/';
                    form.target = '_blank';
                    // CSRF
                    const csrf = getCookie('csrftoken');
                    if (csrf) {
                        const inpCsrf = document.createElement('input'); inpCsrf.type = 'hidden'; inpCsrf.name = 'csrfmiddlewaretoken'; inpCsrf.value = csrf; form.appendChild(inpCsrf);
                    }
                    const inp = document.createElement('input');
                    inp.type = 'hidden';
                    inp.name = 'route_data';
                    inp.value = JSON.stringify(result);
                    form.appendChild(inp);
                    document.body.appendChild(form);
                    form.submit();
                    form.remove();
                });
            }
            
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

    // Zoom control buttons
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const resetZoomBtn = document.getElementById('resetZoom');
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try {
                console.debug('Zoom In clicked', { graphSvg, zoomBehavior });
                if (graphSvg && zoomBehavior) {
                    // Try standard D3 zoom scaleBy first
                    try {
                        graphSvg.transition().duration(300).call(zoomBehavior.scaleBy, 1.2);
                        return;
                    } catch (e) {
                        console.warn('zoomBehavior.scaleBy failed, falling back to manual transform', e);
                    }

                    // Manual fallback: compute new transform around center
                    const svgNode = graphSvg.node();
                    const rect = svgNode.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const t = d3.zoomTransform(svgNode);
                    const scaleFactor = 1.2;
                    const minK = 0.2;
                    const maxK = 6;
                    let newK = Math.max(minK, Math.min(maxK, t.k * scaleFactor));
                    // compute new x/y so that center remains visually centered
                    const newX = t.x - (centerX) * (newK / t.k - 1);
                    const newY = t.y - (centerY) * (newK / t.k - 1);
                    const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newK);
                    graphSvg.transition().duration(300).call(zoomBehavior.transform, newTransform);
                }
            } catch (err) {
                console.warn('Zoom in failed', err);
            }
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try {
                console.debug('Zoom Out clicked', { graphSvg, zoomBehavior });
                if (graphSvg && zoomBehavior) {
                    try {
                        graphSvg.transition().duration(300).call(zoomBehavior.scaleBy, 1 / 1.2);
                        return;
                    } catch (e) {
                        console.warn('zoomBehavior.scaleBy failed (out), falling back to manual transform', e);
                    }

                    const svgNode = graphSvg.node();
                    const rect = svgNode.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const t = d3.zoomTransform(svgNode);
                    const scaleFactor = 1 / 1.2;
                    const minK = 0.2;
                    const maxK = 6;
                    let newK = Math.max(minK, Math.min(maxK, t.k * scaleFactor));
                    const newX = t.x - (centerX) * (newK / t.k - 1);
                    const newY = t.y - (centerY) * (newK / t.k - 1);
                    const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newK);
                    graphSvg.transition().duration(300).call(zoomBehavior.transform, newTransform);
                }
            } catch (err) {
                console.warn('Zoom out failed', err);
            }
        });
    }
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try {
                if (graphSvg && zoomBehavior) {
                    graphSvg.transition().duration(350).call(zoomBehavior.transform, d3.zoomIdentity);
                }
            } catch (err) {
                console.warn('Reset zoom failed', err);
            }
        });
    }

    // Fullscreen button handling
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const graphContainer = document.querySelector('.graph-container');
    if (fullscreenBtn && graphContainer) {
        // Cross-browser helpers for entering/exiting fullscreen
        const enterFullscreen = (el) => {
            if (el.requestFullscreen) return el.requestFullscreen();
            if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
            if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
            if (el.msRequestFullscreen) return el.msRequestFullscreen();
            // Not supported: apply CSS fallback
            el.classList.add('fullscreen');
            rerenderLastRoute();
            return Promise.resolve();
        };

        const exitFullscreen = () => {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
            // Not supported: remove CSS fallback
            graphContainer.classList.remove('fullscreen');
            rerenderLastRoute();
            return Promise.resolve();
        };

        // Helper to detect if element is fullscreen across vendors
        const isElementFullscreen = (el) => {
            return document.fullscreenElement === el || document.webkitFullscreenElement === el || document.mozFullScreenElement === el || document.msFullscreenElement === el;
        };

        fullscreenBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            // Diagnostics: log available fullscreen methods
            console.debug('Fullscreen support:', {
                requestFullscreen: !!graphContainer.requestFullscreen,
                webkitRequestFullscreen: !!graphContainer.webkitRequestFullscreen,
                mozRequestFullScreen: !!graphContainer.mozRequestFullScreen,
                msRequestFullscreen: !!graphContainer.msRequestFullscreen,
                exitFullscreen: !!document.exitFullscreen,
                webkitExitFullscreen: !!document.webkitExitFullscreen,
                mozCancelFullScreen: !!document.mozCancelFullScreen,
                msExitFullscreen: !!document.msExitFullscreen
            });

            // Try the normal fullscreen flow; if it fails, open a popout window as fallback
            try {
                if (!isElementFullscreen(graphContainer)) {
                    await enterFullscreen(graphContainer);
                    return;
                } else {
                    await exitFullscreen();
                    return;
                }
            } catch (err) {
                console.warn('requestFullscreen failed, falling back to popout. Error:', err);
            }

            // Popout fallback: clone the current SVG into a new window
            try {
                const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
                if (!popup) {
                    alert('Unable to open fullscreen or popout window (popup blocked). Please allow popups or try a different browser.');
                    return;
                }

                const svgContainer = document.getElementById('routeGraph');
                const inner = svgContainer ? svgContainer.innerHTML : '';
                const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Route Graph</title>
                    <style>body{margin:0;background:#000;color:#fff} #routeGraph{width:100%;height:100vh;display:block} svg{width:100%;height:100vh;display:block}</style>
                    </head><body><div id="routeGraph">${inner}</div>
                    <div style="position:fixed;top:8px;right:8px;z-index:9999"><button onclick="window.close()" style="padding:8px 12px;border-radius:8px;">Close</button></div>
                    </body></html>`;

                popup.document.open();
                popup.document.write(html);
                popup.document.close();
            } catch (err) {
                console.error('Popout fallback failed:', err);
                // Final fallback: toggle CSS class
                graphContainer.classList.toggle('fullscreen');
                rerenderLastRoute();
            }
        });

        // Keep CSS class in sync with fullscreen changes (standard + vendor prefixed events)
        const fsChangeHandler = () => {
            if (isElementFullscreen(graphContainer)) {
                graphContainer.classList.add('fullscreen');
            } else {
                graphContainer.classList.remove('fullscreen');
            }
            rerenderLastRoute();
        };

        document.addEventListener('fullscreenchange', fsChangeHandler);
        document.addEventListener('webkitfullscreenchange', fsChangeHandler);
        document.addEventListener('mozfullscreenchange', fsChangeHandler);
        document.addEventListener('MSFullscreenChange', fsChangeHandler);
    }
});

