// modules
require("dotenv").config();
const cron = require('node-cron');
const {
  sysLog, RISKS, getLogCollection,
  getDateString
} = require("../libraries/globals");
const {
  DB, getDatabase, MongoMultiCRUD
} = require("../libraries/database");
const { exec } = require('child_process');
const EventScanner = require("../libraries/event-scanner");
const { bootWorker, adaptiveScaleDecision } = require("../libraries/worker-tools");
const { pushJob } = require("../libraries/queue");
const { default: axios } = require("axios");

const WORKER_NAME = "Eddy Eagle";
const WORKER_FILE = "eddy_eagle";
const DEFAULT_TENANT = "default";
const MAX_ITERATION = 10;
const PROCESS_LIMIT = 15000;
const MAX_LOG = 1000; // logs to store on the track for ai data
let DEBUG = false;

function main() {

  getDatabase()
    .then(async database => {

      const worker_ready = await bootWorker(database, WORKER_NAME, WORKER_FILE, true);

      if (worker_ready) {

        for (let i = 0; i < MAX_ITERATION; i++) {

          // processes here
          await processData(database);

          // break the loop if repeatation is not required
          const scaling_needed = await adaptiveScaleDecision(
            database,
            {
              collection: DB.wlog_q,
              filter: {},
              cross_limit: 15000
            }
          );

          if (!scaling_needed) break;

        }

        await bootWorker(database, WORKER_NAME, WORKER_FILE, false);

      } else {

        if (DEBUG) console.log(`${WORKER_NAME} is not ready (Instance already running)`);

      }

    }).catch(err => {

      sysLog(`${WORKER_NAME} encountered server error`, err);

    });

}

