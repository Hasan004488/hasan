// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  getConfig
} = require("../libraries/getConfig");
const {
  permit, getMongoQuery, getLogCollection,
  format,
  actLog
} = require("../libraries/globals");
const { toArray } = format;

const WMAP_DOT_RADIUS = 6;
const WMAP_LIMIT = 300; // ip list on the dashboard
const LOGS_ON_DASHBOARD = 100; // logs to show on dashboard for each ip

// routers (need to be at the top)
const ticket_router = require("./ticket");
const user_router = require("./user");

app.use("/", ticket_router);
app.use("/", user_router);

// dashboard body
app.get("/", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let user_status = await database.collection(DB.users).findOne({ email: req.session.email }) || {};

        if (user_status.updated != true) {
          req.flash("warning", "Please change the default password from <a href='/dashboard/settings/password'>Settings</a>.");
        }

        // render page with the data
        res.status(200).render("pages/dashboard", {
          title: "Dashboard",
          file: 'dashboard-body',
          agents: req.query.agents
        });


      } catch (err) {

        // internal server error
        next(err);

      }

    })

});

app.get("/world/map", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let configuration = getConfig() || {};

        const data = {
          markers: [],
          lines: [],
          info: []
        };

        let date = new Date();
        let cur_hour = date.getHours();

        let target_ip = configuration.ip || "";
        let from_range = ((cur_hour - 6) < 0 ? 0 : (cur_hour - 6));;
        let to_range = cur_hour;

        let public_ips = await database.collection(DB.w_map).find({
          $or: [
            {
              hourtime: {
                $gte: parseInt(from_range),
                $lte: parseInt(to_range)
              }
            },
            { ip: target_ip, private: { $ne: true } }
          ]
        }).project({ ip: 1, logs: 1 }).limit(WMAP_LIMIT).toArray() || [];

        let public_ip_list = public_ips.map(o => o.ip);

        let ip_locations = await database.collection(DB.wm_loc).find({
          ip: {
            $in: public_ip_list
          }
        }).toArray() || [];

        let names = [];
        let name = "";

        let target_data = await database.collection(DB.wm_loc).findOne({ ip: target_ip });
        let target_name = "";

        if (target_data != null) {

          target_name = `EITIx Server IP (${target_ip})`;

          names.push(target_name);

          data.markers.push(
            {
              name: target_name,
              coords: [parseFloat(target_data?.latitude), parseFloat(target_data?.longitude)],
              style: {
                r: WMAP_DOT_RADIUS + 4
              }
            }
          )

        }

        data.target = target_name;

        ip_locations.forEach((location, idx) => {

          name = `${location.city || ""} ${location.country || ""} (${location.ip})`;
          if (names.includes(name) || location.ip === target_ip) { } // do nothing
          else {

            names.push(name);

            let ip_details = public_ips.find(o => o.ip === location.ip);

            data.info.push({
              location: `${location.city}, ${location.country}`,
              ip: location.ip,
              frequency: ip_details.logs?.length
            });

            data.markers.push(
              {
                name: name,
                coords: [parseFloat(location?.latitude), parseFloat(location?.longitude)],
                style: {
                  r: WMAP_DOT_RADIUS
                }
              }
            )

            data.lines.push(
              {
                from: name,
                to: target_name
              }
            )

          }

        });

        if (data) {

          return res.render("components/world-map", {
            no_layout: true,
            data,
            target: target_name,
            range: {
              from: from_range,
              to: to_range,
              min: 0,
              max: 24
            }
          });

        } else {

          return res.status(404).send(NOT_FOUND_MESSAGE);

        }

      } catch (err) {

        // internal server error
        next(err);

      }

    })

})

