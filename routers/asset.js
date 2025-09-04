// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const ObjectId = require('mongodb').ObjectId;
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  permit,
  actLog,
  EITIX,
  getMongoQuery
} = require("../libraries/globals");

const QUERY_LIMIT = EITIX.query_limit;
const MAX_ASSET_ADD = EITIX.max_assets;

app.get("/manage", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let total = await database.collection(DB.assets).countDocuments({});
        let tracking_status = ['on', 'off'];

        return res.render("pages/dashboard", {
          title: "Assets-Management",
          track: "Assets",
          file: 'assets-management.ejs',
          maxAsset: MAX_ASSET_ADD - total,
          table: {
            url: `/dashboard/assets/manage/data`,
            query: {},
            dropdown: false,
            actions: true,
            headers: [
              { text: "Time" },
              { text: "Asset ID" },
              { text: "Name" },
              { text: "Status", class: "text-center" },
              { text: "Category" },
              { text: "Host Address" },
              {
                text: "Tracking", class: "text-center",
                filters: tracking_status.map(status => {
                  return {
                    name: "Tracking " + status,
                    field: "tracking",
                    value: status
                  }
                })
              }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/manage/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let page = parseInt(req.query.page) || 1;
      let collection = DB.assets;

      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        /* await new Promise(resolve => setTimeout(resolve, 500)); */

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        return res.render("components/table/asset-table-data", {
          no_layout: true,
          data: result
        });

      }

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  })

})

app.get("/monitor", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.query.tab || 'weekly';

        res.render("pages/dashboard", {
          title: "Assets-Monitor",
          track: "Assets",
          file: 'assets-monitor.ejs',
          active: tab
        });

      } catch (err) {

        next(err);

      }
    })

})


app.get("/monitor/data", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let timing = req.query.timing || "weekly";
        let data = {};

        let range = 7;

        if (timing == "monthly") range = 30;

        data = {
          // assets monitor data
          wazuh_agents: {
            range: [],
            active: [],
            inactive: []
          },
          cloud_assets: {
            range: [],
            active: [],
            inactive: []
          }
        };

        for (let i = range - 1, j = 0; i >= 0; i--, j++) {

          // set default amount 0
          data.wazuh_agents.active.push(0);
          data.wazuh_agents.inactive.push(0);
          data.cloud_assets.active.push(0);
          data.cloud_assets.inactive.push(0);

          // set dates respectively
          let today = new Date();
          today.setDate(today.getDate() - i);
          let date = today.toISOString().split("T")[0];

          data.wazuh_agents.range.push(date);
          data.cloud_assets.range.push(date);

        };

        let today = new Date();
        today.setDate(today.getDate() - range);
        let date = today.toISOString().split("T")[0];

        let wazuh_agents = await database.collection(DB.w_agents).find({
          date: { $gte: date }
        }).toArray() || [];

        for (const info of wazuh_agents) {

          let index = data.wazuh_agents.range.indexOf(info.date);

          if (index > -1) {

            data.wazuh_agents.active[index] = info.active;
            data.wazuh_agents.inactive[index] = info.inactive;

          }

        }

        let cloud_assets = await database.collection(DB.c_assets).find()
          .sort({
            _id: -1
          }).limit(range).toArray() || [];

        for (const info of cloud_assets) {

          let index = data.cloud_assets.range.indexOf(info.date);

          if (index > -1) {

            data.cloud_assets.active[index] = info.active;
            data.cloud_assets.inactive[index] = info.inactive;

          }

        }

        return res.send(data);

      } catch (err) {
        console.error(err);
        return res.send(false);
      }
    })

})

app.get("/update", permit("modifyAsset"), (req, res, next) => {

  let asset_id = req.query.id;
  let track = req.query.track == 'on' ? 'on' : 'off';

  if (asset_id != "") {

    getDatabase()
      .then(database => {

        database.collection(DB.assets).updateOne({
          sid: asset_id
        }, {
          $set: {
            tracking: track
          }
        })
          .then(results => {

            return res.send({ status: "Tracking status updated!" })

          })
          .catch(err => {

            return res.status(500).send({ error: err.toString() })

          })

      })

  } else {

    return res.status(400).send({ error: "No asset id given!" })

  }

});

app.post("/create", permit("createAsset"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      const body = req.body;

      if (body.updating === "true") {

        body.updated_date = new Date();
        body.updated_by = req.session.email;

        await database.collection(DB.assets).updateOne({ _id: ObjectId(body.id) }, {
          $set: body
        });

        req.flash("success", "Asset updated successfully!");
        actLog(`User(${req.session.email}) just updated an asset`);
        return res.redirect('/dashboard/assets/manage');

      } else {

        body.protected = false;
        body.date = new Date();
        body.created_by = req.session.email;

        MongoCRUD.seqInsert(req, res, next, {

          prefix: "EA",
          collection: DB.assets,
          data: body,
          response: (success, err) => {
            if (success) {

              req.flash("success", "New Asset added successfully!");
              actLog(`User(${req.session.email}) just added a new asset`);
              return res.redirect('/dashboard/assets/manage');

            } else {

              next(err);

            }
          }

        });

      }


    } catch (err) {

      next(err);

    }

  })

});

app.get("/create", permit("createAsset"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let data = {};

      const asset_count = await database.collection(DB.playb).countDocuments();
      if (asset_count >= 100) {
        req.flash("error", "You have reached the maximum number of assets allowed (100). Please delete some assets to continue.");
        return res.redirect("/dashboard/assets/manage");
      }

      if (req.query.id) {
        data = await database.collection(DB.assets).findOne({ _id: ObjectId(req.query.id) });
      }

      return res.status(200).render("pages/dashboard", {
        title: `Create-asset`,
        file: "create-asset",
        track: "Assets", data,
      });

    } catch (err) {

      next(err);

    }

  });

});

app.post("/delete", permit("deleteAsset"), (req, res, next) => {

  let id = req.body.id ? ObjectId(req.body.id) : null;

  getDatabase()
    .then(database => {

      database.collection(DB.assets).deleteOne({
        _id: id
      })
        .then(results => {

          if (results.deletedCount == 0) {

            req.flash("error", "Couldn't access the asset to remove");
            return res.redirect(req.get('Referrer') || '/');

          } else {

            req.flash("success", "Asset removed successfully");
            actLog(`User(${req.session.email}) removed an asset`);
            return res.redirect(req.get('Referrer') || '/');

          }

        })
        .catch(err => {
          next(err);
        })

    })

});

app.get("/duplicate", permit("createAsset"), (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let ip_address = req.query.ip;
      let port_number = req.query.port;

      let exist_asset = await database.collection(DB.assets).findOne({
        ip: ip_address,
        port: port_number
      });

      res.send({
        status: !!exist_asset
      });

    } catch (err) {

      res.send({
        failure: err
      });

    }

  })

})

module.exports = app;