async function processData(database) {

  try {

    // data holders
    const log_data = [];
    const events_data = [];
    const events_data_set = new Set();
    const playbook_events = [];
    const playbook_data = [];
    const fim_data = [];
    const rule_ids = new Map();
    // count holder
    const scanner = new EventScanner();
    // attach surface control
    const attacksc = await database.collection(DB.eitix).findOne({ title: "attack_surface" }) || {};
    // get the active non firing playbooks
    const active_playbooks = await getPlaybooks(database, { firing_required: { $ne: true } });
    const event_playbooks = await getPlaybooks(database, {});
    // get data portion from the queue
    let data_portion = await database.collection(DB.wlog_q).find({}).limit(PROCESS_LIMIT).toArray() || [];
    // remove these ids from the queue later
    const portion_ids = data_portion.map(hit => hit._id);
    // main uploading place
    const collection = getLogCollection();

    // making sure each hit got an id
    data_portion = data_portion.filter(hit => hit.id);

    if (data_portion.length < 1) {

      if (DEBUG) console.log(WORKER_NAME, "no data to process. checking out...");
      return;

    } else {

      if (DEBUG) console.log(WORKER_NAME, "fetched all required data, ready to process...");

    }

    // process and separate data
    data_portion.forEach(hit => {

      const parsed_data = hit || null;

      if (parsed_data) {

        // remove the queue _id
        delete parsed_data._id;

        // swap  the timestamp
        let timestamp = parsed_data['etx_timestamp'] || new Date().toISOString();
        parsed_data.log_timestamp = parsed_data['timestamp'];
        parsed_data.timestamp = timestamp; // overriding the timestamp for exact output
        parsed_data.tenant_id = DEFAULT_TENANT;

        // remove the etx_timestamp
        delete parsed_data['etx_timestamp'];

        // extract data
        let tenant_id = parsed_data.tenant_id;
        let log_id = parsed_data.id;
        let source = parsed_data.data?.srcip || parsed_data.agent?.ip;
        let destination = parsed_data.data?.dstip;
        let agent_id = parsed_data.agent?.id;
        let rule_id = parsed_data.rule?.id || 0;
        let level = parsed_data.rule?.level || 0;
        let firedtimes = parsed_data.rule?.firedtimes || 0;
        let description = parsed_data.rule?.description;

        // store rule id
        rule_ids.set(rule_id, {
          id: rule_id,
          description: description
        });

        // store extra info
        parsed_data.source = source;
        parsed_data.destination = destination;
        parsed_data.group = collection;
        // store full data into wazuh logs
        log_data.push(parsed_data);

        // risk counting
        let risk = RISKS.getRisk(level, attacksc);

        // events counting
        scanner.count({
          risk, rule_id, agent_id, level
        });

        // events scanning
        scanner.scanPciDss({
          pci_dss: parsed_data?.rule?.pci_dss,
          agent_id
        })

        if (parsed_data.syscheck?.path) {

          // processing fim data
          let data = parsed_data.syscheck;
          fim_data.push({
            updateOne: {
              filter: {
                path: data.path,
                agent: agent_id
              },
              update: {
                $set: {
                  agent: agent_id, log_id, tenant_id,
                  date: new Date(),
                  ...data
                },
                $inc: { changes: 1 }
              },
              upsert: true
            }
          })

        }

        if (risk) {

          // processing attack surface data
          let data = {
            date: timestamp,
            description: description,
            severity: level, risk,
            discovered: RISKS.source.wazuh,
            agent_id, rule_id, firedtimes,
            source, destination,
            log_id: log_id, tenant_id,
            group: collection
          }

          let uniqueKey = `${agent_id}-${rule_id}`;
          if (!events_data_set.has(uniqueKey)) {

            events_data_set.add(uniqueKey);
            let data_update = {
              updateOne: {
                filter: { agent_id, rule_id },
                update: {
                  $set: {
                    date: timestamp,
                    description: description,
                    severity: level, risk,
                    discovered: RISKS.source.wazuh,
                    source, destination, firedtimes,
                    log_id, tenant_id,
                    group: collection
                  }
                },
                upsert: true
              }
            };

            events_data.push(data_update);

          }

          /* events_data.push(data); */

          // processing surface playbook
          event_playbooks.forEach((playbook, idx) => {

            if (fireablePlaybook(playbook, parsed_data)) {

              event_playbooks.splice(idx, 1);
              playbook_events.push({
                ...data,
                playbook_id: playbook.sid
              });

              return database.collection(DB.playb).updateOne({ _id: playbook._id }, {
                $inc: { fired: 1 }
              });


            }

          });

        }

        // processing active playbboks for all
        active_playbooks.forEach(async playbook => {

          if (fireablePlaybook(playbook, parsed_data)) {

            // if it matches the rules
            playbook_data.push({
              _id: playbook._id,
              firing_required: true,
              data: parsed_data
            })

          }

        });

      }

    });

    if (log_data.length < 1) return; // skip further processing if nothing avaiable

    if (DEBUG) {
      console.log(WORKER_NAME, "completed data processing, ready to upload...");
      console.log(WORKER_NAME, `uploading ${log_data.length} wazuh logs...`);
      console.log(scanner.getCounts())
      console.log(scanner.getItems())
    }

    // uploading pipeline starts
    return database.collection(collection).insertMany(log_data)
      .then(async (uploaded) => {

        // updated wazuh log data
        if (uploaded) {

          if (DEBUG) console.log(`${WORKER_NAME} processed ${uploaded.insertedCount} new logs`);
          sysLog(`${WORKER_NAME} processed ${uploaded.insertedCount} new logs`);

        }

        // insert the new rule_ids
        if (rule_ids.size > 0) {

          const new_ids = Array.from(rule_ids.keys());
          const prev_rule_ids = await database.collection(DB.temps).distinct("rule", { rule: { $in: new_ids } });

          const rule_ids_data = new_ids
            .filter(id => !prev_rule_ids.includes(id))
            .map(id => ({
              rule: id,
              sid: "ETM00000",
              author: "EITIx",
              type: "playbook",
              protected: true,
              title: rule_ids.get(id).description,
              template: "EPT10001",
              date: new Date()
            }));

          if (rule_ids_data.length > 0) {

            if (DEBUG) console.log(WORKER_NAME, "inserting new rule ids...");
            await database.collection(DB.temps).insertMany(rule_ids_data, { ordered: false });

          }

        }

        // delete the retrived portion from the queue
        if (DEBUG) console.log(WORKER_NAME, "deleting wazuh log queue...");
        return database.collection(DB.wlog_q).deleteMany({
          _id: { $in: portion_ids }
        });

      }).then(async () => {

        // wazuh log data upload and queue clear success
        // uploading attack surface events and playbooks

        if (playbook_events.length > 0) {

          if (DEBUG) console.log(WORKER_NAME, `uploading ${playbook_events.length} surface playbook events...`);
          await database.collection(DB.p_surface).insertMany(playbook_events);

        }

        if (events_data.length > 0) {

          if (DEBUG) console.log(WORKER_NAME, `uploading ${events_data.length} surface events...`);
          /* return database.collection(DB.a_surface).insertMany(events_data); */
          return MongoMultiCRUD.updateBulk(DB.a_surface, events_data, { upsert: true });

        } else {

          console.log(`${WORKER_NAME} found no logs to generate events (unusual)`);
          return null;

        }

      }).then(async (uploaded) => {

        // uploaded attack surface events
        if (uploaded && DEBUG) {

          sysLog(`${WORKER_NAME} processed ${events_data.length} new events`);

        }

        // counting risks 
        let counts = scanner.getCounts();
        // get the date
        let time = new Date();
        let today = getDateString() /* time.toISOString().split("T")[0] */;
        // get the factors from eitix
        let events = await database.collection(DB.risks).findOne({ date: today }) || {};
        // get risks
        let risks = RISKS.countRisk(events, attacksc) || {};

        if (DEBUG) console.log(WORKER_NAME, "counts", counts);

        // update the eitix events counting status
        return await database.collection(DB.risks).updateOne({
          date: today
        }, {
          $set: {
            date: today,
            updated: time,
            low_risks: risks.low_risks,
            medium_risks: risks.medium_risks,
            high_risks: risks.high_risks
          },
          $inc: {
            info_all_events: counts.all || 0,
            alert_low_events: counts.Low || 0,
            alert_medium_events: counts.Medium || 0,
            alert_high_events: counts.High || 0
          }
        }, { upsert: true });

      }).then(async () => {

        // updated risk counting
        // uploading new fim data
        return await MongoMultiCRUD.updateBulk(DB.fim, fim_data, { upsert: true });

      }).then(async (updated) => {

        if (updated > 0) {

          // updated new fim data
          // updating fim data counting

          let time = new Date();
          let today = getDateString() /* time.toISOString().split("T")[0] */;

          let fim_changes = await database.collection(DB.fim).aggregate([
            { $group: { _id: "$agent", total: { $sum: "$changes" } } }
          ]).toArray() || [];

          let total_fcd = totalFimData(fim_changes);
          let total_fca = fim_changes.map(d => ({ agent: d._id, changes: d.total }));

          let fim_actions = await database.collection(DB.fim).aggregate([
            { $group: { _id: "$event", total: { $sum: "$changes" } } }
          ]).toArray() || [];

          let total_fcd_actions = fim_actions.map(d => ({ event: d._id, changes: d.total }));

          //console.log(WORKER_NAME, "fim count:", fim_changes);

          sysLog(`${WORKER_NAME} processed total ${total_fcd} fim data`);

          await database.collection(DB.fcd).updateOne({ date: today }, {
            $set: {
              updated: time,
              changes: total_fcd,
              actions: total_fcd_actions
            }
          }, { upsert: true });

          return await database.collection(DB.fca).updateOne({ date: today }, {
            $set: {
              updated: time,
              agents: total_fca
            }
          }, { upsert: true });

        } else return 0;

      }).then(async () => {

        // updated fim counting
        // updating playbook status
        const promises = [];
        playbook_data.forEach(playbook => {

          promises.push(database.collection(DB.playb).updateOne({ _id: playbook._id }, {
            $set: playbook
          }));

        });

        return await Promise.allSettled(promises);

      }).then(async () => {

        // playbook data updated
        // alert the queue
        if (playbook_data.length > 0) {

          await pushJob('playb', 'playbook', {
            message: "Fire playbook alerts (if needed)",
            time: new Date()
          });

        }

        // events counting and scanning
        let counts = scanner.getCounts();
        let items = scanner.getItems();

        // get today
        let today = getDateString() /* time.toISOString().split("T")[0] */;

        if (DEBUG) console.log(WORKER_NAME, "counts", counts);

        // tracking count data
        await database.collection(DB.track).updateOne({
          date: today
        }, {
          $inc: counts
        }, { upsert: true });

        await database.collection(DB.track).updateOne({
          date: today
        }, {
          $addToSet: items
        }, { upsert: true });


      }).then(async () => {

        try {

          // ai scanning by python script
          if (log_data?.length > 0) {

            return await attackVectorAnalysis(database, log_data.map(log => log.id));

          }

        } catch (err) {

          console.error(`${WORKER_NAME} AI execution error:`, err);

        }

      }).then(async () => {

        try {

          // uba scanning by python script
          if (log_data?.length > 0) {

            const pythonCommand = process.env.PYTHON_COMMAND || 'python3';
            const command = `${pythonCommand} libraries/uba/uba_ml.py ${log_data.length}`;

            const { stdout } = await execAsync(command, 120000);

            if (DEBUG) {
              console.log(`${WORKER_NAME} executed uba analysis script`, stdout.slice(0, 100));
            }

          }

        } catch (err) {
          console.error(`${WORKER_NAME} UBA execution error:`, err);
        }

      }).catch(async (err) => {

        sysLog(`${WORKER_NAME} couldn't process data`, err);

      })

  } catch (err) {

    sysLog(`${WORKER_NAME} encountered internal server error!`, err);

  }

}

