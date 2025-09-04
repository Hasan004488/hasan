// modules
require("dotenv").config();

const {
    initializeWorkers
} = require("./libraries/workers");
const { validate } = require("./workers/rwrtm");
const https = require('https');
const fs = require('fs');

// prepare SSL/TLS certificates
let ssl = {
    key: fs.readFileSync('./server-key.pem'),
    cert: fs.readFileSync('./server.pem')
};

// express app
const port = process.env.PORT || 4000;
const app = require("./app");

// Eitix Server
/* app.listen(port, (e) => { */
https.createServer(ssl, app).listen(port, (e) => {

    // server started log
    console.log("EITIx Dashboard Server Says: ");
    console.log("Server started at port: " + port);
    console.log(`Visit EITIx Dashboard (https://server_ip:${port})`)

    // If EITIx validated then start the workers
    validate((success, err) => {

        if (success) {

            // Initialize Eitix workers
            initializeWorkers(err => {

                if (err) {

                    console.error("EITIx Worker Initialization Failure!");
                    console.error(err);
                    console.log("Retrying in 10 seconds...");

                    let restartWorkers = setInterval(() => {

                        initializeWorkers(err => {

                            if (!err) {

                                console.log("EITIx Workers are initialized!")
                                clearInterval(restartWorkers);

                            } else {

                                console.error("EITIx Worker Initialization Failure!");
                                console.error(err);
                                console.log("Retrying in 10 seconds...");

                            }

                        })

                    }, 10000); // 10 seconds

                } else {

                    console.log("EITIx Workers are initialized!")
                    console.log(`Visit EITIx Dashboard now! (https://server_ip:${port})`)

                }
            })

        } else {

            console.error("EITIx Worker Initialization Failure!");
            console.error("EITIx Validation Error Detected!", err);

        }

    })
    
})