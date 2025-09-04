/**
 * Router Introduction:
 * This router contains routes that provide content (JSON/text) responses.
 * It controls mostly requests coming from ajax request.
 */

require("dotenv").config();
const express = require("express");
const os = require('node-os-utils');
const fs = require("fs");
const path = require("path");
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  permit, OPEN_COLLECTIONS,
  getDateString,
  safeRegex
} = require("../libraries/globals");
const { remaining } = require("../workers/rwrtm");
const axios = require("axios");
const https = require("https");
const { getConfig } = require("../libraries/getConfig");
const ObjectId = require('mongodb').ObjectId;

const app = express.Router();

const QUERY_LIMIT = 30;
const MAX_LOG_AMOUNT = 100;
const DB_ERR_MESSAGE = "Database error encountered";
const INTERNAL_ERR_MESSAGE = "Internal server error encountered";
const NOT_FOUND_MESSAGE = "Information not found";
const TICKET_PROJCTION = {
  title: 1, 
  reminder_frequency: 1, 
  first_escalation: 1, 
  second_escalation: 1, 
  expiry_date: 1, 
  remediation: 1
}

function authenticateWazuh(config, response) {

  try {

      const username = config.wazuh_user;
      const password = config.wazuh_pass;
      const agent = new https.Agent({ rejectUnauthorized: false });

      // Set the Axios defaults with the authentication headers and the agent
      axios.defaults.headers.common['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      axios.defaults.httpsAgent = agent;

      axios.get(`${config.wazuh_host}/security/user/authenticate?raw=true`)
      .then(result => {

          let TOKEN = result.data;
          return response(TOKEN, null);

      }).catch(err => {

          return response(null, err);

      });

      
  } catch (err) {

      return response(null, err);
      
  }

  return 0;
}

app.get("/fetch/one", (req, res, next) => {

  getDatabase()
    .then(database => {

      try {

        let collection = OPEN_COLLECTIONS[req.query.collection];
        let id = ObjectId(req.query.id);
        let exclude = req.query.exclude?.split(',');

        if (!id || !collection) {

          return res.status(404).send("Something went wrong (ID or Collection is not provided otherwise requested Collection is not open");

        }

        // generate the project object
        let projection = {};

        if (exclude) {

          exclude.forEach(field => {
            projection[field] = 0;
          });

        }

        database.collection(collection).find({ _id: id })
          .project(projection)
          .limit(1)
          .toArray()
          .then(results => {

            if (results.length > 0)

              res.status(200).json(results[0]);

            else

              res.status(404).send(NOT_FOUND_MESSAGE);

          })
          .catch(err => {

            // errors with the query
            res.status(500).send(DB_ERR_MESSAGE);
            console.error(err);

          })

      } catch (err) {

        console.error(err);
        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});

app.get("/fetch/single", (req, res, next) => {

  getDatabase()
    .then(database => {

      try {

        console.log("content", "Running route 1");

        let collection = OPEN_COLLECTIONS[req.query.collection];
        let idf = req.query.idf;
        let value = req.query.value;
        let exclude = req.query.exclude?.split(',');

        if (idf === "_id") value = ObjectId(value);

        if (!collection) {

          return res.status(404).send("Something went wrong (Collection is not provided otherwise requested Collection is not open");

        }

        // generate filter
        let filter = {[idf]: value};
        // generate the project object
        let projection = {};

        if (exclude) {

          exclude.forEach(field => {
            projection[field] = 0;
          });

        }

        database.collection(collection).find(filter)
          .project(projection)
          .limit(1)
          .toArray()
          .then(results => {

            if (results.length > 0)

              res.status(200).json(results[0]);

            else

              res.status(404).send(NOT_FOUND_MESSAGE);

          })
          .catch(err => {

            // errors with the query
            res.status(500).send(DB_ERR_MESSAGE);
            console.error(err);

          })

      } catch (err) {

        console.error(err);
        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

})

app.get("/dashboard/eps", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let time_range = req.query.range || '1h';
      let data_limit = 15;
      let collection = DB.epm;
      let time_slice = 16;

      let data = {
        range: [],
        timestamp: [],
        series_data: []
      }

      if (time_range === '1d') {

        // eph
        collection = DB.eph;
        data_limit = 24;
        time_slice = 13;

      } else if (time_range === '1w') {

        // epd
        collection = DB.track;
        data_limit = 7;
        time_slice = 10;
        
      }

      // load data (same for any case)
      let timestamps = await database.collection(collection).find().sort({ _id: -1 }).limit(data_limit).toArray();

      if (time_range === '1d') {

        // eph
        // map the range and base series data
          for(let i = data_limit - 1, j = 0; i >= 0; i--, j++) {
                    
            // set dates respectively
            let today = new Date();
            today.setHours(today.getHours() - i);
            let date = today.toISOString().slice(0, time_slice);

            let [locale_time, am_pm] = today.toLocaleTimeString().split(' ');
            let [hour] = locale_time.split(':');

            let time_str = `${hour}:${am_pm}`;

            data.range.push(time_str);
            data.timestamp.push(date);
            data.series_data.push(0);

        }

        // map the data values
        for (const item of timestamps) {

            let index = data.timestamp.indexOf(item.timestamp);

            if (index > -1) {

                data.series_data[index] = item.count;

            }

        }

      } else if (time_range === '1w') {

        // epd
        // map the range and base series data
          for(let i = data_limit - 1, j = 0; i >= 0; i--, j++) {
                      
            // set dates respectively
            let today = new Date();

            today.setDate(today.getDate() - i);
            let date = today.toISOString().slice(0, time_slice);

            data.series_data.push(0);
            data.range.push(date);

        }

        // map the data values
        for (const item of timestamps) {

            let index = data.range.indexOf(item.date);

            if (index > -1) {

                data.series_data[index] = item.all || 0;

            }

        }
        
      } else {

        // epm
        // map the range and base series data
          for(let i = data_limit - 1, j = 0; i >= 0; i--, j++) {
                  
            // set dates respectively
            let today = new Date();
            today.setMinutes(today.getMinutes() - i);
            let date = today.toISOString().slice(0, time_slice);

            let [locale_time, am_pm] = today.toLocaleTimeString().split(' ');
            let [hour, minute] = locale_time.split(':');

            let time_str = `${hour}:${minute}:${am_pm}`;

            data.range.push(time_str);
            data.timestamp.push(date);
            data.series_data.push(0);

        }

        // map the data values
        for (const item of timestamps) {

          let index = data.timestamp.indexOf(item.timestamp_m);

          if (index > -1) {

              data.series_data[index] = item.count;

          }

        }

      }

      /* console.log(data); */

      return res.status(200).json(data);

    } catch(err) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);
      console.log(err);

    }

  })

})

app.get("/dashboard/fim", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      
      let today = new Date();
      let date = today.toISOString().split("T")[0];
      let fcd_today = await database.collection(DB.fcd).findOne({ date }) || {};

      today.setDate(today.getDate() - 1);
      date = today.toISOString().split("T")[0];
      let fcd_yesterday = await database.collection(DB.fcd).findOne({date}) || {};

      let data = {
        fcd: [fcd_today, fcd_yesterday]
      }

      if (data) {

        return res.status(200).json(data);

      } else {

        return res.status(404).send(NOT_FOUND_MESSAGE);

      }


    } catch (error) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  })

})