async function attackVectorAnalysis(database, log_ids) {

  try {

    const response = await axios.post('http://localhost:5304/predict', {
      log_ids
    });

    const attack_vectors = response.data.summary;
    const new_attacks = [];
    let total_attacks = 0;

    for (const attack_vector of Object.keys(attack_vectors)) {

      const attack = {
        name: attack_vector,
        count: attack_vectors[attack_vector]
      }
      new_attacks.push(attack);
      total_attacks += attack.count;

    }

    const track = await database.collection(DB.track).findOne({ date: getDateString() }) || {};
    const db_attacks = track.attacks || [];

    for (const attack of new_attacks) {
      const existing = db_attacks.find(a => a.name === attack.name);
      if (existing) {
        existing.count += attack.count;
      } else {
        db_attacks.push({ name: attack.name, count: attack.count, affected: 0 });
      }
    }

    return await database.collection(DB.track).updateOne({
      date: getDateString()
    }, {
      $set: { attacks: db_attacks },
      $inc: { total_attacks }
    }, { upsert: true });

  } catch (error) {

    sysLog(`${WORKER_NAME} couldn't process attack vector analysis`, error);

  }

}

function execAsync(command, timeout = 0) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve({ stdout, stderr });
    });
  });
}

async function getPlaybooks(database, query) {

  return database.collection(DB.playb)
    .find({
      disabled: "false",
      source: "Wazuh",
      ...query
    })
    .toArray() || [];

}

