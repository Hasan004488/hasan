const axios = require("axios");
const { sysLog } = require("../../libraries/globals");
const { DB } = require("../../libraries/database");

const PAGE_SIZE = 500;
const MAX_RETRY = 3;

async function scanDarkweb(database, data) {
  try {

    const { fieldType, searchValue, userApiKey, last_page } = data;
    const API_URL = "https://app.insecureweb.com/api/dark-web/live-scan";

    if (!userApiKey) {
      return { success: false, error: "API Key is required. Please provide your own key." };
    }

    let all_data = [];
    let current_page = last_page || 0;
    const headers = {
      "api-key": userApiKey,
      "accept": "application/json",
    };

    const params = {
      'field': fieldType,
      'search': searchValue,
      'page': current_page,
      'size': PAGE_SIZE
    };

    for (let current_retry = 0; current_retry < MAX_RETRY; current_page++) {

      const response = await axios.get(API_URL, { headers, params, timeout: 60000 });

      if (response.data && response.data.length > 0) {

        all_data = response.data;

        const last_breach = await database.collection(DB.dw_logs).findOne({}, { sort: { _id: -1 } });
        const last_breach_id = last_breach?.breach_id;

        let new_breach_seq = last_breach_id ? parseInt(last_breach_id.slice(3)) : 1000000;

        // prepare database upload
        all_data.forEach(breach => {
          new_breach_seq++;
          breach.breach_id = "EDW" + new_breach_seq;
          breach.manualStatus = 'unresolved';
          breach.ingestedAt = new Date();
        });

        sysLog(`Darkweb Scan Response: ${all_data.length} darkweb entries`);

        await database.collection(DB.dw_logs).insertMany(all_data, { ordered: false });

        // If the number of results is less than the page size, it's the last page.
        if (all_data.length === PAGE_SIZE) {
          current_page++;
        }

        break;

      } else {

        // wait for a minute
        await new Promise(resolve => setTimeout(resolve, 60000));

      }

    }

    await database.collection(DB.eitix).updateOne(
      { title: "darkweb_org" },
      {
        $set: {
          last_page: current_page || 0
        },
      },
      { upsert: true }
    );

    return { success: true, data: all_data };

  } catch (error) {

    sysLog("Failed to scan darkweb", error);

    return { success: false, error: "Failed to fetch data from API. An unknown error occurred." };

  }
}

module.exports = {
  scanDarkweb
}