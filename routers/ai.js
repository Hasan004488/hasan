// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const {
  DB, getDatabase
} = require("../libraries/database");
const {
  getDateString,
  getLogCollection,
} = require("../libraries/globals");
const ai_map = require("../libraries/ai/ai_map.json");

const LOGS_ON_DASHBOARD = 30; // logs to show on dashboard for each ip

// starts with "/ai"

app.get("/", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      res.render("pages/dashboard", {
        title: "AI-analysis",
        file: "ai-analysis",
        timing: "daily",
        table: {
          url: `/dashboard/ai/data`,
          query: req.query,
          loadmore: false,
          dropdown: false,
          actions: false,
          headers: [
            { text: "Attack Vector" },
            { text: "Logs Count" },
            { text: "Description" },
            { text: "Mitre Attack", },
            { text: "Impact", class: "text-center" },
          ],
        }
      });

    } catch (err) {

      next(err);

    }

  }).catch(err => next(err));

});


app.get("/analysis/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let date = getDateString();
      let result = await database.collection(DB.track).findOne({ date }) || {};
      let attacks = (result.attacks || []).map(a => ({ name: a.name, affected: a.affected }))

      let priorityVectors = ["anomaly", "vulnerability", "malware"]

      attacks.sort((a, b) => {
        const priorityA = priorityVectors.includes(a.name) ? 0 : 1;
        const priorityB = priorityVectors.includes(b.name) ? 0 : 1;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return b.affected - a.affected;
      });

      return res.render("components/body/ai-analysis-data", {
        no_layout: true, data: attacks.slice(0, 3)
      })

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  }).catch(err => next(err));

});

app.get("/data", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let date = req.query.date || getDateString();
      let attack = req.query.attack;
      let page = parseInt(req.query.page) || 1;

      if (req.query.count === "1") {

        return res.json({ total: 30 });

      } else {

        if (page > 1) {
          // return false so frontned don't call it again
          return res.send(false);
        }

        //let result = await database.collection(DB.track).find().skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];
        let result = await database.collection(DB.track).findOne({ date }) || {};
        let attacks = result?.attacks || [];

        if (attack) {
          attacks = attacks.filter(o => o.name === attack);
        }

        attacks = attacks.map(o => {
          const map = ai_map[o.name] || {};
          return {
            ...o,
            Impact: map.Impact || 0,
            Title: map.Title || o.name,
            MITRE_ATTACK_Technique: map.MITRE_ATTACK_Technique || {},
            Risk_Description: map.Risk_Description || '',
            Remediation_Guide_Type: map.Remediation_Guide_Type || '',
            Remediation_Guide: map.Remediation_Guide || []
          }
        });

        if (attacks.length > 0) {

          return res.render("components/table/ai-table-data", {
            no_layout: true,
            data: attacks, date
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

app.get("/data/attack", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let name = req.query.name || "none";
      let date = req.query.date || getDateString();
      let result = await database.collection(DB.track).findOne({ date }) || {};
      let attacks = result?.attacks || [];
      let attack = attacks.find(o => o.name === name) || {};

      attack.ai_map = ai_map[attack.name] || {};

      return res.render("components/popup/ai-attack-data", {
        no_layout: true, attack,
        logs: [], date_str: date
      });

    } catch (err) {
      next(err);
    }

  });

})

app.get("/data/attack/logs/:name", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      const name = req.params.name;
      const page = parseInt(req.query.page) || 1;

      if (name) {

        const logs_data = await database.collection(getLogCollection()).find({ attack_type: name }).skip((page - 1) * LOGS_ON_DASHBOARD).limit(LOGS_ON_DASHBOARD).sort({ _id: -1 }).toArray() || [];

        if (logs_data.length > 0) {

          return res.send(logs_data);

        } else {

          return res.send(false);

        }

      } else {

        return res.send(false);

      }

    } catch (err) {

      console.error("/data/attack/logs/:name", err);
      return res.send(false);


    }

  });

})

app.get("/monitor/data", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let timing = req.query.timing || "daily";
        let date = req.query.date; // request needs data of a specific date
        let data = {};
        let range = 1;

        if (timing === "weekly") { range = 7; }
        else if (timing === "monthly") { range = 30; }

        data = {
          range: [],
          series: [],
          total: []
        };

        for (let i = range - 1, j = 0; i >= 0; i--, j++) {

          // set dates respectively
          let date = getDateString(null, -i);
          data.range.push(date);

        };

        let track_data = [];

        if (date) {

          // send exactly 1 (one) data for that date
          track_data = await database.collection(DB.track).find({ date })
            .sort({
              _id: -1
            }).limit(1).toArray() || [];

          let last_data = track_data[0] || {};

          last_data.attacks?.forEach(attack => {

            updateSeries(data.series, attack.name, 0, attack.affected);

          });

        } else {

          // send multiple data with total values

          track_data = await database.collection(DB.track).find()
            .sort({
              _id: -1
            }).limit(range).toArray() || [];

          for (const info of track_data) {

            let index = data.range.indexOf(info.date);

            if (index > -1) {

              let this_total = 0;

              // prepare series
              info.attacks?.forEach(attack => {

                updateSeries(data.series, attack.name, index, attack.affected);
                this_total += attack.count;

              });

              data.total[index] = this_total;

            }

          }

        }

        return res.send(data);

      } catch (err) {

        console.error(err);
        return res.send(false);

      }
    })

})


/**
 * Updates the value of a data point in a series object based on the given name and index.
 * If the series object does not contain a data point with the given name, a new data point is created.
 *
 * @param {Array} series - The array of series objects.
 * @param {string} name - The name of the data point to update or create.
 * @param {number} value_index - The index of the value to update in the data point.
 * @param {*} new_value - The new value to set for the data point.
 */
function updateSeries(series, name, value_index, new_value) {

  const index = series.findIndex(item => item.name === name);

  if (index !== -1) {

    series[index].data[value_index] = new_value;

  } else {

    let new_data = {
      name: name,
      data: []
    }
    new_data.data[value_index] = new_value;
    series.push(new_data);

  }

}


module.exports = app;