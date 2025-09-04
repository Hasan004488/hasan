/**
 * Manages and initializes workers
 */
// get config data
const {
  getConfig
} = require("./getConfig");
const {
  DB, getDatabase
} = require("./database");
const { sysLog } = require("./globals");
const DEFAULT_WORKERS = require("../libraries/data/default_workers");

const WORKERS = {};
const WORKER_NAMES = Object.keys(DEFAULT_WORKERS); // array

let worker_jobs = {};

WORKER_NAMES.forEach(name => {

  worker_jobs[name] = require(`../workers/${name}`);

});

function destroyWorkers(database, error) {
  try {

    // destroy all workers
    for (const worker in WORKERS) {
      if (WORKERS[worker]) {
        WORKERS[worker].stop();
      }
    }
    // set all workers running false
    let stop_matrix = {};
    for (const worker of WORKER_NAMES) {
      stop_matrix[`${worker}.running`] = false;
    }

    database.collection(DB.eitix).updateOne({ title: "workers" }, {
      $set: stop_matrix
    }).then(() => {
      error(null);
    }).catch(err => {
      error(err);
    });

  } catch (err) {

    error(err);

  }
}

module.exports = {

  WORKERS, WORKER_NAMES,

  initializeWorkers(error) {

    getDatabase().then(async database => {

      try {

        let configuration = getConfig();
        if (configuration.eitix_configured) {

          let config = await database.collection(DB.eitix).findOne({ title: "workers" });

          if (config) {

            destroyWorkers(database, err => {

              if (err) {

                return error(err);

              } else {

                // start the workers by name and active status
                WORKER_NAMES.forEach(name => {

                  if (config[name]?.rest) {

                    WORKERS[name] = worker_jobs[name](config[name].rest, config[name].active);

                  }

                });

                // configuration done!
                return error(null);

              }

            })

          } else {

            return error({ message: "Can't access the worker configuration data. Configuring EITIx may fix this issue" });

          }

        }
        else {

          // eitix is not configured yet
          return error({ message: "EITIx is not configured. Please configure EITIx" });

        }

      } catch (err) {

        // internal error
        return error(err);

      }

    })
      .catch(err => {

        // database error
        return error(err);

      });

  },

  stopWorkers(option = {}, error) {
    try {

      if (WORKERS[option.name]) {

        // stop specefic worker
        WORKERS[option.name].stop();
        sysLog(`An worker named '${option.name}' just stopped.`);
        error(null);

      } else {

        // stop all workers
        for (const worker in WORKER_NAMES) {
          if (WORKERS[worker]) {
            WORKERS[worker].stop();
          }
        }
        error(null);

      }

    } catch (err) {

      error(err);

    }
  },

  startWorkers(option = {}, error) {
    try {

      if (WORKERS[option.name]) {

        // start specefic worker
        WORKERS[option.name].start();
        error(null);

      } else {

        // start all workers
        for (const worker in WORKERS) {
          if (WORKERS[worker]) {
            WORKERS[worker].start();
          }
        }
        error(null);

      }

    } catch (err) {

      error(err);

    }
  }
}