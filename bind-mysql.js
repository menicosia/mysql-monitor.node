module.exports.getMySQLCreds = function(service) {
    var mysql_creds = {} ;
    if (process.env.VCAP_SERVICES) {
        var vcap_services = JSON.parse(process.env.VCAP_SERVICES) ;
        if (vcap_services['p.mysql']) {
            service = "p.mysql" ;
        } else if (vcap_services['p-mysql']) {
            service = "p-mysql" ;
        }
    } else {
        console.log("No VCAP_SERVICES in environment; using localhost") ;
        service = "local" ;
        mysql_creds["host"] = "localhost" ;
        mysql_creds["user"] = "root" ;
        mysql_creds["password"] = "" ;
        mysql_creds["database"] = "service_instance_db" ;
        mysql_creds["ca_certificate"] = undefined ;
        return(mysql_creds) ;
    }

    mysql_creds["host"] = vcap_services[service][0]["credentials"]["hostname"] ;
    mysql_creds["user"] = vcap_services[service][0]["credentials"]["username"] ;
    mysql_creds["password"] = vcap_services[service][0]["credentials"]["password"] ;
    mysql_creds["port"] = vcap_services[service][0]["credentials"]["port"] ;
    mysql_creds["database"] = vcap_services[service][0]["credentials"]["name"] ;
    if (vcap_services[service][0]["credentials"]["tls"]) {
        mysql_creds["ca_certificate"] = vcap_services[service][0]["credentials"]["tls"]["cert"]["ca"];
    } else {
        mysql_creds["ca_certificate"] = undefined ;
    }
    mysql_creds["uri"] = vcap_services[service][0]["credentials"]["uri"] ;
    console.log("Got access credentials to" + service) ;
    // activateState="mysql" ;
    return(mysql_creds) ;
}
