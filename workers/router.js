const { getDatabase } = require('../libraries/database');
const reportPlaybooks = require('./notifications/report-playbooks')
const reportAssetPlaybooks = require('./notifications/report-asset-playbooks');
const { processWazuhLogEntry } = require('./processor/process-wazuh-logs');

const jobHandlers = {
  'playbook': reportPlaybooks,
  'playbook.asset': reportAssetPlaybooks,
  'wazuh.log.entry': processWazuhLogEntry
};

module.exports = async function jobRouter(job) {
  const handler = jobHandlers[job.name];
  if (!handler) throw new Error(`Unknown job type: ${job.name}`);
  const database = await getDatabase();
  return await handler(database, job);
};