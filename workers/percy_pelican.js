const cron = require('node-cron');
const axios = require("axios");
const https = require("https");
const {
  DB, getDatabase, MongoMultiCRUD
} = require("../libraries/database");
const {
  sysLog, dataCount,
  getDateString
} = require("../libraries/globals");
const {
  getConfig
} = require("../libraries/getConfig");
const { MAILER, SMS } = require('../libraries/sender');
const { bootWorker } = require('../libraries/worker-tools');

const WORKER_NAME = "Percy Pelican";
const WORKER_FILE = "harvey_hawk";

let DEBUG = false;
const MAX_ITERATION = 1; // no_p throttling may be needed
const MAX_SCAN = 1000; // ioc
const MAX_SCAN_UBA = 5000;
const IP_QUERY = { OR: ["ip-src", "ip-dst"] };
const DOM_QUERY = "domain";
const HASH_QUERY = "md5";

function main() {

  getDatabase()
    .then(async database => {

      const worker_ready = await bootWorker(database, WORKER_NAME, WORKER_FILE, true);

      if (worker_ready) {

        for (let i = 0; i < MAX_ITERATION; i++) {

          // count eph
          if (DEBUG) console.log("countEPH entry");
          await countEPH(database);
          if (DEBUG) console.log("countEPH exit");

          // count AI
          if (DEBUG) console.log("count AI entry");
          await countAILogs(database);
          if (DEBUG) console.log("count AI exit");

          // process ticket escalation, alerts
          if (DEBUG) console.log("processTickets entry");
          await processTickets(database);
          if (DEBUG) console.log("processTickets exit");

          // process UBA activity generation
          if (DEBUG) console.log("processUBA entry");
          await processUBA(database);
          if (DEBUG) console.log("processUBA exit");

          // detect attack patterns
          if (DEBUG) console.log("matchUBAPatterns entry");
          await matchUBAPatterns(database);
          if (DEBUG) console.log("matchUBAPatterns exit");

          // process IOCs
          if (DEBUG) console.log("processIOCs entry");
          await processIOCs(database);
          if (DEBUG) console.log("processIOCs exit");

        }

        await bootWorker(database, WORKER_NAME, WORKER_FILE, false);

      } else {

        if (DEBUG) console.log(`${WORKER_NAME} is not ready (Instance already running)`);

      }

    }).catch(err => {

      sysLog(`${WORKER_NAME} encountered server error`, err);

    });

}

async function countAILogs(database) {

  try {

    const track = await database.collection(DB.track).findOne({ date: getDateString() });
    const all_attacks = track.attacks;
    const total_attacks = track.total_attacks;

    for (const attack of all_attacks) {
      attack.affected = ((attack.count / total_attacks) * 100).toFixed(2);
    }

    return await database.collection(DB.track).updateOne(
      { date: getDateString() },
      { $set: { attacks: all_attacks } }
    );

  } catch (err) {

    sysLog(`${WORKER_NAME} Failed to count AI logs`, err);

  }

}

async function countEPH(database) {

  try {

    let retention = 30; // in minutes
    let collection = DB.eph;
    let timestamps = await database.collection(DB.epm).aggregate([
      {
        $match: {
          date: {
            $lt: new Date(Date.now() - retention * 60 * 1000) // minutes
          }
        }
      },
      {
        $sort: {
          date: -1
        }
      },
      {
        $group: {
          _id: "$timestamp_h",
          count: { $sum: "$count" },
          timestamp: { $first: "$timestamp_h" }
        }
      }
    ]).toArray();

    for (let timestamp of timestamps) {
      await database.collection(collection).updateOne(
        { timestamp: timestamp.timestamp },
        {
          $set: { date: new Date() },
          $inc: { count: timestamp.count }
        },
        { upsert: true }
      );
    }

    // only keep last 30 minutes data
    return database.collection(DB.epm).deleteMany({
      date: {
        $lt: new Date(Date.now() - retention * 60 * 1000) // minutes
      }
    });

  } catch (error) {

    console.error(error);
    sysLog(`${WORKER_NAME} encountered error while counting EPH data!`, error);

  }

}

