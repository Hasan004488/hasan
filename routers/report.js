// modules
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express.Router();
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  EITIX,
  WLOG_IDFS,
  format,
  getMongoQuery,
  actLog,
  generateSearchQuery
} = require("../libraries/globals");
const { REPORTER } = require('../libraries/reporter');
const { ObjectId } = require("mongodb");
const { toArray } = format;
const DEFAULT_REPORTS = require("../libraries/data/default_reports");

app.get("/reports/schedule", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        return res.render("pages/dashboard", {
          title: "Report-Schedule",
          track: "Reports",
          file: "reports/report-schedule",
          table: {
            url: `/dashboard/reports/schedule/data/active`,
            query: {},
            dropdown: true,
            actions: true,
            headers: [
              { text: "Schedule ID" },
              { text: "Title" },
              { text: "Reporter" },
              { text: "Repetition" },
              { text: "Next Report On" },
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/reports/schedule/data/:tab", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let tab = req.params.tab || "active";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.rep_sch;

      let filter = getMongoQuery(req.query);

      if (tab == 'inactive') {
        filter.disabled = true;
      }
      else if (tab == 'active') {
        filter.disabled = { $ne: true };
      }

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        let result_item = result[0];

        if (result_item) {

          let result_users = toArray(result_item?.users);

          if (result_users && result_users?.length > 0) {
            let user_sids = result_users.map(u => {
              if (u) return u.split("-")[1]
            })
            result_item.users = await database.collection(DB.users).find({ sid: { $in: user_sids } }).toArray() || [];
          }

          return res.render("components/table/schedule-table-data", {
            no_layout: true,
            data: [result_item],
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


app.get("/reports/schedule/create", (req, res, next) => {

  getDatabase()
    .then(async database => {

      let templates = await database.collection(DB.temps).find({ type: 'schedule' }).project({ title: 1, sid: 1 }).toArray() || [];
      let quick_reports = DEFAULT_REPORTS.filter(r => r.type !== 'detailed');

      res.render("pages/dashboard", {
        title: "Create-Report-Schedule",
        track: "Reports",
        file: 'create-schedule',
        schedule: {},
        data: quick_reports, templates,
      });

    })

});

app.post("/reports/schedule/create", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;

        body.users = toArray(body.users);

        let repeat = parseInt(body.repeat);
        body.repeat = repeat;

        if (body.reports?.length < 1) {

          req.flash("error", "Schedule must have atleast one report");
          return res.redirect(req.get('Referrer') || '/');

        }

        if (body?.updating === "true") {

          // these fields shouldn't be updated by user
          delete body.disabled;
          delete body.last_report;
          delete body.next_report;
          delete body.reporter_name;
          delete body.date;
          delete body.fired;

          await database.collection(DB.rep_sch).updateOne({ _id: ObjectId(body.id) }, {
            $set: body
          });

          req.flash("success", "Report Schedule was updated successfully");
          res.redirect("/dashboard/reports/schedule");
          actLog(`User(${req.session.email}) created a new report schedule`);

        } else {

          // creation
          let reporter = await database.collection(DB.users).findOne({ email: req.session.email }) || {};

          body.reporter = reporter.email;
          body.reporter_name = reporter.full_name;

          // next report
          let today = new Date();
          today.setDate(today.getDate() + repeat);
          today.setHours(...body.time?.split(":").map(Number), 0, 0);
          body.next_report = today;

          // custom setup for creation only
          body.date = new Date();
          body.last_report = 'not-yet';
          body.disabled = false;
          body.fired = 0;

          await MongoCRUD.seqInsert(req, res, next, {
            prefix: "ESR",
            collection: DB.rep_sch,
            data: body,
            redirect: "/dashboard/reports/schedule",
            success: "New schedule created successfully"
          })

        }

      } catch (err) {

        next(err);

      }

    })

});

app.get("/reports/schedule/edit", (req, res, next) => {

  getDatabase()
    .then(async database => {

      let templates = await database.collection(DB.temps).find({ type: 'schedule' }).project({ title: 1, sid: 1 }).toArray() || [];
      let schedule = await database.collection(DB.rep_sch).findOne({ _id: ObjectId(req.query.id) }) || {};
      let quick_reports = DEFAULT_REPORTS.filter(r => r.type !== 'detailed');

      return res.render("pages/dashboard", {
        title: "Edit-Report-Schedule",
        track: "Reports",
        file: 'create-schedule',
        schedule, templates,
        data: quick_reports,
      });

    })

});

app.post("/reports/schedule/disable", (req, res, next) => {

  let status = req.query.status === "true";
  MongoCRUD.update(req, res, next, {
    collection: DB.rep_sch,
    filter: { _id: ObjectId(req.body.id) },
    data: {
      $set: {
        disabled: status
      }
    },
    response: (result, error) => {

      if (error) return res.status(400).send({ error });
      res.send({ status: "Schedule report updated!" })

    }
  });

})

app.post("/reports/schedule/delete", (req, res, next) => {

  MongoCRUD.delete(req, res, next, {
    collection: DB.rep_sch,
    filter: { _id: ObjectId(req.body.id) },
    success: "Successfully deleted a report schedule",
    response: (result, error) => {

      if (error) return res.status(400).send({ error });
      res.send({ status: "Schedule report deleted permanently!" })

    }
  });

  actLog(`User(${req.session.email}) deleted a report schedule`);

});

app.post("/reports/schedule/update", (req, res, next) => {

  if (req.body.idfs?.length < 1) {

    req.flash("error", "Schedule must have atleast one filter");
    return res.redirect(req.get('Referrer') || '/');

  }

  let body = req.body;
  let repeat = parseInt(body.repeat);

  body.repeat = repeat;
  body.limit_logs = parseInt(body.limit_logs);

  let today = new Date();
  today.setDate(today.getDate() + repeat);
  today.setHours(...body.time?.split(":").map(Number), 0, 0);

  body.next_report = today;

  MongoCRUD.update(req, res, next, {
    collection: DB.rep_sch,
    filter: { _id: ObjectId(body.id) },
    data: {
      $set: body
    },
    success: "A report schedule was updated successfully"
  });

})

// custom reporting
app.get("/report/ticket", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let ticket_sid = req.query.id;
        let reporter = await database.collection(DB.users).findOne({ email: req.session.email }) || {};

        REPORTER.ticket(ticket_sid, reporter, (report, err) => {

          if (report) {

            res.download(report);

          } else if (err) {

            req.flash("error", "Couldn't generate report for this ticket because " + err);
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

/* playbook section */
app.get("/playbook", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        return res.render("pages/dashboard", {
          title: `All-playbook`,
          file: "playbook",
          track: "Playbook",
          table: {
            url: `/dashboard/playbook/data/active`,
            query: {},
            dropdown: true,
            actions: true,
            headers: [
              { width: "10%", text: "Playbook ID" },
              { width: "30%", text: "Title", truncate: 30 },
              { text: "Source", class: "text-center" },
              { text: "Type", class: "text-center" },
              { text: "Notification", class: "text-center", extra: " time(s)" },
              { text: "Mean Time", class: "text-center", extra: " minute(s)" }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/playbook/data/:tab", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let tab = req.params.tab || "active";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.playb;

      if (tab !== "all") {
        req.query.disabled = String(tab !== "active");
      }

      let filter = getMongoQuery(req.query);
      // console.log("report.js", filter);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        if (result.length > 0) {

          let result_item = result[0];

          if (result_item.users && result_item.users?.length > 0) {
            let user_sids = result_item.users.map(u => u.split("-")[1])
            result_item.users = await database.collection(DB.users).find({ sid: { $in: user_sids } }).toArray() || [];
          }

          return res.render("components/table/playbook-table-data", {
            no_layout: true,
            data: [result_item],
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

app.get("/playbook/create", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      const playbook_count = await database.collection(DB.playb).countDocuments();
      if (playbook_count >= 100) {
        req.flash("error", "You have reached the maximum number of playbooks allowed (100). Please delete some playbooks to continue.");
        return res.redirect("/dashboard/playbook");
      }

      /* get templates */
      const templates = await database.collection(DB.temps).find({
        type: "playbook"
      }).project({ sid: 1, title: 1, rule: 1 }).toArray() || [];

      /* get workflows */
      const workflows = await database.collection(DB.workf).find().project({ sid: 1, title: 1 }).toArray() || [];

      /* uba data */
      let uba_users = await database.collection(DB.uba_users).find().toArray() || [];
      let uba_actions = await database.collection(DB.uba_actions).find().toArray() || [];
      let uba_patterns = await database.collection(DB.uba_pats).find().toArray() || [];

      // map only these properties
      const idfs = WLOG_IDFS.filter(idf => [
        "agent.id", "rule.id", "rule.level", "rule.firedtimes", "source", "destination"
      ].includes(idf.log));

      // assets
      let assets = await database.collection(DB.assets).find().toArray() || [];

      return res.status(200).render("pages/dashboard", {
        title: `Create-playbook`,
        file: "create-playbook",
        track: "Playbook",
        identifiers: idfs,
        filters: false, data: {},
        templates, workflows, assets,
        uba_users, uba_actions, uba_patterns
      });

    } catch (err) {

      next(err);

    }

  });

});

app.post("/playbook/create", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let body = req.body;
        let today = new Date();
        let time_part = today.toISOString().split("T")[1];

        // filters
        body.idfs = toArray(body.idfs);
        body.types = toArray(body.types);
        body.operators = toArray(body.operators);
        body.values = toArray(body.values);
        // needs work = first one can't be expected
        body.rule = body.values[0]; // first is expected to be rule value
        // users
        body.users = toArray(body.users);

        // expiry date
        if (body.expiry_date) {

          body.expiry_date = new Date(body.expiry_date + 'T' + time_part);

        }

        if (body?.updating === "true") {

          // remove fields that shouldn't be updated
          delete body.disabled;
          delete body.fired;
          delete body.notified;
          delete body.reporter_name;
          delete body.date;

          await database.collection(DB.playb).updateOne({ _id: ObjectId(body.id) }, {
            $set: body
          });

          req.flash("success", "Playbook was updated successfully");
          res.redirect("/dashboard/playbook");

        } else {

          // creation - set default values

          let reporter = await database.collection(DB.users).findOne({ email: req.session.email }) || {};

          body.reporter = reporter.email;
          body.reporter_name = reporter.full_name;
          body.date = today;

          body.disabled = "false";
          body.fired = 0;
          body.notified = 0;

          MongoCRUD.seqInsert(req, res, next, {
            prefix: "EPB",
            collection: DB.playb,
            data: body,
            redirect: `/dashboard/playbook`
          })

          actLog(`User(${req.session.email}) created a new playbook`);

        }


      } catch (err) {

        next(err);

      }

    })

})

app.get("/playbook/update", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let id = req.query.id;
        let data = await database.collection(DB.playb).findOne({ _id: ObjectId(id) });
        const templates = await database.collection(DB.temps).find({
          type: "playbook"
        }).project({ sid: 1, title: 1, rule: 1 }).toArray() || [];

        /* get workflows */
        const workflows = await database.collection(DB.workf).find().project({ sid: 1, title: 1 }).toArray() || [];

        // map only these properties
        const idfs = WLOG_IDFS.filter(idf => [
          "agent.id", "rule.id", "rule.level", "rule.firedtimes", "source", "destination"
        ].includes(idf.log));

        /* uba data */
        let uba_users = await database.collection(DB.uba_users).find().toArray() || [];
        let uba_actions = await database.collection(DB.uba_actions).find().toArray() || [];
        let uba_patterns = await database.collection(DB.uba_pats).find().toArray() || [];

        // assets
        let assets = await database.collection(DB.assets).find().toArray() || [];

        return res.status(200).render("pages/dashboard", {
          title: `Update-playbook`, file: "create-playbook",
          track: "Playbook", data,
          templates, workflows, assets,
          identifiers: idfs,
          filters: {
            idfs: data.idfs,
            types: data.types,
            operators: data.operators,
            values: data.values
          },
          uba_users, uba_actions, uba_patterns
        });

      } catch (err) {

        next(err);

      }

    })

})

app.post("/playbook/disable", (req, res, next) => {

  MongoCRUD.update(req, res, next, {
    collection: DB.playb,
    filter: { _id: ObjectId(req.body.id) },
    data: {
      $set: {
        disabled: req.query.status || "false"
      }
    },
    response: (result, error) => {

      if (error) return res.status(400).send({ error });
      actLog(`User(${req.session.email}) disabled a playbook`);
      res.send({ status: `Playbook has been ${req.query.status === "true" ? "disabled" : "enabled"} successfully` });

    }
  });

})

app.post("/playbook/delete", (req, res, next) => {

  MongoCRUD.delete(req, res, next, {
    collection: DB.playb,
    filter: { _id: ObjectId(req.body.id) },
    response: (result, error) => {

      if (error) return res.status(400).send({ error });

      actLog(`User(${req.session.email}) deleted a playbook`);
      res.send({ status: "Playbook has been deleted permanently" });

    }
  });

});

app.get("/reports/quick", (req, res, next) => {

  let quick_reports = DEFAULT_REPORTS.filter(r => r.type !== 'detailed');

  return res.status(200).render("pages/dashboard", {
    title: `quick-reports`,
    file: "reports/quick-reports",
    track: "Reports", data: quick_reports
  });

})

app.post("/reports/quick", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let data = req.body;
      let user_email = req.session.email;

      let user = await database.collection(DB.users).findOne({ email: user_email });

      if (!user) {

        req.flash("error", "Your user data was not found");
        return res.redirect(req.get('Referrer') || '/');

      }

      if (!data.reports) {

        req.flash("warning", "No report is selected. Please select reports first.");
        return res.redirect(req.get('Referrer') || '/');

      }

      // console.log("report.js", data);

      REPORTER.report(data, user.full_name, `quick-report-${user_email}.pdf`, (file, error) => {

        if (error) {

          console.error(error);
          req.flash("error", "Something went wrong!");
          res.redirect(req.get('Referrer') || '/');

        } else {

          return res.download(file);

        }


      })

    } catch (err) {

      next(err);

    }

  })

})