app.get("/dashboard/notices", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let date = new Date();
      let today = date.toISOString().split("T")[0];

      let eitix_notices = await database.collection(DB.eitix).findOne({title: "notices"}) || {};
      let cve_today = await database.collection(DB.v_cve).countDocuments() || 0;
      let ioc_today = await database.collection(DB.iocd).find()
      .sort({ 
          _id: -1
      }).limit(1).toArray() || [];

      const risks = await database.collection(DB.risks).findOne({ date: today }) || {};

      let notices = {

        eitix: eitix_notices,
        cve: cve_today,
        ioc: ioc_today[0]?.total_events,
        risks

      }

      if (notices) {

        return res.render("components/notices",{
          no_layout: true,
          notices
        });

      } else {

        return res.status(404).send(NOT_FOUND_MESSAGE);

      }


    } catch (error) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  })

})

app.get("/dashboard/ioc", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let today = new Date();
      let date = today.toISOString().split("T")[0];
      let iocd_today = await database.collection(DB.iocd).findOne({ date }) || {};

      today.setDate(today.getDate() - 1);
      date = today.toISOString().split("T")[0];
      let iocd_yesterday = await database.collection(DB.iocd).findOne({date}) || {};

      let data = {
        ioc: [iocd_today, iocd_yesterday]
      }

      if (data) {

        return res.status(200).json(data);

      } else {

        return res.status(404).send(NOT_FOUND_MESSAGE);

      }


    } catch (error) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  })

})

