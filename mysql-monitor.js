var http = require('http') ;
var strftime = require('strftime') ;
// var sleep = require('sleep') ;
var url = require('url') ;
var mysql = require('mysql') ;

// Variables
var activateState = Boolean(false) ;
var dbConnectState = Boolean(false) ;
var pm_uri = "" ;
var data = "" ;
var pm_credentials = ""
var dbConnection = undefined ;

// Setup based on Environment Variables
if (process.env.VCAP_SERVICES) {
    var pm_credentials = JSON.parse(process.env.VCAP_SERVICES)["p-mysql"][0]["credentials"] ;
    pm_uri = pm_credentials["uri"] ;
    console.log("Got access credentials to database: " + pm_uri) ;
    activateState=true ;
}

if (process.env.VCAP_APP_PORT) { var port = process.env.VCAP_APP_PORT ;}
else { var port = 8080 ; }
if (process.env.CF_INSTANCE_INDEX) { var myIndex = JSON.parse(process.env.CF_INSTANCE_INDEX) ; }
else { myIndex = 0 ; }

// Callback functions
function handleDBConnect(err) {
    if (err) {
        dbConnectState = false ;
        console.error("Error connecting to DB: " + err.code + "\nWill try again in 3s") ;
        setTimeout(MySQLConnect, 3000) ;
    } else {
        console.log("Connected to database. Commencing ping every 3s.") ;
        dbConnectState = true ;
        setInterval(doPing, 3000) ;
    }
}

function handleDBping(err) {
    if (err) {
        console.error('MySQL Connection error: ' + err) ;
        dbConnection.destroy() ;
        MySQLConnect() ;
    } else {
        console.log("[" + myIndex + "] Server responded to ping.") ;
    }
}

// Helper functions
function doPing() {
    dbConnection.ping(handleDBping) ;
}

function MySQLConnect() {
    if (activateState) {
        dbConnection = mysql.createConnection(pm_uri)
        dbConnection.connect(handleDBConnect) ;
    } else {
        dbConnection = undefined ;
    }
}


// MAIN
monitorServer = http.createServer(function (request, response) {
    data = "" ;
    rootCall = request.url.match(/([^&]+)/)[0] ;
    console.log("Recieved request for: " + rootCall) ;
    switch (rootCall) {
    case "/env":
	      if (process.env) {
	          data += "<p>" ;
		        for (v in process.env) {
		            data += v + "=" + process.env[v] + "<br>\n" ;
		        }
		        data += "<br>\n" ;
	      } else {
		        data += "<p> No process env? <br>\n" ;
	      }
	      break ;
    case "/dbstatus":
        callBack = request.url.match(/callback=(\w+)/)[1] ;
        data += callBack + "(\"Call Received\")" ;
        break ;
    // case "/sleep":
    //     data += "Sleeping 5 seconds." ;
    //     sleep.sleep(5) ;
    //     break ;
    case "/ping":
        dbConnection.ping(pingCB) ;
        data += "OK, will ping the DB. Watch the log for a response." ;
        break ;
	  default:
        data += "<h1>MySQL Monitor</h1>\n" ;
	      data += "<p>" + strftime("%Y-%m-%d %H:%M") + "<br>\n" ;
	      data += "<p>Request was: " + request.url + "<br>\n" ;
        if (activateState) {
	          data += "Database connection info: " + pm_uri + "<br>\n" ;
        } else {
            data += "Database info is NOT SET</br>\n" ;
        }
        data += "</p\n<hr>\n" ;
        data += "<A HREF=\"" + url.resolve(request.url, "env") + "\">/env</A>  " ;
        data += "<A HREF=\"" + url.resolve(request.url, "ping") + "\">/ping</A>  " ;
        // data += "<A HREF=\"" + url.resolve(request.url, "sleep") + "\">/sleep</A><br>\n" ;
	  }

	  response.end(data + '\n') ;
}) ;

monitorServer.listen(port) ;
if (activateState) {
    MySQLConnect() ;
}

console.log("Server up and listening on port: " + port) ;

