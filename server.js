var finalhandler = require('finalhandler') ;
var http = require('http') ;
var serveStatic = require('serve-static') ;
var strftime = require('strftime') ;
var time = require('time') ;
var url = require('url') ;
var mysql = require('mysql') ;
var redis = require('redis') ;
var util = require('util') ;

// CONFIGURE THESE
var numSecondsStore = 600 // Default 10 minutes

// Variables
var data = "" ;
var activateState = Boolean(false) ;
var localMode = Boolean(false) ;
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
// data per instance: lastTime and a 600-bit list (used to be Bit array)
// which represents 10 min of data.
// Instance_0_Hash lastKeyUpdated 0-599 lastUpdate SECS
// Instance_0_List ...

var redis_credentials = undefined ;
var redis_host = undefined ;
var redisClient = undefined ;
var redisConnectionState = Boolean(false) ;

var lastUpdate ;

// Setup based on Environment Variables
if (process.env.VCAP_SERVICES) {
    vcap_services = JSON.parse(process.env.VCAP_SERVICES) ;
    if (vcap_services['p-mysql']) {
        pm_uri = vcap_services["p-mysql"][0]["credentials"]["uri"] ;
        util.log("Got access p-mysql credentials: " + pm_uri) ;
        activateState=true ;
    } else if (vcap_services['cleardb']) {
        pm_uri = vcap_services["cleardb"][0]["credentials"]["uri"];
        util.log("Got access to cleardb credentials: " + pm_uri) ;
        activateState=true;
    }
    if (vcap_services['redis']) {
        redis_credentials = vcap_services["redis"][0]["credentials"] ;
        util.log("Got access credentials to redis: " + redis_credentials["host"]
                 + ":" + redis_credentials["port"]) ;
    } else if (vcap_services['p-redis']) {
        redis_credentials = vcap_services["p-redis"][0]["credentials"] ;
        util.log("Got access credentials to p-redis: " + redis_credentials["host"]
                 + ":" + redis_credentials["port"]) ;
    }
}

if (process.env.VCAP_APP_PORT) { var port = process.env.VCAP_APP_PORT ;}
else { var port = 8080 ; }
if (process.env.CF_INSTANCE_INDEX) { var myIndex = JSON.parse(process.env.CF_INSTANCE_INDEX) ; }
else {
    util.log("CF not detected, attempting to run in local mode.") ;
    localMode = true ;
    pm_uri = "mysql://root@localhost:3306/default?reconnect=true" ;
    activateState = true ;
    redis_credentials = { 'password' : '', 'host' : '127.0.0.1', 'port' : '6379' } ;
    myIndex = 0 ;
}

// Here lie the names of the Redis data structures that we'll read/write from
var myInstance = "Instance_" + myIndex + "_Hash" ;
var myInstanceBits = "Instance_" + myIndex + "_Bits" ;
var myInstanceList = "Instance_" + myIndex + "_List" ;

// Callback functions
function handleDBConnect(err) {
    if (err) {
        if (dbConnectState == true) { setTimeout(MySQLConnect, 1000) ; }
        dbConnectState = false ;
        console.error("Error connecting to DB: " + err.code + "\nWill try again in 1s.") ;
        recordDBStatus(Boolean(false)) ;
    } else {
        util.log("Connected to database. Commencing ping every 1s.") ;
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
        // util.log("[" + myIndex + "] Server responded to ping.") ;
        recordDBStatus(1) ;
    }
}

function handleLastTime(err, res) {
    if (err) {
        util.log("Error from redis: " + err) ;
    } else {
        util.log("Setting lastUpdate to: " + res) ;
        lastTime = res ;
    }
}
function handleRedisConnect(message, err) {
    switch (message) {
    case "error":
        redisConnectionState = false ;
        util.log("Redis connection failed: " + err + "\nWill try again in 3s." ) ;
        setTimeout(RedisConnect, 3000) ;
        break ;
    case "ready":
        redisConnectionState = true ;
        redisClient.hget(myInstance, "lastUpdate", handleLastTime) ;
        util.log("Redis READY.") ;
        break ;
    }
}


// Helper functions
function recordDBStatusHelper(err, res, bool) {
    if (err) {
        util.log("Error from redis: " + err) ;
    } else {
        // write a 1 to the current second in redis
        lastTime = res ;
        now = time.time() ;
        if (now < lastTime) {
            console.error("Last updated time is in the future?! Waiting to catch up...")
        } else {
            if (bool) {
                redisClient.lpush(myInstanceList, 1) ;
            } else {
                redisClient.lpush(myInstanceList, 0) ;
                util.log("DB down: " + bool + " lastUpdate: " + now) ;
            }
            redisClient.ltrim(myInstanceList, 0, numSecondsStore-1) ;
            redisClient.hmset(myInstance, "lastUpdate", now) ;
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
        dbClient.on('error', handleDBConnect) ;
    } else {
        dbClient = undefined ;
    }
}

function RedisConnect() {
    if (activateState && redis_credentials) {
        util.log("Attempting to connect to redis...") ;
        redisClient = redis.createClient(redis_credentials["port"], redis_credentials["host"]) ;
        if (! localMode) { redisClient.auth(redis_credentials["password"]) ; }
        redisClient.on("error", function(err) { handleRedisConnect("error", err) }) ;
        redisClient.on("ready", function(err) { handleRedisConnect("ready", undefined) }) ;
    } else {
        redisClient = undefined ;
        redisConnectionState = false ;
    }
}

function handleBits(request, response, reply) {
    util.log("Returning array from Redis of length: " + reply.length) ;
    response.end(JSON.stringify(reply)) ;
    return(true) ;
}

function dispatchApi(request, response, method, query) {
    switch(method) {
    case "0bits":
        if (redisConnectionState) {
            redisClient.lrange('Instance_0_List', 0, -1, function (err, reply) {
                var req = request ;
                var res = response ;
                if (err) {
                    util.log('[ERROR] querying redis: ' + err) ;
                    process.exit(5) ;
                } else {
                    handleBits(req, res, reply) ;
                }
            } ) ;
            break ;
        } else {
            response.end(false) ;
        }
    }
}

function requestHandler(request, response) {
    data = "" ;
    var matchRequest = Boolean(false) ;
    requestParts = url.parse(request.url, true);
    rootCall = requestParts['pathname'].split('/')[1] ;
    util.log("Recieved request for: " + rootCall) ;
    switch (rootCall) {
    case "env":
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
    case "dbstatus":
        matchRequest = true ;
        data += JSON.stringify({"dbStatus":dbConnectState}) ;
        break ;
    case "ping":
        matchRequest = true ;
        if (dbConnectState) {
            doPing() ;
            data += "OK, will ping the DB. Watch the log for a response." ;
        } else {
            data += "I'm sorry, Dave, I can't do that. No connection to the database." ;
        }
        break ;
    case "api":
        var method = requestParts['pathname'].split('/')[2] ;
        dispatchApi(request, response, method, requestParts['query']) ;
        return true ;
        break ;
    default:
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
    var done = finalhandler(req, res) ;
    staticServer(req, res, function() { requestHandler(req, res, done) ; } ) ;
}) ;

monitorServer.listen(port) ;
if (activateState) {
    MySQLConnect() ;
    RedisConnect() ;
}

util.log("Server up and listening on port: " + port) ;