app.get("/dashboard/alerts", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let date = new Date();
      let today = date.toISOString().split("T")[0];

      const track_data = await database.collection(DB.track).findOne({ date: today }) || {};

      const sms_daily = track_data.sms_sent;
      const emails_daily = track_data.emails_sent;

      let data = {
        sms_daily, emails_daily
      }

      if (data) {

        return res.status(200).json(data);

      } else {

        return res.status(404).send(NOT_FOUND_MESSAGE);

      }


    } catch (error) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  })

})



app.get("/dashboard/latest-cves", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let data = await database.collection(DB.v_cve).find({}).sort({_id: -1}).limit(3).toArray();

      return res.render("components/table/cve-table-data-small",{
        no_layout: true,
        data
      });

    } catch (error) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  })
  
})

app.get("/dashboard/cve", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let date = new Date();

      const daily_cve = await database.collection(DB.v_cve).countDocuments() || 0;
      const total_cve = await database.collection(DB.v_cve_a).countDocuments() || 0;

      let data = {
        daily_cve, total_cve
      }

      if (data) {

        return res.status(200).json(data);

      } else {

        return res.status(404).send(NOT_FOUND_MESSAGE);

      }


    } catch (error) {

      // errors with the calculation
      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  })

})

app.get("/dashboard/risks", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let today = new Date().toISOString().split("T")[0];
        let risks = await database.collection(DB.risks).findOne({ date: today }) || {};

        return res.json(risks);

      } catch (error) {

        // errors with the calculation
        res.status(500).send(INTERNAL_ERR_MESSAGE);

      }

    })

})

app.get("/dashboard/status", async (req, res, next) => {

  const data = {};

  try {

    if (os) {

      const cpuUsage = await os.cpu.usage();
      const usedMem = await os.mem.used();
      const driveInfo = await os.drive.info();

      const cpuUsagePercentage = cpuUsage.toFixed(2);
      const memPer = ((usedMem.usedMemMb / usedMem.totalMemMb) * 100).toFixed(2);
      const storageUsagePercentage = parseFloat(driveInfo.usedPercentage).toFixed(2);

      data.memory = memPer || 0.0;
      data.cpu = cpuUsagePercentage || 0.0;
      data.storage = storageUsagePercentage || 0.0;

      return res.status(200).json(data);

    } else {

      res.status(500).send(INTERNAL_ERR_MESSAGE);

    }

  } catch (err) {

    // errors with the calculation
    res.status(500).send(INTERNAL_ERR_MESSAGE);

  }


});

app.get("/status", permit("admin"), async (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let data = await database.collection(DB.track).findOne({ date: getDateString() }) || {};

      return res.json(data);
      
    } catch (err) {

      // errors with the calculation
      console.error("content.js", err);
      return res.send(INTERNAL_ERR_MESSAGE);
      
    }

  })

});

app.get("/dashboard/tickets/count", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let data = {};
        data.open = await database.collection(DB.tickets).countDocuments({ status: "open" }) || 0;
        data.closed = await database.collection(DB.tickets).countDocuments({ status: "closed" }) || 0;
        data.expired = await database.collection(DB.tickets).countDocuments({ status: "expired" }) || 0;
        data.all = data.open + data.closed + data.expired;

        res.status(200).json(data);

      } catch (err) {

        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});

app.get("/dashboard/agents", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let today = new Date().toISOString().split("T")[0];
        let data = {
          wazuh: await database.collection(DB.w_agents).findOne({ date: today }) || {},
          cloud: await database.collection(DB.c_assets).findOne({ date: today }) || {}
        };

        res.status(200).json(data);

      } catch (err) {

        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});