app.get("/world/map/info", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let ip = req.query.ip;
        let ip_info = await database.collection(DB.w_map).find({ ip }).limit(1).toArray() || {};
        let logs = ip_info[0]?.logs || [];
        let logs_data = [];

        if (logs.length > 0) {

          logs_data = await database.collection(getLogCollection()).find({
            id: { $in: logs }
          }).limit(LOGS_ON_DASHBOARD).toArray() || [];

        }

        return res.render("./components/body/map-info.ejs", {
          no_layout: true,
          ip, len: logs.length,
          data: logs_data,
          table: {
            dropdown: false,
            actions: false,
            loadmore: false,
            headers: [
              {
                text: "Timestamp", handler: (data) => {
                  let timestamp = new Date(data.timestamp);
                  return timestamp.toLocaleString()
                }
              },
              { text: "Log ID", value: "id", class: "text-center" },
              { text: "Agent ID", handler: (data) => data.agent.id, class: "text-center" },
              { text: "Source", value: "source", class: "text-center" },
              {
                text: "Destination IP", class: "text-center", handler: (data) => {
                  return data.destination;
                }
              }
            ]
          }
        })

      } catch (error) {

        // errors with the calculation
        console.error(error);
        res.status(500).send(false);

      }

    })

})

app.get("/vulnerabilities/tab/:tab", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.params.tab || "daily";
        let tenants = await database.collection(DB.tenants).find({}).project({ tenant_id: 1 }).toArray() || [];

        return res.render("pages/dashboard", {
          title: "System-Vulnerabilities",
          file: "vulnerabilities",
          table: {
            url: `/dashboard/vulnerabilities/tab/${tab}/data`,
            query: {},
            dropdown: false,
            actions: false,
            headers: [
              { text: "Time" },
              {
                text: "Tenant", filters: tenants.map(tenant => {
                  return {
                    name: "Tenant " + tenant.tenant_id,
                    field: "tenant_id",
                    value: tenant.tenant_id
                  }
                })
              },
              { text: "CVE ID" },
              { text: "Agent ID", class: "text-center" },
              { text: "Agent Name", class: "text-center" },
              { text: "Information", class: "text-center" }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/vulnerabilities/tab/:tab/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let tab = req.params.tab || "daily";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.v_cve;
      let archive = false;
      let fetch_collection = "v_cve";

      if (tab === "archive") {

        collection = DB.v_cve_a;
        fetch_collection = "v_cve_a";
        archive = true;

      }

      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        if (result.length > 0) {

          return res.render("components/table/cve-table-data", {
            no_layout: true,
            data: result,
            fetch_collection, archive
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

})

app.get("/risks/monitor", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.query.tab || 'weekly';
        res.render("pages/dashboard", {
          title: "Risks-Monitor",
          track: "Risks",
          file: 'risks-monitor',
          active: tab,
          timing: "weekly"
        });

      } catch (err) {

        next(err);

      }
    })

})

app.get("/risks/monitor/data", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let timing = req.query.timing || "weekly";
        let data = {};

        let range = 7;

        if (timing == "monthly") range = 30;

        data = {
          range: [],
          low_risks: [],
          medium_risks: [],
          high_risks: []
        };

        for (let i = range - 1, j = 0; i >= 0; i--, j++) {

          // set default amount 0
          data.low_risks.push(0);
          data.medium_risks.push(0);
          data.high_risks.push(0);

          // set dates respectively
          let today = new Date();
          today.setDate(today.getDate() - i);
          let date = today.toISOString().split("T")[0];

          data.range.push(date);

        };

        let risks = [];
        let today = new Date();
        today.setDate(today.getDate() - range);
        let date = today.toISOString().split("T")[0];

        risks = await database.collection(DB.risks).find({
          date: { $gte: date }
        }).toArray() || [];

        // overflow calculation
        for (const info of risks) {

          let index = data.range.indexOf(info.date);

          if (index > -1) {

            let low_risks = Math.ceil(info.low_risks || 0);
            let medium_risks = Math.ceil(info.medium_risks || 0);
            let high_risks = Math.ceil(info.high_risks || 0);

            let overflow = (low_risks + medium_risks + high_risks) - 100;

            if (low_risks > medium_risks) {

              if (low_risks > high_risks) {

                low_risks -= overflow;

              } else if (high_risks > low_risks) {

                high_risks -= overflow;

              }

            } else {

              if (medium_risks > high_risks) {

                medium_risks -= overflow;

              } else if (high_risks > medium_risks) {

                high_risks -= overflow;

              }

            }

            data.low_risks[index] = low_risks || 0;
            data.medium_risks[index] = medium_risks || 0;
            data.high_risks[index] = high_risks || 0;

          }

        }

        return res.send(data);

      } catch (err) {
        console.error(err);
        return res.send(false);
      }
    })

})

