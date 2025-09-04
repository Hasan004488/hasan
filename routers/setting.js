// modules
require("dotenv").config();
const express = require("express");
const { exec } = require('child_process');
const app = express.Router();
const fs = require("fs");
const path = require("path");
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  permit,
  actLog
} = require("../libraries/globals");
const { UPLOADER } = require("../libraries/uploader");
const { getConfig, updateConfig } = require("../libraries/getConfig");
const { WORKER_NAMES, stopWorkers, startWorkers } = require("../libraries/workers");
const { ObjectId } = require("mongodb");
const { default: axios } = require("axios");
const archiver = require("archiver");
const { queueMap, getQueue, EQ } = require("../libraries/queue");

function generateTenantID() {

  const prefix = "EITIx";
  const randomChars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = prefix;

  // Append random characters to reach a total length of 11 characters
  while (id.length < 11) {
    const randomIndex = Math.floor(Math.random() * randomChars.length);
    id += randomChars[randomIndex];
  }

  return id;

}

app.get("/control", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let data = {};
      let all_templates = await database.collection(DB.temps).find().project({
        section_a: 0, section_b: 0, summary: 0, footer: 0,
      }).toArray() || [];
      let templates = await database.collection(DB.eitix).findOne({ title: "templates" }) || {};

      data = {
        all_templates, templates
      }

      res.render("pages/dashboard", {
        title: "Dashboard-Control",
        track: "Settings", data,
        file: 'dashboard-control.ejs'
      });

    })

});

app.get("/tenant", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let data = {};

      res.render("pages/dashboard", {
        title: "Tenant-Configure",
        track: "Settings", data,
        file: 'tenant-configure.ejs'
      });

    })

});

app.get("/tenant/list", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let data = await database.collection(DB.tenants).find().project({ key: 0 }).toArray() || [];

      data.forEach(tenant => {
        delete tenant.wazuh_pass;
      });

      res.render("components/tenant-list.ejs", {
        no_layout: true,
        title: "Tenant-Configure",
        track: "Settings", data,
      });

    })

});

app.get("/tenant/add", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let id = req.query.id;
      let data = {};

      if (id) {

        data = await database.collection(DB.tenants).findOne({ tenant_id: id }) || {};

      }

      res.render("components/tenant-add.ejs", {
        no_layout: true,
        title: "Tenant-Configure",
        track: "Settings", data,
      });

    })

});

app.post("/tenant/add", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;
        let today = new Date();

        body.status = "ACTIVE";
        body.updated = today;

        let task = await database.collection(DB.tenants).updateOne({
          tenant_id: body.tenant_id
        }, {
          $set: body
        }, { upsert: true });

        // update hooks tenant list
        let { server_ip } = getConfig();
        let [protocol, host_ip, port] = server_ip.split(":");
        axios.get(`http://${host_ip}:4001/tenants/update`);

        if (task.acknowledged) {

          req.flash("success", "Tenant was added/updated successfully!");

        } else {

          req.flash("error", "Tenant could not be added/updated! You may restart the server.");

        }

        return res.redirect(req.get('Referrer') || '/');

      } catch (err) {

        req.flash("error", "Internal Server Error");
        return res.redirect(req.get('Referrer') || '/');

      }



    })

});

app.post("/tenant/update", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let _id = req.body.id;
        let action = req.query.action;

        if (action === "activate") {

          await database.collection(DB.tenants).updateOne({
            _id: ObjectId(_id)
          }, {
            $set: {
              status: "ACTIVE"
            }
          });

        } else if (action === "deactivate") {

          await database.collection(DB.tenants).updateOne({
            _id: ObjectId(_id)
          }, {
            $set: {
              status: "INACTIVE"
            }
          });

        } else if (action === "delete") {

          await database.collection(DB.tenants).deleteOne({
            _id: ObjectId(_id)
          });

        }

        // update hooks tenant list
        let { server_ip } = getConfig();
        let [protocol, host_ip, port] = server_ip.split(":");
        axios.get(`http://${host_ip}:4001/tenants/update`);

        return res.status(200).send({ status: "EITIx Tenants updated succesfully" });

      } catch (err) {

        console.log(err);
        return res.status(500).send({ error: "Internal Server Error" });

      }

    })

});

