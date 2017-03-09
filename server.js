// Mysql Monitor - an app to monitor availability of a MySQL database

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
var pm_uri = undefined ;
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
    } else if (vcap_services['dedicated-pivotal-mysql']) {
        pm_uri = vcap_services["dedicated-pivotal-mysql"][0]["credentials"]["uri"] ;
        util.log("Got access dedicated-pivotal-mysql credentials: " + pm_uri) ;
        activateState=true ;
    } else if (vcap_services['cleardb']) {
        pm_uri = vcap_services["cleardb"][0]["credentials"]["uri"];
        util.log("Got access to cleardb credentials: " + pm_uri) ;
        activateState=true;
    } else {
        util.log("No VCAP_SERVICES mysql bindings. Will attempt to connect via 'MYSQL_URI'")
    }
    if (vcap_services['redis']) {
        redis_credentials = vcap_services["redis"][0]["credentials"] ;
        util.log("Got access credentials to redis: " + redis_credentials["host"]
                 + ":" + redis_credentials["port"]) ;
    } else if (vcap_services['rediscloud']) {
        redis_credentials = vcap_services["rediscloud"][0]["credentials"] ;
        util.log("Got access credentials to redis: " + redis_credentials["hostname"]
                 + ":" + redis_credentials["port"]) ;
    } else if (vcap_services['p-redis']) {
        redis_credentials = vcap_services["p-redis"][0]["credentials"] ;
        util.log("Got access credentials to p-redis: " + redis_credentials["host"]
                 + ":" + redis_credentials["port"]) ;
    } else {
        util.log("No VCAP_SERVICES redis bindings. Will attempt to connect via 'REDIS_CREDS'")
    }
}

if (process.env.VCAP_APP_PORT) { var port = process.env.VCAP_APP_PORT ;}
else { var port = 8080 ; }
if (process.env.CF_INSTANCE_INDEX) { var myIndex = JSON.parse(process.env.CF_INSTANCE_INDEX) ; }
else {
    util.log("CF not detected, attempting to run in local mode.") ;
    localMode = true ;
    if (process.env.MYSQL_URI) {
        pm_uri = process.env.MYSQL_URI ;
    } else {
        pm_uri = "mysql://root@localhost:3306/default?reconnect=true" ;
    }
    activateState = true ;
    if (process.env.REDIS_CREDS) {
        creds = process.env.REDIS_CREDS.split(":") ;
        if (3 != creds.length) {
            console.error("[ERROR] REDIS_CREDS environment variable must be colon separated host:port:password") ;
            process.exit(1) ;
        } else {
            redis_credentials = { 'password' : creds[2], 'host' : creds[0], 'port' : creds[1] } ;
        }
    } else {
        redis_credentials = { 'password' : '', 'host' : '127.0.0.1', 'port' : '6379' } ;
    }
    console.log("MySQL URI: " + pm_uri) ;
    myIndex = 0 ;
}

// Here lie the names of the Redis data structures that we'll read/write from
var myInstance = "Instance_" + myIndex + "_Hash" ;
var myInstanceBits = "Instance_" + myIndex + "_Bits" ;
var myInstanceList = "Instance_" + myIndex + "_List" ;

// Callback functions
function handleDBConnect(err) {
    if (err) {
        if (activateState == true) { setTimeout(MySQLConnect, 1000) ; }
        dbConnectState = false ;
        console.error("Error connecting to DB: " + err.code + "\nWill try again in 1s.") ;
        recordDBStatus(Boolean(false)) ;
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
        // util.log("[" + myIndex + "] Server responded to ping.") ;
        recordDBStatus(1) ;
    }
}

function handleLastTime(err, res) {
    if (err) {
        console.error("Error from redis: " + err) ;
    } else {
        console.log("Setting lastUpdate to: " + res) ;
        lastTime = res ;
    }
}
function handleRedisConnect(message, err) {
    switch (message) {
    case "error":
        redisConnectionState = false ;
        console.warn("Redis connection failed: " + err + "\nWill try again in 3s." ) ;
        setTimeout(RedisConnect, 3000) ;
        break ;
    case "ready":
        redisConnectionState = true ;
        redisClient.hget(myInstance, "lastUpdate", handleLastTime) ;
        console.log("Redis READY.") ;
        break ;
    default:
        console.warn("Redis connection result neither error nor ready?!") ;
        break ;
    }
}


// Helper functions
function recordDBStatusHelper(err, res, bool) {
    if (err) {
        console.error("Error from redis: " + err) ;
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
                console.log("DB down: " + bool + " lastUpdate: " + now) ;
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
        console.log("Attempting to connect to redis...") ;
        if (redis_credentials["host"]) {
          redisClient = redis.createClient(redis_credentials["port"], redis_credentials["host"]) ;
        } else {
          redisClient = redis.createClient(redis_credentials["port"], redis_credentials["hostname"]) ;
        }
        if (! localMode) { redisClient.auth(redis_credentials["password"]) ; }
        redisClient.on("error", function(err) { handleRedisConnect("error", err) }) ;
        redisClient.on("ready", function(err) { handleRedisConnect("ready", undefined) }) ;
    } else {
        redisClient = undefined ;
        redisConnectionState = false ;
    }
}

function handleBits(request, response, reply) {
    console.log("Returning array from Redis of length: " + reply.length) ;
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
                    console.error('[ERROR] querying redis: ' + err) ;
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
    requestParts = url.parse(request.url, true);
    rootCall = requestParts['pathname'].split('/')[1] ;
    console.log("Recieved request for: " + rootCall) ;
    switch (rootCall) {
    case "env":
	      if (process.env) {
	          data += "<p>" ;
		        for (v in process.env) {
		            data += v + "=" + process.env[v] + "<br>\n" ;
		        }
		        data += "<br>\n" ;
	      } else {
		        data += "<p> No process env? <br>\n" ;
	      }
        response.write(data) ;
	      break ;
    case "dbstatus":
        data += JSON.stringify({"dbStatus":dbConnectState}) ;
        response.write(data) ;
        break ;
    case "ping":
        if (dbConnectState) {
            doPing() ;
            data += "OK, will ping the DB. Watch the log for a response." ;
        } else {
            data += "I'm sorry, Dave, I can't do that. No connection to the database." ;
        }
        response.write(data) ;
        break ;
    case "api":
        var method = requestParts['pathname'].split('/')[2] ;
        dispatchApi(request, response, method, requestParts['query']) ;
        return true ; // short-circuit response.end below.
        break ;
    case "debug":
        // This is the old code that was the original index page.
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
        response.write(data) ;
        break ;
    default:
        console.log("Unknown request: " + request.url) ;
        response.statusCode = 404 ;
        response.statusMessage = http.STATUS_CODES[404] ;
        response.writeHead(404) ;
        response.write("<H1>404 - Not Found</H1>") ;
    }

    response.end() ;
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

console.log("Server up and listening on port: " + port) ;
