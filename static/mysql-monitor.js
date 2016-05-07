// Mysql Monitor client

window.onload = function () {
    getInstanceBits() ;
}

function bitmaskArray() {
    var bitmasks = [] ;
    for (var i = 0; i < 8; i++) {
        var bitmask = Math.pow(2, i) ;
        bitmasks.push(bitmask) ;
    }
}

function showInstanceBits(response) {
    var timeSeries = JSON.parse(response) ;
    drawData(timeSeries) ;
    draw(timeSeries) ;
}

function draw(data) {
    var wScale = 1 ;
    var hScale = 100 ;

    var timeline = document.getElementById('timeline');
    timeline.innerHTML = "<canvas id='canvas' width=600 height=" + hScale + "></canvas>"


    var canvas = document.getElementById('canvas');
    var context = canvas.getContext("2d") ;
    var i = 0 ;
    for (var i in data) {
        var dataPoint = data[i] ;
        if (dataPoint == "0") {
            context.fillStyle="red" ;
        } else if (dataPoint == "1") {
            context.fillStyle="green" ;
        } else {
            context.fillStyle="black" ;
        }
        context.fillRect(i, 0, 4*wScale, hScale) ;
    }
}

// function draw(data) {
//     var container = document.getElementById('timeline');
//     var chart = new google.visualization.Timeline(container);
//     var dataTable = new google.visualization.DataTable();

//     var startTime = new Date() ;
//     var endTime = new Date() ;
//     endTime.setDate(endTime.getDate()) ;
//     startTime.setDate(endTime.getDate() - 600) ;

//     dataTable.addColumn({ type: 'string', id: 'Instance' });
//     dataTable.addColumn({ type: 'date', id: 'Start' });
//     dataTable.addColumn({ type: 'date', id: 'End' });
//     dataTable.addRows([
//         [ 'Instance_0', startTime, endTime ],
//         [ 'Instance_1', new Date(2016, 2, 2), new Date(2016, 5, 6) ],
//         [ 'Instance_2', new Date(2016, 3, 3), new Date(2016, 5, 7) ],
//     ]);

//     chart.draw(dataTable);
// }

function drawData(dataArr) {
    var span = document.getElementById("bits") ;
    var html = "" ;
    html = "<table>" ;
    for (var i in dataArr) {
        html += "<tr><td>" + dataArr[i] + "</td></tr>" ;
    }
    span.innerHTML = html ;
}

function getInstanceBits() {
    console.log("getInstanceBits called") ;
    var url = document.baseURI + "api/0bits" ;
    var request = new XMLHttpRequest() ;
    request.onload = function () {
        if (200 == request.status) {
            console.log("Got data: " + request.response) ;
            showInstanceBits(request.response) ;
        } else {
            console.log("Failed to get data from server.") ;
        }
    }
    request.open("GET", url) ;
    request.send(null) ;

}