// update backup frequency
app.post("/backup/update", permit('control'), (req, res, next) => {

  let { frequency } = req.body;

  MongoCRUD.update(req, res, next, {
    collection: DB.eitix,
    filter: { title: "cleaner" },
    data: {
      $set: {
        backup_frequency: parseInt(frequency),
      }
    },
    extra: { upsert: true }
  })

})

// backup and restore
app.get("/backup", permit('control'), (req, res, next) => {

  try {

    let command = "npm run backup";

    exec(command, (err) => {

      getDatabase().then(async database => {

        let time = new Date();

        if (err) {

          req.flash("error", "EITIx backup encountered an error: " + err.message);
          console.error(err);

          database.collection(DB.notifs).insertOne({
            type: "Backup",
            message: `EITIx backup was failed at ${time.toLocaleString()}!`,
            redirect: `/dashboard/settings/data#Settings`,
            updated: time,
            targets: [req.session.email],
            targets_unseen: [req.session.email],
          });

          return res.redirect(req.get('Referrer') || '/');

        } else {

          // alert user later
          req.flash("success", "EITIx backup successful");

          database.collection(DB.notifs).insertOne({
            type: "Backup",
            message: `EITIx backup was completed at ${time.toLocaleString()}!`,
            redirect: `/dashboard/settings/data#Settings`,
            updated: time,
            targets: [req.session.email],
            targets_unseen: [req.session.email],
          });

          return res.redirect(req.get('Referrer') || '/');

        }

      })

    });

  } catch (err) {

    req.flash("error", "Something went wrong: " + err.message ?? err);
    res.redirect(req.get('Referrer') || '/');
    next(err);

  }

});

app.get("/backup/list", permit('control'), (req, res, next) => {

  try {

    const directoryPath = './backups'; // Replace with the actual path

    if (!fs.existsSync(directoryPath)) {

      fs.mkdirSync(directoryPath, { recursive: true });

    }

    fs.readdir(directoryPath, (err, files) => {

      if (err) {

        req.flash("error", "EITIx failed to read backup directory" + err.message);
        console.error(err);
        return res.send("Internal Server Error");

      }

      const archiveNames = files.filter(file => file.endsWith('.tar.gz'));

      return res.render("components/settings/backup-list", {
        no_layout: true,
        data: archiveNames
      });

    });

  } catch (err) {

    console.error("setting", err);
    return res.send("Internal Server Error");

  }

})

app.get("/backup/download/:name", permit('control'), (req, res, next) => {

  try {

    const directoryPath = './backups';
    let file_name = req.params.name;

    const folderPath = path.join(directoryPath, file_name);

    if (!fs.existsSync(folderPath)) {

      req.flash("error", "Backup folder not found");
      console.error("Backup folder not found");
      return res.send("Internal Server Error");

    }

    res.download(`${directoryPath}/${file_name}`, file_name, (err) => {

      if (err) {

        req.flash("error", "EITIx failed to download backup" + err.message);
        console.error(err);

      }

    });

  } catch (err) {

    console.error("setting", err);
    return res.send("Internal Server Error");

  }

})

app.post("/restore", permit('control'), (req, res, next) => {

  try {

    let config = getConfig();
    let backup_name = req.body.backup_name;

    if (!backup_name) {

      req.flash("error", "No backup point was selected");
      return res.redirect(req.get('Referrer') || '/');

    }

    let backup_dir = "./backups/" + backup_name;
    let command = `mongorestore --gzip --username ${config.db_user} --password ${config.db_pass} ${backup_dir}`;

    exec(command, {

      maxBuffer: 1024 * 1024 * 10, // 10 MB

    }, (err, stdout, stderr) => {

      /* let lines = stderr.toString().split('\n');
      let last_lines = lines.slice(-3); */

      req.flash("success", "Backup restored successfully.");
      res.redirect(req.get('Referrer') || '/');

    });


  } catch (err) {

    req.flash("error", "Something went wrong: " + err.message ?? err);
    res.redirect(req.get('Referrer') || '/');
    next(err);

  }

});


