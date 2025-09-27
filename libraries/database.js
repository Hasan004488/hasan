// warning: this module can't require globals.js
require("dotenv").config();
const MongoClient = require('mongodb').MongoClient;
const {
  getConfig
} = require("./getConfig");
const { sysLog } = require("./logger");
const { decrypt } = require("./encrypter");

const QUERY_LIMIT = 30;

const cred_data = `c4f1795c38e583fdcb281c3ac6784fce:cd4329672253d4d02b6dee49687dd45f4f9a1abf6aa98b8e65566bd6e5a49d346485e24e488dcdb8a1e9352e6b16fdee8b22b8808140ff29d0e515efcf9817e5eee71bfdbca74e5186054196a775290163a171404183fef455716cde2526c4d9b55a157e24705c85a6149f7f6b6a1d486b4d38755e7eb21ce142f9db5488c8d21bb3eac8f53991c80d4280f7ce3c176d8f3437b75d2e3b45a64f8fe7684d761e132f0e13f08f7c89bda7c35726d01a76bd9f96d10b525af248ad1b03aec9b0c9d762e6917843ecd5a858bda6b91e80d13f0e15b718b615978a34c0989e6d68be8bd78ee5a4da8832a26c59e4efe71ecb311167b1c573477a11bd314662fecc1e`;

const CREDENTIALS = JSON.parse(decrypt(cred_data));

const DB = {
  eitix: "eitix",
  ai_logs: "eitix.ai",
  track: "eitix.track",
  tenants: "eitix.tenants",
  eps: "events.track",
  epm: "events.track.minutes",
  eph: "events.track.hours",
  users: "users",
  roles: "roles",
  risks: "risks",
  rep_sch: "report.schedules",
  rep_sms: "report.sms",
  rep_email: "report.email",
  rep_q: "report.queue",
  playb: "playbooks",
  workf: "workflow",
  attach: "attachments",
  notifs: "notifications",
  temps: "templates",
  playb_temps: "templates.playbook",
  v_cve: "vulnerabilities.cve",
  v_cve_a: "vulnerabilities.cve.archive",
  tickets: "tickets",
  t_comments: "tickets.comments",
  wlog: "wazuh.logs",
  wlog_q: "wazuh.logs.queue",
  agn_p: "agents.profile",
  w_agents: "wazuh.agents",
  w_agents_d: "wazuh.agent.details",
  w_map: "world.map.ip",
  wm_loc: "world.map.locations",
  doms: "domains",
  f_hashes: "file.hashes",
  assets: "assets",
  c_assets: "cloud.assets",
  a_surface: "attack.surface",
  p_surface: "playbook.surface",
  act_log: "logs.activity",
  sys_log: "logs.system",
  err_log: "logs.error",
  fcd: "fim.changes.date",
  fca: "fim.changes.agent",
  fim: "fim.changes",
  fim_a: "fim.changes.archive",
  iocd: "ioc.events.date",
  ioc: "ioc.events.daily",
  a_ioc: "ioc.events.archive",
  uba_logs: "uba.logs",
  uba_acts: "uba.activity",
  uba_acts_a: "uba.activity.archive",
  uba_users: "uba.users",
  uba_pats: "uba.patterns",
  uba_alerts: "uba.anomaly.alerts",
  uba_alerts_a: "uba.anomaly.alerts.archive",
  uba_actions: "uba.user.actions",
  dw_logs: "darkweb.logs",
  ioc_ips: "ioc.ips",
  ioc_sha256: "ioc.sha256",
  ioc_md5: "ioc.md5",
  ioc_hostnames: "ioc.hostnames",
  ioc_domains: "ioc.domains",
  misp_attributes: "ioc.misp_attributes",
}

let connection;
let database;

function getDatabase(config) {

  return new Promise(async (resolve, reject) => {

    if (database) {

      resolve(database);

    } else {

      try {

        let auth = config || getConfig();

        if (!auth.db_user || !auth.db_pass || !auth.db_port) {

          throw new Error("MongoDB Credentials Not Found. Please configure EITIx properly (Admin only command).");

        } else {

          let uri = `mongodb://${auth.db_user}:${auth.db_pass}@127.0.0.1:${auth.db_port}/admin?authSource=admin`;
          let options = {
            useNewUrlParser: true
          }

          const mongoClient = new MongoClient(uri, options);

          connection = await mongoClient.connect();
          database = connection.db(process.env.DATABASE_NAME);

          if (database) return resolve(database);
          else {
            throw new Error("Database Connection Error");
          }
        }

      }
      catch (err) {

        reject(err);

      }

    }
  })
}

const testConnection = () => {

  if (database) return true;
  else return false;

}

const closeConnection = () => {

  database = null;
  if (connection) connection.close();

}


