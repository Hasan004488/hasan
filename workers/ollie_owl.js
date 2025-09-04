// modules
const cron = require('node-cron');
const fs = require("fs");
const {
  DB, getDatabase
} = require("../libraries/database");
const {
  EITIX,
  sysLog, getLogCollection
} = require('../libraries/globals');
const { exec } = require('child_process');
const { cleanerLog } = require('../libraries/logger');
const { getConfig } = require('../libraries/getConfig');
const { default: axios } = require('axios');

const WORKER_NAME = "Ollie Owl";
const CLEANER_JOB = [];
const MAX_COPY = 10000;
let DEBUG = false;

function main() {

  console.log(`${WORKER_NAME} checked in ${new Date().toLocaleTimeString()}`);

  getDatabase()
    .then(database => {

      database.collection(DB.eitix).findOne({
        title: "cleaner"
      })
        .then(async result => {

          if (result == null) {

            return sysLog(`${WORKER_NAME} refused to work because of missing data in the database. Configuring EITIx may fix this issue.`);

          }

          try {

            // get housekeeping data
            let {
              latest = result.latest,
              syslog_clean,
              backup,
              backup_frequency = 7,
              syslog_ret = 7,
              retention = 90,
              wlog_ret = 30
            } = result;

            // get current new date
            let new_date = new Date();
            new_date.setHours(0, 0, 0, 0);

            // clearing regular data
            if (DEBUG) console.log(WORKER_NAME, "checking regular data");
            if (latest) {

              if (latest.toDateString() != new_date.toDateString()) {

                sysLog(`${WORKER_NAME} is clearing daily EITIx data.`);

                // attack surface and playbook events
                if (DEBUG) console.log(WORKER_NAME, "cleaning attack surface and playbook events");
                CLEANER_JOB.push("Surface events cleaning: drop, drop, index");
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.a_surface));
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.p_surface));
                // create indexes after for next load
                CLEANER_JOB.push(await database.collection(DB.a_surface).createIndexes([
                  { key: { agent_id: 1 } },
                  { key: { rule_id: 1 } },
                  { key: { risk: 1 } },
                  { key: { discovered: 1 } }
                ]));

                // wazuh logs
                if (DEBUG) console.log(WORKER_NAME, "cleaning wazuh logs");
                CLEANER_JOB.push("Wazuh logs cleaning: drop, index, prune");
                // delete the temporary queue
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.wlog_q));
                // create index on the latest collection
                CLEANER_JOB.push(await database.collection(getLogCollection()).createIndexes([
                  { key: { 'id': 1 } },
                  { key: { 'timestamp': 1 } },
                  { key: { 'agent.id': 1 } },
                  { key: { 'rule.id': 1 } },
                  { key: { 'tenant_id': 1 } },
                  { key: { 'agent.ip': 1 } },
                  { key: { 'agent.name': 1 } },
                  { key: { 'rule.level': 1 } },
                  { key: { 'rule.firedtimes': 1 } },
                  { key: { 'rule.description': 1 } },
                  { key: { 'source': 1 } },
                  { key: { 'attack_type': 1 } },
                  { key: { 'scanned': 1, _id: -1 } }
                ]));
                // delete all wazuh collections
                CLEANER_JOB.push(await pruneLogs(database, wlog_ret || 30));

                // fim
                if (DEBUG) console.log(WORKER_NAME, "cleaning FIM data");
                CLEANER_JOB.push("FIM data cleaning: drop, copy, index");
                CLEANER_JOB.push(await copyCollection(database, DB.fim, DB.fim_a));
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.fim));

                // log data
                if (DEBUG) console.log(WORKER_NAME, "cleaning log data (IoC)");
                CLEANER_JOB.push("Log data cleaning: drop, drop, drop");
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.w_map));
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.doms));
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.f_hashes));

                // ioc
                if (DEBUG) console.log(WORKER_NAME, "cleaning IoC data");
                CLEANER_JOB.push("IoC cleaning: copy, drop");
                CLEANER_JOB.push(await copyCollection(database, DB.ioc, DB.a_ioc));
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.ioc));

                // uba
                if (DEBUG) console.log(WORKER_NAME, "cleaning UBA data");
                CLEANER_JOB.push("UBA cleaning: acts copy, acts drop, logs drop, alerts drop, cursor update");
                CLEANER_JOB.push(await copyCollection(database, DB.uba_alerts, DB.uba_alerts_a));
                if (DEBUG) console.log(WORKER_NAME, "copied UBA alerts");
                CLEANER_JOB.push(await copyCollection(database, DB.uba_acts, DB.uba_acts_a));
                if (DEBUG) console.log(WORKER_NAME, "copied UBA activities");
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.uba_acts));
                if (DEBUG) console.log(WORKER_NAME, "cleaned UBA activities");
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.uba_logs));
                CLEANER_JOB.push(await database.collection(DB.uba_logs).createIndexes([
                  { key: { scanned: 1, _id: -1 } }
                ]));
                if (DEBUG) console.log(WORKER_NAME, "cleaned UBA logs and created index");
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.uba_alerts));
                if (DEBUG) console.log(WORKER_NAME, "cleaned UBA alerts");
                CLEANER_JOB.push(await database.collection(DB.eitix).updateOne({ title: "uba_read_cursor" }, {
                  $set: {
                    value: null
                  }
                }));

                // vulns cve
                if (DEBUG) console.log(WORKER_NAME, "cleaning CVE data");
                CLEANER_JOB.push("Vulns CVE cleaning: copy, drop");
                CLEANER_JOB.push(await copyCollection(database, DB.v_cve, DB.v_cve_a));
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.v_cve));

                // ai logs cleaning
                if (DEBUG) console.log(WORKER_NAME, "cleaning AI logs data");
                CLEANER_JOB.push(await dropCollectionIfExists(database, DB.ai_logs));

                if (DEBUG) console.log(WORKER_NAME, "setting last update status");
                CLEANER_JOB.push("Cleaner Update Status");
                CLEANER_JOB.push(await updateCleaner(database, { latest: new_date }));

                // reset notices data
                if (DEBUG) console.log(WORKER_NAME, "resetting notices");
                CLEANER_JOB.push("Reset notices");
                CLEANER_JOB.push(await database.collection(DB.eitix).updateOne({
                  title: "notices"
                }, {
                  $set: {
                    info_tickets: 0
                  }
                }, { upsert: true }));

                // reset all playbooks
                let active_playbooks = await database.collection(DB.playb).find({ disabled: "false" }).toArray();
                active_playbooks.forEach(playbook => {

                  let { last_fired } = playbook
                  if (last_fired && last_fired?.toDateString() != new Date().toDateString()) {

                    database.collection(DB.playb).updateOne({ sid: playbook.sid }, {
                      $set: { notified: 0 }
                    })

                  }

                });

                // delete old reports
                if (DEBUG) console.log(WORKER_NAME, "cleaning daily exported rports");
                let reports_dir = "./reports";
                if (fs.existsSync(reports_dir)) {

                  fs.rmdir("./reports", { recursive: true }, (err) => {
                    if (err) {

                      sysLog(`${WORKER_NAME} couldn't delete old reports`, err);

                    }
                  });

                }

                // wazuh housekeeping
                if (DEBUG) console.log(WORKER_NAME, "running wazuh cleanup");
                CLEANER_JOB.push("Wazuh cleanup");
                CLEANER_JOB.push(await wazuhCleanup(database, result));

              }

            } else {

              // put today as the latest
              await updateCleaner(database, { latest: new_date });

            }

            // other cleanings (runs every 25 minutes, must be a conditional move)

            // scheduled backups
            if (DEBUG) console.log(WORKER_NAME, "checking scheduled backups");
            if (backup) {

              if (timeDif(backup) >= backup_frequency) {

                let command = "npm run backup";

                if (DEBUG) console.log(WORKER_NAME, "creating scheduled backup");

                exec(command, (err) => {

                  if (err) {

                    sysLog(`${WORKER_NAME} failed to create a backup!`, err);

                  } else {

                    sysLog(`${WORKER_NAME} created a scheduled backup. ${filename}`);

                  }

                });

                await updateCleaner(database, { latest_backups: new_date });

              }

            } else {

              await updateCleaner(database, { latest_backups: new_date });

            }

            // eph pruning
            if (DEBUG) console.log(WORKER_NAME, "cleaning EPH data");
            await database.collection(DB.eph).deleteMany({
              date: {
                $lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days
              }
            });

            // no_f = plan if these archives need to move it to daily condition block avobe

            // uba alerts archive
            if (DEBUG) console.log(WORKER_NAME, "cleaning UBA archive data");
            await pruneData(database, DB.uba_alerts_a, {
              retention_days: retention,
              date_field_text: "date",
            });

            // uba acts archive
            await pruneData(database, DB.uba_acts_a, {
              retention_days: retention,
              date_field_text: "timestamp",
            });

            // cve archive
            if (DEBUG) console.log(WORKER_NAME, "cleaning CVE archive data");
            await pruneData(database, DB.v_cve_a, {
              retention_days: retention,
              date_field_text: "lastModified",
            });

            // ioc archive
            if (DEBUG) console.log(WORKER_NAME, "cleaning IoC archive data");
            await pruneData(database, DB.a_ioc, {
              retention_days: retention,
              date_field_text: "date",
            });

            // fim archive
            if (DEBUG) console.log(WORKER_NAME, "cleaning FIM archive data");
            await pruneData(database, DB.fim_a, {
              retention_days: retention,
              date_field_text: "date",
            });

            // no_f - need implementation
            /*
              DB.track
              DB.risks,
              DB.rep_sms,
              DB.rep_email,
              DB.notifs, // smart pruning or smart display required
              DB.w_agents,
              DB.wm_loc,
              DB.fcd,
              DB.fca,
              DB.iocd,
            */

            // clear daily system log here (from db)
            if (DEBUG) console.log(WORKER_NAME, "cleaning system log data and others");
            await cleanMongoLog(database, syslog_clean, syslog_ret, "syslog_clean");
            await cleanSysLog(database, syslog_clean, syslog_ret, "syslog_clean");
            await cleanData(database, DB.act_log, syslog_clean, syslog_ret, "syslog_clean");
            await cleanData(database, DB.err_log, syslog_clean, syslog_ret, "syslog_clean");
            await cleanData(database, DB.sys_log, syslog_clean, syslog_ret, "syslog_clean", true);

            if (CLEANER_JOB.length > 0) {

              cleanerLog(`${WORKER_NAME} cleaning debug:`, CLEANER_JOB);

            }

            console.log(`${WORKER_NAME} checked out ${new Date().toLocaleTimeString()}`);

          } catch (err) {

            sysLog(`${WORKER_NAME} encountered internal server error!`, err);

          }

        })
        .catch(err => {

          sysLog(`${WORKER_NAME} failed to check old info`, err);

        })

    })


}