// send individual cve info from database
app.get("/vulnerabilities/cve/:id", (req, res, next) => {

  getDatabase()
    .then(database => {

      database.collection(DB.v_cve).findOne({ id: req.params.id })
        .then(results => {

          if (results != null)

            res.status(200).json(results);

          else

            res.status(404).send(NOT_FOUND_MESSAGE);

        })
        .catch(err => {

          // errors with the query

          res.status(500).send(DB_ERR_MESSAGE);

        })

    })

});


app.get("/tickets/info/:id", (req, res, next) => {

  getDatabase()
    .then(database => {

      try {

        database.collection(DB.tickets).find({ _id: ObjectId(req.params.id) })
        .project(TICKET_PROJCTION)
        .toArray()
        .then(results => {

          if (results != null)

            res.status(200).json(results[0]);

          else

            res.status(404).send(NOT_FOUND_MESSAGE);

        })
        .catch(err => {

          // errors with the query

          res.status(500).send(DB_ERR_MESSAGE);

        })
        
      } catch (err) {

        res.status(500).send(INTERNAL_ERR_MESSAGE);
        
      }

    })

});

app.get("/tickets/comments", (req, res, next) => {

  getDatabase()
    .then(database => {

      let ticket = req.query.ticket;

      database.collection(DB.t_comments).find({ comment_for: ticket })
        .sort({ _id: -1 }).toArray()
        .then(results => {

          if (results != null)

            res.status(200).json(results);

          else

            res.status(404).send(NOT_FOUND_MESSAGE);

        })
        .catch(err => {

          // errors with the query

          res.status(500).send(DB_ERR_MESSAGE);

        })

    })

});

app.get("/notifications", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let user = req.session.email;
        // notification list
        let notifs = await database.collection(DB.notifs).find({
          targets: { $in: [user] }
        }).sort({ _id: -1 }).toArray() || [];
        let unseen_notifs = await database.collection(DB.notifs).find({
          targets_unseen: { $in: [user] }
        }).sort({ _id: -1 }).toArray() || [];
        // eitix status for processing
        let eitix_status = await database.collection(DB.eitix).findOne({
          title: "eitix"
        }) || {};

        if (notifs.length > 0) {

          res.status(200).json({
            code: 200, body: notifs, unseen: unseen_notifs.length,
            processing: eitix_status.detailed_reporting
          });

        } else {

          res.status(200).send({ 
            code: 404, body: NOT_FOUND_MESSAGE,
            processing: eitix_status.detailed_reporting
          });

        }

      } catch (err) {

        // errors with the query
        console.error("content.js/notifications", err);
        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});

app.get("/notifications/remove/:_id", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let user = req.session.email;
        let id = req.params._id;

        await database.collection(DB.notifs).updateOne({
          _id: ObjectId(id)
        }, {
          $pull: { targets: user }
        }).then(() => {

          res.status(200).json({ status: "success" });

        }).catch(err => {

          res.status(500).json(err);

        });


      } catch (err) {

        // errors with the query
        console.error("content.js/notifications", err);
        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});

app.get("/notifications/seen", (req, res, next) => {

  // no_f = this is not complete

  getDatabase()
    .then(async database => {

      try {

        let user = req.session.email;
        let id = req.params._id;

        await database.collection(DB.notifs).updateMany({}, {
          $pull: { targets_unseen: user }
        }).then(() => {

          res.status(200).json({ status: "success" });

        }).catch(err => {

          res.status(200).json({ status: "success" });

        });


      } catch (err) {

        // errors with the query
        console.error("content.js/notifications", err);
        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});


app.get("/users", (req, res, next) => {

  getDatabase().then(async database => {

    let searchText = req.query.searchText?.trim().replace(/\\/g, '\\\\');
    let filter = { sid: { $exists: true } };

    if (searchText) {

      filter = {
        $and: [
          { sid: { $exists: true } },
          {
            $or: [ 
              { full_name: RegExp(safeRegex(searchText), 'i') },
              { email: RegExp(safeRegex(searchText), 'i') }
            ]
          }
        ]
      };

    }

    database.collection(DB.users).find(filter).limit(QUERY_LIMIT)
      .toArray().then(results => {

        if (results.length > 0) {

          res.status(200).json(results);

        } else {

          res.status(200).send(false);

        }

      })
      .catch(err => {

        // errors with the query
        res.status(500).send(DB_ERR_MESSAGE);

      })

  })

});

// send individual log info from database
app.get("/attack/event", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let event_id = req.query.id ?? null;
        let tab = req.query.tab ?? 'daily';
        let collection = DB.a_surface;

        let event = await database.collection(collection).findOne({ _id: ObjectId(event_id) });

        if (event != null)

          res.status(200).json(event);

        else res.status(404).send(NOT_FOUND_MESSAGE);

      } catch (err) {

        // errors with the query

        res.status(500).send(DB_ERR_MESSAGE);

      }

    })

});