app.post("/restore/external", permit('control'), UPLOADER.backup.fields([
  { name: "backup_file" }
]), (req, res, next) => {

  try {

    let config = getConfig();
    let files = req.files;

    if (!files?.backup_file) {

      req.flash("error", "No file was uploaded");
      return res.redirect(req.get('Referrer') || '/');

    }

    let backup_dir = "./backups/" + files.backup_file.originalname;
    let command = `mongorestore --gzip --username ${config.db_user} --password ${config.db_pass} ${backup_dir}`;

    exec(command, {

      maxBuffer: 1024 * 1024 * 10, // 10 MB

    }, (err, stdout, stderr) => {

      /* let lines = stderr.toString().split('\n');
      let last_lines = lines.slice(-3); */

      req.flash("success", "External backup restored successfully.");
      res.redirect(req.get('Referrer') || '/');

    });


  } catch (err) {

    req.flash("error", "Something went wrong: " + err.message ?? err);
    return res.redirect(req.get('Referrer') || '/');

  }

});


app.get("/data", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let data = {};
      let stats = await database.stats();
      let eitix = await database.collection(DB.eitix).findOne({ title: "cleaner" }) || {};

      data = {
        stats, eitix
      }

      res.render("pages/dashboard", {
        title: "Data-Management",
        track: "Settings", data,
        file: 'data-management.ejs',
      });

    })

});

app.get("/wazuh", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let data = getConfig();
      let cleaner_data = await database.collection(DB.eitix).findOne({ title: "cleaner" }) || {};

      data.wazuh_cleanup = cleaner_data.wazuh_cleanup;
      data.wazuh_cleanup_days = cleaner_data.wazuh_cleanup_days;
      data.wazuh_last_cleanup = cleaner_data.wazuh_last_cleanup;

      res.render("pages/dashboard", {
        title: "Wazuh-Management",
        track: "Settings", data,
        file: 'wazuh-management.ejs',
      });

    })

});

app.get("/wazuh/clean/size", permit('control'), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      const days_to_delete = req.query.days;
      const { kibana_host, kibana_user, kibana_pass } = getConfig();
      const size_url = `${kibana_host}/wazuh-alerts-4.x-*/_count`;

      const response = await axios.post(size_url, {
        query: {
          range: {
            "@timestamp": {
              lt: `now-${days_to_delete}d/d`
            }
          }
        }
      }, {
        httpsAgent: new require('https').Agent({ rejectUnauthorized: false }),
        auth: {
          username: kibana_user,
          password: kibana_pass
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      res.send({
        status: 'success',
        data: response.data
      })


    } catch (err) {

      res.send({
        status: 'failure',
        error: err.message
      })

    }

  })

});

app.post("/wazuh/clean", permit('control'), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      const { wazuh_cleanup_days } = req.body;
      const { kibana_host, kibana_user, kibana_pass } = getConfig();
      const delete_url = `${kibana_host}/wazuh-alerts-4.x-*/_delete_by_query`;

      const response = await axios.post(delete_url, {
        query: {
          range: {
            "@timestamp": {
              lt: `now-${wazuh_cleanup_days}d/d`
            }
          }
        }
      }, {
        httpsAgent: new require('https').Agent({ rejectUnauthorized: false }),
        auth: {
          username: kibana_user,
          password: kibana_pass
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      actLog(`User(${req.session.email}) just cleaned ${response.data?.deleted} old wazuh logs`);

      return res.send({
        status: 'success',
        data: response.data
      })


    } catch (err) {

      return res.send({
        status: 'failure',
        error: err.message
      })

    }

  })

});

app.get("/wazuh/cleanup", permit("control"), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let schedule = req.query.schedule == 'on' ? 'on' : 'off';

        console.log(schedule);

        await database.collection(DB.eitix).updateOne({ title: "cleaner" }, {
          $set: {
            wazuh_cleanup: schedule
          }
        });

        req.flash("success", "Wazuh cleanup status updated!");
        return res.redirect(req.get('Referrer') || '/');

      } catch (err) {

        next(err);

      }

    })

});

app.post("/data/retention/update", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      let data = req.body;
      let convertedData = {};

      // make the inputs into integer
      for (var key in data) {
        if (data.hasOwnProperty(key)) {

          convertedData[key] = parseInt(data[key]);

        }
      }

      database.collection(DB.eitix).updateOne({
        title: "cleaner"
      }, {
        $set: convertedData
      }, { upsert: true })
        .then(result => {

          req.flash("success", "Database housekeeping retention settings updated");
          res.redirect(req.get('Referrer') || '/');

        });

    })

});