app.get("/eitix/logs", permit("syslog"), (req, res, next) => {

  let tab = req.query.type || "system";

  getDatabase()
    .then(async database => {


      database.collection(DB.eitix).findOne({
        title: "EITIx"
      })
        .then(async results => {

          res.render("pages/dashboard", {
            title: "Logs",
            track: "System",
            file: 'eitix-logs',
            active: tab,
            cleaner: results
          });

        })

    });

})

app.get("/fim/monitor", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let timing = req.query.timing || "weekly";
        let data = {};
        let today = new Date();
        let date = today.toISOString().split("T")[0];

        if (timing == "monthly") range = 30;

        data = {
          fca_range: [],
          fca_changes: []
        };

        let fca_changes = await database.collection(DB.fca).find({ date })
          .sort({
            _id: -1
          }).limit(1).toArray() || [];

        let today_fca_changes = fca_changes[0] || [];

        today_fca_changes.agents?.sort((a, b) => {
          return parseInt(a.agent) - parseInt(b.agent);
        });

        today_fca_changes.agents?.forEach(agent => {
          data.fca_range.push(agent.agent);
          data.fca_changes.push(agent.changes);
        });

        res.render("pages/dashboard", {
          title: "FIM-Graph",
          track: "FIM",
          file: 'fim-monitor',
          data, timing
        });

      } catch (err) {

        next(err);

      }
    })

})

app.get("/fim/monitor/data", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let timing = req.query.timing || "weekly";
        let data = {};
        let range = 7;

        if (timing == "monthly") range = 30;

        data = {
          fcd_range: [],
          fcd_changes: []
        };

        for (let i = range - 1, j = 0; i >= 0; i--, j++) {

          // set dates respectively
          let today = new Date();
          today.setDate(today.getDate() - i);
          let date = today.toISOString().split("T")[0];

          data.fcd_changes.push(0);
          data.fcd_range.push(date);

        };

        let fim_date = await database.collection(DB.fcd).find()
          .sort({
            _id: -1
          }).limit(range).toArray() || [];

        for (const info of fim_date) {

          let index = data.fcd_range.indexOf(info.date);

          if (index > -1) {

            data.fcd_changes[index] = info.changes;

          }

        }

        return res.send(data);

      } catch (err) {

        console.error(err);
        return res.send(false);

      }
    })

})

