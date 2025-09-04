require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const { getConfig } = require("./getConfig");
const {
  DB, getDatabase
} = require("../libraries/database");

const EITIX = {
  default_admin_user: "EITIX Admin",
  default_admin_email: "admin@eitix.com",
  default_admin_pass: "eitixadmin",
  default_user_pass: "eitixuser",
  backup_dir: "./backups",
  query_limit: 30,
  truncate_limit: 100,
  max_assets: 100,
  default_tenant: "tenant",
  na_msg: "unknown",
}

// cleaner retention rate in days
const RETENTION = {
  events: 7,
  vuls: 90,
  archive_wlog: 90,
  system_log: 90
}

const RISKS = {

  getRisk(level, options) {

    let low = options?.low_range || 5;
    let med = options?.medium_range || 9;

    if (level <= low) return "Low";
    else if (level > low && level <= med) return "Medium";
    else return "High";

  },

  countRisk(events, factors) {

    try {

      // get the severity from database
      let { alert_low_events, alert_medium_events, alert_high_events } = events;
      let { low_factor, medium_factor, high_factor } = factors;

      let risk_counts = {
        low: (low_factor || 1) * alert_low_events,
        medium: (medium_factor || 3) * alert_medium_events,
        high: (high_factor || 5) * alert_high_events,
      }

      let total_risk = risk_counts.low + risk_counts.medium + risk_counts.high;

      let low_risks = 0;
      let medium_risks = 0;
      let high_risks = 0;

      if (total_risk !== 0) {
        low_risks = risk_counts.low / total_risk * 100;
        medium_risks = risk_counts.medium / total_risk * 100;
        high_risks = risk_counts.high / total_risk * 100;
      }

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

      return { low_risks, medium_risks, high_risks };

    } catch (error) {

      console.error(error)
      return error;

    }

  },

  source: {
    wazuh: "Wazuh",
    eitix: "EITIx",
    misp: "MISP"
  }

};

const ACCESS_LIST = [

  { access: "default", control: "No Permisssions", protected: true },
  { access: "admin", control: "All Permisssions", protected: true },
  { access: "view", control: "Ability to view all basic pages" },
  { access: "report", control: "Ability to generate reports, playbook, schedule tasks." },
  { access: "syslog", control: "Ability to view system logs, error logs, activity logs" },
  { access: "modifyAsset", control: "Ability to modify and access asset management" },
  { access: "createAsset", control: "Ability to create assets (modifyAsset permission required)" },
  { access: "deleteAsset", control: "Ability to delete assets (modifyAsset permission required)" },
  { access: "createTicket", control: "Ability to create tickets" },
  { access: "modifyTicket", control: "Ability to modify any tickets (closing, reopening, commenting)" },
  { access: "manageUser", control: "Ability to access user management page", risk: true },
  { access: "createUser", control: "Ability to create users (manageUser permission required)", risk: true },
  { access: "deleteUser", control: "Ability to delete any user (manageUser permission required)", risk: true },
  { access: "modifyUser", control: "Ability to update any user (manageUser permission required)", risk: true },
  { access: "blockUser", control: "Ability to block any user (manageUser permission required)", risk: true },
  { access: "control", control: "Ability to access critical control panels (access to server settings)", risk: true },
  { access: "manageRole", control: "Ability to manage and update roles and permissions", protected: true },
  { access: "createRole", control: "Ability to create new set of roles and permissions", protected: true }

];

const WLOG_IDFS = [

  { name: "Log ID", type: 'string', log: "id" },
  { name: "Agent ID", type: 'string', log: "agent.id" },
  { name: "Rule ID", type: 'string', log: "rule.id" },
  { name: "Tenant ID", type: 'string', log: "tenant_id" },
  { name: "Agent IP", type: 'string', log: "agent.ip" },
  { name: "Agent Name", type: 'string', log: "agent.name" },
  { name: "Level", type: 'int', log: "rule.level" },
  { name: "Description", type: 'string', log: "rule.description" },
  { name: "Fired Times", type: 'int', log: "rule.firedtimes" },
  { name: "Decoder Name", type: 'string', log: "decoder.name" },
  { name: "Source IP", type: 'string', log: "source" },
  { name: "Full Log", type: 'string', log: "full_log" },

];