app.get("/profile", (req, res, next) => {

  getDatabase()
    .then(database => {

      database.collection(DB.users).findOne({ email: req.session.email })
        .then(results => {

          // render data
          res.render("pages/dashboard", {
            title: "Your-Profile",
            track: "Settings",
            file: 'profile.ejs',
            data: results
          });

        })
        .catch(err => {
          next(err)
        })

    })

});

app.post("/profile/update", UPLOADER.profile.fields([
  { name: "profile_image" }
]), (req, res, next) => {

  try {

    const email = req.session.email;

    if (req.files?.profile_image) {

      req.body.profile_image = req.files.profile_image[0].filename

    }

    MongoCRUD.update(req, res, next, {

      collection: DB.users,
      filter: { email: email },
      data: {
        $set: req.body
      },
      success: "Updated the user information successfully!",
      failure: "failed to update this user information"

    })

  } catch (err) {

    next(err)

  }

});

app.get("/organization", permit("control"), (req, res, next) => {

  getDatabase()
    .then(database => {

      database.collection(DB.eitix).findOne({ title: "organization" })
        .then(result => {

          // render data
          res.render("pages/dashboard", {
            title: "Your-Organization",
            track: "Settings",
            file: 'organization.ejs',
            data: result
          });

        })
        .catch(err => {
          next(err)
        })

    })

});

app.post(
  "/organization/update",
  permit("control"),
  UPLOADER.organization.single('image'),
  (req, res, next) => {

    getDatabase()
      .then(database => {

        database.collection(DB.eitix).updateOne({ title: "organization" }, {
          $set: req.body
        })
          .then(results => {

            // render data
            req.flash("success", "Successfully updated Organization Info");
            res.redirect(req.get('Referrer') || '/');

          })
          .catch(err => {
            next(err)
          })

      })

  });

app.get("/password", (req, res, next) => {
  res.render("pages/dashboard", {
    title: "Change-Password",
    track: "Settings",
    file: 'password.ejs'
  })
})

app.post("/templates/update", permit('admin'), (req, res, next) => {

  let channel = req.body.channel;

  if (channel) {

    MongoCRUD.update(req, res, next, {
      collection: DB.eitix,
      filter: { title: "templates", channel },
      data: {
        $set: req.body
      },
      extra: { upsert: true }
    })

  } else {

    req.flash("error", "Something went wrong");
    res.redirect(req.get('Referrer') || '/');

  }

})

// serves worker control page
app.get("/worker", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        const workers = await database.collection(DB.eitix).findOne({ title: "workers" }) || {};
        const active_workers = {};

        // keep the work
        for (const prop in workers) {

          if (WORKER_NAMES.includes(prop)) {
            active_workers[prop] = workers[prop];
          }

        }

        // keep only the initialized worker info

        res.render("pages/dashboard", {
          title: "Worker-Control",
          track: "Settings",
          workers: active_workers,
          file: 'worker-control.ejs'
        });

      } catch (err) {

        next(err)

      }

    })

});

app.get("/worker/status", permit('control'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        const workers = await database.collection(DB.eitix).findOne({ title: "workers" }) || {};
        const active_workers = {};

        // keep the work
        for (const prop in workers) {

          if (WORKER_NAMES.includes(prop)) {
            active_workers[prop] = workers[prop];
          }

        }

        // keep only the initialized worker info
        res.render('pages/dashboard/worker-status.ejs', {
          no_layout: true,
          workers: active_workers,
        });

      } catch (err) {

        next(err)

      }

    })

});

app.post("/worker/rest/update", permit('control'), async (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let data = req.body;
        let convertedData = {};

        // make the inputs into integer
        for (const key in data) {
          if (data.hasOwnProperty(key)) {

            convertedData[key] = parseInt(data[key]);

          }
        }

        database.collection(DB.eitix).updateOne({ title: "workers" }, {
          $set: data
        })
          .then(() => {

            req.flash("success", "Successfully updated! Please restart EITIx server.");
            res.redirect(req.get('Referrer') || '/');

          }).catch(err => {

            next(err);

          })

      } catch (err) {

        next(err);

      }

    })

});