async function matchUBAPatterns(database) {

  try {

    let collection = DB.uba_acts;
    let max_pattern_length = 5 - 1; // no_f 5 should be dynamic

    // read the last uba activity read cursor
    let read_cursor = await database.collection(DB.eitix).findOne({ title: "uba_read_cursor" }) || { pattern_matching: null };

    // get uba activites (only _id, timestamp and sequence)
    let uba_acts = await database.collection(collection).find({

      _id: read_cursor.pattern_matching ? { $gte: read_cursor.pattern_matching } : { $exists: true }

    }).sort({ _id: 1 }).project({

      _id: 1, timestamp: 1, sequence: 1, action: 1, username: 1, anomaly: 1

    }).limit(MAX_SCAN_UBA).toArray() || [];

    if (DEBUG) console.log(WORKER_NAME, read_cursor, uba_acts.length);

    if (uba_acts && uba_acts.length > max_pattern_length) {

      // get the patterns sorting by priority
      let patterns = await database.collection(DB.uba_pats).find({}).sort({ priority: -1 }).toArray() || [];

      // filter out the activities by username
      let grouped_uba_acts = uba_acts.reduce((acc, uba) => {
        if (!uba.username) {
          return acc; // Skip if username is undefined
        }
        let found = acc.find(group => group.username === uba.username);
        if (found) {
          found.activities.push(uba);
        } else {
          acc.push({ username: uba.username, activities: [uba] });
        }
        return acc;
      }, []);

      for (const group of grouped_uba_acts) {

        let { username, activities } = group;

        // match patterns with the sequence
        let results = matchPatterns(activities, patterns);
        let new_alerts = [];

        // generate an alert for each detection
        for (const pattern of patterns) {

          pattern.matches.forEach(match => {

            // generate an alert
            let uba_alert = {
              username,
              attack: pattern.implication,
              pattern: pattern.pattern,
              risk: pattern.risk,
              date: new Date(),
              actions: match
            };

            new_alerts.push(uba_alert);

          })

        }

        if (new_alerts.length > 0) {

          let generate_alerts = await database.collection(DB.uba_alerts).insertMany(new_alerts);

          if (generate_alerts.insertedCount > 0) {

            sysLog(`${WORKER_NAME} generated ${generate_alerts.insertedCount} UBA alerts!`);

          }

        }

        let uba_anomaly_acts = uba_acts.filter(uba_act => uba_act.anomaly !== undefined);

        for (const act of uba_anomaly_acts) {

          await database.collection(collection).updateOne({
            _id: act._id
          }, {
            $set: { anomaly: act.anomaly }
          });

        }

      }

      return database.collection(DB.eitix).updateOne({
        title: "uba_read_cursor"
      }, {
        $set: { pattern_matching: uba_acts[Math.max(uba_acts.length - max_pattern_length, 0)]._id }
      }, {
        upsert: true
      });

    }

  } catch (error) {

    console.error(error);
    sysLog(`${WORKER_NAME} encountered error while matching UBA attack patterns!`, err);

  }

}

function matchPatterns(activites, patterns) {

  // if any activites got anomaly field then it should 0
  let matching_activities = activites.map(uba_act => uba_act.anomaly ? { sequence: 0 } : { sequence: uba_act.sequence });

  let sequence = matching_activities.map(uba_act => uba_act.sequence);
  let sequenceStr = sequence.join(',');

  /* console.log(WORKER_NAME, matching_activities, sequenceStr); */

  patterns.forEach(item => {

    const pattern = item.pattern;
    // giving boundery to patterns
    const regexPattern = pattern.split(",")
      .map(num => `\\b${num}\\b`).join(",");
    const regex = new RegExp(regexPattern, 'g');
    const matches = sequenceStr.matchAll(regex);

    sequenceStr = sequenceStr.replaceAll(regex, new Array(pattern.split(',').length).fill(0).join(','));

    item.matches = [];

    for (const match of matches) {

      let matched_activities = [];

      const matchIndex = match.index;
      const arrayIndex = sequenceStr.slice(0, matchIndex).split(',').length - 1;

      for (let i = 0; i < pattern.split(',')?.length; i++) {

        if (activites[arrayIndex + i]) {

          let matched_act = activites[arrayIndex + i];
          matched_act.anomaly = pattern;
          matched_activities.push({
            _id: matched_act._id,
            sequence: matched_act.sequence,
            name: matched_act.action
          });

        }

      }

      item.matches.push(matched_activities);

    }

  });

}

function countConsecutiveActions(logs) {

  if (logs.length === 0) return [];

  let result = [];
  let prev = logs[0];
  let frequency = 1;
  let log_ids = [logs[0].log_id];

  for (let i = 1; i < logs.length; i++) {

    let current = logs[i];

    // removing id as these will conflict in insertion
    delete prev._id;
    delete current._id;

    if (current.username === prev.username && current.action === prev.action) {

      frequency++;
      log_ids.push(current.log_id)

    } else {
      // add the previous
      result.push({ ...prev, frequency, logs: log_ids });
      // reset for next 
      prev = logs[i];
      frequency = 1;
      log_ids = [logs[i].log_id];
    }

  }

  result.push({ ...prev, frequency, logs: log_ids }); // Add the last entry
  return result;

}

