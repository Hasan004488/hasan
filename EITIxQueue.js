const { Worker } = require('bullmq');
const connection = require('./libraries/redis');
const jobRouter = require('./workers/router');
const { EQ } = require("./libraries/queue");

const queueNames = Object.values(EQ);

for (const name of queueNames) {

  const worker = new Worker(
    name,
    async (job) => {
      await jobRouter(job); 
    },
    { connection } 
  );

  /* worker.on('completed', (job) => {
    console.log(`[${name}] Job ${job.id} (${job.name}) done`);
  }); */

  worker.on('failed', (job, err) => {
    console.error(`[${name}] Job ${job.id} (${job.name}) failed:`, err);
  });

}