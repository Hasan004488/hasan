/**
 * Redis Queue Manager
 * gets a valid queue
 * push jobs to queue
 */
const { Queue } = require('bullmq');
const connection = require('./redis'); // your Redis connection

const EQ = {
  playb: 'playbooks',
  w_logs: 'wazuh_logs'
};

// Store Queue instances to avoid re-instantiating
const queueMap = {};

function generateId(queueKey) {
  const prefix = EQ[queueKey];                   // 'wazuh_logs'
  const timestamp = Date.now().toString(36);     // base36 to keep shorter
  const random = Math.random().toString(36).slice(2, 8); // 6 chars of randomness

  return `${prefix}_${timestamp}_${random}`;
}

function getQueue(name) {
  if (!EQ[name]) throw new Error(`Unknown queue key: ${name}`);
  if (!queueMap[name]) {
    queueMap[name] = new Queue(EQ[name], { connection });
  }
  return queueMap[name];
}

async function pushJob(queueKey, jobName, data, options = {}) {
  const queue = getQueue(queueKey);
  return await queue.add(jobName, data, {
    jobId: generateId(queueKey),
    removeOnComplete: true,
    removeOnFail: 1000, // keep only last 1000 failed
    ...options
  });
}

module.exports = {
  EQ,
  pushJob,
  getQueue,
};