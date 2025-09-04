// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  getMongoQuery,
  getLogCollection,
  access
} = require("../libraries/globals");
const { ObjectId } = require("mongodb");
const path = require("path");

// starts with "dashboard/uba"

app.get("/", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        res.render("pages/dashboard", {
          title: "Monitor-UBA",
          track: "UBA",
          file: 'uba-monitor',
        });

      } catch (err) {

        next(err);

      }
    })

})

app.get("/alerts", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        res.render("pages/dashboard", {
          title: "UBA-alerts",
          track: "UBA",
          file: 'uba-alerts',
          table: {
            url: `/dashboard/uba/alerts/data/daily`,
            query: {},
            dropdown: true,
            actions: access("admin", req.session.permissions) ? true : false,
            headers: [
              { width: "18%", text: "Time" },
              { width: "20%", text: "Username" },
              { text: "Attack Trend", class: "text-center" },
              { text: "Trend Risk", class: "text-center" }
            ]
          }
        });

      } catch (err) {

        next(err);

      }
    })

})

app.get("/alerts/data/:tab", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let page = parseInt(req.query.page) || 1;
        let collection = DB.uba_alerts;
        let tab = req.params.tab || "daily";

        if (tab === "archive") {
          collection = DB.uba_alerts_a;
        }

        let filter = getMongoQuery(req.query);

        if (req.query.count === "1") {

          const total_results = await database.collection(collection).countDocuments(filter);
          return res.json({ total: total_results });

        } else {

          let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

          if (result.length > 0) {

            return res.render("components/table/uba-alerts-table-data", {
              no_layout: true, active: tab,
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

app.post("/alerts/delete/:type", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let id = req.body.id;
        let type = req.params.type;
        let collection = DB.uba_alerts;

        if (type == "archive") {

          collection = DB.uba_alerts_a;
          
        }

        await database.collection(collection).deleteOne({ _id: ObjectId(id) });

        return res.send({ status: "Alert deleted successfully" });

      } catch (err) {

        console.error(err);
        return res.send(false);

      }

    })

})

app.get("/activity", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let users = await database.collection(DB.uba_acts).distinct("username");

        res.render("pages/dashboard", {
          title: "User-Activity",
          track: "UBA",
          file: 'uba-activity',
          table: {
            url: `/dashboard/uba/activity/data/daily`,
            query: {},
            dropdown: false,
            actions: false,
            headers: [
              { text: "Time" },
              { text: "Username", property: "username" },
              { text: "Source IP", class: "text-center", property: "agent_ip" },
              { text: "Destination IP", class: "text-center" },
              { text: "Sequence", class: "text-center" },
              { text: "Frequency", class: "text-center" },
              { text: "Action", property: "action" },
            ]
          }
        });

      } catch (err) {

        next(err);

      }
    })

})

app.get("/activity/data/:tab", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.params.tab || "daily";
        let page = parseInt(req.query.page) || 1;
        let collection = DB.uba_acts;

        if (tab === "archive") {
          collection = DB.uba_acts_a;
        }

        let filter = getMongoQuery(req.query);

        if (req.query.count === "1") {

          const total_results = await database.collection(collection).countDocuments(filter);
          return res.json({ total: total_results });

        } else {

          let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

          if (result.length > 0) {

            return res.render("components/table/uba-table-data", {
              no_layout: true, tab,
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

app.get("/activity/logs", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let id = req.query.id ? ObjectId(req.query.id) : null;
      let type = req.query.type || "daily";
      let collection = DB.uba_acts;

      if (type === "archive") {

        collection = DB.uba_acts_a;

      }

      if (id) {

        let act = await database.collection(collection).findOne({ _id: id });

        if (!act) {

          return res.send("Activity log does not found");

        }

        let logs = act.logs || [];

        let logs_data = await database.collection(getLogCollection()).find({
          id: { $in: logs }
        }).project({
          id: 1, rule: 1, agent: 1, timestamp: 1
        }).toArray() || [];

        if (logs_data.length < 1) {

          logs_data = logs.map(item => ({ id: item }))

        }

        return res.render("components/popup/uba-activity-logs", {
          no_layout: true, act,
          logs: logs_data
        });

      } else {

        return res.status(400).send("Bad request: id not given");

      }

    } catch (err) {

      next(err);

    }

  });

})

app.get("/users/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let type = req.params.type || "user";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.uba_users;

      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        return res.render("components/table/uba-users-table-data", {
          no_layout: true, page,
          data: result,
          active: type
        });

      }

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  })

});

