// modules
require('dotenv').config();
const express = require("express");
const fs = require("fs");
const app = express.Router();
const axios = require("axios");
const {
  requireLogin,
  controlEitix
} = require("../libraries/globals");
const {
  configureDB,
  requireConfig
} = require("../libraries/configuration");
const {
  requireDB, DB, getDatabase, testConnection, CREDENTIALS
} = require("../libraries/database");
const {
  getConfig, resetConfig, updateConfig
} = require("../libraries/getConfig");

// routers
const content_router = require("./content");
const dashboard_router = require("./board");
const auth_router = require("./auth");

// handle redirects!
app.get(["/", "/home"], (req, res) => { res.redirect("/dashboard") });
app.get(["/login", "/signin"], (req, res) => { res.redirect("/auth/login") });

// routes
app.use("/auth", requireConfig, requireDB, auth_router);
app.use("/content", requireConfig, requireDB, requireLogin, content_router);
app.use("/dashboard", requireConfig, requireDB, requireLogin, dashboard_router);

function verifyPasscode(req, res, next) {

  let passcode = req.session.passcode;

  if (passcode == CREDENTIALS.configure_passcode) {

    next()

  } else {

    req.flash("warning", "Enter correct passcode to configure EITIx");
    res.redirect("/passcode");

  }

}

// configuration handeling
app.get("/configure", controlEitix, verifyPasscode, (req, res, next) => {

  let configuration = getConfig();
  res.render("pages/misc/configure", {
    config: configuration,
    configured: configuration.eitix_configured
  });

});

app.post("/configure", controlEitix, (req, res, next) => {

  // reset some config setting initially
  let configuration = getConfig();
  configuration.eitix_configured = false;

  updateConfig(configuration, err => {

    if (err) {

      req.flash("error", err);
      res.redirect(req.get('Referrer') || '/');

    } else {

      // start configuring asynchronously
      configureDB(req.body);

      // immediately take to the loading page
      return res.redirect("/loading");

    }
  });

});

// check if eitix is configured (ajax)
app.get("/configured", (req, res, next) => {

  let { eitix_configured, configure_failed, failed_reason } = getConfig();

  if (eitix_configured) {

    res.send({ status: "success" });

  } else {

    if (configure_failed) {

      // stop the loader by returning "failed"
      res.send({ status: "failed", reason: failed_reason });

    } else {

      res.send({});

    }

  }

});

app.get("/reset", controlEitix, (req, res, next) => {

  // hard reset eitix
  // it will require to re configure
  resetConfig(err => {

    if (err) next(err);
    else {

      req.flash("success", "EITIx hard reset successful");
      res.redirect(req.get('Referrer') || '/');

    }

  })

});

// render loading page
app.get("/loading", (req, res, next) => {

  res.render("pages/misc/loading");

});

// session and user test
app.get("/session", (req, res, next) => {

  getDatabase().then(async database => {

    let active = req.query.active;

    if (req.session.token) {

      if (active === "true") {

        req.session.nowInMinutes = Math.floor(Date.now() / 1000 / 60) + 30; // add another one minute
        
      }

      // check if user is logged in somewhere else
      let user_email = req.session.email;
      let user_db = await database.collection(DB.users).findOne({ email: user_email });

      // expiration check
      let nowInMinutes = Math.floor(Date.now() / 1000 / 60);
      if (user_db.role !== "Observer" && nowInMinutes > req.session.nowInMinutes) {
        // update the status in the database
        await database.collection(DB.users).updateOne({ email: req.session.email }, {
          $set: { logged_in: false }
        })
        // session out detected
        req.session = null;
        return res.json({ status: "session-out" });
      }

      if (user_db && user_db.logged_in === true) {

        let this_browser = req.headers["user-agent"];
        if (user_db.browser !== this_browser) {
          // logout required because it is logged in another browser
          req.session = null;
          return res.json({ status: "browser-logout" });
        }

        // no issues
        return res.json({ status: "success" });
        
      } else {

        // force logout
        // update the status in the database
        await database.collection(DB.users).updateOne({ email: req.session.email }, {
          $set: { logged_in: false }
        })

        // logout required because it is logged in another browser
        req.session = null;
        return res.json({ status: "force-logout" });

      }

    } else {

      // update the status in the database
      await database.collection(DB.users).updateOne({ email: req.session.email }, {$set: { logged_in: false }});
      // session out detected
      req.session = null;
      return res.json({ status: "session-out" });

    }

  })

})

app.get("/expired", (req, res, next) => {

  res.render("pages/misc/expired");

})

app.get("/passcode", controlEitix, (req, res, next) => {

  res.render("pages/misc/passcode");

})

app.post("/passcode", controlEitix, (req, res, next) => {

  let code = req.body.passcode;

  if (code == CREDENTIALS.configure_passcode) {

    req.session.passcode = code;
    req.flash("success", "Passcode matched! You are ready to configure");
    res.redirect("/configure");

  } else {

    req.flash("error", "Entered passcode didn't match");
    res.redirect("/passcode");

  }

})

// run eitix dependency check
app.get("/check", controlEitix, async (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        return res.send({
          message: "This route is deprecated"
        });

        let eitix_wazuh = await database.collection(DB.eitix).findOne({ title: "wazuh" }) || {};

        let db_connection = testConnection();

        let env_file = false;
        let config_file = false;
        let license_key = false;

        if (fs.existsSync('.env')) env_file = true;
        if (fs.existsSync('config.json')) config_file = true;
        if (fs.existsSync('license.eitix')) license_key = true;

        // show database keys 

        let data = {
          name: "EITIx",
          process: "EITIx Status Check",
          version: process.env?.EITIX_VERSION,
          environment: process.env?.NODE_ENV,
          node_version: process.version,
          environment_file: env_file,
          configuration_file: config_file,
          license_key_exists: license_key,
          database_successful_connection: db_connection,
          collected_wazuh_logs: eitix_wazuh.last_log_collected || "unknown"
        }

        res.send(data);

      } catch (err) {
        next(err);
      }

    })

})

// must be at the bottom for not found page
app.use((req, res, next) => {

  let error = new Error("404 page not found");
  error.status = 404;
  next(error);

});

// custom error handeling middleware
app.use((err, req, res, next) => {

  if (err.status === 404 && req.accepts('html')) {

    return res.status(404).render("pages/misc/404-not-found", {
      error: err.message
    });

  } else if (err.status === 404) {

    return res.status(404).send({ error: "Page not found" });

  } else {

    if (err.name?.startsWith("Mongo")) {

      // mongodb error
      let err_message_flash = "EITIx encountered an database error!"
      let err_message = err.message;

      // a database error encountered
      req.flash("error", err_message_flash);
      console.error(err);
      return res.render("pages/misc/database-error", {
        error_message: err_message
      });

    } else if (err.name == "Multer") {

      // multer error
      req.flash("error", "Eitix encountered an file uploading error: " + err.message);
      return res.redirect(req.get('Referrer') || '/');

    } else {

      // a random server error
      req.flash("error", "Eitix encountered an internal server error!");
      console.error(err);
      return res.render("pages/misc/internal-server-error", {
        error_message: err.message
      });

    }

  }
});


module.exports = app;