var finalhandler = require('finalhandler') ;
var http = require('http') ;
var serveStatic = require('serve-static') ;
var strftime = require('strftime') ;
var time = require('time') ;
var url = require('url') ;
var mysql = require('mysql') ;
var redis = require('redis') ;

// CONFIGURE THESE
var numSecondsStore = 600 // Default 10 minutes

// Variables
var data = "" ;
var activateState = Boolean(false) ;
var pm_uri = "" ;
var vcap_services = undefined ;
var pm_credentials = undefined ;
var dbClient = undefined ;
var dbConnectState = Boolean(false) ;

// REDIS DOCUMENTATION

// Each instance is responsible for recording its own activity in
// Redis. Because this is cloud foundry, there's only ever expected to
// be one of each index running ie there should be no conflicts of
// multiple instances updating the same data.  There are two pieces of
// data per instance: lastKeyUpdated/lastTime and a 600-bit bitmap
// which represents 10 min of data.
// instance:0 lastKeyUpdated 0-599 lastUpdate SECS
// instance:0 [bitmap]
var redis_credentials = undefined ;
var redisClient = undefined ;
var redisConnectionState = Boolean(false) ;

var lastUpdate ;
var lastKey ;

// Setup based on Environment Variables
if (process.env.VCAP_SERVICES) {
    vcap_services = JSON.parse(process.env.VCAP_SERVICES) ;
    if (vcap_services['p-mysql']) {
        pm_uri = vcap_services["p-mysql"][0]["credentials"]["uri"] ;
        console.log("Got access p-mysql credentials: " + pm_uri) ;
        activateState=true ;
    } else if (vcap_services['cleardb']) {
        pm_uri = vcap_services["cleardb"][0]["credentials"]["uri"];
        console.log("Got access to cleardb credentials: " + pm_uri) ;
        activateState=true;
    }
    if (vcap_services['redis']) {
        redis_credentials = vcap_services["redis"][0]["credentials"] ;
        console.log("Got access credentials to redis: " + JSON.stringify(redis_credentials)) ;
    }
}

if (process.env.VCAP_APP_PORT) { var port = process.env.VCAP_APP_PORT ;}
else { var port = 8080 ; }
if (process.env.CF_INSTANCE_INDEX) { var myIndex = JSON.parse(process.env.CF_INSTANCE_INDEX) ; }
else { myIndex = 0 ; }
var myInstance = "Instance_" + myIndex + "_Hash" ;
var myInstanceBits = "Instance_" + myIndex + "_Bits" ;

// Callback functions
function handleDBConnect(err) {
    if (err) {
        dbConnectState = false ;
        console.error("Error connecting to DB: " + err.code + "\nWill try again in 1s.") ;
        setTimeout(MySQLConnect, 1000) ;
    } else {
        console.log("Connected to database. Commencing ping every 1s.") ;
        dbConnectState = true ;
        setInterval(doPing, 1000) ;
    }
}

function handleDBping(err) {
    if (err) {
        console.error('MySQL Connection error: ' + err) ;
        recordDBStatus(0) ;
        dbClient.destroy() ;
        MySQLConnect() ;
    } else {
        // console.log("[" + myIndex + "] Server responded to ping.") ;
        recordDBStatus(1) ;
    }
}

function handleLastKey(err, res) {
    if (err) {
        console.log("Error from redis: " + err) ;
    } else {
        console.log("Setting lastKey to: " + res) ;
        lastKey = res ;
    }
}
function handleLastTime(err, res) {
    if (err) {
        console.log("Error from redis: " + err) ;
    } else {
        console.log("Setting lastKey to: " + res) ;
        lastTime = res ;
    }
}
function handleRedisConnect(message, err) {
    console.log("handleRedisConnect called with message: " + message) ;
    switch (message) {
    case "error":
        redisConnectionState = false ;
        console.log("Redis connection failed: " + err + "\nWill try again in 3s." ) ;
        setTimeout(RedisConnect, 3000) ;
        break ;
    case "ready":
        redisConnectionState = true ;
        redisClient.hget(myInstance, "lastKeyUpdated", handleLastKey) ;
        redisClient.hget(myInstance, "lastUpdate", handleLastTime) ;
        console.log("Redis READY.") ;
        break ;
    }
}


// Helper functions
function recordDBStatusHelper(err, res, bool) {
    if (err) {
        console.log("Error from redis: " + err) ;
    } else {
        // write a 1 to the current second in redis
        lastTime = res ;
        now = time.time() ;
        if (now < lastTime) {
            console.error("Last updated time is in the future?! Waiting to catch up...")
        } else {
            nextKey = (lastKey + (now-lastTime)) % numSecondsStore // round-robin when reaching N seconds
            redisClient.setbit(myInstanceBits, nextKey, bool)
            redisClient.hmset(myInstance, "lastKeyUpdated", nextKey, "lastUpdate", now) ;
            lastKey = nextKey ;
            console.log("Updated DB status: " + bool + " lastKeyUpdated: " + nextKey + " lastUpdate: " + now) ;
        }
    }
}

function recordDBStatus(bool) {
    if (redisConnectionState) {
        redisClient.hget(myInstance, "lastUpdate", function(err, res) { recordDBStatusHelper(err, res, bool) ; }) ;
    }
}

function doPing() {
    dbClient.ping(handleDBping) ;
}

function MySQLConnect() {
    if (activateState) {
        dbClient = mysql.createConnection(pm_uri)
        dbClient.connect(handleDBConnect) ;
    } else {
        dbClient = undefined ;
    }
}

function RedisConnect() {
    if (activateState && redis_credentials) {
        redisClient = redis.createClient(redis_credentials["port"], redis_credentials["host"]) ;
        redisClient.auth(redis_credentials["password"]) ;
        redisClient.on("error", function(err) { handleRedisConnect("error", err) }) ;
        redisClient.on("ready", function(err) { handleRedisConnect("ready", undefined) }) ;
    } else {
        redisClient = undefined ;
        redisConnectionState = false ;
    }
}

function apiRequests(request, response) {
    data = "" ;
    var matchRequest = Boolean(false) ;
    rootCall = request.url.match(/([^&]+)/)[0] ;
    console.log("Recieved request for: " + rootCall) ;
    switch (rootCall) {
    case "/env":
        matchRequest = true ;
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
        matchRequest = true ;
        data += JSON.stringify({"dbStatus":dbConnectState}) ;
        break ;
    case "/ping":
        matchRequest = true ;
        if (dbConnectState) {
            doPing() ;
            data += "OK, will ping the DB. Watch the log for a response." ;
        } else {
            data += "I'm sorry, Dave, I can't do that. No connection to the database." ;
        }
        break ;
    case "/":
        matchRequest = true ;
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
        break ;
	  }

    if (matchRequest) {
	      response.end(data + '\n') ;
        return(true) ;
    } else {
        return(false) ;
    }

}

// MAIN
var staticServer = serveStatic("static") ;
monitorServer = http.createServer(function(req, res) {
    if (! apiRequests(req, res)) {
        var done = finalhandler(req, res) ;
        staticServer(req, res, done)
    }
}) ;

monitorServer.listen(port) ;
if (activateState) {
    MySQLConnect() ;
    RedisConnect() ;
}

console.log("Server up and listening on port: " + port) ;