// dedicated to routers only
const MongoCRUD = {

  update(req, res, next, options) {

    /* options = {
        collection: "collection",
        filter: "search critteria for one item",
        data: "date to update",
        extra: "extra options for update",
        redirect: "redirect after successful operation",
        success: "success message",
        failure: "failure message",
        response: "(result, error) => {}"
    } */

    try {

      database.collection(options.collection)
        .updateOne(options.filter, options.data, options.extra || {})
        .then(result => {

          if (options.response) {

            options.response(result, null);

          } else {

            req.flash("success", options.success || "Successfully updated an EITIx content");
            res.redirect(options.redirect || req.get('Referrer') || '/');

          }

        }).catch(err => {

          if (options.response) {

            options.response(null, err);

          } else {

            req.flash("error", options.failure || "Failed to update EITIx content: " + err.message);
            res.redirect(req.get('Referrer') || '/'); // always go back if fails

          }

        })

    } catch (err) {

      next(err);

    }

  },

  updates(req, res, next, options) {

    /* options = {
        collection: "collection",
        filter: "search critteria for one item",
        data: "date to update",
        extra: "extra options for update",
        redirect: "redirect after successful operation",
        success: "success message",
        failure: "failure message",
        response: "(result, error) => {}"
    } */

    try {

      database.collection(options.collection)
        .updateMany(options.filter, options.data, options.extra || {})
        .then(result => {

          if (options.response) {

            options.response(result, null);

          } else {

            req.flash("success", options.success || "Successfully updated some EITIx content");
            res.redirect(options.redirect || req.get('Referrer') || '/');

          }


        }).catch(err => {

          if (options.response) {

            options.response(null, err);

          } else {

            req.flash("error", options.failure || "Failed to update EITIx content: " + err.message);
            res.redirect(req.get('Referrer') || '/'); // always go back if fails

          }

        })

    } catch (err) {

      next(err);

    }

  },

  delete(req, res, next, options) {

    /* options = {
        collection: "collection",
        filter: "search critteria for one item",
        redirect: "redirect after successful operation",
        success: "success message",
        failure: "failure message",
        not_found: "when delete item is not found",
        response: "(result, error) => {}"
    } */

    try {

      database.collection(options.collection).deleteOne(options.filter)
        .then(result => {

          if (result.deletedCount > 0) {

            if (options.response) {

              options.response(result, null);

            } else {

              req.flash("success", options.success || "Successfully deleted an EITIx content");
              res.redirect(options.redirect || req.get('Referrer') || '/');

            }

          } else {

            if (options.response) {

              options.response(null, options.not_found || "Couldn't delete any EITIx content");

            } else {

              req.flash("warning", options.not_found || "Couldn't delete any EITIx content");
              res.redirect(req.get('Referrer') || '/');

            }

          }

        }).catch(err => {

          if (options.response) {

            options.response(null, err);

          } else {

            req.flash("error", options.failure || "Failed to delete EITIx content: " + err.message);
            res.redirect(req.get('Referrer') || '/'); // always go back if fails

          }

        })

    } catch (err) {

      next(err);

    }

  },

  insert(req, res, next, options) {

    /* options = {
        collection: "collection"
        data: "date to update"
        redirect: "redirect after successful operation"
        success: "success message"
        failure: "failure message"
    } */

    try {

      database.collection(options.collection).insertOne(options.data)
        .then(result => {

          req.flash("success", options.success || "Successfully created an EITIx content");
          res.redirect(options.redirect || req.get('Referrer') || '/');


        }).catch(err => {

          req.flash("error", options.failure || "Failed to create an EITIx content: " + err.message);
          res.redirect(req.get('Referrer') || '/'); // always go back if fails

        })

    } catch (err) {

      next(err);

    }

  },

  async seqInsert(req, res, next, options) {

    /* 
    
    options = {
      prefix: "sequation name prefix",
      collection: "collection",
      data: "data to update",
      redirect: "redirect after successful operation",
      success: "success message",
      failure: "failure message",
      response: "(sid, error) => {}"
    }

    */

    try {

      let new_count = "";

      // check the last element sid and increment that
      const last_doc = await database.collection(options.collection)
        .find().limit(1).sort({ sid: -1 }).toArray() || [{}];

      if (last_doc.length > 0 && last_doc[0]?.sid) {

        // console.log("database.js", last_doc[0]);
        const last_sid_count = last_doc[0].sid?.match(/\d+$/)?.[0] || 10000;
        new_count = parseInt(last_sid_count) + 1;

      } else {

        // get the total docs count
        const total_count = await database.collection(options.collection).countDocuments();
        new_count = parseInt(total_count + 10001);

      }

      // addding the new sequence ID
      const new_sid = options.prefix + new_count;
      options.data.sid = new_sid;

      database.collection(options.collection).insertOne(options.data)
        .then(() => {

          if (options.response) {

            options.response(new_sid, null);

          } else {

            req.flash("success", options.success || "Successfully created an EITIx content");
            res.redirect(options.redirect || req.get('Referrer') || '/');

          }


        })
        .catch(err => {

          if (options.response) {

            options.response(null, err);

          } else {

            req.flash("error", options.failure || "Failed to create an EITIx content: " + err.message);
            res.redirect(req.get('Referrer') || '/'); // always go back if fails

          }


        });

    } catch (err) {

      next(err);

    }

  },

  // sends a the pagination results with pagination data
  async dataLoad(req, res, next, options, data) {

    /*
    [returns an object containing the data] 
    options = {
        collection: "database collection",
        filter: "data collecting filter",
        project: "document property projection",
        sort: "sorting method",
        page: "page number",
        info: {
            title: "page title",
            file: "page view file",
            active: "active tab info"
            ...etc (all will be passed into the page)
        }
    } */

    try {

      let {
        collection, filter = {}, project = {},
        sort = { _id: -1 }
      } = options;

      let page = parseInt(req.query.page) || 1;
      const aggre_total = await database.collection(collection).aggregate([{ $match: filter }, { $count: "total" }]).toArray() || [];
      const total_results = aggre_total[0] ? aggre_total[0].total : 0;
      let startIndex = ((page - 1) * QUERY_LIMIT) || 0;
      let endIndex = (startIndex + QUERY_LIMIT) > total_results ? total_results : (startIndex + QUERY_LIMIT) || 0;
      let total_page = Math.ceil(total_results / QUERY_LIMIT) || 1;

      if (page > total_page) {

        req.flash("error", "Invalid page number!");
        return res.redirect(req.get('Referrer') || '/');

      }

      database.collection(collection).find(filter)
        .skip(startIndex)
        .limit(QUERY_LIMIT)
        .project(project)
        .sort(sort).toArray()
        .then(async results => {

          // send data
          return data({
            data: results,
            total: total_results,
            pagination: {
              curr: page,
              total: total_page,
              range: [startIndex, endIndex]
            }
          });

        }).catch(err => {

          next(err)

        })

    } catch (err) {

      next(err);

    }

  },

  async getSID(database, options) {

    try {

      let new_count = "";

      // check the last element sid and increment that
      const last_doc = await database.collection(options.collection)
        .find().limit(1).sort({ sid: -1 }).toArray() || [{}];

      if (last_doc.length > 0 && last_doc[0]?.sid) {

        // console.log("database.js", last_doc[0]);
        const last_sid_count = last_doc[0].sid?.match(/\d+$/)?.[0] || 10000;
        new_count = parseInt(last_sid_count) + 1;

      } else {

        // get the total docs count
        const total_count = await database.collection(options.collection).countDocuments();
        new_count = parseInt(total_count + 10001);

      }

      // addding the new sequence ID
      const new_sid = options.prefix + new_count;

      return new_sid;

    } catch (error) {

      console.error(error);
      return null;

    }

  }

}

