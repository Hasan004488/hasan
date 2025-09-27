require("dotenv").config();
const axios = require("axios");
const https = require("https");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDatabase, DB } = require("../../libraries/database");
const logger = require("../../libraries/logger");
const { actLog } = require("../../libraries/globals");

// Define a directory for caching downloaded threat feeds.
const CACHE_DIR = path.join(__dirname, "..", "..", ".cache", "ioc");

class IOC_Processor {
  constructor() {
    this.isProcessing = false;
    this.dataSources = [
      {
        type: "ip",
        url:
          process.env.IP_FETCH_URL ||
          "https://intelligence.threatwinds.com/feeds/public/ip/cumulative.list",
        dbCollection: DB.ioc_ips,
        validator: this.isValidIP,
      },
      {
        type: "sha256",
        url:
          process.env.SHA256_FETCH_URL ||
          "https://intelligence.threatwinds.com/feeds/public/sha256/cumulative.list",
        dbCollection: DB.ioc_sha256,
        validator: this.isValidSHA256,
      },
      {
        type: "md5",
        url:
          process.env.MD5_FETCH_URL ||
          "https://intelligence.threatwinds.com/feeds/public/md5/cumulative.list",
        dbCollection: DB.ioc_md5,
        validator: this.isValidMD5,
      },
      {
        type: "hostname",
        url:
          process.env.HOSTNAME_FETCH_URL ||
          "https://intelligence.threatwinds.com/feeds/public/hostname/cumulative.list",
        dbCollection: DB.ioc_hostnames,
        validator: this.isValidHostname,
      },
      {
        type: "domain",
        url:
          process.env.DOMAIN_FETCH_URL ||
          "https://intelligence.threatwinds.com/feeds/public/domain/cumulative.list",
        dbCollection: DB.ioc_domains,
        validator: this.isValidDomain,
      },
    ];

    // Ensure the cache directory exists on startup.
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, {
        recursive: true,
      });
    }
  }

  // --- Validation Helper Methods ---
  isValidIP = (ip) =>
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(
      ip
    );
  isValidSHA256 = (hash) => /^[a-fA-F0-9]{64}$/.test(hash);
  isValidMD5 = (hash) => /^[a-fA-F0-9]{32}$/.test(hash);
  isValidHostname = (hostname) =>
    /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(
      hostname
    );
  isValidDomain = (domain) => this.isValidHostname(domain);

  /**
   * Ensures that all necessary indexes are created in the database for optimal performance.
   */
  async ensureIndexes() {
    logger.sysLog("IOC Processor: Ensuring database indexes are created...");
    try {
      const database = await getDatabase();

      const mispCollection = database.collection(DB.misp_attributes);
      await mispCollection.createIndex({ value: 1 }, { name: "value_idx" });
      await mispCollection.createIndex(
        { uuid: 1 },
        { unique: true, name: "uuid_unique_idx" }
      );
      logger.sysLog("IOC Processor: Indexes for MISP attributes verified.");

      for (const source of this.dataSources) {
        const collection = database.collection(source.dbCollection);
        await collection.createIndex(
          { indicator: 1 },
          { unique: true, name: "indicator_unique_idx" }
        );
        await collection.createIndex(
          { mispScanned: 1 },
          { name: "mispScanned_idx" }
        );
        logger.sysLog(
          `IOC Processor: Indexes for ${source.dbCollection} verified.`
        );
      }

      actLog(
        "IOC Processor: All database indexes have been successfully verified."
      );
    } catch (error) {
      logger.sysLog(
        `IOC Processor: Error while creating indexes: ${error.message}`,
        error
      );
    }
  }

  /**
   * Fetches indicators from a URL with caching.
   */
  async fetchIndicators(source) {
    const urlHash = crypto.createHash("md5").update(source.url).digest("hex");
    const cacheFilePath = path.join(CACHE_DIR, `${urlHash}.cache`);
    const metaFilePath = path.join(CACHE_DIR, `${urlHash}.meta`);

    const headers = {};
    let meta = {};

    if (fs.existsSync(metaFilePath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFilePath, "utf-8"));
        if (meta.etag) headers["If-None-Match"] = meta.etag;
        if (meta.lastModified) headers["If-Modified-Since"] = meta.lastModified;
      } catch (e) {
        logger.sysLog(
          "IOC Processor: Could not read meta file, fetching fresh data.",
          e
        );
      }
    }

    try {
      const response = await axios.get(source.url, {
        headers,
        timeout: 60000,
        responseType: "text",
        validateStatus: (status) =>
          (status >= 200 && status < 300) || status === 304,
      });

      if (response.status === 304) {
        logger.sysLog(
          `IOC Processor: Cache hit for ${source.type}. Using local version.`
        );
        const cachedData = fs.readFileSync(cacheFilePath, "utf-8");
        const rawData = cachedData
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .filter((l) => !l.startsWith("#"));
        return [...new Set(rawData)].filter((indicator) =>
          source.validator(indicator)
        );
      }

      logger.sysLog(
        `IOC Processor: Fetched fresh data for ${source.type}. Updating cache.`
      );
      const newMeta = {
        etag: response.headers.etag,
        lastModified: response.headers["last-modified"],
      };

      fs.writeFileSync(cacheFilePath, response.data);
      fs.writeFileSync(metaFilePath, JSON.stringify(newMeta));

      const rawData = response.data
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !l.startsWith("#"));
      return [...new Set(rawData)].filter((indicator) =>
        source.validator(indicator)
      );
    } catch (error) {
      logger.sysLog(
        `IOC Processor: Failed to fetch from ${source.url}: ${error.message}`,
        error
      );
      if (fs.existsSync(cacheFilePath)) {
        logger.sysLog(
          `IOC Processor: Using fallback cache for ${source.type}.`
        );
        const cachedData = fs.readFileSync(cacheFilePath, "utf-8");
        const rawData = cachedData
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .filter((l) => !l.startsWith("#"));
        return [...new Set(rawData)].filter((indicator) =>
          source.validator(indicator)
        );
      }
      return [];
    }
  }

  /**
   * Stores indicators in the database, preventing duplicates.
   */
  async storeIndicators(database, source, indicators) {
    const collection = database.collection(source.dbCollection);
    let newIndicatorsCount = 0;
    const chunkSize = 15000;
    const totalChunks = Math.ceil(indicators.length / chunkSize);

    logger.sysLog(
      `IOC Processor: Preparing to store ${indicators.length.toLocaleString()} ${source.type.toUpperCase()} indicators in ${totalChunks} chunk(s).`
    );

    for (let i = 0; i < indicators.length; i += chunkSize) {
      const chunk = indicators.slice(i, i + chunkSize);
      const chunkNumber = i / chunkSize + 1;
      logger.sysLog(
        `IOC Processor: Storing chunk ${chunkNumber} of ${totalChunks} for ${source.type.toUpperCase()}...`
      );

      const operations = chunk.map((indicatorValue) => ({
        updateOne: {
          filter: { indicator: indicatorValue },
          update: {
            $set: { lastUpdated: new Date() },
            $setOnInsert: {
              indicator: indicatorValue,
              type: source.type,
              mispScanned: false,
              source: "ThreatFeed",
              firstSeen: new Date(),
            },
          },
          upsert: true,
        },
      }));

      try {
        if (operations.length > 0) {
          const result = await collection.bulkWrite(operations, {
            ordered: false,
          });
          newIndicatorsCount += result.upsertedCount;
        }
      } catch (error) {
        logger.sysLog(
          `IOC Processor: Bulk write operation failed for ${source.type}: ${error.message}`,
          error
        );
      }
    }
    logger.sysLog(
      `IOC Processor: Finished storing for ${source.type.toUpperCase()}. Added ${newIndicatorsCount.toLocaleString()} new entries.`
    );
  }

  /**
   * Orchestrates fetching and storing indicators from all sources.
   */
  async processAllSources(options = { scanMisp: true }) {
    if (this.isProcessing) {
      logger.sysLog(
        "IOC Processor: A task is already running. Skipping scheduled run."
      );
      return;
    }

    this.isProcessing = true;
    logger.sysLog(
      "IOC Processor: Starting daily fetch of all threat sources..."
    );
    const startTime = Date.now();

    try {
      const database = await getDatabase();
      for (const source of this.dataSources) {
        logger.sysLog(
          `IOC Processor: Fetching from ${source.type.toUpperCase()}...`
        );
        const indicators = await this.fetchIndicators(source);

        if (indicators.length > 0) {
          await this.storeIndicators(database, source, indicators);
        } else {
          logger.sysLog(
            `IOC Processor: No new indicators found for ${source.type.toUpperCase()}.`
          );
        }
      }
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
      logger.sysLog(
        `IOC Processor: Data fetching completed in ${duration} minutes.`
      );
      actLog("IOC Processor: Successfully fetched and stored all IOCs.");

      if (options.scanMisp) {
        await this.scanIndicatorsAgainstMisp();
      }
    } catch (error) {
      logger.sysLog(
        `IOC Processor: A critical error occurred during source processing: ${error.message}`,
        error
      );
    } finally {
      this.isProcessing = false;
    }
  }

 /**
 * Main worker process for fetching MISP data.
 * Performs an initial fetch of the last 5 hours of data upon startup,
 * then starts a cron job to fetch the last 1 hour of data, every hour.
 */