// no_f = replace names with DB.name
// masking actual collection names for frontend use
// frontend can directly query these collection openly (no permissions)
const OPEN_COLLECTIONS = {
  users: DB.users,
  rep_sch: DB.rep_sch,
  v_cve: "vulnerabilities.cve",
  v_cve_a: "vulnerabilities.cve.archive",
  tickets: DB.tickets,
  wlog: "wazuh.logs",
  assets: "assets",
  a_surface: "attack.surface",
  fim: "fim.changes",
  fim_a: "fim.changes.archive",
  wf: DB.workf,
  pb: DB.playb,
};

function pad(num, size) {

  var s = "000000000" + num;
  return s.slice(s.length - size);

}

function access(permission = "", permissions = []) {

  if (permissions.includes("admin") || permissions.includes(permission)) {
    return true
  } else return false

}

function permit(name) {

  return permit[name] || (permit[name] = function (req, res, next) {

    if (access(name, req.session.permissions)) {

      next()

    } else {

      req.flash("error", "You do not have required permission! Go back or login from another account.");
      res.redirect("/auth/login")

    }

  })

}

function title(value = "") {

  if (typeof value === 'string') {

    return value.replace(/[-_,:;"'.]/g, " ").replace(/\b\w+\b/g, l => l.charAt(0).toUpperCase() + l.slice(1));

  } else return value;

}

function isNumber(value) {
  return /^\d+(\.\d+)?$/.test(value);
}

function safeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// check if an url is up
async function checkUrl(url) {
  try {

    const response = await axios.get(url);
    console.log(response.status);
    return response.status >= 200 && response.status < 300;

  } catch (error) {

    return false;

  }
}

function renderJSONInfo(data, exclude = []) {

  let render = "";

  for (const prop in data) {

    if (exclude.includes(prop)) continue;

    if (typeof data[prop] === "object") {

      if (Array.isArray(data[prop])) {

        if (data[prop].length > 0) {

          // nested block
          render += `
            <details>
                <summary class="bg-gray p-1 fclickable-h border-start border-3 border-primary">
                    <strong class="">${title(isNumber(prop) ? parseInt(prop) + 1 : prop)} :</strong>
                </summary>
                <div class="border-start border-3 ps-3">${renderJSONInfo(data[prop])}</div>
            </details>
        `;

        }


      } else {

        if (data[prop] && Object.keys(data[prop])?.length > 0) {

          // nested block
          render += `
              <details>
                  <summary class="bg-gray p-1 clickable-h border-start border-3 border-primary">
                      <strong class="">${title(prop)} :</strong>
                  </summary>
                  <div class="border-start border-3 ps-3">${renderJSONInfo(data[prop])}</div>
              </details>
          `;

        }

      }

    } else {

      // render block
      render += `
      <div class="ps-2 border-start border-3 border-primary border-b-mini">
          <div class="p-1 border-0 fw-bold">
              ${title(isNumber(prop) ? parseInt(prop) + 1 : prop)} :
          </div>
          <div class="p-1 text-break ps-3">${data[prop] || 'No information'}</div>
      </div>
      `;

    }

  }

  return render;

}

function checkAllowedUser(selected_users_str, test_user) {

  try {

    if (test_user == EITIX.default_admin_email) return true;

    let users = JSON.parse(selected_users_str);
    let found = users.some(user => user.email == test_user);

    return found;

  } catch (err) {

    return false;

  }

}

async function dataLoad(collection, search_filter = {}, page = 1, projetion) {

  return getDatabase()
    .then(async database => {

      try {

        const sorting = { _id: -1 };
        const projecting = { unknown: 0 };
        const startIndex = ((page - 1) * EITIX.query_limit) || 0;
        const results = await database.collection(collection).aggregate([
          { $match: search_filter },
          { $sort: sorting },
          { $skip: startIndex },
          { $limit: EITIX.query_limit },
          { $project: projetion || projecting }
        ]).toArray() || [];

        if (results.length > 0) {

          return results;

        } else {

          return false;

        }

      } catch (err) {

        console.error(err);
        return false;

      }

    })

}

async function dataCount(collection, search_filter = {}) {

  return getDatabase()
    .then(async database => {

      try {

        const results = await database.collection(collection).aggregate([{ $match: search_filter }, { $count: "total" }]).toArray();
        const total = results[0]?.total || 0;
        return total;

      } catch (err) {

        console.error(err);
        return 0;

      }

    })

}

function createDirectory(directory) {

  if (!fs.existsSync(directory)) {

    fs.mkdirSync(directory, { recursive: true });

  }

}

function getDateString(date, days = 0) {

  // returns date in a format that supported by html, ISO, etc (YYYY-MM-DD)
  let today = date || new Date();
  today.setDate(today.getDate() + days);
  return `${pad(today.getFullYear(), 4)}-${pad(today.getMonth() + 1, 2)}-${pad(today.getDate(), 2)}`;

}

function timeAgo(dateStr) {
  let date;
  try {
    date = new Date(dateStr);
  } catch (e) {
    return 'Unknown';
  }
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;

  return date.toLocaleString(); // fallback to full date
}

module.exports = {

  EITIX, ACCESS_LIST, OPEN_COLLECTIONS,
  WLOG_IDFS,
  RETENTION, RISKS, safeRegex,
  pad, access, permit, checkUrl,
  renderJSONInfo, dataLoad, dataCount,
  getDateString,

  format: {

    checkAllowedUser, renderJSONInfo, getDateString, timeAgo,

    renderBadge(text, type, block = true) {
      return `
        <span class="d-${block ? "block" : "inline"} badge bg-${type} rounded-pill">${text}</span>
      `;
    },

    title(value = "") {

      if (typeof value === 'string') {

        return value.replace(/[-_,:;"'.]/g, " ").replace(/\b\w+\b/g, l => l.charAt(0).toUpperCase() + l.slice(1));

      } else return value;

    },

    // keep the date part from toString
    showDate(str = "") {
      return str.slice(0, 15)
    },

    // keep the date and time parts from toString
    showDateTime(str = "") {
      return str.slice(0, 24)
    },

    hourTime(hour = 0) {

      // 12 hour system
      if (hour > 12) {
        return (hour - 12) + " PM";
      } else if (hour === 12) {
        return "12 PM";
      } else if (hour === 0) {
        return "12 AM";
      } else {
        return hour + " AM";
      }

    },

    htmlToday(days = 0) {

      // returns date in a format that supported by html
      let today = new Date();
      today.setDate(today.getDate() + days);
      return `${pad(today.getFullYear(), 4)}-${pad(today.getMonth() + 1, 2)}-${pad(today.getDate(), 2)}`;

    },

    getLocaleString(timestamp) {

      if (timestamp) {

        let date = new Date(timestamp);
        return [date.toLocaleDateString(), date.toLocaleTimeString()];

      } else {

        return null;

      }

    },

    toArray(value) {
      return Array.isArray(value) ? value : [value];
    },

    number(number) {

      if (!number) return 0;

      if (number < 1000) {
        return number.toString();
      } else if (number < 1000000) {
        return (number / 1000).toFixed(1) + 'K';
      } else {
        return (number / 1000000).toFixed(1) + 'M';
      }

    },

    truncateText(text, length, reverse = false) {

      text = String(text);
      if (!text || text === "") return "";
      let truncated_value;
      if (reverse) {
        truncated_value = (text.length > length ? "..." : "") + text.slice(text.length - length);
      } else {
        truncated_value = text.slice(0, length) + (text.length > length ? "..." : "");
      }
      return truncated_value;

    }

  },

  requireLogin(req, res, next) {

    if (req.session.token) {

      // get the jwt token
      let token = req.session.token;

      // verify the token
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {

        if (err) {

          req.flash("error", "Your authorization failed!");
          res.redirect("/auth/login");

        } else {

          getDatabase().then(database => {

            database.collection(DB.roles).findOne({ name: user.role })
              .then(roles => {

                if (roles != null) {

                  database.collection(DB.users).findOne({ email: user.email })
                    .then(user_db => {

                      if (user_db.blocked == true) {

                        req.flash("error", "This user account has been blocked!");
                        res.redirect("/auth/login");

                      } else {

                        // this user is ready to pass
                        let permissions = roles.permissions.split(",");
                        // set the locals
                        res.locals.username = user_db.full_name;
                        res.locals.email = user.email;
                        res.locals.role = user.role;
                        res.locals.profile_image = user_db.profile_image;
                        res.locals.permissions = permissions;
                        // set the sessions
                        req.session.username = user_db.full_name;
                        req.session.email = user.email;
                        req.session.role = user.role;
                        req.session.profile_image = user_db.profile_image;
                        req.session.permissions = permissions;
                        // move on
                        next();

                      }

                    })
                    .catch(err => {

                      req.flash("error", "This user account may no longer available!");
                      res.redirect("/auth/login");
                      console.error(err)

                    })

                } else {

                  req.flash("error", "This user account's role is not available!");
                  res.redirect("/auth/login");

                }

              })
              .catch(err => {

                next(err);

              })
          })

        }
      })
    }
    else {
      res.redirect("/auth/login");
    }
  },

  controlEitix(req, res, next) {

    let configuration = getConfig();

    if (configuration.admin_created == true) {

      if (access("control", req.session.permissions)) {

        next()

      } else {

        req.flash("error", "You're not authorized to control EITIx!")
        res.redirect(req.get('Referrer') || '/')

      }

    } else {
      // skip permission check if admin is not created already
      next()
    }
  },

  safeRole(role) {

    return role !== "Admin" && role !== "User";

  },

  sysLog(log_message, log_err, log_json = {}) {

    try {

      let date_time = new Date().toLocaleString();
      let date = date_time.split(",")[0].replace(/\//g, "-");
      let db = DB.sys_log;
      let directory = `./logs/${date}`;
      let filename = `${directory}/system.log`;
      let full_log = `[${date_time}] ${log_message}`;
      let errorString = "Not Found";
      let logJSON = "{}";
      let errorJSON = "{}";

      createDirectory(directory);

      if (log_err) {

        db = DB.err_log;
        filename = `${directory}/error.log`;

        if (log_err.stack) {

          log_err = log_err.stack;

        } else {

          // if any object do not contains stack it should contain message
          log_err = log_err.message || log_err;

        }

        errorString = log_err?.toString();
        errorJSON = JSON.stringify(log_err);

        console.error(log_message, log_err);

        fs.appendFile(filename, `${full_log}\n`, () => { });
        fs.appendFile(filename, `${errorString}\n`, () => { });
        fs.appendFile(filename, `${errorJSON}\n`, () => { });

      } else {

        console.log(log_message);

        fs.appendFile(filename, `${full_log}\n`, () => { });
        fs.appendFile(filename, `${logJSON}\n`, () => { });

      }

      getDatabase()
        .then(database => {

          database.collection(db).insertOne({
            date: date_time,
            log: log_message,
            error: errorString,
            json: errorJSON
          })

        })
        .catch(err => {

          console.error("Can't write the activity log in the database");
          console.error(err);

        })

    } catch (err) {

      console.error(`Error processing system logs`);
      console.error(err);

    }

  },

  actLog(log_message) {

    try {

      let date_time = new Date().toLocaleString();
      let date = date_time.split(",")[0].replace(/\//g, "-");
      let directory = `./logs/${date}`;
      let filename = `${directory}/activity.log`;
      let full_log = `[${date_time}] ${log_message}`;

      createDirectory(directory);

      // write log 
      console.log(full_log);

      // write file
      fs.appendFile(filename, `${full_log}\n`, () => { });

      // upload to the database
      getDatabase().then(database => {
        database.collection(DB.act_log).insertOne({
          date: date_time,
          log: log_message
        })
      })
        .catch(err => {

          console.error("Can't write the activity log in the database");
          console.error(err);

        })

    } catch (err) {

      console.error(`Error processing activity logs`);
      console.error(err);

    }

  },

  timeDif(old_date, factor = "day") {

    // calculate difference for days
    try {

      let new_date = new Date();
      let divide_factor = 24 * 60 * 60 * 1000;

      if (factor == "minute") {

        divide_factor = 60000;

      }

      return parseInt(Math.abs(new_date - old_date) / divide_factor);

    } catch (err) {

      console.error("globals.js/timeDif", err);
      return -1;

    }

  },

  getLogCollection(date, days) {

    return DB.wlog + ".data." + getDateString(date, days);

  },

  generateSearchQuery(q) {

    /* full featured search query for wazuh log searching */

    // generate other search filters
    let filters = [];
    let idfs = Array.isArray(q.idfs) ? q.idfs : [q.idfs];
    let types = Array.isArray(q.types) ? q.types : [q.types];
    let operators = Array.isArray(q.operators) ? q.operators : [q.operators];
    let values = Array.isArray(q.values) ? q.values : [q.values];
    let idfs_len = idfs.length;

    for (let index = 0; index < idfs_len; index++) {

      let idf = idfs[index];
      let type = types[index];
      let operator = operators[index];
      let value = values[index];

      if (!value) continue; // skip if there's no value

      if (type == 'int') {

        let int_value = parseInt(value);
        let filter = { [idf]: int_value };

        if (operator == "greater_than") {

          filter = { [idf]: { $gt: int_value } };

        } else if (operator == "less_than") {

          filter = { [idf]: { $lt: int_value } };

        } else if (operator == "greater_than_equal") {

          filter = { [idf]: { $gte: int_value } };

        } else if (operator == "less_than_equal") {

          filter = { [idf]: { $lte: int_value } };

        } else if (operator == "multiple_of") {

          filter = { [idf]: { $mod: [int_value, 0] } };

        }

        filters.push(filter);

      } else {

        let filter = { [idf]: RegExp(safeRegex(value?.trim()), 'i') };

        if (operator == "equal_to") {

          filter = { [idf]: value?.trim() };

        } else if (operator == "not_contains") {

          filter = { [idf]: { $not: RegExp(safeRegex(value?.trim()), 'i') } };

        }

        filters.push(filter);

      }

    }

    // final search query
    if (filters.length > 0) {

      if (q._boolean_matrix) {

        let and_filters = filters.map((f, idx) => q._boolean_matrix[idx] === 1);
        let or_filters = filters.map((f, idx) => q._boolean_matrix[idx] === 0);;

        /* console.log(add_filters, or_filters); */

        return {
          $and: [
            ...and_filters,
            {
              $or: or_filters
            }
          ]
        };

      } else if (q._boolean == "or") {

        return {
          $or: filters
        };

      } else {

        return {
          $and: filters
        };

      }


    } else return {};


  },

  getMongoQuery(normal_query, schema = {}) {

    /* medium featured search query for any frontend page */

    /* 
    normal_query = {
      idf: search_value,
      type_idf: type,
      idf1: search_value1,
      type_idf1: type1,
    },
    schema = {
      [prop]: {
        type: "int", 
        operator: "gte"
      }
    }
    */

    let query = {};

    for (const key in normal_query) {
      if (
        normal_query.hasOwnProperty(key) &&
        key !== "page" && key !== "count" &&
        key !== "collection" && key !== "view"
      ) {

        if (schema[key]?.type === 'int') {

          if (schema[key]?.operator === 'gte') {

            query[key] = { $gte: parseInt(normal_query[key]) };

          } else {

            query[key] = parseInt(normal_query[key]);

          }

        } else {

          if (key.startsWith("op_")) {

            continue;

          } else {

            let operator = normal_query["op_" + key];
            let value = normal_query[key];

            if (operator === "equal_to") {

              query[key] = value?.trim();

            } else if (operator === "not_contains") {

              query[key] = { $not: RegExp(safeRegex(value?.trim()), 'i') };

            } else {

              query[key] = { $regex: safeRegex(value?.trim()), $options: "i" };

            }

          }

        }

      }
    }

    return query;

  }

}