// send list of a particular role 
app.get("/role/users/:name", (req, res, next) => {

  getDatabase()
    .then(database => {

      let name = req.params.name ?? "";

      database.collection(DB.users).find({ role: name, hidden: {$ne: true} }).toArray()
        .then(results => {

          if (results != null)

            res.status(200).json(results);

          else

            res.status(404).send(NOT_FOUND_MESSAGE);

        })
        .catch(err => {

          // errors with the query

          res.status(500).send(DB_ERR_MESSAGE);

        })

    })

});


app.get("/eitix/logs", permit("syslog"), (req, res, next) => {

  try {

    let type = req.query.type ?? "activity";
    let collection = DB.act_log;

    if (type == "system") {

      collection = DB.sys_log;

    } else if (type == "error") {

      collection = DB.err_log;

    }

    getDatabase()
      .then(database => {

        database.collection(collection).find({})
          .limit(500).sort({ _id: -1 })
          .toArray()
          .then(results => {

            let filteredResults = results.filter(result => !result.log.includes("admin@eitix.com"));
            res.status(200).json(filteredResults);

          });

      })
      .catch(err => {

        res.status(500).send(DB_ERR_MESSAGE);

      })

  } catch (err) {

    res.status(500).send(INTERNAL_ERR_MESSAGE);

  }

});

// send list of a particular role 
app.get("/validation", (req, res, next) => {

  getDatabase()
    .then(async database => {

      let eitix = await database.collection(DB.eitix).findOne({ title: "validation" }) || {};
      res.status(200).send(eitix);

    })

});

// expiry time
app.get("/expiry", (req, res, next) => {

  res.status(200).send(remaining());

});

// send info about a particular agent 
app.get("/agent/info/:id", (req, res, next) => {

  getDatabase().then(database => {

    let id = req.params.id ?? "";

    database.collection(DB.w_agents_d).findOne({ id: id })
      .then(result => {

        if (result != null) {

          delete result._id;
          res.status(200).json(result);

        } else {

          res.status(404).send(NOT_FOUND_MESSAGE);

        }

      })
      .catch(err => {

        // errors with the query
        res.status(500).send(DB_ERR_MESSAGE);

      })

  })

});

app.get("/agent/changes", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let files = req.query.files || "daily";
      let agent = req.query.agent;
      let collection = DB.fim;
      let agent_info = await database.collection(DB.w_agents_d).findOne({ id: agent }) || {};

      let agent_filter = agent ? { agent: agent } : {};
      let filter = agent_filter;

      MongoCRUD.dataLoad(req, res, next, {
        collection, filter,
        sort: { changes: -1 }
      }, data => {

        return res.status(200).render("components/partial-fim-changes", {
          ...data,
          no_layout: true,
          active: { files, agent },
          agent_info
        });

      })

    } catch (err) {

      console.log(err);
      return res.status(500).send(err);

    }

  })

});

app.get("/checkapi", (req, res, next) => {

  try {

    let url = req.query.url;

    if (url) {

      axios({
        url, method: 'get',
        headers: {},
        httpsAgent: new https.Agent({ rejectUnauthorized: false, family: 4 })
      }).then(() => {

        return res.status(200).send({
          status: true
        });

      }).catch(err => {
        
        console.error("content.js/checkapi", err.message);
        return res.status(200).send({
          status: false,
          reason: err.toString()
        });

      })

    } else {

      return res.status(404).send({
        status: false,
        reason: "No URL was found"
      });

    }
    
  } catch (err) {
   
    console.error("content.js/checkurl", err.message);
    return res.status(500).send({
      status: false,
      reason: err.toString()
    });

  }

})