app.post("/users/update", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;

        await database.collection(DB.uba_users).updateOne({
          _id: ObjectId(body.id)
        }, {
          $set: {
            username: body.username,
            fullname: body.fullname,
            type: body.type
          }
        }).then((result) => {
          return res.send({ status: "User updated successfully" });
        }).catch(error => {
          console.error(error);
          return res.status(500).send({ error: error.toString() })
        })

      } catch (error) {

        console.error(error);
        return res.status(500).send({ error: error.toString() })

      }

    });

});

app.post("/users/create", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;

        let duplicate = await database.collection(DB.uba_users).findOne({ username: body.username });

        if (duplicate) {
          return res.status(400).send({ error: "This username already exists" });
        }

        let sid = await MongoCRUD.getSID(database, {
          collection: DB.uba_users,
          prefix: "EUBA"
        });

        await database.collection(DB.uba_users).insertOne({
          sid,
          username: body.username,
          fullname: body.fullname,
          type: body.type
        }).then((result) => {
          return res.send({ status: "New user created successfully" });
        }).catch(error => {
          console.error(error);
          return res.send({ error })
        })

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.post("/users/delete", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let id = req.body.id;

        await database.collection(DB.uba_users).deleteOne({
          _id: ObjectId(id)
        }).then((result) => {
          return res.send({ status: "User deleted permanently!" });
        }).catch(error => {
          console.error(error);
          return res.send({ error })
        })

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.get("/export/:page_name", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page_name = req.params.page_name;
      let data;
      let filename;

      if (page_name === 'users') {

        data = await database.collection(DB.uba_users).find({}).project({ _id: 0, sid: 0 }).toArray();
        filename = 'uba-users.json';

      } else if (page_name === 'patterns') {

        data = await database.collection(DB.uba_pats).find({}).project({ _id: 0, sid: 0 }).toArray();
        filename = 'uba-patterns.json';

      } else if (page_name === 'actions') {

        data = await database.collection(DB.uba_actions).find({}).project({ _id: 0, sequence: 0 }).toArray();
        filename = 'uba-actions.json';

      } else {

        req.flash("error", "Invalid request detected!");
        return res.redirect(req.get('Referrer') || '/');

      }

      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(data);

    } catch (err) {

      console.error(err);
      req.flash("error", "Server error encountered!");
      return res.redirect(req.get('Referrer') || '/');

    }

  })

});

app.get("/export/:page_name/csv", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page_name = req.params.page_name;
      let data;
      let filename;

      if (page_name === 'users') {

        data = await database.collection(DB.uba_users).find({}).project({ _id: 0, sid: 0 }).toArray();
        filename = 'uba-users.csv';

      } else {

        req.flash("error", "Invalid request detected!");
        return res.redirect(req.get('Referrer') || '/');
      }

      let csv = "";
      let headers = ['username', 'fullname', 'type'];
      csv += `${headers.join(",")}\n`;
      data.forEach((item) => {
        let line = "";
        headers.forEach((key) => {
          if (line != "") line += ",";
          line += item[key] ? `${item[key]}` : 'N/A';
        });
        csv += `${line}\n`;
      });

      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      res.status(200).send(csv);

    } catch (err) {

      console.error(err);
      req.flash("error", "Server error encountered!");
      return res.redirect(req.get('Referrer') || '/');

    }

  })

});

