const fs = require("fs");
const { spawn, exec } = require("child_process");
const { getConfig } = require("./getConfig");

// MongoDB credentials (replace securely)
const config = getConfig();
const MONGO_USER = config.db_user;
const MONGO_PASS = config.db_pass;
const AUTH_DB = "admin"; // or your DB

const THRESHOLD_MS = 500; // .5s

const mongotop = spawn("mongotop", [
  "2", "--json",
  "-u", MONGO_USER,
  "-p", MONGO_PASS,
  "--authenticationDatabase", AUTH_DB
]);

mongotop.stdout.on("data", (buffer) => {

  try {
    const dataStr = buffer.toString();
    const lines = dataStr.split('\n').filter(line => line.trim().length > 0);

    let alerted = false;

    for (const line of lines) {
      try {
        const dataObj = JSON.parse(line).totals;
        Object.keys(dataObj).forEach(key => {

          const data = dataObj[key];
          const readMs = parseInt(data.read?.time);
          const writeMs = parseInt(data.write?.time);
          const totalMs = readMs + writeMs;
          const totalOps = parseInt(data.total?.count);

          if (totalMs > THRESHOLD_MS) {

            console.log(`${new Date().toLocaleTimeString()} || r${readMs}ms || w${writeMs}ms || ${totalOps} query || ${key}`);
            alerted = true;
            
          }
          
        });

      } catch (error) {
        console.error("Error parsing line:", error.message);
      }
    }

  } catch (error) {
    console.error("Error processing mongotop data:", error);
  }

});

mongotop.stderr.on("data", (data) => {
  console.error("Mongotop Error:", data.toString());
});

mongotop.on("close", (code) => {
  console.log(`Mongotop exited with code ${code}`);
});

/* setInterval(monitor, 1000); */

function monitor() {
  exec(cmd, (error, stdout, stderr) => {

    if (error || stderr) {
      console.error("[mongotop error]:", stderr || error.message);
      return;
    }

    try {

      const lines = stdout
        .split('\n')
        .filter(line => line.trim().startsWith('{'));

      for (const line of lines) {
        const stat = JSON.parse(line);

        const ns = stat.ns || ""; // namespace (db.collection)
        const totalField = stat.total || ""; // e.g. "1454ms"

        const match = totalField.match(/(\d+)/);
        if (!match) continue;

        const totalMs = parseInt(match[1], 10);

        if (totalMs > THRESHOLD_MS) {
          const [dbName, collection] = ns.split('.');
          console.log(`[ALERT] A query in ${dbName}.${collection || ns} took ${totalMs}ms`);
        }
      }
    } catch (e) {
      console.error("[Parse error]:", e.message);
    }

  });
}