app.get("/worker/control", permit('control'), (req, res, next) => {

  let worker_name = req.query.name;
  let worker_active = worker_name + ".active";
  let option = req.query.option;

  if (option == "start") {

    startWorkers({ name: worker_name }, err => {

      if (!err) {

        MongoCRUD.update(req, res, next, {
          collection: DB.eitix,
          filter: { title: "workers" },
          data: {
            $set: {
              [worker_active]: true
            }
          },
          success: "EITIx started an inactive worker"
        });

      } else next(err);

    })

  } else if (option == "stop") {


    stopWorkers({ name: worker_name }, err => {

      if (!err) {

        MongoCRUD.update(req, res, next, {
          collection: DB.eitix,
          filter: { title: "workers" },
          data: {
            $set: {
              [worker_active]: false
            }
          },
          success: "EITIx stopped an active worker"
        });

      } else next(err);

    })

  } else {

    req.flash("error", "Parameters are missing, EITIx aborted the task");
    res.redirect(req.get('Referrer') || '/');

  }

});

app.get("/worker/restart", permit('control'), (req, res, next) => {

  stopWorkers({}, err => {

    if (!err) {

      startWorkers({}, err => {

        if (!err) {

          const DEFAULT_WORKERS = require("../libraries/data/default_workers");
          const WORKER_NAMES = Object.keys(DEFAULT_WORKERS); // array

          let start_workers = {}

          WORKER_NAMES.forEach(name => {

            start_workers[`${name}.active`] = true;

          });

          // update the database that all workers are now active
          MongoCRUD.update(req, res, next, {
            collection: DB.eitix,
            filter: { title: "workers" },
            data: {
              $set: start_workers
            },
            success: "All workers are restarted succesfully"
          });

        } else next(err);

      })

    } else next(err);

  })

});

app.get("/server/restart", permit('control'), (req, res, next) => {

  req.flash("info", "Server will be restarted right away!");
  res.redirect(req.get('Referrer') || '/');
  // restart EITIx workers
  exec("npm run restart");

})

app.get("/api", permit('admin'), (req, res, next) => {

  getDatabase()
    .then(() => {

      try {

        const config = getConfig();

        let urls = {
          eitix_api: `http://${config.wazuh_host}:5000`,
          cve_api: "https://services.nvd.nist.gov/rest/json/cves/2.0",
          vulns_finder: "https://internetdb.shodan.io/8.8.8.8",
          ip_location: "http://ip-api.com/"
        }

        res.render("pages/dashboard", {
          title: "API-Control",
          track: "Settings", urls, config,
          file: 'api-control.ejs'
        });

      } catch (err) {

        next(err)

      }

    })

});

app.post("/api/update", permit('admin'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        const config = getConfig();
        const body = req.body;

        for (const key in body) {

          if (Object.hasOwnProperty.call(body, key)) {

            config[key] = body[key];

          }

        }

        updateConfig(config, err => {

          if (err) res.send(false);
          else {

            res.send(true);

          }

        })

        /* database.collection(DB.eitix).updateOne({
          title: "configuration"
        }, {
          $set: body
        }, {upsert: true}).then(() => {

          res.send(true);
          
        }) */

      } catch (err) {

        next(err)

      }

    })

});

app.get("/queue", permit('admin'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        res.render("pages/dashboard", {
          title: "Message-Queue",
          track: "Settings",
          file: 'message-queue.ejs'
        });

      } catch (err) {
        next(err)
      }

    })

});

app.get("/queue/status", permit('admin'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        const queueStats = {};

        // Use your existing queueMap which already has the queue instances
        for (const key in EQ) {
          const queue = getQueue(key);
          queueStats[key] = await queue.getJobCounts();

          const jobs = await queue.getJobs(['waiting', 'active', 'failed'], 0, 10);

          // Fetch status for each job
          const jobDetails = await Promise.all(jobs.map(async job => ({
            ...job.toJSON(),
            status: await job.getState(), // Proper status like 'waiting', 'active', etc.
          })));

          queueStats[key].last10tasks = jobDetails;
        }

        res.render("pages/dashboard/message-queue-status", {
          no_layout: true, queueStats,
        });

      } catch (err) {
        next(err)
      }

    })

});


module.exports = app;