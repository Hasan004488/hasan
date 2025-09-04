// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const {
    DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
    permit, getMongoQuery,
    generateSearchQuery
} = require("../libraries/globals");
const { ObjectId } = require("mongodb");

let DEBUG = false;

app.get("/events/:tab", (req, res, next) => {

  getDatabase().then(async database => {
    
    try {

      //const agents = await database.collection(DB.w_agents_d).distinct("id") || [];
      let date = new Date();
      let today = date.toISOString().split("T")[0];
      let track_data = await database.collection(DB.track).findOne({
        date: today
      }) || {};
      let tenants = await database.collection(DB.tenants).find({}).project({tenant_id: 1}).toArray() || [];
      let agents = [];

      if (track_data?.tenants?.tenant?.agents) {

        agents = Object.keys(track_data?.tenants?.tenant?.agents) || [];

      }

      if (DEBUG) console.log("agents:", agents);

      const tab = req.params.tab || "regular";
      const risks = ["Low", "Medium", "High"];
      const sources = ["Wazuh", "MISP"];
      const severities = [];

      for (let index = 1; index <= 16; index++) {
        severities.push({
          name: "Level " + index,
          field: "severity",
          value: index
        })
      }

      // custom agent_id (MISP)
      agents.push("999");
      
      res.render("pages/dashboard",{
        title: `${tab}-events`,
        file: 'surface-events',
        track: "Attack-Surface",
        active: tab, severities,
        table: {
          dropdown: false,
          actions: true,
          url: `/dashboard/surface/events/${tab}/data`,
          query: req.query,
          headers: [
            { width: "7%", text: "Event Time" },
            { 
              width: "10%",
              text: "Tenant",
              filters: tenants.map(tenant => {
                return {
                  name: "Tenant " + tenant.tenant_id,
                  field: "tenant_id",
                  value: tenant.tenant_id
                }
              })
            },
            { width: "50%", text: "Information" },
            { 
              width: "7%",
              text: "Agent ID", class:"text-center",
              filters: agents.map(agent => {
                return {
                  name: "Agent " + agent,
                  field: "agent_id",
                  value: agent
                }
              })
            },
            {
              width: "7%",
              text: "Risk", class:"text-center",
              filters: risks.map(risk => {
                return {
                  name:  risk + " Risk",
                  field: "risk",
                  value: risk
                }
              })
            },
            {
              width: "7%",
              text: "Source", class:"text-center",
              filters: sources.map(source => {
                return {
                  name: "Source " + source,
                  field: "discovered",
                  value: source
                }
              })
            }
          ]
        }
      });
      
    } catch (err) {
  
      next(err);
  
    }

  })

});

app.get("/events/:tab/data", async (req, res, next) => {

  getDatabase().then(async database => {

    try {

    // data loading
    let tab = req.params.tab || "regular";
    let page = parseInt(req.query.page) || 1;
    let collection = DB.a_surface;
    // prepare database filter
    let filter  = getMongoQuery(req.query, {
      firedtimes: {
        type: "int"
      },
      severity: {
        type: "int"
      }
    });
    
    if (tab === "playbook") {
      collection = DB.p_surface;
    }

    if (req.query.count === "1") {

      let total_results = 0;

      total_results = await database.collection(collection).countDocuments(filter);

      return res.json({total: total_results});

    } else {

      let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

      if (result.length > 0) {

        return res.render("components/table/surface-table-data", {
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

app.get("/configuration", permit('control'), (req, res, next) => {

  getDatabase().then(async database => {

    let attacksc = await database.collection(DB.eitix).findOne({ title: "attack_surface" }) || {};

    res.render("pages/dashboard",{
      title: `surface-configuration`,
      file: 'surface-configuration',
      track: "Attack-Surface",
      data: {
        attacksc
      }
    });

  })
})

app.post("/configuration/update", permit('control'), (req, res, next) => {

  let low_range = req.body.low_range;
  let med_range = req.body.medium_range;

  if (low_range > med_range - 2) {

    req.flash("error", "Invalid detection range provided that can't be set");
    res.redirect(req.get('Referrer') || '/');

  } else {

    getDatabase()
      .then(database => {

        database.collection(DB.eitix).updateOne({ title: "attack_surface" }, {
          $set: {
            low_range: low_range,
            medium_range: med_range,
            low_factor: req.body.low_factor,
            medium_factor: req.body.medium_factor,
            high_factor: req.body.high_factor
          }
        }, { upsert: true })
          .then(result => {
            req.flash("success", "Successfully updated attack surface parameters")
            res.redirect(req.get('Referrer') || '/');
          })
          .catch(err => next(err));

      })

  }

});

app.get("/customization", permit('control'), (req, res, next) => {

  getDatabase().then(async database => {

    res.render("pages/dashboard",{
      title: `surface-customization`,
      file: 'surface-customization',
      track: "Attack-Surface",
      data: []
    });

  })

})

app.get("/customization/data/fields", permit('control'), (req, res, next) => {

  res.render("components/surface/agent-log-fields",{
    no_layout: true
  });

})

app.get("/logs/data/raw", async (req, res, next) => {

  getDatabase().then(async database => {

    try {

      // return one log data from here
      let id = req.query.id ? ObjectId(req.query.id) : null;
      let search_filter = {_id: id};
      let collection = DB.a_surface;

      if (id) {
  
        let result = await database.collection(collection).findOne(search_filter);
  
        if (result) {
  
          delete result._id;
          return res.send(result);
  
        } else {

          // now start searching from second collection to all collections
  
          let result = await database.collection(collection).findOne(search_filter);
  
          if (!result || result.length === 0) {

            return res.send({
              status: "Log data not found!",
              info: "The data maybe cleaned up by auto data cleaning!"
            })

          } else {

            delete result._id;
            return res.send(result[0]);

          }
  
        }
        
      } else {

        return res.send({
          status: "Log ID is unknown or not found!",
          info: "Log ID is unknown or not found!"
        });

      }

    
  } catch (err) {

    console.error(err);
    return res.send(false);

  }

  })
    
});

module.exports = app;