app.get("/reports/detailed", (req, res, next) => {

  // load only detailed reqports
  let detailed_reports = DEFAULT_REPORTS.filter(r => r.type === 'detailed');

  return res.status(200).render("pages/dashboard", {
    title: `detailed-reports`,
    file: "reports/detailed-reports",
    identifiers: WLOG_IDFS,
    track: "Reports", data: detailed_reports
  });

})

app.get("/reports/edit-report", (req, res, next) => {

  getDatabase().then(async database => {

    // report sid
    const sid = req.query.sid;
    // load the report
    const report = DEFAULT_REPORTS.find(r => r.sid === sid);
    // track data
    let date = new Date().toISOString().split("T")[0];
    const eitix_track = await database.collection(DB.track).findOne({ date }) || {};
    // get agent data
    const agents = await database.collection(DB.w_agents_d).aggregate([
      { $match: { available: true } },
      { $group: { _id: "$id", id: { $first: "$id" }, name: { $first: "$name" } } }
    ]).sort({ _id: 1 }).toArray() || [];

    if (report && eitix_track) {

      return res.render("pages/dashboard/reports/edit-report", {
        no_layout: true,
        report, data: eitix_track,
        identifiers: WLOG_IDFS,
        agents
      });

    } else {

      req.flash("error", "Report not found or data is not available.");
      return res.send("back");

    }

  })

})

app.post("/reports/detailed", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let data = req.body;
      let user_email = req.session.email;

      let user = await database.collection(DB.users).findOne({ email: user_email });

      if (!user) {

        req.flash("error", "Your user data was not found");
        return res.redirect(req.get('Referrer') || '/');

      }

      REPORTER.detailedReport(data, user, (file, error) => {

        if (error) {

          console.error(error);
          req.flash("error", "Something went wrong!");
          res.redirect(req.get('Referrer') || '/');

        } else {

          return res.send(file);

        }

      })

    } catch (err) {

      next(err);

    }

  });

})

app.get("/reports/detailed/render", (req, res, next) => {

  getDatabase().then(async database => {

    res.render("../tests/wazuh-logs", {
      no_layout: true
    })

  })

})

app.get("/reports/download", (req, res, next) => {

  let file_path = req.query.file;
  const safeFileName = path.basename(file_path);
  let safeFilePath = path.join(__dirname, `../reports/${safeFileName}`);
  if (fs.existsSync(safeFilePath)) {
    res.download(safeFilePath);
  } else {
    res.status(404).send("File not found, or has expired. (Report files expire if not downloaded on the same day)");
  }

})

module.exports = app;
