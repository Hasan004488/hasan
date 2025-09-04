require("dotenv").config()
const { getConfig } = require("./getConfig");
const { exec } = require('child_process');
const fs = require("fs");
const archiver = require("archiver");
const { DB } = require("./database");

try {

  let { DATABASE_NAME } = process.env;
  let config = getConfig();
  let directory = "./backups";
  let today = new Date().toISOString().slice(0, 19);
  let tempDumpDir = directory + "/point-" + today;
  let mongoURI = `mongodb://${config.db_user}:${config.db_pass}@localhost:${config.db_port}/${DATABASE_NAME}?authSource=admin`;

  if (!fs.existsSync(tempDumpDir)) {

    fs.mkdirSync(tempDumpDir, { recursive: true });

  }

  let ignore_collections = [
    DB.attach, DB.notifs, DB.wlog, DB.wlog_q, DB.f_hashes, DB.doms, DB.w_map, DB.a_surface,
    DB.act_log, DB.err_log, DB.sys_log, DB.ioc, DB.a_ioc,
    DB.uba_logs, DB.uba_acts, DB.uba_acts_a
  ]
  const backup_collections = Object.values(DB).filter(collectionName => !ignore_collections.includes(collectionName));

  // Dump each collection individually
  backup_collections.forEach(collectionName => {
      exec(`mongodump --uri ${mongoURI} --collection ${collectionName} --out ${tempDumpDir}`, (error, stdout, stderr) => {
          if (error) {
              console.error("Error dumping collection:", error);
              console.error(stderr);
          }
      });
  });
  
  const output = fs.createWriteStream(`${tempDumpDir}.tar.gz`);
  const archive = archiver('tar', {
    gzip: true,
  });

  output.on('close', () => {
    console.log(`Backup folder tarred and gzipped successfully.`);
    try {
      fs.rmdirSync(tempDumpDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to delete the folder: ${err}`);
    }
  });

  archive.pipe(output);

  archive.directory(tempDumpDir, false);

  archive.finalize();
  
} catch (err) {

  console.error(err);
  
}