app.get("/fim/changes/tab/:tab", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.params.tab || "daily";

        let agent_list = await database.collection(DB.fim).distinct("agent");
        let tenants = await database.collection(DB.tenants).find({}).project({ tenant_id: 1 }).toArray() || [];

        return res.render("pages/dashboard", {
          title: "FIM-Change-History",
          track: "FIM",
          file: 'fim-changes',
          active: tab,
          agent_list,
          table: {
            url: `/dashboard/fim/changes/tab/daily/data`,
            query: {},
            dropdown: true,
            actions: false,
            headers: [
              { text: "Time" },
              {
                text: "Tenant", filters: tenants.map(tenant => {
                  return {
                    name: "Tenant " + tenant.tenant_id,
                    field: "tenant_id",
                    value: tenant.tenant_id
                  }
                })
              },
              { text: "Filename" },
              {
                text: "Agent ID", class: "text-center", filters: agent_list.map(agent => {
                  return {
                    name: "Agent ID " + agent,
                    field: "agent",
                    value: agent
                  }
                })
              },
              {
                text: "Event", class: "text-center", filters: [
                  {
                    name: "Modified Files",
                    field: "event",
                    value: "modified"
                  },
                  {
                    name: "Added Files",
                    field: "event",
                    value: "added"
                  },
                  {
                    name: "Deleted Files",
                    field: "event",
                    value: "deleted"
                  }
                ]
              },
              { text: "Changes", class: "text-center" }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/fim/changes/tab/:tab/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let tab = req.params.tab || "daily";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.fim;

      if (tab === "archive") {

        collection = DB.fim_a;
        fetch_collection = "fim_a";
        archive = true;

      }

      let filter = getMongoQuery(req.query);


      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        if (result.length > 0) {

          return res.render("components/table/fim-table-data", {
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

})

app.get("/ioc/monitor", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let timing = req.query.timing || "weekly";
      let range = 7;

      if (timing == "monthly") range = 30;

      let monitor = {
        iocd_range: [],
        iocd_total: [],
        ioce_total: []
      };

      for (let i = range - 1, j = 0; i >= 0; i--, j++) {

        // set dates respectively
        let today = new Date();
        today.setDate(today.getDate() - i);
        let date = today.toISOString().split("T")[0];

        monitor.iocd_total.push(0);
        monitor.ioce_total.push(0);
        monitor.iocd_range.push(date);

      };

      let iocd_val = [];

      let today = new Date();
      today.setDate(today.getDate() - range);
      let date = today.toISOString().split("T")[0];

      iocd_val = await database.collection(DB.iocd).find({
        date: { $gte: date }
      }).toArray() || [];

      for (const info of iocd_val) {

        let index = monitor.iocd_range.indexOf(info.date);

        if (index > -1) {

          monitor.iocd_total[index] = info.total;
          monitor.ioce_total[index] = info.total_events;

        }

      }

      return res.send(monitor);

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  })

})

app.get("/ioc/tab/:tab", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let sources = await database.collection(DB.ioc).distinct('source') || [];
      let tenants = await database.collection(DB.tenants).find({}).project({ tenant_id: 1 }).toArray() || [];

      return res.render("pages/dashboard", {
        title: "IoC-Monitor",
        track: "IoC",
        file: "ioc",
        timing: "weekly",
        table: {
          dropdown: true,
          actions: false,
          url: `/dashboard/ioc/tab/daily/data`,
          query: req.query,
          headers: [
            { text: "Time" },
            {
              text: "Tenant",
              filters: tenants.map(tenant => {
                return {
                  name: "Tenant " + tenant.tenant_id,
                  field: "tenant_id",
                  value: tenant.tenant_id
                }
              })
            },
            {
              text: "Source", filters: sources.map(source => {
                return {
                  name: "Source: " + source,
                  field: "source",
                  value: source
                }
              })
            },
            { text: "Data" },
            {
              text: "Malicious", class: "text-center", filters: [
                {
                  name: "Malicious Found",
                  field: "ioc_count",
                  value: "0"
                },
                {
                  name: "10 Malicious Events+",
                  field: "ioc_count",
                  value: "10"
                }
              ]
            },
            {
              text: "Response", class: "text-center", filters: [
                {
                  name: "Successful Response",
                  field: "response",
                  value: "Success"
                },
                {
                  name: "Failed Response",
                  field: "response",
                  value: "Failed"
                }
              ]
            },
          ]
        }
      });


    } catch (err) {
      next(err)
    }

  });

})

app.get("/ioc/tab/:tab/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let tab = req.params.tab || "daily";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.ioc;
      let archive = false;

      if (tab === "archive") {

        archive = true;
        collection = DB.a_ioc;

      }

      let filter = getMongoQuery(req.query, {
        ioc_count: {
          type: "int",
          operator: "gte",
        }
      });

      /* console.log("board.js", req.query, filter); */

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        if (result.length > 0) {

          return res.render("components/table/ioc-table-data", {
            no_layout: true, archive,
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

})

app.get("/ioc/manage", permit("control"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      const ioc_data = await database.collection(DB.eitix).findOne({ title: "ioc" }) || {};

      res.render("pages/dashboard", {
        title: "IoC-Management",
        track: "IoC",
        file: "ioc-management",
        data: ioc_data || {}
      });

    } catch (err) {

      next(err);

    }

  })

})

app.post("/ioc/manage/whitelist", permit("control"), (req, res, next) => {

  const new_list = req.body.domains?.replace(/\s/g, '').split(",");

  MongoCRUD.update(req, res, next, {
    collection: DB.eitix,
    filter: { title: "ioc" },
    data: {
      $set: {
        whitelist: new_list
      }
    },
    success: "Domain whitelist updated successfully"
  });

})

