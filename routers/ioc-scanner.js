// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const { DB, getDatabase } = require("../libraries/database");

// --- Helper Functions (No changes) ---

const isValidIP = (ip) =>
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(
    ip
  );
const isValidSHA256 = (hash) => /^[a-fA-F0-9]{64}$/.test(hash);
const isValidMD5 = (hash) => /^[a-fA-F0-9]{32}$/.test(hash);
const isValidHostname = (hostname) =>
  /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(
    hostname
  );
const isValidDomain = (domain) => isValidHostname(domain);

const detectIndicatorType = (indicator) => {
  if (isValidIP(indicator)) return "ip";
  if (isValidSHA256(indicator)) return "sha256";
  if (isValidMD5(indicator)) return "md5";
  if (isValidDomain(indicator)) {
    return indicator.includes(".") ? "domain" : "hostname";
  }
  return null;
};

// --- Data Source (Expanded for Pagination Demo) ---
let mispAttributes = [
    { indicator: "185.199.108.153", type: "ip-dst", category: "Network activity", eventInfo: "C2 server for a known malware family", age: { percentage: 5, text: "Just now", progressClass: "bg-danger" }, threatLevel: { text: "High", class: "threat-level-high" }, iocMatched: 1204, status: "Malicious", date: "2025-09-22" },
    { indicator: "evil-phish.com", type: "domain", category: "Attribution", eventInfo: "Phishing campaign targeting financial institutions", age: { percentage: 15, text: "1 day ago", progressClass: "bg-danger" }, threatLevel: { text: "High", class: "threat-level-high" }, iocMatched: 982, status: "Malicious", date: "2025-09-21" },
    { indicator: "baddomain.net", type: "domain", category: "Payload delivery", eventInfo: "Domain hosting malware dropper", age: { percentage: 40, text: "2 weeks ago", progressClass: "bg-warning" }, threatLevel: { text: "Medium", class: "threat-level-medium" }, iocMatched: 540, status: "Malicious", date: "2025-09-08" },
    { indicator: "eicar.com", type: "domain", category: "Testing", eventInfo: "Test file domain", age: { percentage: 95, text: "Over 1 year ago", progressClass: "bg-success" }, threatLevel: { text: "Low", class: "threat-level-low" }, iocMatched: 35, status: "Benign", date: "2024-01-15" }
];

// Let's add more data to make pagination meaningful
const originalData = JSON.parse(JSON.stringify(mispAttributes));
for (let i = 0; i < 7; i++) {
    const newData = originalData.map(item => ({...item, indicator: `${i+1}-${item.indicator}`, iocMatched: Math.floor(Math.random() * 1000) }));
    mispAttributes.push(...newData);
}


// --- Routes ---

// GET /ioc-scanner - Renders the main scanner page.
app.get("/ioc-scanner", (req, res, next) => {
  getDatabase()
    .then(async (database) => {
      try {
        // Fetch total counts for each indicator type to display on the dashboard.
        // Using the fast estimatedDocumentCount()
        const ipCount = await database
          .collection(DB.ioc_ips)
          .estimatedDocumentCount();
        const sha256Count = await database
          .collection(DB.ioc_sha256)
          .estimatedDocumentCount();
        const md5Count = await database
          .collection(DB.ioc_md5)
          .estimatedDocumentCount();
        const hostnameCount = await database
          .collection(DB.ioc_hostnames)
          .estimatedDocumentCount();
        const domainCount = await database
          .collection(DB.ioc_domains)
          .estimatedDocumentCount();

        const dashboardStats = {
          ip: {
            total: ipCount,
          },
          sha256: {
            total: sha256Count,
          },
          md5: {
            total: md5Count,
          },
          hostname: {
            total: hostnameCount,
          },
          domain: {
            total: domainCount,
          },
        };

        res.render("pages/dashboard", {
          title: "IOC Scanner",
          track: "IoC",
          file: "ioc-scanner.ejs",
          dashboardStats,
          scanResult: null, // No result on initial load
        });
      } catch (err) {
        next(err);
      }
    })
    .catch((err) => {
      next(err);
    });
});