async function processUBA(database) {

  try {

    // get uba logs
    let new_uba_acts = [];
    let uba_logs = await database.collection(DB.uba_logs).find({
      $or: [{ scanned: { $exists: false } }, { scanned: false }]
    }).sort({ _id: -1 }).limit(MAX_SCAN_UBA).toArray() || [];

    // scanned log ids
    let uba_log_ids = uba_logs.map(log => log._id);

    // take valid logs only
    uba_logs = uba_logs.filter(log => log.username && log.action && log.log_id);

    // reduce uba logs (count frequency)
    new_uba_acts = countConsecutiveActions(uba_logs)

    // update uba activity (if found)
    if (new_uba_acts.length > 0) {

      // get the new activity
      let { username, action, frequency } = new_uba_acts[0];
      // get the last activity (in db)
      let last_uba_act = await database.collection(DB.uba_acts).find().sort({ _id: -1 }).limit(1).toArray() || [];

      // if username and action matches then update and shift

      if (last_uba_act.length > 0 && last_uba_act[0].action === new_uba_acts[0].action) {

        await database.collection(DB.uba_acts).updateOne({
          _id: last_uba_act._id,
          username, action
        }, {
          $inc: { frequency: frequency },
          $push: {
            logs: { $each: new_uba_acts[0].logs }
          }
        });

      } else {

        await database.collection(DB.uba_acts).insertOne(new_uba_acts[0])

      }

      new_uba_acts.shift();

      if (new_uba_acts.length > 0) {

        // insert the other activities
        await database.collection(DB.uba_acts).insertMany(new_uba_acts);

      }

      sysLog(`${WORKER_NAME} processed ${uba_logs.length} UBA logs`);

      /* console.log(WORKER_NAME, uba_log_ids, uba_logs.map(log => log._id)); */

      // mark scanned
      return database.collection(DB.uba_logs).updateMany({ _id: { $in: uba_log_ids } }, { $set: { scanned: true } });

    }

  } catch (err) {

    sysLog(`${WORKER_NAME} failed to process UBA`, err);

  }
}

async function processTickets(database) {

  try {

    let today = new Date();
    let open_tickets = await database.collection(DB.tickets)
      .find({ status: "open" })
      .project({ root_cause: 0, event: 0, log: 0 })
      .toArray() || [];

    return open_tickets.forEach(ticket => {
      try {

        // ticket reminder 

        if (true) {

          // ticket reminder

          let freq = parseInt(ticket.reminder_frequency);
          let opening = ticket.opening;
          let last_reminder = ticket.last_reminder ?? new Date();

          if (opening && last_reminder.toDateString() != today.toDateString()) {

            let divide_factor = 24 * 60 * 60 * 1000;
            let dif = parseInt(Math.abs(today - opening) / divide_factor);

            if (dif && dif % freq == 0) {

              if (ticket.send_email === 'on') {

                MAILER.ticketReminder(ticket.sid, err => {
                  if (err) {

                    sysLog(`${WORKER_NAME} encountered error while emailing!`, err);

                  } else {

                    database.collection(DB.tickets).updateOne({
                      sid: ticket.sid
                    }, {
                      $set: { last_reminder: new Date() }
                    })

                  }
                })

              }

              if (ticket.send_sms === 'on') {

                SMS.ticket("reminder", ticket.sid, err => {
                  if (err) {

                    sysLog(`${WORKER_NAME} encountered error while emailing!`, err);

                  } else {

                    database.collection(DB.tickets).updateOne({
                      sid: ticket.sid
                    }, {
                      $set: { last_reminder: new Date() }
                    })

                  }
                })

              }


            }

          }

          // escalation and expiry
          let phase = ticket.phase;
          let workflow = ticket?.workflow || {};
          let interval = workflow?.interval || [];
          // check workflow phases amount
          let phases = parseInt(workflow?.phases) || [];

          // do an expiry check
          if (phase == phases) {

            // ticket is in the last phase, need to expire next
            if (today >= interval[phase - 1]) {

              // expire the ticket
              database.collection(DB.tickets).updateOne({
                _id: ticket._id
              }, {
                $set: {
                  status: "expired",
                  closing_date: new Date(),
                  phase: parseInt(phase) + 1
                }
              })
                .then(results => {

                  sysLog(`A ticket with ID (${String(ticket?.sid)}) just expired after first escalation.`);

                  if (ticket.send_email === 'on') {

                    MAILER.ticketExpiry(ticket.sid, err => {
                      if (err) {

                        sysLog(`${WORKER_NAME} encountered error while emailing!`, err);

                      }
                    })

                  }

                  if (ticket.send_sms === 'on') {

                    SMS.ticket("expired", ticket.sid, err => {
                      if (err) {

                        sysLog(`${WORKER_NAME} encountered error while emailing!`, err);

                      } else {

                        database.collection(DB.tickets).updateOne({
                          sid: ticket.sid
                        }, {
                          $set: { last_reminder: new Date() }
                        })

                      }
                    })

                  }

                })

            }

          }

          // do an escalation check
          if (phases > 1) {

            // multiphase check
            if (today >= interval[phase - 1]) {

              // escalation has been reached
              console.log(WORKER_NAME, "escalation required for", ticket.sid);
              // upidate the phase of the ticket
              database.collection(DB.tickets).updateOne({
                _id: ticket._id
              }, {
                $set: {
                  phase: parseInt(phase) + 1
                }
              })
                .then(results => {

                  sysLog(`A ticket with ID (${String(ticket?.sid)}) just escalated to next phase.`);

                  if (ticket.send_email === 'on') {

                    // send escalation email
                    MAILER.ticketEscalation(ticket.sid, err => {
                      if (err) {

                        sysLog(`${WORKER_NAME} encountered error while emailing!`, err);

                      }
                    })

                  }

                  if (ticket.send_sms === 'on') {

                    SMS.ticket("escalated", ticket.sid, err => {
                      if (err) {

                        sysLog(`${WORKER_NAME} encountered error while emailing!`, err);

                      } else {

                        database.collection(DB.tickets).updateOne({
                          sid: ticket.sid
                        }, {
                          $set: { last_reminder: new Date() }
                        })

                      }
                    })

                  }

                })

            }


          }

        }

      } catch (err) {

        sysLog(`${WORKER_NAME} encountered internal server error!`, err);

      }
    });

  } catch (err) {

    sysLog(`${WORKER_NAME} failed to manage tickets`, err);

  }

}

