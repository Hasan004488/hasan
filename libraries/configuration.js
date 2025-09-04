require("dotenv").config();
const axios = require("axios");
const {
    getConfig,
    updateConfig
} = require("./getConfig");
const {
    DB,
    getDatabase,
    closeConnection
} = require("./database");
const {
  createSchema
} = require("./create-schema");
const {
  initializeWorkers
} = require("./workers");


module.exports = {

    requireConfig(req, res, next) {

        let config = getConfig();

        if (config?.eitix_configured) next()
        else {

            console.log("EITIx is not configured. Please configure your EITIx now!")
            res.render("pages/misc/not-configured")

        }
    },

    configureDB(config) {
        
      try {

        let configuration = getConfig();

        // set config info coming from the mother.js
        configuration.db_user = config.db_user;
        configuration.db_pass = config.db_pass;
        configuration.db_port = config.db_port;

        // close the previous database connection
        closeConnection();

        // get database with new config
        getDatabase(config)
        .then(async database => {

            createSchema(config, err => {

                if (!err) {

                    // everything is ok ready to write configure status
                    configuration.admin_created = true;
                    configuration.eitix_configured = true;
                    configuration.configure_failed = false;
                    configuration.failed_reason = null;
                    updateConfig(configuration);

                    // re-initialize the workers again (parallel)
                    initializeWorkers((err) => {
    
                        if (err) {
                            
                          console.error("Workers failed to re-initialized!", err);
                          console.log("Please try to re-configure. (visit http://localhost:4000/configure)");
                          console.log("Try resetting the EITIx");
    
                        }
    
                    })

                } else {

                  configuration.eitix_configured = false;
                  configuration.configure_failed = true;
                  configuration.failed_reason = err.toString();
                  updateConfig(configuration);

                  console.error("EITIx failed to create schema while configuration!", err);

                }

            })

            // get location for the target ip
            let response = await axios.get("http://208.95.112.1/json/");
            let info = response?.data || {};

            await database.collection(DB.wm_loc).updateOne({
                ip: info.query
            },{
                $set: {
                    ip: info.query,
                    country: info.country,
                    city: info.city,
                    latitude: info.lat,
                    longitude: info.lon
                }
            }, { upsert: true })
            .then(() => {

              let configuration = getConfig();
              configuration.ip = info.query || "";
              updateConfig(configuration);

            })
            .catch(err => {

              console.error(`Couldn't update ip info for ${info.query} while configuration`, err);

            })

        })
        .catch(err => {

            // error encountered because of failed database connection
            console.error("EITIx failed to configure!", err);
            console.log("Please Try to re-configure. (visit http://localhost:4000/configure)");
            console.log("Try updating database credentials.");

            configuration.eitix_configured = false;
            configuration.configure_failed = true;
            configuration.failed_reason = err.toString();
            updateConfig(configuration);
            
        }) 

      } catch (err) {

        // error encountered because of internal server error
        console.error("EITIx failed to configure!", err);
        console.log("Please Try to re-configure. (visit http://localhost:4000/configure)");
        console.log("Try restarting the server.");
        
        configuration.eitix_configured = false;
        configuration.configure_failed = true;
        configuration.failed_reason = err.toString();
        updateConfig(configuration);
          
      }

    },

}