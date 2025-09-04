require("dotenv").config();
const fs = require("fs");
const cron = require('node-cron');
const getMAC = require('getmac').default;
const { sysLog } = require("../libraries/logger");
const { DB, getDatabase } = require("../libraries/database");
const { exec } = require("child_process");
const { decrypt } = require("../libraries/encrypter");

const LICENSE_FILE = "license.eitix";

// Callback structure: (success, error)
function validate(callback) {

    getDatabase().then(database => {

        try {

            // Read file from the root directory
            let raw;
            if (fs.existsSync(LICENSE_FILE)) {
                raw = fs.readFileSync(LICENSE_FILE);
            } else {
                throw {
                    message: "License file does not exist.",
                    code: 404
                };
            }

            const data = decrypt(raw);

            const key_obj = JSON.parse(data);
            const { start, end, key } = key_obj;

            // Remove the ":" from the mac adddress
            const mac_address = getMAC().replace(/:/g, '');

            const currentDate = new Date();

            // Calculate the Unix timestamp (in seconds) from the current date
            const current = Math.floor(currentDate.getTime() / 1000);

            const current_raw = BigInt(current);
            const start_int_raw = BigInt(start);
            const end_int_raw = BigInt(end);

            // Abort the process if current unix time is not in the key range
            if (current_raw < start_int_raw || current_raw > end_int_raw) {

                throw { 
                    message: "License key is expired! EITIx is unable to run.",
                    code: 500
                };

            }

            // Convert hexadecimal strings to integers
            const mac_int = BigInt('0x' + mac_address);
            const start_int = BigInt('0x' + start);
            const end_int = BigInt('0x' + end);

            // Perform XOR operation
            let xor_one = mac_int ^ start_int;
            let xor_two = xor_one ^ end_int;

            const licenseKey = Buffer.from(xor_two.toString(16)).toString("base64");;

            if (licenseKey === key) {

                // license key matched, validation success
                callback(true, null);
                // write to the database
                database.collection(DB.eitix).updateOne({ title: "validation" }, {
                    $set: {
                        validated: true,
                        message: ""
                    }
                }, {upsert: true})

            } else {

                // license key mismatched
                throw {
                    message: "License key is not valid. Please enter a valid key file."
                }

            }


        } catch (err) {

            let type = "in_valid";

            if (err.code == 500) type = "expired";

            if (err.code == 'ENOENT') {

                // handle no such file or directory error
                type = "no_key";
                callback(false, {
                    message: "License key not found. EITIx is unable to run!"
                })

            } else {

                // handle any other internal error
                callback(false, err)

            }
            // write to the database
            database.collection(DB.eitix).updateOne({ title: "validation" }, {
                $set: {
                    validated: false,
                    type: type
                }
            }, {upsert: true})

        }

    })


}

// remaining time
function remaining() {

    try {

      
        let raw;
        if (fs.existsSync(LICENSE_FILE)) {
            raw = fs.readFileSync(LICENSE_FILE);
        } else {
            return "perpetual"
        }

      const decrypted = decrypt(raw);
      
        const data = JSON.parse(decrypted);
        const expiry_date = new Date(data.end * 1000).toISOString().split("T")[0]

        return expiry_date;
        
    } catch (err) {

        console.log("Error while calculating expiry date", err);
        return null;
        
    }

}

const verifier = cron.schedule(`*/10 * * * *`, () => {

    // validate to see if any error occurs
    getDatabase()
        .then(async database => {

            database.collection(DB.eitix).findOne({title: "validation"})
            .then((status) => {

                if (status?.validated) {

                    // run the test
                    validate((success, error) => {

                        if (error) {
        
                            // alert to console
                            sysLog("EITIx validation error detected!", error);
                            console.error("All workers are suspended! Please insert the correct license.eitix and restart the server");
                            
                            // restart EITIx workers
                            exec("npm run restart");
        
                        }
        
                    })

                } else {

                    // stop itself
                    verifier.stop();

                }

            })

        })

});

module.exports = {

    validate, remaining

};