async function processIOCs(database) {

  try {

    // load the ip address into the IoC database
    await scanAndLoadIoC(database, DB.w_map, "IP Address", IP_QUERY, "ip");
    // load the file hashes into the IoC database
    await scanAndLoadIoC(database, DB.f_hashes, "MD5 Hash", HASH_QUERY, "md5");
    // load the domains into the IoC database
    await scanAndLoadIoC(database, DB.doms, "Domain", DOM_QUERY, "domain");
    // collect all the unsuccessful IOC items
    await recheckFailedIoC(database);

    // counting section
    const total_count = await dataCount(DB.ioc, {});
    // count DB.surface log where source is MISP
    const misp_count = await dataCount(DB.a_surface, { discovered: "MISP" });

    // write total ioc count
    const total = total_count || 0;
    const total_events = misp_count || 0;

    let time = new Date();
    let today = time.toISOString().split("T")[0];

    return database.collection(DB.iocd).updateOne({
      date: today
    }, {
      $set: {
        updated: time,
        total, total_events
      },
    }, { upsert: true })

  } catch (err) {

    sysLog(`${WORKER_NAME} encountered an server error`, err);

  }

}

async function scanAndLoadIoC(database, collection, type, query, tag) {

  /* @param: database, DB.w_map, type, IP_QUERY, "ip" */

  // process IP Address found from the logs
  const data = await database.collection(collection).find({
    scanned: { $ne: true }
  }).limit(MAX_SCAN).toArray() || [];
  const values = data.map(doc => doc[tag]);

  if (DEBUG) console.log(WORKER_NAME, `total ${type} data to scan:`, data.length);

  if (data.length > 0) {
    // load the data into the IoC database
    await loadIoC(data, type, tag, collection, database);
  }
  if (values.length > 0) {
    // call MISP for finding ip address related logs
    await collectIoC(values, query, database);
  }

}

// recheck the failed IoC
async function recheckFailedIoC(database) {

  const no_response_ioc = await database.collection(DB.ioc).find({
    $or: [
      { response: "Queue" },
      { response: "Failed" },
      { response: { $exists: false } }
    ]

  }).limit(MAX_SCAN).toArray() || [];

  let no_response_ip = no_response_ioc.filter(o => o.type === "ip").map(o => o.data) || [];
  let no_response_domain = no_response_ioc.filter(o => o.type === "domain").map(o => o.data) || [];
  let no_response_hash = no_response_ioc.filter(o => o.type === "md5").map(o => o.data) || [];

  if (no_response_ip.length > 0) {

    await collectIoC(no_response_ip, IP_QUERY, database);

  }

  if (no_response_domain.length > 0) {

    await collectIoC(no_response_domain, DOM_QUERY, database);

  }

  if (no_response_hash.length > 0) {

    await collectIoC(no_response_hash, HASH_QUERY, database);

  }

}

