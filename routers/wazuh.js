// modules
require("dotenv").config();
const express = require("express");
const {
    DB, getDatabase
} = require("../libraries/database");
const {
    WLOG_IDFS, generateSearchQuery, permit, getDateString
} = require("../libraries/globals");
const { ObjectId } = require("mongodb");
const { REPORTER } = require('../libraries/reporter');
const {
  loadLogs,
  searchLog,
  countLogs,
  loadLog
} = require('../libraries/log-finder');
const app = express.Router();

app.get("/logs", async (req, res, next) => {

  getDatabase().then(async database => {
    
    try {
  
      const tab = req.params.tab || "regular";
      const levels = [];

      for (let index = 1; index <= 16; index++) {
        levels.push({
          name: "Level " + index,
          href: `&idfs=rule.level&operators=equal_to&types=int&values=${index}`
        })
      }
      
      res.render("pages/dashboard", {
        title: "Wazuh-Logs",
        file: 'wazuh-logs.ejs',
        active: tab,
        identifiers: WLOG_IDFS,
        table: {
          dropdown: false,
          actions: true,
          url: `/dashboard/wazuh/logs/data`,
          query: req.query,
          headers: [
            { text: "Time" },
            { text: "Tenant" },
            { text: "Log ID" },
            { text: "Description" },
            { text: "Agent ID", class:"text-center" },
            { text: "Rule ID", class:"text-center" },
            { text: "Rule Level", class:"text-center" }
          ]
        }
      });
      
    } catch (err) {
  
      next(err);
  
    }

  })
      
});

app.get("/logs/data", async (req, res, next) => {

  getDatabase().then(async database => {

    try {

    let search_filter = generateSearchQuery(req.query);
    let page = parseInt(req.query.page) || 1;
    let collection = parseInt(req.query.collection) || 1;

    /* console.log("wazuh.js", req.query.page, page, collection); */

    if (req.query.count === "1") {

      const total_results = await countLogs(database, search_filter);
      return res.json({total: total_results});

    } else {

      let result = await loadLog(database, req.query, collection, page);

      /* console.log("wazuh.js", collection, page, result); */

      if (!result || result !== -1) {

        if (result === null) return res.send("404");
        else return res.render("components/wazuh/wazuh-table-data", {
          no_layout: true,
          data: result
        });

      } else {

        return res.send(false);
  
      }

    }
    
  } catch (err) {

    console.error(err);
    return res.send(false);

  }

  })
    
});

app.get("/logs/data/raw", async (req, res, next) => {

  getDatabase().then(async database => {

    try {

      // return one log data from here
      let search_filter = generateSearchQuery(req.query);
      let date_str = req.query.date || getDateString();
      let collection = req.query.collection || DB.wlog + ".data." + date_str;

      if (req.query?.values && req.query.values.length > 0) {
  
        let result = await database.collection(collection).findOne(search_filter);
  
        if (result) {
  
          delete result._id;
          return res.send(result);
  
        } else {

          // now start searching from second collection to all collections

          req.query.page = 2; // return array of 2 - 1 = 1 log
  
          result = await loadLogs(database, req.query); // returns an array if found otherwise empty array
  
          if (!result || result.length === 0) {

            return res.send({
              status: "Wazuh log data not found!",
              info: "The data maybe cleaned up by auto data cleaning!"
            })

          } else {

            delete result._id;
            return res.send(result[0]);

          }
  
        }
        
      } else {

        return res.send({
          status: "Wazuh log ID is unknown or not found!",
          info: "Wazuh log ID is unknown or not found!"
        });

      }

    
  } catch (err) {

    console.error(err);
    return res.send(false);

  }

  })
    
});

// send individual log info from database
app.get("/content/log", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let log_id = req.query.id ? ObjectId(req.query.id) : null;
      let collection = req.query.collection;
      let data = null;

      // console.log("wazuh.js", req.query);

      if (!log_id) {

        return res.status(404).send("Log ID not found in the query");

      }

      if (collection) {

        data = await database.collection(collection).findOne({ _id: log_id });

      } else {

        data = await searchLog(database, log_id);

      }

      // console.log(data);

      if (data) {

        delete data._id;
        delete data.group;
        res.status(200).json(data);

      } else {

        res.status(404).send("Log data not found");

      }
      
    } catch (err) {

      console.log(err);
      res.status(500).send("Internal Server Error");
      
    }

  })

})

app.get("/report/logs", permit("report"), (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      // get log Ids
      let load_query = req.query;
      load_query.page = req.query.limit;
      const log_data = await loadLogs(database, req.query);
      
      // pass it to the reporter
      let reporter = await database.collection(DB.users).findOne({ email: req.session.email }) || {};
      let filename = `report-wazuh-logs-${reporter.email}.pdf`;

      REPORTER.wlog(log_data, reporter.full_name, filename, "on", (report, err) => {

          if (report) {

              res.download(report);

          } else if (err) {

            console.error(err);
            req.flash("error", "Couldn't generate report for logs because " + err.message);
            res.redirect(req.get('Referrer') || '/');

          } else {

              req.flash("error", "Something went wrong");
              res.redirect(req.get('Referrer') || '/');

          }

      })

    } catch (err) {

        next(err);

    }

  })

})

module.exports = app;