app.get("/workflow", permit("manageUser"), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.params.tab || "active";

        return res.render("pages/dashboard", {
          title: "All-workflow",
          file: "workflow",
          track: "Workflow",
          active: { tab: "ticket" },
          table: {
            url: `/dashboard/workflow/data`,
            query: {},
            dropdown: true,
            actions: true,
            headers: [
              { text: "Workflow ID" },
              { text: "Workflow Name", },
              { text: "Users", class: "text-center" },
              { text: "Escalation Phases", class: "text-center" }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/workflow/data", permit("manageUser"), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let page = parseInt(req.query.page) || 1;
        let collection = DB.workf;

        let filter = getMongoQuery(req.query);

        if (req.query.count === "1") {

          const total_results = await database.collection(collection).countDocuments(filter);
          return res.json({ total: total_results });

        } else {

          // no_f = limit(30) should be dynamic which defines how much data to send at a time
          // sometimes it can be 1 or 30 depending on the query
          let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

          // get all user here so we don't have to call it multiple times
          // it is done because we expect few users in this platform (1-5000)
          let all_users = await database.collection(DB.users).find({}).toArray();

          result.forEach(each_workflow => {

            let processed_users = [];

            raw_users = each_workflow?.users;

            raw_users?.forEach(user_str => {

              // user_str = type-user_sid-forward_type
              // no_f = do something smart here or handle the error
              if (typeof user_str === "string") {

                let user_raw_values = user_str?.split("-");
                let user_sid = user_raw_values[1];
                let phase = user_raw_values[0];
                let forward_type = user_raw_values[2];

                // user must be taken from database as data can be changed later by the user
                let user = all_users.find(each_user => each_user.sid == user_sid) || {};

                processed_users.push({
                  sid: user_sid, role: user.role,
                  full_name: user.full_name,
                  profile_image: user.profile_image,
                  phase, forward_type
                })

              }

            });

            each_workflow.users = processed_users;

          });

          if (result.length > 0) {

            return res.render("components/table/workflow-table-data", {
              no_layout: true,
              data: result,
            });

          } else {

            return res.send(false);

          }

        }

      } catch (err) {
        // server error
        next(err)
      }


    })

});

app.get("/workflow/create", permit("manageUser"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      return res.status(200).render("pages/dashboard", {
        title: `Create-workflow`,
        file: "create-workflow",
        track: "Workflow",
        data: {}
      });

    } catch (err) {

      next(err);

    }

  });

});

app.get("/workflow/update", permit("manageUser"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let data = await database.collection(DB.workf).findOne({ _id: ObjectId(req.query.id) }) || {};

      return res.status(200).render("pages/dashboard", {
        title: `Update-workflow`,
        file: "create-workflow",
        track: "Workflow", data
      });

    } catch (err) {

      next(err);

    }

  });

});

app.post("/workflow/create", permit("manageUser"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let body = req.body;

      body.users = toArray(body.users);
      body.interval = toArray(body.interval);
      body.interval_h = toArray(body.interval_h);
      body.interval_m = toArray(body.interval_m);

      // users can't be in a string
      // then each character will be treated as a user
      if (typeof body.users === "string") {
        body.users = [body.users];
      }

      // it'll update in either operation
      body.updated = new Date();

      if (body?.updating === "true") {

        body.editor = req.session.email;
        let id = body.id;

        // remove fields that exists in the view but shouldn't be updated
        // this is objectID (already there in mongodb)
        delete body.id;
        // this is to detect if it's an update, no further use
        delete body.updating;

        await database.collection(DB.workf).updateOne({ _id: ObjectId(id) }, {
          $set: body
        });

        req.flash("success", "Workflow was updated successfully");
        res.redirect("/dashboard/workflow");
        actLog(`User(${req.session.email}) created a new workflow`);

      } else {

        // set default values
        body.date = new Date();
        body.author = req.session.email;
        body.editor = req.session.email;

        MongoCRUD.seqInsert(req, res, next, {
          prefix: "EWF",
          collection: DB.workf,
          data: body,
          redirect: `/dashboard/workflow`
        })

      }

    } catch (err) {

      next(err);

    }

  })

});

app.post("/workflow/delete", permit("manageUser"), (req, res, next) => {

  let id = ObjectId(req.body.id);

  if (id) {

    MongoCRUD.delete(req, res, next, {
      collection: DB.workf,
      filter: { _id: ObjectId(req.body.id) }
    });
    actLog(`User(${req.session.email}) deleted a workflow`);

  } else {

    // flash
    req.flash("error", "Workflow ID not found. This is corrupted data. Please contact support");
    res.redirect("/dashboard/workflow");

  }

});

