// Mysql Monitor client

window.onload = function () {
    getInstanceBits() ;
    setInterval(getInstanceBits, 2000) ;
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
    var timeSeries = JSON.parse(response) ;
    draw(timeSeries) ;
}

function draw(data) {
    var dataPoints = data.length ;
    var wScale = 1 ; // How fat each pulse shall be
    var hScale = 40 ; // How long each pulse shall be

    var timeline = document.getElementById('timeline');

    timeline.innerHTML = "<p><canvas id='connTimeline' width=" + dataPoints*wScale + " height=" + hScale + "></p>" ;

    var canvas = document.getElementById('connTimeline');
    var context = canvas.getContext("2d") ;
    context.fillStyle="lightblue" ;
    context.fillRect(0, 20, 10, 30) ;
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
        context.fillRect(i, 0, 1, 40) ;
    }
}

