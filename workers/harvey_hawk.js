// modules
const cron = require('node-cron');
const axios = require("axios");
const is_ip_private = require("private-ip");
const {
  DB, getDatabase, MongoMultiCRUD
} = require("../libraries/database");
const {
  getConfig
} = require("../libraries/getConfig");
const { sysLog, getLogCollection, dataCount } = require('../libraries/globals');
const EventScanner = require('../libraries/event-scanner');
const { bootWorker } = require('../libraries/worker-tools');

let DEBUG = true;
const WORKER_NAME = "Harvey Hawk";
const WORKER_FILE = "harvey_hawk";
// total ip location requests at a time
const ITERATION = 1; // no_p throttling needed
const MAX_SCAN = 5000;
const MAX_ASSET = 2000;
// counting scanner
const scanner = new EventScanner();

function main() {

  getDatabase()
    .then(async database => {

      const worker_ready = await bootWorker(database, WORKER_NAME, WORKER_FILE, true);

      if (worker_ready) {

        for (let i = 0; i < ITERATION; i++) {

          // processes here
          await mapData(database);

        }

        await bootWorker(database, WORKER_NAME, WORKER_FILE, false);

      } else {

        if (DEBUG) console.log(`${WORKER_NAME} is not ready (Instance already running)`);

      }

    }).catch(err => {

      sysLog(`${WORKER_NAME} encountered server error`, err);

    });

}

/**
 * Map Data is a worker that will scan wazuh logs, extract ip addresses, domains, hashes, and CVEs
 * and upload them into the database. It will also find the location of the new IPs and update the
 * database with the new information.
 * @param {Object} database - an instance of the database
 * @returns {Promise<void>}
 */
