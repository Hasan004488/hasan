module.exports = {
  swift_swallow: {
    active: true,
    rest: 1, // minutes
    execution: 0, // seconds
    name: "Swift Swallow",
    info: "Checks for cloud agents (EITIx assets) and also finds wazuh agents status"
  },
  eddy_eagle: {
    active: true,
    rest: 2,
    execution: 0, // seconds
    name: "Eddy Eagle",
    info: "Process Wazuh logs from EITIx API and populates attack surface"
  },
  percy_pelican: {
    active: true,
    rest: 3,
    execution: 0, // seconds
    name: "Percy Pelican",
    info: "Manages EITIx open tickets and sends email for them, process uba, process ico and misp"
  },
  charlie_crane: {
    active: true,
    rest: 3,
    execution: 0, // seconds
    name: "Charlie Crane",
    info: "Automatically reports to the users for active EITIx schedules and playbooks"
  },
  harvey_hawk: {
    active: true,
    rest: 5,
    execution: 0, // seconds
    name: "Harvey Hawk",
    info: "Finds out various data from wazuh logs like public IP, Domain etc..."
  },
  ollie_owl: {
    active: true,
    rest: 24,
    execution: 0, // seconds
    name: "Ollie Owl",
    info: "Assigned for housekeeping and cleaning EITIx daily data"
  }
}