async function loadIoC(data, source, type, collection) {

  const ioc_data = [];
  const scan_data = [];

  data.forEach(doc => {

    const {
      agent,
      log_id,
      tenant_id,
      agent_ip,
      rule_id,
      agent_name,
      description,
      log_source,
      destination,
      full_log
    } = doc;

    // upload the ioc item
    ioc_data.push({
      data: doc[type],
      source, type, agent, log_id,
      agent_ip,
      tenant_id,
      rule_id,
      agent_name,
      description,
      log_source,
      destination,
      full_log,
      date: new Date(),
      response: "Queue"
    })

    scan_data.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { scanned: true }
        },
        upsert: false
      }
    })

    /* scan_data.push({
        filter: { _id: doc._id },
        update: {
            $set: { scanned: true }
        }
    }) */

  });

  if (ioc_data.length > 0) {
    await MongoMultiCRUD.insert(DB.ioc, ioc_data);
  }

  if (scan_data.length > 0) {
    await MongoMultiCRUD.updateBulk(collection, scan_data, {});
  }

}

async function collectIoC(values, query, database) {

  // getting the latest config
  const config = getConfig();
  let responded = false;

  if (!config.misp_key || !config.misp_host) {
    return;
  }

  // new misp connection
  const url = `${config.misp_host}/attributes/restSearch/`;

  const headers = {
    headers: {
      Authorization: config.misp_key
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  }

  if (DEBUG) console.log(WORKER_NAME, `total data for MISP search:`, values.length);

  /* try {
    await axios.head(url, headers);
  } catch (error) {
    console.log(error)
    console.error(WORKER_NAME, `ignoring MISP search as url is unreachable.`);
    return;
  } */

  await axios.post(url, {

    returnFormat: 'json',
    type: query,
    limit: 10,
    value: values

  }, headers)
    .then(async (response) => {

      // upload the reponse
      const result = response.data.response.Attribute;
      responded = true;

      if (DEBUG) console.log(WORKER_NAME, `found ${result.length} MISP events`);

      const value_group = result.reduce((acc, obj) => {

        const { value } = obj;
        if (!acc[value]) {
          acc[value] = [];
        }
        acc[value].push(obj);
        return acc;

      }, {});

      // set response code to Success for this values
      await database.collection(DB.ioc).updateMany({ data: { $in: values } }, {
        $set: {
          response: "Success"
        }
      });

      for (const value in value_group) {

        if (Object.hasOwnProperty.call(value_group, value)) {

          const ioc_events = value_group[value];
          const ioc_count = ioc_events.length || 0;

          // upload the events to surface
          ioc_events.forEach(result => {

            database.collection(DB.ioc).updateOne({ data: value }, {
              $set: {
                ioc_count
              },
              $addToSet: { ioc_events: result.id || "" }
            });

            database.collection(DB.a_surface).updateOne({ id: result.id }, {
              $set: {
                date: new Date().toISOString(),
                enrolled_date: new Date(parseInt(result.timestamp) * 1000).toISOString(),
                description: result.Event?.info,
                risk: "High",
                tenant_id: "All Tenant",
                agent_id: "999",
                severity: 12,
                discovered: "MISP",
                log_data: result
              }
            }, { upsert: true })
              .then(() => { });

          });

        }

      }

    })
    .catch((error) => {

      //console.log("Failed response received!", values);

      responded = true; // failed response but got a response
      console.error(`${WORKER_NAME} couldn't get a response from MISP`);
      // set the error code
      database.collection(DB.ioc).updateMany({ data: { $in: values } }, {
        $set: {
          response: "Failed"
        }
      });

    })
    .finally(() => {

      if (responded === false) {

        //console.log("No response received!", values);

        database.collection(DB.ioc).updateMany({ data: { $in: values } }, {
          $set: {
            response: "Queue"
          }
        });

      }

    })

}

module.exports = (rest_time, active) => {

  let scheduled = false;

  if (active) {

    // immediate call
    main();
    // schedule at first
    scheduled = true

  }

  return cron.schedule(`*/${rest_time} * * * *`, main, { scheduled });

};