app.get("/checkapi/wazuh", (req, res, next) => {

  try {

    const config = getConfig();
    const username = config.wazuh_user;
    const password = config.wazuh_pass;
    const agent = new https.Agent({ rejectUnauthorized: false, family: 4 });

    axios.defaults.headers.common['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    axios.get(`${config.wazuh_host}/security/user/authenticate?raw=true`, { httpsAgent: agent })
    .then(() => {

      return res.status(200).send({
        status: true
      });

    }).catch(err => {

      console.error("content.js/checkapi", err.message);
      return res.status(200).send({
        status: false,
        reason: err.toString()
      });

    })
    
  } catch (err) {
   
    console.error("content.js/checkapi", err.message);
    return res.status(500).send({
      status: false,
      reason: err.toString()
    });

  }

})

app.get("/checkapi/misp", (req, res, next) => {

  try {
    
    // getting the latest config
    const config = getConfig();

    // new misp connection
    const url = `${config.misp_host}/attributes/restSearch/`;

    axios.post(url, {

      returnFormat: 'json',
      type: { OR: ['ip-src', 'ip-dst', 'domain'] },
      limit: 10,
      value: "abc.com"
  
    }, {
      headers: {
        Authorization: config.misp_key
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })
    .then(() => {

      return res.status(200).send({
        status: true
      });

    }).catch(err => {

      console.error("content.js/checkapi", err.message);
      return res.status(200).send({
        status: false,
        reason: err.toString()
      });

    })
    
  } catch (err) {
   
    console.error("content.js/checkapi", err.message);
    return res.status(500).send({
      status: false,
      reason: err.toString()
    });

  }

})

app.get("/checkapi/kibana", (req, res, next) => {

  try {
    
    // getting the latest config
    const CONFIG = getConfig();

    const baseUrl = CONFIG.kibana_host;
  
    const config = {
      method: 'get',
      url: `${baseUrl}/`,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: CONFIG.kibana_user,
        password: CONFIG.kibana_pass
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    };

    axios(config)
    .then(() => {

      return res.status(200).send({
        status: true
      });

    }).catch(err => {

      console.error("content.js/checkapi", err.message);
      return res.status(200).send({
        status: false,
        reason: err.toString()
      });

    })
    
  } catch (err) {
   
    console.error("content.js/checkapi", err.message);
    return res.status(500).send({
      status: false,
      reason: err.toString()
    });

  }

})

app.get("/checkapi/sms", (req, res, next) => {

  try {
    
    // getting the latest config
    return res.status(200).send({
      status: false,
      reason: "Testing development paused"
    });
    
  } catch (err) {
   
    console.error("content.js/checkapi", err);
    return res.status(500).send({
      status: false,
      reason: err.toString()
    });

  }

});

app.get("/check/value", (req, res, next) => {

  /* sample: /content/check/value?col=open_collection&field=field&val=value */
  try {
    
    getDatabase().then(async database => {
      
      let collection = OPEN_COLLECTIONS[req.query.col];
      let field = req.query.field;
      let value = req.query.val;

      /* console.log("content.js", collection, field, value); */

      if (collection && field && value) {

        let check = await database.collection(collection).findOne({[field]: new RegExp(`^${safeRegex(value)}$`, 'i')});

        return res.send({
          unique: check ? false : true
        });

      } else {

        return res.send({
          error: "Something went wrong"
        });

      }
      
    })
    
  } catch (err) {
   
    return res.send({
      error: err
    });

  }

});

// a route with /content/assets/images/ that serves images
app.get("/assets/images/:image", (req, res, next) => {

  try {

    let image = req.params.image;
    const safeFileName = path.basename(image);
    let filePath = path.join(__dirname, `../assets/images/${safeFileName}`);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.sendFile(path.join(__dirname, `../public/images/user-profile.png`));
    }

  } catch (err) {

    next(err);
    
  }

});

module.exports = app;