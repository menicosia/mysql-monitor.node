mysql-monitor.node

A node app to monitor the availabiliy of an HA mysql service.

I sometimes use this app in Demos
Design:
- a Node server which maintains a (pool of) MySQL connection(s)
- a JavaScript app which connects back to the Node server and represents the status of the connections

Requirements:
- This app is designed to run on Cloud Foundry, typically PWS.
- It will require database credentials. Currently supporte service bindings are p-mysql (Pivotal) or ClearDB.