async startMispSyncWorker() {
  const MISP_API_URL = process.env.MISP_API_URL;
  const MISP_API_KEY = process.env.MISP_API_KEY;

  if (!MISP_API_URL || !MISP_API_KEY) {
    logger.sysLog(
      "IOC Processor: MISP_API_URL or MISP_API_KEY is not defined."
    );
    return;
  }

  // Note: The isProcessing flag is now managed inside the cron job
  // to prevent overlapping runs, rather than blocking the whole worker startup.

  try {
    const database = await getDatabase();
    const mispCollection = database.collection(DB.misp_attributes);
    const agent = new https.Agent({ rejectUnauthorized: false });

    const fetchAndStoreChunk = async (startTime, endTime) => {
      const startTimestamp = Math.floor(startTime.getTime() / 1000);
      const endTimestamp = Math.floor(endTime.getTime() / 1000);
      logger.sysLog(
        `IOC Processor: Fetching MISP chunk from ${startTime.toISOString()} to ${endTime.toISOString()}`
      );

      try {
        const response = await axios.post(
          MISP_API_URL,
          {
            returnFormat: "json",
            timestamp: [String(startTimestamp), String(endTimestamp)],
          },
          {
            headers: {
              Authorization: MISP_API_KEY,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            httpsAgent: agent,
            timeout: 120000,
          }
        );

        const attributes = response.data?.response?.Attribute || [];

        if (attributes.length > 0) {
          logger.sysLog(
            `IOC Processor: Received ${attributes.length} attributes. Attempting to insert...`
          );
          try {
            const result = await mispCollection.insertMany(attributes, {
              ordered: false,
            });
            logger.sysLog(
              `IOC Processor: Stored ${result.insertedCount} new MISP attributes.`
            );
          } catch (dbError) {
            if (dbError.code === 11000) {
              const insertedCount = dbError.result.nInserted || 0;
              logger.sysLog(
                `IOC Processor: Stored ${insertedCount} new attributes, ignoring duplicates.`
              );
            } else {
              logger.sysLog(
                `IOC Processor: Database error during insertMany: ${dbError.message}`,
                dbError
              );
            }
          }
        } else {
          logger.sysLog(
            "IOC Processor: No new attributes found in this time range."
          );
        }
      } catch (apiError) {
        logger.sysLog(
          `IOC Processor: Failed to fetch or process MISP chunk: ${apiError.message}`,
          apiError
        );
      }
    };

    // --- 1. Perform the initial 5-hour data sync immediately ---
    logger.sysLog(
      "IOC Processor: Starting initial sync for the last 5 hours of data..."
    );
    const initialEndTime = new Date();
    const initialStartTime = new Date(
      initialEndTime.getTime() - 5 * 60 * 60 * 1000
    );
    await fetchAndStoreChunk(initialStartTime, initialEndTime);
    logger.sysLog("IOC Processor: Initial 5-hour sync complete.");

    // --- 2. Start the continuous monitoring cron job for every hour ---
    logger.sysLog(
      "IOC Processor: Scheduling hourly job to fetch the last 1 hour of data."
    );
    cron.schedule("0 * * * *", async () => {
      if (this.isProcessing) {
        logger.sysLog(
          "CRON JOB: A sync is already in progress. Skipping this run."
        );
        return;
      }

      this.isProcessing = true;
      logger.sysLog("CRON JOB: Waking up to fetch last hour of MISP data...");

      try {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 1 * 60 * 60 * 1000); // Fetch last 1 hour
        await fetchAndStoreChunk(startTime, endTime);
      } catch (cronError) {
        logger.sysLog(
          `CRON JOB: An unexpected error occurred: ${cronError.message}`,
          cronError
        );
      } finally {
        this.isProcessing = false;
        logger.sysLog("CRON JOB: Hourly sync task finished.");
      }
    });
  } catch (e) {
    logger.sysLog(
      `IOC Processor: A critical error occurred during MISP worker startup: ${e.message}`,
      e
    );
    // In case of startup error, ensure the lock is released.
    this.isProcessing = false;
  }
}

