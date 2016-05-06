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

function byteToBool(byte, offset) {
    var bitmasks = bitmaskArray() ;
    var bitmask = bitmasks[offset] ;
    if ((byte & bitmasks[offset]) == bitmasks[offset]) { return true }
    else { return (false) }
}

for (x = 0 ; x < width(bitfield) % 64 ; x++) {
  for (i = x*64 ; i < (x*64)-1 && i < width(bitfield) ; i++ ) {
      if byteToBool(bitfield, i) { green} else { red }
  }
}
}

function showInstanceBits(response) {
    var span = document.getElementById("bits") ;
    if ( 0 == response[0] ) {
      span.innerHTML = "0" ;
    } else if ( 1 == response[0]) {
        span.innerHTML = "1" ;
    } else {
        span.innerHTML = "Not having a BIT of this." ;
    }
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