// POST /ioc-scanner/scan - Handles the indicator scanning logic.
app.post("/ioc-scanner/scan", (req, res, next) => {
  getDatabase()
    .then(async (database) => {
      try {
        const indicator = req.body.indicator ? req.body.indicator.trim() : "";
        let scanResult = {
          indicator,
          source: "Not Found",
          data: {},
        };

        const indicatorType = detectIndicatorType(indicator);

        if (!indicatorType) {
          scanResult = {
            indicator,
            source: "Invalid",
            data: {
              message:
                "The provided input is not a valid IP, domain, hostname, SHA256, or MD5 hash.",
            },
          };
        } else {
          const mispData = await database
            .collection(DB.misp_attributes)
            .find({
              value: indicator,
            })
            .toArray();

          if (mispData.length > 0) {
            scanResult = {
              indicator,
              source: "MISP Database",
              data: mispData,
            };
          } else {
            let collectionName;
            // FIXED: Handle domain/hostname distinction for more accurate lookups.
            switch (indicatorType) {
              case "ip":
                collectionName = DB.ioc_ips;
                break;
              case "sha256":
                collectionName = DB.ioc_sha256;
                break;
              case "md5":
                collectionName = DB.ioc_md5;
                break;
              case "domain":
                collectionName = DB.ioc_domains;
                break;
              case "hostname":
                collectionName = DB.ioc_hostnames;
                break;
            }

            if (collectionName) {
              let threatIndicator = await database
                .collection(collectionName)
                .findOne({ indicator });

              // If the type was a domain and we didn't find it, check the hostnames list as a fallback.
              if (!threatIndicator && indicatorType === "domain") {
                threatIndicator = await database
                  .collection(DB.ioc_hostnames)
                  .findOne({ indicator });
              }

              if (threatIndicator) {
                scanResult = {
                  indicator,
                  source: "Local Threat Feed",
                  data: threatIndicator,
                };
              }
            }
          }
        }

        // Re-fetch stats for the dashboard view
        // FIXED: Using estimatedDocumentCount() to prevent timeouts and infinite loading.
        const ipCount = await database
          .collection(DB.ioc_ips)
          .estimatedDocumentCount();
        const sha256Count = await database
          .collection(DB.ioc_sha256)
          .estimatedDocumentCount();
        const md5Count = await database
          .collection(DB.ioc_md5)
          .estimatedDocumentCount();
        const hostnameCount = await database
          .collection(DB.ioc_hostnames)
          .estimatedDocumentCount();
        const domainCount = await database
          .collection(DB.ioc_domains)
          .estimatedDocumentCount();

        const dashboardStats = {
          ip: {
            total: ipCount,
          },
          sha256: {
            total: sha256Count,
          },
          md5: {
            total: md5Count,
          },
          hostname: {
            total: hostnameCount,
          },
          domain: {
            total: domainCount,
          },
        };

        // Render the same page, but this time with the scanResult
        res.render("pages/dashboard", {
          title: "IOC Scanner",
          track: "IoC",
          file: "ioc-scanner.ejs",
          dashboardStats,
          scanResult,
        });
      } catch (err) {
        next(err);
      }
    })
    .catch((err) => {
      next(err);
    });
});


// --- MODIFIED: IOC Attributes Page Route ---
app.get("/ioc-attributes", (req, res, next) => {
  try {
    res.render("pages/dashboard", {
      title: "IOC Attributes",
      track: "IoC",
      file: "ioc-attributes.ejs",
      table: {
        dropdown: false,
        actions: false,
        url: `/dashboard/ioc-scanner/ioc-attributes/data`,
        query: req.query,
        headers: [
            { text: "Indicator", width: "200px" },
            { text: "Type" },
            { text: "Category" },
            { text: "Event Info", width: "250px" },
            { text: "IOC Age", width: "150px" },
            { text: "Threat Level", class: "text-center" },
            { text: "IOC Matched", width: "150px" },
            { text: "Status" },
            { text: "Date" }
        ]
      }
    });
  } catch(err) {
    next(err);
  }
});

// --- NEW: Data Endpoint for IOC Attributes Table ---
app.get("/ioc-attributes/data", (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const dataSlice = mispAttributes.slice(startIndex, endIndex);

    if (dataSlice.length === 0 && page > 1) {
      return res.send("404");
    }
    
    const maxIocMatched = Math.max(...mispAttributes.map(attr => attr.iocMatched), 0);

    res.render("pages/dashboard/ioc-attributes-table-data", {
      layout: false,
      attributes: dataSlice,
      maxIocMatched: maxIocMatched,
    });
  } catch (err) {
    next(err);
  }
});


module.exports = app;