app.post("/import/:page_name", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page_name = req.params.page_name;
      let raw_data = req.body.data_str;
      let data = null;
      let collection = null;

      if (page_name === 'patterns') {

        data = JSON.parse(raw_data);

        if (data && data.length > 0) {

          collection = DB.uba_pats;

          for (let i = 0; i < data.length; i++) {

            let item = data[i];

            let sid = await MongoCRUD.getSID(database, {
              collection, prefix: "EUPAT"
            });

            let pattern = item.pattern.replace(/\s/g, '');

            await database.collection(collection).updateOne({ pattern: pattern }, {
              $set: {
                sid,
                implication: item.implication,
                priority: item.priority
              }
            }, { upsert: true });

          };

        } else {

          return res.send({ error: "Imported file is not valid!" });

        }

      } else if (page_name === 'actions') {

        data = JSON.parse(raw_data);

        if (data && data.length > 0) {

          collection = DB.uba_actions;
          let new_sequence = await database.collection(collection).countDocuments() + 1;

          for (let i = 0; i < data.length; i++) {

            let item = data[i];

            const result = await database.collection(collection).updateOne({ action: item.action }, {
              $setOnInsert: {
                sequence: new_sequence
              },
              $set: {
                description: item.description,
                metadata: item.metadata,
                category: item.category
              }
            }, { upsert: true });

            if (result.upsertedCount > 0) {
              new_sequence = await database.collection(collection).countDocuments() + 1;
            }

          };

        } else {

          return res.send({ error: "Imported file is not valid!" });

        }

      } else {

        return res.send({ error: "Invalid request detected!" });

      }

      res.status(200).send({ status: "Data imported successfully" });

    } catch (err) {

      console.error(err);
      return res.send({ error: err.toString() });

    }

  })

});

app.post("/import/:page_name/csv", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page_name = req.params.page_name;
      let csv_data = req.body.data_str;
      let data = null;
      let collection = null;

      if (page_name === 'users') {

        data = csv_data.split("\n").slice(1).map(item => {
          const [username, fullname, type] = item.split(",");
          return { username, fullname, type };
        });

        collection = DB.uba_users;

        for (let i = 0; i < data.length; i++) {

          let item = data[i];

          if (!item.username || item.username === '') continue;

          let sid = await MongoCRUD.getSID(database, {
            collection, prefix: "EUBA"
          });

          await database.collection(collection).updateOne({ username: item.username }, {
            $set: {
              sid,
              fullname: item.fullname,
              type: item.type
            }
          }, { upsert: true });

        };

      }

      res.status(200).send({ status: "Data imported successfully" });

    } catch (err) {

      console.error(err);
      return res.send({ error: err.toString() });

    }

  })

})

app.get("/patterns/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page = parseInt(req.query.page) || 1;
      let collection = DB.uba_pats;

      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        return res.render("components/table/uba-patterns-table-data", {
          no_layout: true, page,
          data: result,
        });

      }

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  })

});

app.post("/patterns/update", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;

        let pattern = body.pattern.replace(/\s/g, '')

        if (pattern.split(",").length < 2) return res.status(400).send({ error: "Pattern is not valid!" })

        await database.collection(DB.uba_pats).updateOne({
          _id: ObjectId(body.id)
        }, {
          $set: {
            pattern: pattern,
            implication: body.implication,
            priority: body.priority,
            risk: body.risk
          }
        }).then((result) => {
          return res.send({ status: "Pattern updated successfully" });
        }).catch(error => {
          console.error(error);
          return res.status(500).send({ error: error.toString() })
        })

      } catch (error) {

        console.error(error);
        return res.status(500).send({ error: error.toString() })

      }

    });

});

