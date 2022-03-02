
window.addEventListener('DOMContentLoaded', function() {
    var warning = document.getElementById('outdated-browser');
    var outdatedBrowser = false;
    if (document.documentMode) {
        // Internet Explorer
        outdatedBrowser = true;
    }

    if (outdatedBrowser) {
        warning.style.display = 'block';
    } else {
        warning.remove();
    }

    var enableJavascript = document.getElementById('enable-javascript');
    enableJavascript.remove();
});