app.get("/workflow/info", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let sid = req.query.sid;

      if (sid) {

        let workflow = await database.collection(DB.workf).findOne({ sid }) || {};

        // get all user here so we don't have to call it multiple times
        // it is done because we expect few users in this platform (1-5000)
        let all_users = await database.collection(DB.users).find({}).toArray();

        let processed_users = [];

        raw_users = workflow?.users;

        raw_users?.forEach(user_str => {

          // user_str = type-user_sid-forward_type
          // no_f = do something smart here or handle the error
          if (typeof user_str === "string") {

            let user_raw_values = user_str?.split("-");
            let user_sid = user_raw_values[1];
            let phase = user_raw_values[0];
            let forward_type = user_raw_values[2];

            // user must be taken from database as data can be changed later by the user
            let user = all_users.find(each_user => each_user.sid == user_sid) || {};

            processed_users.push({
              sid: user_sid, role: user.role,
              full_name: user.full_name,
              phase, forward_type
            })

          }

        });

        workflow.users = processed_users;

        return res.send(workflow);

      } else {

        return res.send(false);

      }

    } catch (err) {

      next(err);

    }

  })

});

app.get("/notifications/monitor", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.query.tab || 'weekly';

        return res.status(200).render("pages/dashboard", {
          title: `monitor-notifications`,
          file: "reports/notifications-monitor",
          track: "Notifications",
          active: tab
        });

      } catch (err) {
        next(err);
      }

    })

})

app.get("/notifications/monitor/data", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let timing = req.query.timing || "weekly";
        let data = {};

        let range = 7;

        if (timing == "monthly") range = 30;
        data = {
          range: [],
          emails_sent: [],
          sms_sent: []
        };

        for (let i = range - 1, j = 0; i >= 0; i--, j++) {

          // set default amount 0
          data.emails_sent.push(0);
          data.sms_sent.push(0);

          // set dates respectively
          let today = new Date();
          today.setDate(today.getDate() - i);
          let date = today.toISOString().split("T")[0];

          data.range.push(date);

        };

        let track_data = await database.collection(DB.track).find()
          .sort({
            _id: -1
          }).limit(range).toArray() || [];

        for (const info of track_data) {

          let index = data.range.indexOf(info.date);

          if (index > -1) {

            data.emails_sent[index] = info.emails_sent || 0;
            data.sms_sent[index] = info.sms_sent || 0;

          }

        }

        return res.send(data);

      } catch (err) {

        console.error(err);
        return res.send(false);

      }

    })

});


app.get("/notifications/list/queue", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        return res.render("pages/dashboard", {
          title: `notification-queue`,
          track: "Notifications",
          file: "reports/notifications-queue",
          table: {
            url: `/dashboard/notifications/list/data/queue`,
            query: {},
            dropdown: false,
            actions: false,
            headers: [
              { text: "Time", value: "sent", type: "date" },
              { text: "Source", value: "source", truncate: 10 },
              { text: "Message ID", value: "message_id", truncate: 20 },
              { text: "Status", value: "status", class: "text-center" },
              { text: "Receiver", value: "receiver", truncate: 40 },
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/notifications/list/:channel", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let time = new Date();
        let today = time.toISOString().split("T")[0];
        let property = "emails_sent";
        let collection = DB.rep_email;
        let channel = req.params.channel || 'email';
        let file = "reports/notifications-list";

        if (channel == 'sms') {
          property = "sms_sent";
          collection = DB.rep_sms;
          file = "reports/notifications-list-sms";
        }

        const sent_daily = await database.collection(DB.track).findOne({ date: today }) || {};

        const sent_monthly = await database.collection(DB.track).aggregate([
          { $match: { $expr: { $eq: [{ $substr: ["$date", 0, 7] }, today.slice(0, 7)] } } },
          { $group: { _id: null, total: { $sum: "$" + property } } }
        ]).toArray() || [];

        const startOfWeek = new Date(time.setDate(time.getDate() - time.getDay()));
        const startOfWeekStr = startOfWeek.toISOString().split("T")[0];
        const sent_weekly = await database.collection(DB.track).aggregate([
          { $match: { date: { $gte: startOfWeekStr } } },
          { $group: { _id: null, total: { $sum: "$" + property } } }
        ]).toArray() || [];

        const counts = {
          sent_daily: sent_daily[property],
          sent_monthly: sent_monthly[0]?.total,
          sent_weekly: sent_weekly[0]?.total
        }

        if (channel === 'email') {

          return res.render("pages/dashboard", {
            title: `${channel}-notifications`,
            track: "Notifications",
            file: "reports/notifications-list", counts,
            table: {
              url: `/dashboard/notifications/list/data/${channel}`,
              query: {},
              dropdown: false,
              actions: false,
              headers: [
                { text: "Time", value: "sent", type: "date" },
                { text: "Source", value: "source", truncate: 10 },
                { text: "Message ID", value: "message_id", truncate: 20 },
                { text: "Status", value: "status", class: "text-center" },
                { text: "Receiver", value: "receiver", truncate: 40 },
              ]
            }
          });

        } else {

          return res.render("pages/dashboard", {
            title: `${channel}-notifications`,
            track: "Notifications",
            file: "reports/notifications-list-sms", counts,
            table: {
              url: `/dashboard/notifications/list/data/${channel}`,
              query: {},
              dropdown: false,
              actions: false,
              headers: [
                { text: "Time", value: "sent", type: "date" },
                { text: "Source", },
                { text: "Message ID" },
                { text: "Status", value: "status", class: "text-center" },
                { text: "Characters", class: "text-center" },
                { text: "Receiver", value: "receiver", truncate: 40 },
              ]
            }
          });

        }

      } catch (err) {
        // server error
        next(err)
      }w

    })

});