/**
 * The entry point for the manual runner.
 */
async importMispData() {
  await this.startMispSyncWorker();
}

  /**
   * Scans local threat feeds against the imported MISP database.
   */
  async scanIndicatorsAgainstMisp() {
    if (this.isProcessing) {
      logger.sysLog(
        "IOC Processor: A task is already running. Skipping MISP scan."
      );
      return;
    }
    this.isProcessing = true;
    logger.sysLog(
      "IOC Processor: Starting scan of local indicators against MISP database..."
    );
    const startTime = Date.now();

    try {
      const database = await getDatabase();
      const mispCollection = database.collection(DB.misp_attributes);
      let totalScanned = 0,
        totalMatched = 0;

      for (const source of this.dataSources) {
        const collection = database.collection(source.dbCollection);
        const indicatorsToScan = await collection
          .find(
            { mispScanned: false },
            { projection: { indicator: 1, _id: 1 } }
          )
          .toArray();
        if (indicatorsToScan.length === 0) continue;

        const values = indicatorsToScan.map((i) => i.indicator);
        const matchedValues = new Set();
        const cursor = mispCollection.find(
          { value: { $in: values } },
          { projection: { value: 1 } }
        );

        for await (const doc of cursor) {
          matchedValues.add(doc.value);
        }

        if (matchedValues.size > 0) {
          await collection.updateMany(
            { indicator: { $in: Array.from(matchedValues) } },
            {
              $set: {
                status: "malicious-misp",
                mispScanned: true,
                lastMispScan: new Date(),
              },
            }
          );
        }

        await collection.updateMany(
          { _id: { $in: indicatorsToScan.map((i) => i._id) } },
          { $set: { mispScanned: true, lastMispScan: new Date() } }
        );

        totalScanned += values.length;
        totalMatched += matchedValues.size;
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.sysLog(
        `IOC Processor: MISP scan completed in ${duration}s. Scanned: ${totalScanned.toLocaleString()}, Matches: ${totalMatched.toLocaleString()}`
      );
      actLog(
        "IOC Processor: Successfully scanned local IOCs against MISP data."
      );
    } catch (e) {
      logger.sysLog(`IOC Processor: Error during MISP scan: ${e.message}`, e);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Clears all cached threat intelligence files.
   */
  async clearCache() {
    if (fs.existsSync(CACHE_DIR)) {
      try {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true });
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        logger.sysLog("IOC Processor: Cache cleared successfully.");
        actLog("IOC cache has been cleared manually.");
      } catch (error) {
        logger.sysLog(
          `IOC Processor: Error clearing cache: ${error.message}`,
          error
        );
      }
    }
  }

  /**
   * Initializes the cron scheduler and ensures database indexes are ready.
   */
  async initialize() {
    logger.sysLog("IOC Processor: Initializing...");
    await this.ensureIndexes();
    logger.sysLog("IOC Processor: Initializing scheduled tasks.");
    cron.schedule("0 0 * * *", () => {
      logger.sysLog("IOC Processor: Midnight cron job triggered.");
      this.processAllSources();
    });
  }
}

const iocProcessor = new IOC_Processor();
module.exports = iocProcessor;
