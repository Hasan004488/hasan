const { DB } = require("./database");
const os = require('node-os-utils');

async function bootWorker(database, name, file, start_request) {

  if (start_request) {

    if (await workerRunning(database, file)) {

      return false; // can't start a worker that is already running

    } else {

      console.log(`${name} checked in ${new Date().toLocaleTimeString()}`);
      return await database.collection(DB.eitix).updateOne({ title: "workers" }, {
        $set: {
          [`${file}.running`]: true
        }
      });

    }

  } else {

    console.log(`${name} checked out ${new Date().toLocaleTimeString()}`);
    return await database.collection(DB.eitix).updateOne({ title: "workers" }, {
      $set: {
        [`${file}.running`]: false
      }
    });

  }

}

async function adaptiveScaleDecision(database, decision_filter) {

  const { collection, filter, cross_limit } = decision_filter;

  let data = await database.collection(collection).countDocuments(filter);

  if (data > cross_limit) {

    const system_ready = await isSystemReady();

    if (system_ready) {

      return true;

    } else {

      return false;

    }

  } else {

    return false;

  }

}

async function isSystemReady() {

  const threshold = 95;
  const cpuUsage = await os.cpu.usage();
  const usedMem = await os.mem.used();
  const driveInfo = await os.drive.info();

  const cpuUsagePercentage = cpuUsage.toFixed(2);
  const memPer = ((usedMem.usedMemMb / usedMem.totalMemMb) * 100).toFixed(2);
  const storageUsagePercentage = parseFloat(driveInfo.usedPercentage).toFixed(2);

  const isUnderLoad = cpuUsagePercentage > threshold || memPer > threshold || storageUsagePercentage > threshold;

  if (isUnderLoad) {
    return false;
  } else {
    // system ready to go
    return {
      cpu: cpuUsagePercentage,
      memory: memPer,
      storage: storageUsagePercentage
    };
  }

}

async function workerRunning(database, file) {

  const worker = await database.collection(DB.eitix).findOne(
    { title: "workers", [`${file}.running`]: true },
    { projection: { _id: 1 } }
  );

  return !!worker;

}

module.exports = {

  bootWorker, adaptiveScaleDecision

}