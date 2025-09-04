require("dotenv").config();
const cron = require('node-cron');
const axios = require('axios');
const https = require('https');
const net = require('net');
const ping = require('ping');
const snmp = require("net-snmp");
const {
  DB, getDatabase
} = require("../libraries/database");
const { sysLog } = require("../libraries/globals");
const { getConfig } = require('../libraries/getConfig');
const { bootWorker } = require("../libraries/worker-tools");
const { pushJob } = require("../libraries/queue");

const MAX_ITERATION = 1; // no throttling needed
const WORKER_NAME = "Swift Swallow";
const WORKER_FILE = "swift_swallow";
const DEBUG = false;

function main() {

  getDatabase()
    .then(async database => {

      const worker_ready = await bootWorker(database, WORKER_NAME, WORKER_FILE, true);

      if (worker_ready) {
        
        for (let i = 0; i < MAX_ITERATION; i++) {
  
          // wait for some time
          /* await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000)); */
  
          /* console.log(WORKER_NAME, `Processing: analyze cloud assets`); */
          await cloudAssets(database);
  
          /* console.log(WORKER_NAME, `Processing: wazuh agents`); */
          await wazuhAgents(database);
  
          /* console.log(WORKER_NAME, `Processing: fire playbook assets if needed`); */
          await pushJob('playb', 'playbook.asset', {
            message: "Fire asset playbook alerts (if needed)",
            time: new Date()
          });
  
        }
  
        await bootWorker(database, WORKER_NAME, WORKER_FILE, false);

      } else {

        if (DEBUG) console.log(`${WORKER_NAME} is not ready (Instance already running)`);

      }


    }).catch(err => {

      sysLog(`${WORKER_NAME} encountered server error`, err);

    });

}

function checkTCPServer(ipAddress, port, timeout) {

  return new Promise((resolve, reject) => {

    const socket = new net.Socket();

    let timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timeout'));
    }, timeout);

    socket.connect(port, ipAddress, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

  });

}

function checkICMPServer(ipAddress, timeout) {

  return new Promise((resolve, reject) => {

    ping.sys.probe(ipAddress, (isAlive) => {
      if (isAlive) {
        resolve();
      } else {
        reject(new Error('Host is unreachable'));
      }
    }, { timeout: timeout / 1000 });

  });

}

function checkSNMPServer(asset) {

  const {
    ip, port, timeout, security_name, security_level,
    auth_protocol, auth_password, priv_protocol, priv_password
  } = asset;

  return new Promise((resolve, reject) => {
    try {

      // Default options for v3
      let options = {
        port, retries: 1,
        timeout: timeout || 5000,
        version: snmp.Version3,
      };

      // Example user
      let user = {
        name: security_name,
        level: parseInt(security_level),
        authProtocol: parseInt(auth_protocol),
        authKey: auth_password,
        privProtocol: parseInt(priv_protocol),
        privKey: priv_password
      };

      const session = snmp.createV3Session(ip, user, options);

      const oids = ["1.3.6.1.2.1.1.3.0"];

      session.get(oids, (err, varbinds) => {

        session.close();

        if (err) {
          reject(err);
        } else {
          resolve(varbinds);
        }

      });

    } catch (error) {
      reject(error);
    }
  });

}


async function cloudAssets(database) {

  let assets = await database.collection(DB.assets).find({ tracking: 'on' }).toArray() || [];
  let playbooks = await database.collection(DB.playb).find({ source: "Asset", disabled: "false" }).toArray() || [];
  let active = 0;
  let inactive = 0;

  for (let asset of assets) {

    let previous_status = asset.status || "inactive";
    let new_status = "inactive";

    let { connection, ip, port, timeout } = asset;

    if (connection === "icmp") {

      try {

        await checkICMPServer(ip, parseInt(timeout || 5000));

        active++;
        new_status = "active";

      } catch (err) {

        inactive++;
        new_status = "inactive";

      }

    } else if (connection === "snmpv3") {

      try {

        await checkSNMPServer(asset);

        active++;
        new_status = "active";

      } catch (err) {

        inactive++;
        new_status = "inactive";

      }

    } else {

      try {

        await checkTCPServer(ip, port || 25, parseInt(timeout || 5000));

        active++;
        new_status = "active";

      } catch (err) {

        inactive++;
        new_status = "inactive";

      }

    }

    if (previous_status !== new_status) {

      // transition detected
      for (let i = 0; i < playbooks.length; i++) {

        let playbook = playbooks[i];

        if (playbook.asset_sid === asset.sid) {

          asset.status = new_status;

          // mark the assigned playbook
          await database.collection(DB.playb).updateOne(
            { _id: playbook._id },
            { $set: { asset, lastChecked: new Date() } }
          );

        }
      }

    }

    await database.collection(DB.assets).updateOne(
      { _id: asset._id },
      { $set: { status: new_status, lastChecked: new Date() } }
    );

  }

  return getDatabase()
    .then(async database => {

      const today = new Date().toISOString().split("T")[0];
      const time = new Date();

      await database.collection(DB.c_assets).updateOne(
        { date: today },
        {
          $set: {
            date: today,
            updated: time,
            active,
            inactive,
          }
        },
        { upsert: true }
      );

    });

}