async function wazuhCleanup(database, cleaner_data) {

  try {

    const {
      wazuh_cleanup,
      wazuh_cleanup_days
    } = cleaner_data;

    if (wazuh_cleanup == 'on') {

      let new_date = new Date();
      new_date.setHours(0, 0, 0, 0);

      // do cleaning process
      await deleteWazuhLogs(wazuh_cleanup_days);
      await updateCleaner(database, { wazuh_last_cleanup: new_date });
      sysLog(`${WORKER_NAME} cleared wazuh data.`);

    }

  } catch (err) {

    sysLog(`${WORKER_NAME} failed to do wazuh cleanup!`, err);

  }

}

async function deleteWazuhLogs(wazuh_cleanup_days) {

  try {

    const { kibana_host, kibana_user, kibana_pass } = getConfig();
    const delete_url = `${kibana_host}/wazuh-alerts-4.x-*/_delete_by_query`;
    const query = {
      range: {
        "@timestamp": {
          lt: `now-${wazuh_cleanup_days}d/d`
        }
      }
    }

    return await axios.post(delete_url, { query }, {
      httpsAgent: new require('https').Agent({ rejectUnauthorized: false }),
      auth: {
        username: kibana_user,
        password: kibana_pass
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (err) {

    sysLog(`${WORKER_NAME} failed to do cleaning of wazuh data!`, err);

  }

}

async function dropCollectionIfExists(db, collectionName, type = "drop") {

  const collections = await db.listCollections().toArray() || [];
  const collection = collections.find(c => c.name === collectionName);

  if (collection) {

    if (type == "delete") {

      return db.collection(collectionName).deleteMany();

    } else {

      return db.collection(collectionName).drop();

    }

  } else return null;

}

function timeDif(old_date) {

  // calculate difference for days
  let new_date = new Date();
  new_date.setHours(0, 0, 0, 0);

  let divide_factor = 24 * 60 * 60 * 1000;
  return parseInt(Math.abs(new_date - old_date) / divide_factor);

}

function updateCleaner(database, data) {

  return new Promise(async (resolve, reject) => {

    await database.collection(DB.eitix).updateOne({
      title: "cleaner"
    }, {
      $set: data
    }, {
      upsert: true
    }
    )
      .then(result => resolve(result))
      .catch(err => reject(err))

  })

}

async function pruneData(database, collection, options) {

  /*
    Pruning data steps
    1. Find the last date to be stored by subtracting the retention days from the current date
    2. clean all the data with or more than the last date (if exists in the collection)
  */

  try {

    const {
      retention_days, // the data retention in days
      date_field_text, // the date field to search in the collection to find the data to be deleted
    } = options;


    if (!retention_days || !date_field_text) {

      return sysLog(`${WORKER_NAME} pruneData() is missing retention_days or date_field_text in options.`, options);

    }

    // console.log(WORKER_NAME, "options:", options);

    let last_date = new Date();
    last_date.setDate(last_date.getDate() - retention_days);
    last_date.setHours(0, 0, 0, 0);

    // console.log(WORKER_NAME, "last_date:", last_date);

    return await database.collection(collection).deleteMany({
      [date_field_text]: { $lt: last_date }
    });

    // console.log(WORKER_NAME, "deleted:", deleted);

  } catch (err) {

    sysLog(`${WORKER_NAME} failed to clean data!`, err);

  }

}

async function cleanData(database, collection, cleaning_date, retention, cleaner_tag, update_clean_date) {

  let new_date = new Date();
  new_date.setHours(0, 0, 0, 0);

  if (cleaning_date) {

    if (timeDif(cleaning_date) >= retention) {

      try {

        await dropCollectionIfExists(database, collection);
        if (update_clean_date) {
          await updateCleaner(database, { [cleaner_tag]: new_date });
        }

        sysLog(`${WORKER_NAME} is clearing collection:${collection} data.`);

      } catch (err) {

        sysLog(`${WORKER_NAME} failed to clean data!`, err);

      }

    }

  } else {

    await updateCleaner(database, { [cleaner_tag]: new_date });

  }

}

async function cleanMongoLog(database, cleaning_date, retention) {

  let new_date = new Date();
  new_date.setHours(0, 0, 0, 0);

  if (cleaning_date) {

    if (timeDif(cleaning_date) >= retention) {

      try {

        fs.truncate('/var/log/mongodb/mongod.log', 0, (err) => {
          if (err) {
            console.error(`${WORKER_NAME} failed to truncate mongodb log`, err);
          } else {
            console.log(`${WORKER_NAME} truncated mongodb log successfully.`);
          }
        });

        sysLog(`${WORKER_NAME} is clearing mongodb log data.`);

      } catch (err) {

        sysLog(`${WORKER_NAME} failed to clean data!`, err);

      }

    }

  } else {

    await updateCleaner(database, { [cleaner_tag]: new_date });

  }

}

async function cleanSysLog(database, cleaning_date, retention, cleaner_tag) {

  let new_date = new Date();
  new_date.setHours(0, 0, 0, 0);

  if (cleaning_date) {

    if (timeDif(cleaning_date) >= retention) {

      try {

        // syslog eitix agent log cleaning
        fs.truncate('/var/log/eitix-syslog-agent.log', 0, (err) => {
          if (err) {
            console.error(`${WORKER_NAME} failed to truncate syslog`, err);
          } else {
            console.log(`${WORKER_NAME} truncated eitix agent syslog successfully.`);
          }
        });

        sysLog(`${WORKER_NAME} is clearing syslog data.`);

      } catch (err) {

        sysLog(`${WORKER_NAME} failed to clean data!`, err);

      }

    }

  } else {

    await updateCleaner(database, { [cleaner_tag]: new_date });

  }

  // normal syslog
  try {

    fs.truncate('/var/log/syslog', 0, (err) => {
      if (err) {
        console.error(`${WORKER_NAME} failed to truncate syslog`, err);
      } else {
        console.log(`${WORKER_NAME} truncated syslog successfully.`);
      }
    });

  } catch (err) {

    sysLog(`${WORKER_NAME} failed to clean data!`, err);

  }

}

async function copyCollection(database, source, destination) {

  const cursor = database.collection(source).find({});
  const batch = [];

  while (await cursor.hasNext()) {

    const doc = await cursor.next();
    batch.push(doc);

    if (batch.length >= MAX_COPY) {

      await database.collection(destination).insertMany(batch)
        .catch(err => {

          // ignore

        });

      batch.length = 0;

    }

  }

  if (batch.length > 0) {

    return await database.collection(destination).insertMany(batch)
      .catch(err => {

        // ignore

      });

  }

  return true;

}

async function pruneLogs(database, retention) {

  const collections = await database.listCollections({ name: /^wazuh.logs.data.*/ });
  const list = await collections.toArray();
  const maped_list = list.map(col => col.name);
  const drop_collections = maped_list.sort((a, b) => {
    const dateA = new Date(a.split('.')[3]);
    const dateB = new Date(b.split('.')[3]);
    return dateB - dateA;
  }).slice(retention);

  drop_collections.forEach(async collection => {

    await database.collection(collection).drop().catch(err => {

      sysLog(`${WORKER_NAME} couldn't drop a collection: ${collection}.`, err);

    });

  });

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