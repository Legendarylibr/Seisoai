// MongoDB Replica Set Initialization Script
// This runs on the primary node to initialize the replica set

// Wait for MongoDB to be ready
sleep(5000);

// Check if replica set is already initialized
var status = rs.status();
if (status.ok === 1) {
    print("Replica set already initialized");
} else {
    print("Initializing replica set...");
    
    // Initialize the replica set
    var config = {
        _id: "rs0",
        members: [
            { _id: 0, host: "mongodb-primary:27017", priority: 2 },
            { _id: 1, host: "mongodb-secondary-1:27017", priority: 1 },
            { _id: 2, host: "mongodb-secondary-2:27017", priority: 1 }
        ],
        settings: {
            // Election timeout
            electionTimeoutMillis: 10000,
            // Heartbeat interval
            heartbeatIntervalMillis: 2000,
            // Catch-up timeout
            catchUpTimeoutMillis: 30000
        }
    };
    
    var result = rs.initiate(config);
    print("Replica set initialization result:");
    printjson(result);
    
    // Wait for replica set to be ready
    sleep(10000);
    
    // Check status
    print("Replica set status:");
    printjson(rs.status());
}