async function authenticateWazuh(response) {

  try {

    const config = getConfig();
    const username = config.wazuh_user;
    const password = config.wazuh_pass;
    const agent = new https.Agent({ rejectUnauthorized: false });

    if (!username || !password) {
      return response(null, "Wazuh username or password not found");
    }

    // Set the Axios defaults with the authentication headers and the agent
    axios.defaults.headers.common['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    axios.defaults.httpsAgent = agent;

    await axios.get(`${config.wazuh_host}/security/user/authenticate?raw=true`)
      .then(result => {

        let TOKEN = result.data;
        return response(TOKEN, null);

      }).catch(err => {

        return response(null, err);

      });


  } catch (err) {

    return response(null, err);

  }
}

async function wazuhAgents(database) {

  return authenticateWazuh(async (token, err) => {

    if (token) {

      const config = getConfig();

      return axios({
        url: `${config.wazuh_host}/agents?pretty=true&sort=-ip,name&limit=10000`,
        method: 'get',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(async response => {

          let data = response.data.data.affected_items;
          let active = 0;
          let inactive = 0;
          let active_agents = [];
          let inactive_agents = [];

          data.forEach(agent => {

            if (agent.status == "active") {

              active++;
              active_agents.push(agent.id);

            } else {

              inactive++;
              inactive_agents.push(agent.id);

            }

          });

          let time = new Date();
          let today = time.toISOString().split("T")[0];

          database.collection(DB.w_agents).updateOne({
            date: today
          }, {
            $set: {
              date: today,
              updated: time,
              active, inactive,
              active_agents, inactive_agents
            }
          }, {
            upsert: true
          })
            .then(async () => {

              // store detailed information about each agent
              await syncAgents(database, data);

            })

        })
        .catch(err => {

          sysLog(`${WORKER_NAME} failed to collect agents info`, err);

        })

    } else {

      console.error(`${WORKER_NAME} couldn't authenticate with Wazuh.`, err.message);

    }

  })

}

async function syncAgents(database, data) {

  const collection = database.collection(DB.w_agents_d);

  // Get all current agents from DB
  const existingAgents = await collection.find({}).toArray();

  // Build a Map for quick lookup
  const existingMap = new Map(existingAgents.map(agent => [agent.id, agent]));

  // Track all agent IDs in input data
  const incomingIds = new Set();

  // Process incoming data
  for (const newAgent of data) {

    incomingIds.add(newAgent.id);
    const existing = existingMap.get(newAgent.id);

    if (existing) {
      // Update existing agent
      await collection.updateOne(
        { id: newAgent.id },
        {
          $set: {
            available: true,
            last_active: new Date(),
            ...newAgent
          }
        }
      );
    } else {
      // Insert new agent
      await collection.insertOne({
        id: newAgent.id,
        available: true,
        last_active: new Date(),
        ...newAgent
      });
    }
  }

  // Mark agents not in incoming data as unavailable
  for (const agent of existingAgents) {
    if (!incomingIds.has(agent.id)) {
      await collection.updateOne(
        { id: agent.id },
        { $set: { available: false, last_active: new Date() } }
      );
    }
  }
}

module.exports = (rest_time, active) => {

  let scheduled = false;

  if (active) {

    // immediate call
    main();
    // scheduled by default
    scheduled = true

  }

  return cron.schedule(`*/${rest_time} * * * *`, main, { scheduled });

};