async function mapData(database) {

  try {

    // write your content here
    const promises = [];
    // getting the latest config
    const configuration = getConfig();
    // public ip container with default ip always there
    let all_ips = [configuration.ip];
    let new_ip_locations = [];
    // debug stats
    let debug_total = {};
    // log data from the latest wazuh logs
    const log_data = await database.collection(getLogCollection()).find({
      $or: [
        { scanned: false },
        { scanned: { $exists: false } }
      ]
    }).limit(MAX_SCAN).sort({ _id: -1 }).toArray() || [];
    // ioc config data
    const ioc_data = await database.collection(DB.eitix).findOne({ title: "ioc" }) || {};

    if (log_data.length > 0) {

      // alert system
      sysLog(`${WORKER_NAME} scanning ${log_data.length} wazuh logs`);

      // buffer are for storing data temporarily and checking for duplicates
      let ips_buffer = [];
      let domains_buffer = [];
      let hashes_buffer = [];
      let cves_buffer = [];
      // these array will be uploaded into database
      let ip_addresses = [];
      let domains = [];
      let hashes = [];
      let cves = [];
      // today's date and time
      let today = new Date();
      let hourtime = today.getHours();

      log_data.forEach(async log => {

        // log data
        const log_id = log.id;
        const agent_id = log.agent?.id;
        let log_data = {
          tenant_id: log.tenant_id,
          log_id: log_id,
          agent_ip: log.agent?.ip,
          rule_id: log?.rule?.id,
          agent_name: log.agent?.name,
          description: log?.rule?.description,
          log_source: log?.source,
          destination: log?.destination,
          full_log: log.full_log
        }
        // serialize object
        const data = JSON.stringify(log) || "";
        // CVE flag
        let cves_found = data.match(/CVE-\d{4}-\d{3,6}/gi) || [];

        cves_found.forEach(cve => {

          if (cve && !cves_buffer.includes(cve)) {

            cves_buffer.push(cve);
            cves.push({
              updateOne: {
                filter: { id: cve, agent: agent_id },
                update: {
                  $set: {
                    id: cve, log,
                    tenant_id: log.tenant_id,
                    agent: agent_id,
                    lastModified: today
                  }
                },
                upsert: true
              }
            });

          }

        });

        // ip addresses
        const domain_regex = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g;
        const ip_regex = /\b(?:(?:2(?:[0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9])\.){3}(?:(?:2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9]))\b/g;
        // extract ip addresses
        let new_ip = data.match(ip_regex) || [];

        // upsert all daily ip addresses
        new_ip.forEach((ip) => {

          if (ip && !ips_buffer.includes(ip)) {

            // store in the buffer to duplicate check
            ips_buffer.push(ip);

            let private_ip_status = is_ip_private(ip);
            if (!private_ip_status) all_ips.push(ip);

            scanner.count_ioc({
              type: "ip",
              data: ip,
              logs: log_id,
              agents: agent_id
            })

            ip_addresses.push({
              updateOne: {
                filter: { ip },
                update: {
                  $set: {
                    agent: agent_id, hourtime,
                    private: private_ip_status,
                    ...log_data
                  },
                  $addToSet: { logs: log_id }
                },
                upsert: true
              }
            })

          }

        });

        // find valid domains
        const whitelist = ioc_data.whitelist || [];

        let raw_domains = data.match(domain_regex) || [];

        let valid_domains = raw_domains?.filter(domain => {

          // white list the domains
          const parts = domain.split('.') || [];
          if (parts.length > 0) {

            const extension = parts[parts.length - 1].toLowerCase();
            return whitelist.includes(extension);

          } else {

            return false;

          }

        }) || [];

        // console.log(WORKER_NAME, valid_domains);

        // find file_hashes 
        let file_hash = log?.syscheck?.md5_after;

        // console.log(WORKER_NAME, file_hash);

        // upser all domains
        valid_domains.forEach((domain) => {

          if (domain && !domains_buffer.includes(domain)) {

            // console.log(WORKER_NAME, domain);
            domains_buffer.push(domain);

            scanner.count_ioc({
              type: "domain",
              data: domain,
              logs: log_id,
              agents: agent_id
            })

            domains.push({
              updateOne: {
                filter: { domain },
                update: { $set: { agent: agent_id, hourtime, ...log_data } },
                upsert: true
              }
            })

          }

        });

        // upsert all file hashes ip addresses
        if (file_hash && !hashes_buffer.includes(file_hash)) {

          scanner.count_ioc({
            type: "hash",
            data: file_hash,
            logs: log_id,
            agents: agent_id
          })

          hashes.push({
            updateOne: {
              filter: { md5: file_hash },
              update: {
                $set: {
                  agent: agent_id, hourtime,
                  ...log_data
                }
              },
              upsert: true
            }
          })

        }

      });

      // limit the assets
      ip_addresses = ip_addresses.slice(0, MAX_ASSET);
      domains = domains.slice(0, MAX_ASSET);
      hashes = hashes.slice(0, MAX_ASSET);

      // console.log(WORKER_NAME, ip_addresses.length, domains.length, hashes.length);

      // upsert all daily ip addresses
      let ip_updated = await MongoMultiCRUD.updateBulk(DB.w_map, ip_addresses, { upsert: true });

      // upser all domains
      let domain_updated = await MongoMultiCRUD.updateBulk(DB.doms, domains, { upsert: true });

      // upser all domains
      let hash_updated = await MongoMultiCRUD.updateBulk(DB.f_hashes, hashes, { upsert: true });

      // update cve status of previously found CVE
      let cve_updated = await MongoMultiCRUD.updateBulk(DB.v_cve, cves, { upsert: true });

      // mark the data scanned
      // set log scanned done status
      await database.collection(getLogCollection()).updateMany({
        _id: { $in: log_data.map(log => log._id) }
      }, {
        $set: {
          scanned: true
        }
      })

      // update CVE count
      const total_cve = await dataCount(DB.v_cve, {});
      let this_day = today.toISOString().split('T')[0];

      await database.collection(DB.track).updateOne({ date: this_day }, {
        $set: { cve: total_cve || 0 }
      }, { upsert: true });

      // find location for the new ips first
      let known_ips = await database.collection(DB.wm_loc).find({
        ip: {
          $in: all_ips
        }
      }).project({ ip: 1 }).toArray() || [];
      known_ips = known_ips.map(doc => doc.ip);
      const new_ips = all_ips.filter(ip => !known_ips.includes(ip));

      // make api calls with the new ips for locations
      new_ips.forEach((ip, idx) => {

        if (idx <= MAX_SCAN) {

          promises.push(
            axios.get("http://208.95.112.1/json/" + ip)
              .then(response => {

                new_ip_locations.push(response?.data || {});

              })
              .catch(err => {

                // error while api calls
                console.error(`${WORKER_NAME} couldn't find an IP information for ${ip}`, err);

              })
          )

        }

      });

      debug_total.promises = promises.length;
      debug_total.ip = ip_updated;
      debug_total.domains = domain_updated;
      debug_total.hash = hash_updated;
      debug_total.cve = cve_updated;

      await Promise.allSettled(promises).then(async () => {

        let location_data = [];
        // upload the ip locations
        location_data = new_ip_locations.map(info => ({
          updateOne: {
            filter: { ip: info.query },
            update: {
              $set: {
                ip: info.query,
                country: info.country,
                city: info.city,
                latitude: info.lat,
                longitude: info.lon
              }
            },
            upsert: true
          }
        }));

        if (location_data.length > 0) {

          await database.collection(DB.wm_loc).bulkWrite(location_data, {});

          if (DEBUG) {

            console.log(WORKER_NAME, "Debug:", debug_total);

          }

        }

      })

    }

  } catch (err) {

    sysLog(`${WORKER_NAME} encountered an server error`, err);

  }

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