app.post("/patterns/create", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;
        let pattern = body.pattern.replace(/\s/g, '');

        if (pattern.split(",").length < 2) {
          return res.status(400).send({ error: "Pattern is not valid!" })
        }

        let duplicate = await database.collection(DB.uba_pats).findOne({ pattern });

        if (duplicate) {
          return res.status(400).send({ error: "This pattern already exists" });
        }

        let sid = await MongoCRUD.getSID(database, {
          collection: DB.uba_pats,
          prefix: "EUPAT"
        });

        await database.collection(DB.uba_pats).insertOne({
          sid, pattern,
          implication: body.implication,
          priority: body.priority
        }).then((result) => {

          return res.send({ status: "New pattern created successfully" });

        }).catch(error => {

          console.error(error);
          return res.send({ error })

        })

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.post("/patterns/delete", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let id = req.body.id;

        await database.collection(DB.uba_pats).deleteOne({
          _id: ObjectId(id)
        }).then((result) => {
          return res.send({ status: "Pattern deleted permanently!" });
        }).catch(error => {
          console.error(error);
          return res.send({ error })
        })

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.get("/list/:page", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let page = req.params.page;

        if (page === "users") {

          page = "users/csv";

          return res.render("pages/dashboard", {
            title: "UBA-users", page,
            track: "UBA",
            file: "d-table-page",
            table: {
              name: "UBA Users List",
              total_text: "Total active users:",
              url: `/dashboard/uba/users/data`,
              query: {},
              dropdown: false,
              actions: true,
              headers: [
                { width: "10%", text: "User ID", property: "sid" },
                { width: "20%", text: "Username", property: "username" },
                { width: "20%", text: "Full Name", property: "fullname" },
                { width: "20%", text: "Type", class: "text-center", property: "type" },
              ]
            }
          });

        } else if (page === "patterns") {

          return res.render("pages/dashboard", {
            title: "UBA-patterns", page,
            track: "UBA",
            file: "d-table-page",
            table: {
              name: "UBA Patterns List",
              total_text: "Total active patterns:",
              url: `/dashboard/uba/patterns/data`,
              query: {},
              dropdown: false,
              actions: true,
              headers: [
                { width: "13%", text: "ID", property: "sid" },
                { text: "Pattern", property: "pattern" },
                { width: "35%", text: "Implication", property: "implication" },
                { text: "Priority", class: "text-center", property: "priority" },
                { text: "Risk", class: "text-center", property: "risk" },
              ]
            }
          });

        } else if (page === "actions") {

          return res.render("pages/dashboard", {
            title: "UBA-actions", page,
            track: "UBA",
            file: "d-table-page",
            table: {
              name: "UBA Actions List",
              total_text: "Total actions listed:",
              url: `/dashboard/uba/list/actions/data`,
              query: {},
              dropdown: false,
              actions: true,
              headers: [
                { width: "10%", text: "Sequence", class: "text-center", property: "sequence" },
                { width: "20%", text: "Action", property: "action" },
                { width: "30%", text: "Description", property: "description" },
                { text: "Metadata", property: "metadata" },
                { text: "Category", class: "text-center", property: "category" },
              ]
            }
          });

        } else {

          req.flash("warning", "Page Not found!");
          return res.redirect(req.get('Referrer') || '/');

        }


      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/list/:page_name/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page_name = req.params.page_name;
      let page = parseInt(req.query.page) || 1; // this page is for pagination
      let filter = getMongoQuery(req.query);
      let sort_filter = { _id: -1 };
      let collection;

      if (page_name === "actions") {

        collection = DB.uba_actions;
        sort_filter = { sequence: 1 };

      } else {

        console.log("UBA: Page not found!");
        return res.send(false);

      }

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort(sort_filter).toArray() || [];

        return res.render("components/table/uba-actions-table-data", {
          no_layout: true, page,
          data: result,
          dropdown: false,
          values: [
            { property: "sequence", class: "text-center fw-bold" },
            { property: "action" },
            { property: "description" },
            { property: "metadata", truncate: 25 },
            { property: "category", class: "text-center" },
          ],
          actions: [
            {
              title: "Delete this action",
              body: "<i class='fa fa-trash'></i>",
              class: "btn-danger",
            }
          ],
        });

      }

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  })

});

// actions routes
// no_f = these should be merged in grouped routes

app.post("/actions/update", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;

        await database.collection(DB.uba_actions).updateOne({
          _id: ObjectId(body.id)
        }, {
          $set: {
            action: body.action,
            description: body.description,
            metadata: body.metadata,
            category: body.category
          }
        }).then((result) => {
          return res.send({ status: "An action updated successfully" });
        }).catch(error => {
          console.error(error);
          return res.status(500).send({ error: error.toString() })
        })

      } catch (error) {

        console.error(error);
        return res.status(500).send({ error: error.toString() })

      }

    });

});