app.get("/notifications/list/data/:channel", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page = parseInt(req.query.page) || 1;
      let collection = DB.rep_email;
      let channel = req.params.channel || 'email';

      if (channel == 'sms') {
        collection = DB.rep_sms;
      } else if (channel == 'queue') {
        collection = DB.rep_q;
      }

      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        if (result.length > 0) {

          return res.render("components/table/report-list-table-data", {
            no_layout: true,
            data: result,
            channel
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

app.get("/notifications/list/:channel", async (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let time = new Date();
      let today = time.toISOString().split("T")[0];
      let property = "emails_sent";
      let collection = DB.rep_email;
      let channel = req.params.channel || 'email';
      let file = "reports/notifications-list";

      if (channel == 'sms') {
        property = "sms_sent";
        collection = DB.rep_sms;
        file = "reports/notifications-list-sms";
      }

      const sent_daily = await database.collection(DB.track).findOne({ date: today }) || {};

      const sent_monthly = await database.collection(DB.track).aggregate([
        { $match: { $expr: { $eq: [{ $substr: ["$date", 0, 7] }, today.slice(0, 7)] } } },
        { $group: { _id: null, total: { $sum: "$" + property } } }
      ]).toArray() || [];

      const sent_all = await database.collection(DB.track).aggregate([
        { $group: { _id: null, total: { $sum: "$" + property } } }
      ]).toArray() || [];

      const counts = {
        sent_daily: sent_daily[property],
        sent_monthly: sent_monthly[0]?.total,
        sent_all: sent_all[0]?.total
      }

      MongoCRUD.dataLoad(req, res, next, {

        collection, filter: {},
        sort: { _id: -1 }

      }, data => {

        return res.status(200).render("pages/dashboard", {
          ...data, counts, file,
          title: `${channel}-notifications`,
          track: "Notifications",
          query: null
        });

      })

    } catch (err) {
      next(err)
    }

  })

});


// other routers
const wazuh_router = require("./wazuh");
const surface_router = require("./surface");
const asset_router = require("./asset");
const setting_router = require("./setting");
const report_router = require("./report");
const template_router = require("./template");
const ai_router = require("./ai");
const uba_router = require("./uba");
const { ObjectId } = require("mongodb");

app.use("/ai", ai_router);
app.use("/assets", asset_router);
app.use("/surface", surface_router);
app.use("/wazuh", wazuh_router);
app.use("/settings", setting_router);
app.use("/uba", uba_router);
app.use("/templates", permit('control'), template_router);
app.use("/", permit('report'), report_router);
app.use("/", require("./darkweb"));

// must be at the bottom
// 404 error for wrong dashboard route
app.get("*", (req, res, next) => {

  res.render("pages/dashboard", {
    title: "Wrong Route!",
    file: '404-not-found.ejs'
  });

});

module.exports = app;