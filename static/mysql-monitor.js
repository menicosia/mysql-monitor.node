// Mysql Monitor client

window.onload = init ;
var dataWidth = 600 ;
var maxDataHeight = 40 ;
var stdDataHeight = 40 ;
var timeSeries = null ;

function init () {
    getInstanceBits() ;
    setInterval(getInstanceBits, 2000) ;

    window.onresize = resizeToWindow ;
}

function resizeToWindow () {
    dataWidth = window.innerWidth > 20 ? window.innerWidth - 20 : -1; // Allow 5px border
    maxDataHeight = window.innerHeight - 2 ;
    draw(dataWidth, maxDataHeight, timeSeries) ;
}

function bitmaskArray() {
    var bitmasks = [] ;
    for (var i = 0; i < 8; i++) {
        var bitmask = Math.pow(2, i) ;
        bitmasks.push(bitmask) ;
    }
}

function getInstanceBits() {
    var url = document.baseURI + "api/0bits" ;
    var request = new XMLHttpRequest() ;
    request.onload = function () {
        if (200 == request.status) {
            showInstanceBits(request.response) ;
        } else {
            console.log("Failed to get data from server.") ;
        }
    }
    request.open("GET", url) ;
    request.send(null) ;
}

function showInstanceBits(response) {
    timeSeries = JSON.parse(response) ;
    draw(dataWidth, maxDataHeight, timeSeries) ;
}

function draw(maxWidth, maxHeight, data) {
    if (! data) {
        console.warn("Data not defined yet. Not rendering.") ;
        return(false) ;
    }
    if ( -1 == maxWidth) {
        console.warn("Window too small to render") ;
        return(false) ;
    }
    // Same args as fillRect, but fill with a data array
    var dataPoints = data.length ;
    var effectiveWidth = dataPoints ;
    var effectiveHeight = stdDataHeight ;
    var timeline = document.getElementById('timeline');

    if (maxHeight < stdDataHeight) { effectiveHeight = maxHeight }
    if (maxWidth < dataPoints) { effectiveWidth = maxWidth }

    timeline.innerHTML = "<p><canvas id='connTimeline' width=" + effectiveWidth
                         + " height=" + effectiveHeight + "></p>" ;

    var canvas = document.getElementById('connTimeline');
    var context = canvas.getContext("2d") ;
    context.fillStyle="lightblue" ;
    context.fillRect(0, 0, effectiveWidth, effectiveHeight) ;
    // FIXME - probably rendering the wrong part of the data; focus on most recent
    for (var i in data) {
        rectOffset = i ;
        var dataPoint = data[i] ;
        if (dataPoint == "0") {
            context.fillStyle="red" ;
        } else if (dataPoint == "1") {
            context.fillStyle="green" ;
        } else {
            console.warn("Value of dataPoint: " + dataPoint) ;
            context.fillStyle="black" ;
        }
        context.fillRect(i, 0, 1, effectiveHeight) ;
    }
}
