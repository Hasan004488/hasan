const { EITIX } = require("./globals");
const {

  default_tenant,
  na_msg

} = EITIX;

let DEBUG = false;
class EventScanner {

  /**
   * Initializes the EventScanner class with default configuration and counts.
   *
   * @constructor
   * @return {void}
   */
  constructor() {

    this.config = {
      tenant: default_tenant,
      agent_id: na_msg,
      type: "counts"
    }
    this.counts = {
      ...this.getEmptyAgentObject(),
      tenants: {
        [default_tenant]: this.getEmptyTenantObject(),
      }
    }
    this.items = {
      ...this.getEmptyAgentObject("items"),
      tenants: {
        [default_tenant]: this.getEmptyTenantObject("items"),
      }
    }

  }

  /**
   * Counts the number of events based on the provided data.
   *
   * @param {Object} data - The data object containing the event details.
   * @param {string} [tenant=default_tenant] - The tenant for which the event count is being calculated.
   * @return {void} This function does not return a value.
   */
  count(data, tenant = default_tenant) {

    const {
      risk = na_msg, rule_id, agent_id = na_msg, level
    } = data;

    // put empty objects if needed in the database
    this.prepareDataset(tenant, agent_id);

    // all events count
    this.increment("all");

    // risk specific count
    this.increment(risk);

    // risky events
    if (level >= 12) {

      this.increment("risky");

    }


    // failure and success events
    switch (rule_id) {
      case "60122":
      case "411":
      case "427":
      case "2501":
      case "2502":
      case "2509":
      case "5301":
      case "5302":
      case "5405":
      case "3332":
      case "3357":
      case "3601":
      case "3651":
      case "3902":
      case "3910":
      case "4321":
      case "4324":
      case "4334":
      case "4336":
      case "4386":
      case "4811":
      case "5503":
      case "5551":
      case "5557":
      case "5710":
      case "5711":
      case "5716":
      case "5720":
      case "5728":
      case "5733":
      case "5738":
      case "5755":
      case "5758":
      case "5760":
      case "5763":
      case "6104":
      case "6106":
      case "6210":
      case "6211":
      case "6256":
        // It's a failure event
        this.increment("failure");
        break;
      case "60106":
      case "5701":
      case "426":
      case "2506":
      case "5303":
      case "5304":
      case "10100":
      case "3602":
      case "3904":
      case "4323":
      case "4335":
      case "4506":
      case "4507":
      case "4722":
      case "4724":
      case "4810":
      case "5501":
      case "5712":
      case "5715":
      case "6103":
      case "6105":
        // It's a success event
        this.increment("success");
        break;
    }

  }

  /**
   * Counts the number of IOCs and increments the corresponding counters.
   *
   * @param {Object} info - The information about the IOC.
   * @param {Object} info.data - The data of the IOC.
   * @param {string} info.type - The type of the IOC.
   * @param {string} info.log_id - The log ID of the IOC.
   * @param {string} [info.agent_id=na_msg] - The agent ID of the IOC.
   * @param {string} [tenant=default_tenant] - The tenant for which the IOC count is being calculated.
   * @return {void} This function does not return a value.
   */
  count_ioc(info, tenant = default_tenant) {

    const {
      data, type, log_id, agent_id = na_msg
    } = info;

    // put empty objects if needed in the database
    this.prepareDataset(tenant, agent_id);

    // total ioc
    this.increment("ioc");

    // ioc by type
    this.increment("ioc_" + type);

  }

  scanPciDss(info, tenant = default_tenant) {

    const {
      pci_dss, agent_id = na_msg
    } = info;

    // put empty objects if needed in the database
    this.prepareDataset(tenant, agent_id, "items");

    let stored_pci_dss = this.items.tenants[this.config.tenant].agents[this.config.agent_id].pci_dss || [];

    if (pci_dss) {

      pci_dss.forEach(rule => {
        if (!stored_pci_dss.includes(rule)) {

          this.items.tenants[this.config.tenant].agents[this.config.agent_id].pci_dss.push(rule);

        }
      });

    }

  }

  getCollectedData() {
    return [
      this.counts,
      this.items
    ];
  }

  getCounts() {

    return this.traverse(this.counts, "", "counts");

  }

  getItems() {

    return this.traverse(this.items, "", "items");

  }

  traverse(obj, path = "", type = "counts") {

    let object = {};

    for (const key in obj) {

      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {

        Object.assign(object, this.traverse(obj[key], path ? `${path}.${key}` : key, type));

      } else {

        if (obj[key]) {

          // increment-able
          const incPath = path ? `${path}.${key}` : key;

          if (type === "items") {

            object[incPath] = { $each: obj[key] };

          } else {

            object[incPath] = obj[key];

          }

        }

      }
    }

    return object;

  }

  /**
   * Increments the count of a given property in the counts object.
   *
   * @param {string} property - The property to increment the count for.
   * @return {boolean} Returns true if the increment was successful, false otherwise.
   */
  increment(property) {

    let default_properties = this.getEmptyAgentObject();

    if ((property in default_properties)) {

      // global count
      this.counts[property]++;
      // each tenant count
      this.counts.tenants[this.config.tenant][property]++;
      // each agent inside each tenant count
      this.counts.tenants[this.config.tenant].agents[this.config.agent_id][property]++;
      // success
      return true;

    } else {

      // ignoring the increment and flag it
      console.error(`EventScanner: Invalid property increment request found. Property: ${property}`);
      // failure
      return false;

    }

  }

  /**
   * Prepares the dataset for the given tenant and agent.
   *
   * @param {string} tenant - The tenant for which the dataset is being prepared.
   * @param {string} agent_id - The agent ID for which the dataset is being prepared.
   * @return {void} This function does not return a value.
   */
  prepareDataset(tenant, agent_id, type = "counts") {

    if (this[type].tenants?.[tenant] === undefined) {

      // create tenant object
      this[type].tenants[tenant] = this.getEmptyTenantObject(type);

    }

    if (this[type].tenants?.[tenant]?.agents?.[agent_id] === undefined) {

      // create agent object
      this[type].tenants[tenant].agents[agent_id] = this.getEmptyAgentObject(type);

    }

    this.config.tenant = tenant;
    this.config.agent_id = agent_id;
    this.config.type = type;

    if (DEBUG) {

      console.log("EventScanner: Dataset prepared:", this.config);

    }

  }

  getEmptyTenantObject(type) {

    return {
      ...this.getEmptyAgentObject(type),
      agents: {}
    };

  }

  getEmptyAgentObject(type = "counts") {

    // property names used in the items object can't be used in the counts object

    if (type === "items") {

      return {
        pci_dss: [],
        cve_list: []
      };

    } else {

      return {
        all: 0,
        total_attacks: 0,
        Low: 0,
        Medium: 0,
        High: 0,
        risky: 0,
        failure: 0,
        success: 0,
        cve: 0,
        ioc: 0,
        ioc_events: 0,
        ioc_ip: 0,
        ioc_domain: 0,
        ioc_hash: 0,
        fim: 0,
        fim_added: 0,
        fim_deleted: 0,
        fim_modified: 0
      };

    }

  }

}

module.exports = EventScanner;