app.post("/actions/create", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;

        let duplicate = await database.collection(DB.uba_actions).findOne({ action: body.action });

        if (duplicate) {
          return res.status(400).send({ error: "This action already exists" });
        }

        let sequence = await database.collection(DB.uba_actions).countDocuments() + 1;

        await database.collection(DB.uba_actions).insertOne({
          sequence,
          action: body.action,
          description: body.description,
          metadata: body.metadata,
          category: body.category
        }).then((result) => {
          return res.send({ status: "New action created successfully" });
        }).catch(error => {
          console.error(error);
          return res.send({ error })
        })

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.post("/actions/delete", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let id = req.body.id;

        await database.collection(DB.uba_actions).deleteOne({
          _id: ObjectId(id)
        }).then((result) => {
          return res.send({ status: "An action deleted permanently!" });
        }).catch(error => {
          console.error(error);
          return res.send({ error })
        })

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.get("/actions/description/:name", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let name = req.params.name;

        let result = await database.collection(DB.uba_actions).findOne({ action: name });

        if (result) {
          return res.send(result);
        } else {
          return res.status(404).send({ error: "Action not found" });
        }

      } catch (error) {

        console.error(error);
        return res.send({ error })

      }

    });

});

app.get("/assets/icons/:name", (req, res, next) => {

  try {

    let name = req.params.name.toLowerCase();
    let icon;

    switch (true) {
      case name.includes("Critical"):
        icon = "risk.png";
        break;
      case name.includes("login") || name.includes("log"):
        icon = "user-login.png";
        break;
      case name.includes("file"):
        icon = "file.png";
        break;
      case name.includes("privilege"):
        icon = "privilege.png";
        break;
      case name.includes("network") || name.includes("VPN"):
        icon = "network.png";
        break;
      case name.includes("access"):
        icon = "user-access.png";
        break;
      case name.includes("malware"):
        icon = "malware.png";
        break;
      case name.includes("security"):
        icon = "security-issue.png";
        break;
      case name.includes("software"):
        icon = "software-install.png";
        break;
      case name.includes("data") || name.includes("file"):
        icon = "data.png";
        break;
      case name.includes("email"):
        icon = "email.png";
        break;
      case name.includes("lock"):
        icon = "lock.png";
        break;
      case name.includes("session"):
        icon = "session.png";
        break;
      case name.includes("password"):
        icon = "password.png";
        break;
      case name.includes("system"):
        icon = "system.png";
        break;
      case name.includes("ransomware"):
        icon = "ransomware.png";
        break;
      case name.includes("suspicious"):
        icon = "ransomware.png";
        break;
      case name.includes("firewall"):
        icon = "firewall.png";
        break;
      case name.includes("firewall"):
        icon = "firewall.png";
        break;
      case name.includes("unauthorised"):
        icon = "unauthorised.png";
        break;
      case name.includes("script"):
        icon = "file.png";
        break;
      case name.includes("malicious"):
        icon = "file.png";
        break;
      case name.includes("ssh"):
        icon = "authentication.png";
        break;
      case name.includes("cpu"):
        icon = "cpu.png";
        break;
      case name.includes("docker"):
        icon = "system.png";
        break;
      case name.includes("increase"):
        icon = "network.png";
        break;
      case name.includes("cloud"):
        icon = "data.png";
        break;
      case name.includes("resource"):
        icon = "resource.png";
        break;
      case name.includes("drive"):
        icon = "endpoint.png";
        break;
      case name.includes("process"):
        icon = "system.png";
        break;
      case name.includes("api"):
        icon = "api.png";
        break;
      default:
        icon = "risk.png";
        break;
    }

    let filePath = path.join(__dirname, `../public/icons/${icon}`);
    res.sendFile(filePath);

  } catch (err) {

    next(err);

  }

});

module.exports = app;