// for multipldate sequential data load
const MongoMultiCRUD = {

  async update(collection, data, extra = {}) {

    /* 
    data: {
      filter: "{ filter object }",
      update: "{ { update body } }"
    } 
    */

    let count = 0;

    for (const document of data) {

      const { filter, update } = document;

      try {

        await database.collection(collection).updateOne(filter, update, extra);
        count++;

      } catch (error) {

        console.error('Error updating document:', error);

      }

    }

    return count;

  },

  async updateBulk(collection, data, extra = {}) {

    /* 
    data: [
      { updateOne: { filter: { _id: ObjectId('...') }, update: { $set: { ... } } } },
      { updateOne: { filter: { _id: ObjectId('...') }, update: { $set: { ... } } } }
    ]
    */

    try {

      if (data.length > 0) {

        const result = await database.collection(collection).bulkWrite(data, extra);
        return result.modifiedCount;

      } else {

        return 0;

      }

    } catch (error) {

      console.error('Error updating document:', error);
      return 0;

    }

  },

  async insert(collection, data) {

    try {

      await database.collection(collection).insertMany(data);

    } catch (error) {

      console.error('Error updating document:', error);

    }

  }

}


module.exports = {

  DB, MongoCRUD, MongoMultiCRUD,
  CREDENTIALS,
  testConnection,
  getDatabase,
  closeConnection,

  // database testing middleware
  requireDB(req, res, next) {

    let configuration = getConfig();

    getDatabase(configuration)
      .then(async database => {

        next()

      })
      .catch((err) => {

        sysLog("Failed connecting to the database", err);
        res.render("pages/misc/database-error", {
          error_message: err.message
        });

      })

  }

};