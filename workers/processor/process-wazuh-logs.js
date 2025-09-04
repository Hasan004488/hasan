const { DB } = require('../../libraries/database');
const { sysLog } = require('../../libraries/globals');
const { pushJob } = require('../../libraries/queue');

async function processWazuhLogEntry(database, job) {

  try {

    const log = job.data?.data;
    const now = new Date();
    const active_playbooks = await getPlaybooks(database, { firing_required: { $ne: true } });
    const event_playbooks = await getPlaybooks(database, {});
    const updatedPlaybooks = [];

    log.etx_timestamp = now.toISOString();

    // processing surface playbook
    for (const playbook of event_playbooks) {

      if (fireablePlaybook(playbook, log)) {

        updatedPlaybooks.push(
          database.collection(DB.playb).updateOne(
            { _id: playbook._id },
            { $inc: { fired: 1 } }
          )
        );

      }

    };

    for (const playbook of active_playbooks) {

      if (fireablePlaybook(playbook, lg)) {

        // if it matches the rules
        updatedPlaybooks.push(
          database.collection(DB.playb).updateOne(
            { _id: playbook._id },
            {
              $set: {
                firing_required: true,
                data: log
              }
            }
          )
        );
        await pushJob('playb', 'playbook', {
          message: "Fire playbook alerts (if needed)",
          time: now
        });

      }

    };

    if (updatedPlaybooks.length > 0) {
      await Promise.all(updatedPlaybooks);
    }

    await database.collection(DB.wlog_q).insertOne(log);

    // upload in the epm collection
    let date_str = now.toISOString();
    let timestamp_m = date_str.slice(0, 16);
    await database.collection(DB.epm).updateOne({ timestamp_m }, {
      $set: {
        timestamp_h: date_str.slice(0, 13),
        date: now
      },
      $inc: {
        count: 1
      }
    }, {
      upsert: true
    });

  } catch (err) {

    sysLog(`${WORKER_NAME} encountered internal server error!`, err);

  }

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

module.exports = {
  processWazuhLogEntry
}