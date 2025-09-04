/**
 * Finds wazuh logs
 * Load one log from different collections
 * Load multiple logs from different collections
 */
// modules
require("dotenv").config();
const {
    DB
} = require("../libraries/database");
const {
    generateSearchQuery, getDateString
} = require("../libraries/globals");

// return one log upon query
async function loadLog(database, query, collection = 1, page = 1) {

    const startDate = query.timestamp_from;
    const endDate = query.timestamp_to;
    const collections = await database.listCollections({ name: /^wazuh.logs.data.*/ });
    const list = await collections.toArray();
    const maped_list = list.map(col => col.name);
  
    const sorted_list = maped_list.sort((a, b) => {
      const dateA = new Date(a.split('.')[3]);
      const dateB = new Date(b.split('.')[3]);
      return dateB - dateA;
    });
  
    let log_collections = sorted_list;
  
    if (startDate && endDate) {
  
      let query_collections = collectionRange(startDate, endDate);
      log_collections = sorted_list.filter(col => query_collections.includes(col));
  
    }
  
    const collection_name = log_collections[collection - 1];
    const search_query = generateSearchQuery(query);
  
    if (collection_name) {
  
      // console.log("wazuh.js", collection_name, page - 1);
  
      let results = await database.collection(collection_name).find(search_query).skip(page - 1).limit(1).sort({ _id: -1 }).toArray();
  
      if (results.length > 0) return results;
      else return null;
  
    }
    else return -1;
  
  }
  
  // aggregate logs from multiple collections
  async function loadLogs(database, query) {
  
    const startDate = query.timestamp_from;
    const endDate = query.timestamp_to;
    const collections = await database.listCollections({ name: /^wazuh.logs.data.*/ });
    const list = await collections.toArray();
    const maped_list = list.map(col => col.name);
    const search_query = generateSearchQuery(query);
  
    const sorted_list = maped_list.sort((a, b) => {
      const dateA = new Date(a.split('.')[3]);
      const dateB = new Date(b.split('.')[3]);
      return dateB - dateA;
    });
  
    let log_collections = sorted_list;
  
    if (startDate && endDate) {
  
      let query_collections = collectionRange(startDate, endDate);
      log_collections = sorted_list.filter(col => query_collections.includes(col));
  
    }
  
    let limit = parseInt(query.page) - 1;
    let data = [];
  
    for (const collection of log_collections) {
  
      let results = await database.collection(collection).find(search_query).sort({ _id: -1 }).limit(limit).toArray();
  
      data = data.concat(results);
  
      if (data.length >= limit) return data;
  
    }
  
    return data;
  
  }
  
  async function searchLog(database, _id) {
  
    const collections = await database.listCollections({ name: /^wazuh.logs.data.*/ });
    const list = await collections.toArray();
    const maped_list = list.map(col => col.name);
  
    const log_collections = maped_list.sort((a, b) => {
      const dateA = new Date(a.split('.')[3]);
      const dateB = new Date(b.split('.')[3]);
      return dateB - dateA;
    });
  
    return Promise.allSettled(log_collections.map(collection_name => {
  
      return database.collection(collection_name).find({ _id })
        .project({ _id: 0 })
        .limit(1)
        .toArray();
      
    })).then(data => {
  
      let result = null;
  
      data.forEach(promise => {
  
        if (promise.value.length > 0) return result = promise.value[0];
        
      });
  
      return result;
  
    });
  
  }
  
  async function countLogs(database, filter = {}) {
  
    const collections = await database.listCollections({ name: /^wazuh.logs.data.*/ });
    const list = await collections.toArray();
    const maped_list = list.map(col => col.name);
  
    return Promise.all(maped_list.map(collectionName => {
  
      return database.collection(collectionName).estimatedDocumentCount(filter) || 0;
  
    })).then(counts => {
  
      return counts.reduce((sum, count) => sum + count, 0);
  
    })
    .catch(error => {
  
      console.error("Error counting documents:", error);
      return -1;
  
    });
  
  }

  async function getCollectionNames(database, startDate, endDate) {

    const collections = await database.listCollections({ name: /^wazuh.logs.data.*/ });
    const list = await collections.toArray();
    const maped_list = list.map(col => col.name);

    const sorted_list = maped_list.sort((a, b) => {
    const dateA = new Date(a.split('.')[3]);
    const dateB = new Date(b.split('.')[3]);
        return dateB - dateA;
    });

    let log_collections = sorted_list;

    if (startDate && endDate) {

        let query_collections = collectionRange(startDate, endDate);
        log_collections = sorted_list.filter(col => query_collections.includes(col));

    }

    return log_collections;

  }
  
  /**
   * Generates an array of collection names for a range of dates.
   *
   * @param {string} start - The start date in ISO format.
   * @param {string} end - The end date in ISO format.
   * @return {Array<string>} An array of collection names.
   */
  function collectionRange(start, end) {
  
    const date1 = new Date(end);
    const date2 = new Date(start);
  
    // Calculate the number of days between the dates
    const differenceInDays = Math.floor((date1 - date2) / (1000 * 60 * 60 * 24));
  
    // Create an empty array to store the dates
    const dateList = [];
  
    // Loop through each day between the start and end dates
    for (let i = 0; i <= differenceInDays; i++) {
      
      const currentDate = new Date(date2.getTime() + (i * 1000 * 60 * 60 * 24));
      dateList.push(DB.wlog + ".data." + getDateString(currentDate));
  
    }
  
    return dateList;
  
  }

  module.exports = {
    loadLogs,
    searchLog,
    countLogs,
    loadLog,
    collectionRange,
    getCollectionNames
  }