function totalFimData(data) {

  return data.reduce((sum, { total }) => sum + total, 0);

}

function fireablePlaybook(playbook, data) {

  const { idfs, operators, types, values } = playbook;
  const len = idfs?.length;
  let fireable = true;

  for (let index = 0; index < len; index++) {
    fireable = compareValues(values[index], operators[index], types[index], getNestedValue(data, idfs[index]));
    if (fireable === false) break;
  }

  return fireable;

}

// it returns true only if the condition does not fail
function compareValues(test_value, operator, type, base_value) {

  if (type === "int") test_value = parseInt(test_value);

  if (operator === "contains") {

    if (typeof base_value !== "string" || base_value.indexOf(test_value) < 0) return false;

  } else if (operator === "not_contains") {

    if (typeof base_value !== "string" || base_value.indexOf(test_value) >= 0) return false;

  } else if (operator === "greater_than") {

    if (base_value <= test_value) return false;

  } else if (operator === "less_than") {

    if (base_value >= test_value) return false;

  } else if (operator == "greater_than_equal") {

    if (base_value < test_value) return false;

  } else if (operator == "less_than_equal") {

    if (base_value > test_value) return false;

  } else if (operator === "multiple_of") {

    if (base_value % test_value !== 0) return false;

  } else {

    if (base_value !== test_value) return false;

  }

  return true;

};

function getNestedValue(object, propertyPath) {

  const properties = propertyPath.split(".");
  let current = object;

  for (const property of properties) {
    if (current && typeof current === "object" && property in current) {
      current = current[property];
    } else {
      return "";
    }
  }

  return current;
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
