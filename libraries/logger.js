// emergency logger for all libraries that can't depend on globals.js
// this logger only write logs into the file

const fs = require("fs");

module.exports = {

    sysLog(log_message, log_err) {

        try {

            let date_time = new Date().toLocaleString();
            let date = date_time.split(",")[0].replace(/\//g, "-");
            let directory = `./logs/${date}`;
            let filename = `${directory}/system.log`;
            let full_log = `[${date_time}] ${log_message}`;
            let errorString = "Not Found";
            let errorJSON = "{}";

            if (!fs.existsSync(directory)) {

                fs.mkdirSync(directory, { recursive: true });

            }

            if (log_err) {

                filename = `${directory}/error.log`;

                if (log_err.stack) {

                    log_err = log_err.stack;

                } else {

                    // if any object do not contains stack it should contain message
                    log_err = log_err.message;

                }

                errorString = log_err?.toString();
                errorJSON = JSON.stringify(log_err);

                fs.appendFileSync(filename, `${full_log}\n`);
                fs.appendFileSync(filename, `${errorString}\n`);
                fs.appendFileSync(filename, `${errorJSON}\n`);

                console.error(log_message, log_err);

            } else {

                fs.appendFileSync(filename, `${full_log}\n`);
                console.log(log_message);

            }

        } catch (err) {

            console.error(`Error processing system logs`);
            console.error(err);

        }

    },

    cleanerLog(log_message, data = false) {

        try {

            let date_time = new Date().toLocaleString();
            let date = date_time.split(",")[0].replace(/\//g, "-");
            let directory = `./logs/${date}`;
            let filename = `${directory}/cleaner.log`;
            let full_log = `[${date_time}] ${log_message}`;

            if (!fs.existsSync(directory)) {

                fs.mkdirSync(directory, { recursive: true });

            }

            datajson = JSON.stringify(data.toString());

            fs.appendFileSync(filename, `${full_log}\n`);
            fs.appendFileSync(filename, `${datajson}\n`);

        } catch (err) {

            console.error(`Error processing cleaner logs`);
            console.error(err);

        }

    }

}