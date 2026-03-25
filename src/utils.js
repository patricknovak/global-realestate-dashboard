// ===== HTML Escaping Utility (XSS Prevention) =====
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===== Lazy Script Loader =====
var _loadedScripts = {};
function loadScript(url) {
    if (_loadedScripts[url]) return _loadedScripts[url];
    _loadedScripts[url] = new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return _loadedScripts[url];
}

function loadLeaflet() {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js')
        .then(function() { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'); });
}
function loadChartJs() {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js');
}
function loadJsPdf() {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.3.1/jspdf.umd.min.js')
        .then(function() { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js'); });
}

