const fs = require('fs');
const PDFDocument = require('pdfkit-table');
const { DB, getDatabase } = require("./database");
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const dataLabels = require("chartjs-plugin-datalabels");
const { format, generateSearchQuery, safeRegex } = require('./globals');
const {
  S,
  renderTicketReport,
  renderExtras,
  resetStyles,
  calculatePercentage,
  removeDuplicatesWithCountAndSum,
  sortObject,
  getChartsData,
  getEventsData,
  countTotal,
  calculateCounts
} = require("./report-tools");
const { getCollectionNames } = require("./log-finder");
const archiver = require('archiver');

const MAX_FETCH = 100000;
const MAX_LINES = 1000000;
let DEBUG = false;
const REPORT_DIR = "./reports";

// Create a Chart.js node-canvas instance only for once
const chartNode = new ChartJSNodeCanvas({
  width: 700,
  height: 300,
  chartCallback: (ChartJS) => {
    ChartJS.register(dataLabels)
  }
});

const REPORTER = {

  ticket(ticket_id, reporter, callback) {

    getDatabase()
      .then(async database => {

        try {

          let org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};
          let data = await database.collection(DB.tickets).findOne({ sid: ticket_id });
          if (!data) throw "Ticket not found or not supported";

          let requester = await database.collection(DB.users).findOne({ email: data.created_by });
          if (!requester) throw "Requester of this ticket doesn't exists anymore. Reporting aborted.";

          // writing pdf report
          let directory = "./reports";
          let filename = `./reports/report-ticket-${data.sid}-${requester.email}.pdf`;

          if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory, { recursive: true });

          }

          const doc = new PDFDocument({
            size: 'A4',
            bufferPages: true,
            margins: {
              top: S.margin.top,
              bottom: S.margin.bottom,
              left: S.margin.x,
              right: S.margin.x
            }
          });

          const outputStream = fs.createWriteStream(filename);
          doc.pipe(outputStream);

          // render the report
          await renderTicketReport({ doc, data, requester, org_data });

          // Set footer and header
          renderExtras(doc, org_data, reporter.full_name);

          // end writing
          doc.end();
          outputStream.on('finish', () => {
            callback(filename, false);
          })

        } catch (err) {

          callback(false, err);

        }

      })

  },

  wlog(log_data, reporter_name, file_name, show_logs, callback) {

    getDatabase()
      .then(async database => {

        try {

          let org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

          if (log_data.length < 1) {

            throw { code: 404, message: "No logs found to make a report" };

          }

          // writing pdf report
          let directory = "./reports";
          let filename = `./reports/${file_name}`;

          if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory, { recursive: true });

          }

          const doc = new PDFDocument({
            size: 'A4',
            bufferPages: true,
            margins: {
              top: S.margin.top,
              bottom: S.margin.bottom,
              left: S.margin.x,
              right: S.margin.x
            }
          });

          let doc_width = doc.page.width - S.margin.x;

          const outputStream = fs.createWriteStream(filename);
          doc.pipe(outputStream);

          // render the report
          // heading
          doc.font(S.font.bold).fontSize(S.font_size.h2).fillColor(S.color.primary);
          doc.text(`EITIx Wazuh Logs Reporting`);
          doc.moveDown(0.5);
          resetStyles(doc);

          doc.moveDown();
          // ticket information
          await doc.table({
            headers: [`Total Logs Retrived: ${log_data.length} logs`]
          }, {
            width: doc.page.width - (S.margin.x * 2),
            columnSpacing: S.padding.normal,
            prepareHeader: () => doc.font(S.font.bold).fontSize(S.font_size.small)
          });
          doc.moveDown();

          let data_len = log_data.length;

          log_data.forEach((log, idx) => {

            try {

              // Ticket summary
              doc.font(S.font.bold).fontSize(S.font_size.normal);
              doc.text(`Log Information (${idx + 1})`, { align: 'center' });
              doc.moveDown(0.5);
              doc.moveTo(doc.x, doc.y).lineTo(doc_width, doc.y).lineWidth(1).stroke('gray');
              doc.moveDown(1);

              doc.table({
                title: `Log Summary`,
                headers: [
                  `Agent Name: ${log.agent?.name || "No Information"}`,
                  `Agent ID: ${log.agent?.id || "No Information"}`
                ],
                rows: [
                  [
                    `Technique: ${log.rule?.mitre?.technique?.join(', ') || "No Information"}`,
                    `Tactics: ${log.rule?.mitre?.tactic?.join(', ') || "No Information"}`
                  ],
                  [
                    `Program Name: ${log.decoder?.name || "No Information"}`,
                    `Fired Times: ${log.rule?.firedtimes || "No Information"}`
                  ],
                  [
                    `Source Address: ${log.source || "No Information"}`,
                    `Destination Address: ${log.destination || "No Information"}`
                  ],
                  [
                    `Source Port: ${log.data?.srcport || "No Information"}`,
                    `Destination Port: ${log.data?.dstport || "No Information"}`
                  ],
                  [
                    `PCI DSS: ${log.rule?.pci_dss?.join(', ') || "No Information"}`,
                    `NIST: ${log.rule?.nist_800_53?.join(', ') || "No Information"}`
                  ],
                  [
                    `Rule ID: ${log.rule?.id || "No Information"}`,
                    `Rule Level: ${log.rule?.level || "No Information"}`
                  ]
                ]
              }, {
                width: doc.page.width - (S.margin.x * 2),
                columnSpacing: S.padding.normal,
                prepareHeader: () => doc.font(S.font.bold).fontSize(S.font_size.small),
                prepareRow: (row, i) => doc.font(S.font.normal).fontSize(S.font_size.small)
              });

              resetStyles(doc);
              doc.moveDown();

              if (show_logs === "on") {

                doc.font(S.font.bold).fontSize(S.font_size.normal);
                doc.text(`Full Log Information`,);
                doc.moveDown(1);

                let full_log = JSON.stringify(log, null, 2);
                doc.font(S.font.normal).fontSize(S.font_size.small);
                doc.text(full_log);

                resetStyles(doc);

              }

              if (idx >= data_len - 1) {

                // header and footer
                renderExtras(doc, org_data, reporter_name);

                // end writing
                doc.end();

              } else {

                doc.addPage();

              }
            } catch (err) {

              callback(false, err);

            }

          });

          outputStream.on('finish', () => {
            callback(filename, false);
          })

        } catch (err) {

          callback(false, err);

        }

      })

  },

  report(data, reporter_name, file_name, callback) {

    getDatabase()
      .then(async database => {

        try {

          // callback(filename, error)

          let org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

          // writing pdf report
          let directory = REPORT_DIR;
          let filename = `${REPORT_DIR}/${file_name}`;

          if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory, { recursive: true });

          }

          const doc = new PDFDocument({
            size: 'A4',
            bufferPages: true,
            margins: {
              top: S.margin.top,
              bottom: S.margin.bottom,
              left: S.margin.x,
              right: S.margin.x
            }
          });

          let doc_width = doc.page.width - (S.margin.x * 2);
          let today = new Date();

          const outputStream = fs.createWriteStream(filename);
          doc.pipe(outputStream);

          // Main Cover Page

          doc.moveDown(8).image('./public/images/logo512.png', {
            fit: [doc_width, 200],
            align: 'center'
          }).moveDown(2);

          doc.font(S.font.bold)
            .fontSize(S.font_size.h1)
            .fillColor(S.color.primary)
            .text("EITIx Quick Report", { align: "center" })
            .moveDown()
          resetStyles(doc);

          doc.font(S.font.bold)
            .fontSize(S.font_size.h2)
            .text(data.title, { align: "center" })
            .moveDown()
          resetStyles(doc);

          doc.font(S.font.bold)
            .fontSize(S.font_size.h3)
            .text(reporter_name, { align: "center" })
            .moveDown()
          resetStyles(doc);

          doc.text(today.toLocaleString(), { align: "center" });
          resetStyles(doc);

          let reports = Array.isArray(data.reports) ? data.reports : [data.reports];

          (async () => {
            try {

              // get all agent names and IPs for later use
              let agent_details = await database.collection(DB.w_agents_d).find().sort({ _id: -1 }).project({
                id: 1, ip: 1, name: 1
              }).toArray();

              for (const [idx, report_id] of reports.entries()) {

                let report = data[report_id];

                // console.log("reporter.js", report_id, report);

                if (!report) continue; // skip the missing report

                let title = report[0];
                let top = report[1];
                let bottom = report[2];
                let range = parseInt(report[3]);

                // write in new page
                doc.addPage();

                // report header
                doc.font(S.font.bold).fontSize(S.font_size.h3).text(title);
                resetStyles(doc);
                doc.moveDown(0.5);

                doc.fillColor(S.color.primary)
                  .rect(S.margin.x, doc.y - 6, doc_width, 2).fill();
                resetStyles(doc);
                doc.moveDown(0.5);

                // top description
                doc.text(top, { align: "justify" });
                doc.moveDown();

                let chart_options = {
                  /* fil: true,
                  borderColor: "#ff7f3f", */
                  backgroundColor: ["#ffbe9e", "#bac8ff"],
                  borderRadius: 5,
                  tension: 0.5,
                  pointRadius: 4
                }
                let datalabels_config = {
                  color: S.color.dark,
                  rotation: range > 7 ? -60 : range > 15 ? -90 : 0,
                  font: {
                    weight: 'bold'
                  },
                  formatter: (value) => { return format.number(value) }
                };

                let show_labels = false;
                let show_scales = true;
                let show_chart = true;
                let show_table = false;
                let colors = ["#ffbe9e", "#bac8ff", "#63ffb7", "#75e8ff", "#ff8787", "#ffe59e", "#9effca", "#be9cff", "#fc9ad0", "#deff9c"];
                let table_headers = ["Agent ID", "Agent Name", "Agent IP", "Counts"];
                let table_data = [];
                let table_title = "Report Data Overview Table";

                // Chart configuration
                let chart_data = getEventsData(Math.min(range, 60));

                table_data = [chart_data.values];

                if (report_id === "ERE10001") {

                  // Top 10 Agents
                  show_table = true;
                  datalabels_config.rotation = 0;
                  datalabels_config.formatter = (value) => { return `${value}%` };


                  let data_len = 10;
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();
                  let events_by_agents = calculateCounts(data, "all") || {};
                  events_by_agents = sortObject(events_by_agents);

                  if (DEBUG) {
                    console.log("reporter.js", report_id, events_by_agents);
                  }

                  let values = Array.from(events_by_agents.values()).slice(0, data_len);
                  let keys = Array.from(events_by_agents.keys()).slice(0, data_len);
                  keys = keys.map(k => agent_details.find(a => a.id === k));

                  let rows = [];
                  keys.forEach((key, idx) => {
                    if (key) {

                      rows.push([key.id, key.name, key.ip, values[idx]]);

                    }
                  });

                  chart_data.range = keys.map(o => o?.name);
                  chart_data.values = calculatePercentage(values);
                  table_data = rows;
                  chart_options.backgroundColor = colors.slice(0, data_len);

                  if (DEBUG) {
                    console.log("reporter.js", report_id, chart_data);
                  }

                } else if (report_id === "ERE10002") {

                  // Total Alerts
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();

                  for (const info of data) {

                    let index = chart_data.range.indexOf(info.date);

                    if (index > -1) {

                      chart_data.values[index] = info.all;

                    }

                  }

                } else if (report_id === "ERE10003") {

                  // Level 12 Alerts or Above
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();

                  for (const info of data) {

                    let index = chart_data.range.indexOf(info.date);

                    if (index > -1) {

                      chart_data.values[index] = info.risky;

                    }

                  }


                } else if (report_id === "ERE10004") {

                  // Authentication Failure
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();

                  for (const info of data) {

                    let index = chart_data.range.indexOf(info.date);

                    if (index > -1) {

                      chart_data.values[index] = info.failure;

                    }

                  }

                } else if (report_id === "ERE10005") {

                  // Authentication Failure (Top 10 Agents)
                  show_table = true;
                  datalabels_config.rotation = 0;
                  datalabels_config.formatter = (value) => { return `${value}%` };

                  let data_len = 10;
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();
                  let failure_by_agents = calculateCounts(data, "failure") || {};

                  failure_by_agents = sortObject(failure_by_agents);

                  let values = Array.from(failure_by_agents.values()).slice(0, data_len);
                  let keys = Array.from(failure_by_agents.keys()).slice(0, data_len);

                  keys = keys.map(k => agent_details.find(a => a.id === k));

                  let rows = [];
                  keys.forEach((key, idx) => {

                    if (key) {

                      rows.push([key.id, key.name, key.ip, values[idx]]);

                    }

                  });

                  chart_data.range = keys.map(o => o?.name);
                  chart_data.values = calculatePercentage(values);
                  table_data = rows;
                  chart_options.backgroundColor = colors.slice(0, data_len);

                } else if (report_id === "ERE10006") {

                  // Authentication Success
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();

                  for (const info of data) {

                    let index = chart_data.range.indexOf(info.date);

                    if (index > -1) {

                      chart_data.values[index] = info.success;

                    }

                  }

                } else if (report_id === "ERE10007") {

                  // FIM total changes
                  let fim_date = await database.collection(DB.fcd).find().sort({
                    _id: -1
                  }).limit(range).toArray() || [];

                  for (const info of fim_date) {

                    let index = chart_data.range.indexOf(info.date);

                    if (index > -1) {

                      chart_data.values[index] = info.changes;

                    }

                  }

                } else if (report_id === "ERE10008") {

                  // Common FIM Actions
                  show_table = true;
                  table_title = "Total FIM Changes by Actions";
                  datalabels_config.rotation = 0;
                  datalabels_config.formatter = (value) => { return `${value}%` };

                  let data_len = 3;
                  let data = await database.collection(DB.fcd).find().sort({ _id: -1 }).limit(range).toArray();

                  let actions = data.map(o => o.actions) || [];
                  let total_actions = countTotal(actions, "event") || {};
                  total_actions = sortObject(total_actions);

                  if (DEBUG) {
                    console.log("reporter.js", report_id, total_actions);
                  }

                  let values = Array.from(total_actions.values()).slice(0, data_len);

                  let keys = Array.from(total_actions.keys()).slice(0, data_len);

                  let percentages = calculatePercentage(values);

                  chart_data.range = keys;
                  chart_data.values = percentages;
                  table_headers = keys;
                  table_data = [values];

                  chart_options.backgroundColor = colors.slice(0, data_len);

                } else if (report_id === "ERE10009") {

                  // Top 10 FIM Agents

                  show_table = true;
                  datalabels_config.rotation = 0;
                  datalabels_config.formatter = (value) => { return `${value}%` };

                  let data_len = 10;

                  let data = await database.collection(DB.fca).find().sort({ _id: -1 }).limit(range).toArray();

                  let agents = data.map(o => o.agents) || [];
                  let total_agents = countTotal(agents, "agent") || {};
                  total_agents = sortObject(total_agents);

                  if (DEBUG) {

                    console.log("reporter.js", report_id, total_agents);

                  }

                  let values = Array.from(total_agents.values()).slice(0, data_len);

                  let keys = Array.from(total_agents.keys()).slice(0, data_len);
                  keys = keys.map(k => agent_details.find(a => a.id === k));

                  let percentages = calculatePercentage(values);
                  let rows = [];

                  keys.forEach((key, idx) => {

                    if (key) {
                      rows.push([key.id, key.name, key.ip, values[idx]]);
                    }

                  });

                  chart_data.range = keys.map(o => o.name);
                  chart_data.values = percentages;
                  table_data = rows;
                  chart_options.backgroundColor = colors.slice(0, data_len);

                } else if (report_id === "ERE10010") {

                  // CVE vulnerabilities
                  show_table = true;

                  let data = await getChartsData(database, DB.v_cve, "lastModified", range) || [];

                  if (range > 1) {

                    let all_data = await getChartsData(database, DB.v_cve_a, "lastModified", range);
                    let today_data = await database.collection(DB.v_cve).countDocuments() || 0;
                    all_data.values[all_data.values.length - 1] = today_data;

                    data = all_data || [];

                  }

                  chart_data.range = data.range;
                  chart_data.values = data.values;

                  let date_range = new Date();
                  date_range.setDate(date_range.getDate() - range);
                  date_range.setHours(23, 59, 59, 999);

                  let cve_data = await database.collection(DB.v_cve).aggregate([
                    {
                      $match: {
                        lastModified: { $gt: date_range }
                      }
                    },
                    {
                      $project: {
                        id: 1,
                        agent: 1,
                        lastModified: 1,
                        'log.agent.ip': 1,
                        'log.id': 1
                      }
                    },
                    {
                      $sort: { agent: 1 }
                    }
                  ]).toArray() || [];

                  if (range > 1) {

                    let all_cve_data = await database.collection(DB.v_cve_a).aggregate([
                      {
                        $match: {
                          lastModified: { $gt: date_range }
                        }
                      },
                      {
                        $project: {
                          id: 1,
                          agent: 1,
                          lastModified: 1,
                          'log.agent.ip': 1,
                          'log.id': 1
                        }
                      },
                      {
                        $sort: { agent: 1 }
                      }
                    ]).toArray() || [];

                    cve_data.concat(all_cve_data || []);

                  }

                  table_title = "List of detected CVEs";
                  table_headers = ["CVE", "Agent ID", "Agent IP", "Detection"];
                  table_data = cve_data.map(o => {
                    return [
                      o.id + "\nLog: " + o.log?.id,
                      o.agent,
                      o.log?.agent?.ip,
                      o.lastModified?.toDateString() + "\n" + o.lastModified?.toLocaleTimeString()
                    ]
                  });


                } else if (report_id === "ERE10011") {

                  // IoC events
                  let data = await database.collection(DB.iocd).find().sort({ _id: -1 }).limit(range).toArray();

                  for (const info of data) {

                    let index = chart_data.range.indexOf(info.date);

                    if (index > -1) {

                      chart_data.values[index] = info.total_events || 0;

                    }

                  }

                  show_table = true;

                  let date_range = new Date();
                  date_range.setDate(date_range.getDate() - range);
                  date_range.setHours(23, 59, 59, 999);

                  let ioc_data = await database.collection(DB.ioc).find({
                    ioc_count: { $exists: true },
                  }).limit(MAX_FETCH).toArray() || [];

                  ioc_data = ioc_data.concat(await database.collection(DB.a_ioc).find({
                    ioc_count: { $exists: true },
                    date: { $gte: date_range }
                  }).limit(MAX_FETCH).toArray() || []);

                  let mapped_ioc = ioc_data.map(o => {
                    return [
                      o.data,
                      o.type,
                      o.agent || "Unknown",
                      o.ioc_count,
                    ]
                  });

                  table_title = "List of detected Malicious IoCs";
                  table_headers = ["IoC", "Type", "Agent ID", "MISP Events", "Repeated"];
                  table_data = removeDuplicatesWithCountAndSum(mapped_ioc, "day(s)");

                } else if (report_id === "ERE10012") {

                  // PCI DSS
                  show_table = true;
                  show_chart = false;

                  table_title = "PCI DSS Compliance of Agents";
                  table_headers = ["Agent ID", "Agent Name", "Agent IP", "PCI DSS"];
                  table_data = [];

                  let data_len = 1000;
                  let data = await database.collection(DB.track).find().sort({ _id: -1 }).limit(range).toArray();
                  let pci_dss = calculateCounts(data, "pci_dss", true) || {};

                  let keys = Object.keys(pci_dss).slice(0, data_len);
                  let values = Object.values(pci_dss).slice(0, data_len);
                  keys = keys.map(k => agent_details.find(a => a.id === k));

                  let rows = [];
                  keys.forEach((key, idx) => {

                    if (key) {

                      rows.push([key.id, key.name, key.ip, values[idx]]);

                    }

                  });

                  table_data = rows;

                } else if (report_id === "ERE10013") {

                  // SMS notifications
                  show_table = true;
                  let search_collection = DB.rep_sms;

                  let data = await getChartsData(database, search_collection, "sent", range) || [];

                  chart_data.range = data.range;
                  chart_data.values = data.values;

                  let date_range = new Date();
                  date_range.setDate(date_range.getDate() - range);
                  date_range.setHours(23, 59, 59, 999);

                  let list_data = await database.collection(search_collection).aggregate([
                    {
                      $match: {
                        sent: { $gt: date_range }
                      }
                    },
                    {
                      $project: {
                        sent: 1,
                        source: 1,
                        message_id: 1,
                        characters: 1,
                        status: 1,
                        receiver: 1
                      }
                    },
                    {
                      $sort: { agent: 1 }
                    }
                  ]).toArray() || [];

                  table_title = "SMS: Notifications Sent";
                  table_headers = ["Time", "Source", "Message ID", "Status", "Characters", "Receiver"];
                  table_data = list_data.map(o => {
                    return [
                      o.sent.toLocaleDateString() + "\n" + o.sent.toLocaleTimeString() || 'No Information',
                      o.source,
                      o.message_id,
                      o.status,
                      o.characters,
                      o.receiver
                    ]
                  });

                } else if (report_id === "ERE10014") {

                  // Email notifications
                  show_table = true;
                  let search_collection = DB.rep_email;

                  let data = await getChartsData(database, search_collection, "sent", range) || [];

                  chart_data.range = data.range;
                  chart_data.values = data.values;

                  let date_range = new Date();
                  date_range.setDate(date_range.getDate() - range);
                  date_range.setHours(23, 59, 59, 999);

                  let list_data = await database.collection(search_collection).aggregate([
                    {
                      $match: {
                        sent: { $gt: date_range }
                      }
                    },
                    {
                      $project: {
                        sent: 1,
                        source: 1,
                        message_id: 1,
                        status: 1,
                        receiver: 1
                      }
                    },
                    {
                      $sort: { agent: 1 }
                    }
                  ]).toArray() || [];

                  table_title = "Email: Notifications Sent";
                  table_headers = ["Time", "Source", "Message ID", "Status", "Receiver"];
                  table_data = list_data.map(o => {
                    return [
                      o.sent.toLocaleDateString() + "\n" + o.sent.toLocaleTimeString() || 'No Information',
                      o.source,
                      o.message_id,
                      o.status,
                      o.receiver
                    ]
                  });


                } else if (report_id === "ERE10015") {

                  // UBA Login Activity outside working hour
                  show_table = true;
                  show_chart = false;

                  let { working_hour_ends, working_hour_starts } = org_data;

                  let [s_hour, s_min] = working_hour_starts.split(":");
                  let [e_hour, e_min] = working_hour_ends.split(":");

                  let starting_hour = new Date().setHours(parseInt(s_hour) ?? 9, parseInt(s_min) ?? 0, 0, 0);
                  let ending_hour = new Date().setHours(parseInt(e_hour) ?? 15, parseInt(e_min) ?? 0, 0, 0);

                  if (DEBUG) {
                    console.log("reporter.js, starting: ", new Date(starting_hour));
                    console.log("reporter.js, ending: ", new Date(ending_hour));
                  }

                  let pipeline = [
                    {
                      $match: {
                        sequence: { $in: [3, 12, 28, 32] },
                        timestamp: {
                          $not: {
                            $gte: new Date(starting_hour),
                            $lte: new Date(ending_hour)
                          }
                        }
                      }
                    },
                    {
                      $group: {
                        _id: { username: "$username", action: "$action" },
                        count: { $sum: 1 },
                        last_entry: { $last: "$$ROOT" }
                      }
                    }
                  ]

                  let uba_data = await database.collection(DB.uba_acts).aggregate(pipeline).limit(MAX_FETCH).toArray() || [];

                  if (range > 1) {
                    uba_data.push(...await database.collection(DB.uba_acts_a).aggregate(pipeline).limit(MAX_FETCH).toArray() || []);
                  }

                  let list_data = uba_data.map(o => ({ ...o._id, count: o.count, last_entry: o.last_entry })) || [];

                  table_title = "Login Activity List (Grouped by user)";
                  table_headers = ["Username", "Activity", "Count", "Source", "Last Activity Time"];
                  table_data = list_data.slice(0, 200).map(o => {
                    return [
                      o.username,
                      o.action,
                      o.count,
                      o.last_entry.agent_ip,
                      o.last_entry.timestamp.toLocaleDateString() + "\n" + o.last_entry.timestamp.toLocaleTimeString() || 'No Information',
                    ]
                  });


                }

                if (DEBUG) {
                  console.log("reporter.js, graph", report_id, chart_data);
                  console.log("reporter.js, table", report_id, table_headers, table_data);
                }

                if (show_chart) {

                  const chartConfig = {
                    type: chart_data.type || "bar",
                    data: {
                      labels: chart_data.range,
                      datasets: [{
                        data: chart_data.values,
                        ...chart_options
                      }]
                    },
                    options: {
                      scales: {
                        y: {
                          ticks: {
                            display: show_scales
                          },
                          beginAtZero: true
                        }
                      },
                      plugins: {
                        datalabels: datalabels_config,
                        legend: {
                          display: show_labels,
                          position: "bottom"
                        }
                      },
                    }
                  };

                  const image_buf = await chartNode.renderToBuffer(chartConfig);
                  doc.image(image_buf, {
                    fit: [doc_width, 250]
                  });

                  doc.y += 5;
                  doc.font(S.font.bold).fillColor(S.color.secondary)
                    .text(`Showing data of previous ${range} days from ${today.toLocaleDateString()}`, {
                      align: "center"
                    });
                  resetStyles(doc);

                }


                if (show_table && table_headers.length > 0) {

                  doc.y += 20;

                  await doc.table({
                    title: table_title,
                    headers: table_headers,
                    rows: table_data // array of arrays (2D)
                  }, {
                    width: doc.page.width - (S.margin.x * 2),
                    columnSpacing: S.padding.normal,
                    divider: {
                      header: { disabled: false, width: 1, opacity: 1 },
                      horizontal: { disabled: false, width: 0.5, opacity: 0.5 },
                    },
                    padding: S.padding.small,
                    prepareHeader: () => doc.font(S.font.bold).fontSize(S.font_size.small),
                    prepareRow: (row, i) => doc.font(S.font.normal).fontSize(S.font_size.small)
                  });

                }

                resetStyles(doc);
                doc.y += 10;

                // bottom description
                doc.text(bottom, { align: "justify" });
                doc.moveDown();

                // Add logic to break out of the loop if necessary
                if (idx >= reports.length - 1) {

                  renderExtras(doc, org_data, reporter_name, 0);

                  doc.end();

                  outputStream.on('finish', () => {

                    callback(filename, false);

                  })

                }

              }

            } catch (err) {

              callback(false, err);

            }
          })();

        } catch (err) {

          callback(false, err);

        }

      })

  },

  detailedReport(data, reporter, callback) {

    // callback(filename, error)

    getDatabase()
      .then(async database => {

        try {

          // >>>>>>>>>> prepare report data
          let {
            title, report, agent, timestamp_from, timestamp_to, range
          } = data;
          // writing limit
          let limit_logs = MAX_LINES;
          let line_count = 0;
          let file_index = 0;
          // get the log collection names that will be fetched
          let log_collections = await getCollectionNames(database, timestamp_from, timestamp_to);
          let org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

          // >>>>>>>>>> prepare directory
          // create directory if it doesn't exist
          if (!fs.existsSync(REPORT_DIR)) {

            fs.mkdirSync(REPORT_DIR, { recursive: true });

          }
          // report streams
          const reportStreams = [];
          let filename = `${REPORT_DIR}/${title}-detailed-report-${new Date().getTime()}.csv`;
          reportStreams[file_index] = fs.createWriteStream(filename);

          // >>>>>>>>>> Flag the start of reporting
          await database.collection(DB.eitix).updateOne({
            title: "eitix"
          }, {
            $set: {
              detailed_reporting: true
            }
          }, { upsert: true });

          // >>>>>>>>>> Send notification
          let nid = Math.random().toString(36).substring(2, 10) + (new Date()).getTime().toString(36);
          database.collection(DB.notifs).insertOne({
            nid,
            type: "Report",
            message: `
                    <div class="d-flex align-items-center gap-2">
                        <div>
                            <div class="spinner-border text-primary text-center" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                        <div class="fw-bold">
                            Detailed report (${report}) is generating...
                        </div>
                    </div>
                `,
            redirect: `#`,
            updated: new Date(),
            targets: [reporter.email],
            targets_unseen: [reporter.email],
          });

          // check for file limit and prepare new stream if necessary
          function fileLimitCheck() {

            if (line_count++ > MAX_LINES) {

              console.log("reporter.js", "Creating new stream with number: ", file_index);

              // close current stream
              reportStreams[file_index].end();

              // increment index
              file_index++;
              line_count = 0;
              // prepare new stream
              let new_filename = `${REPORT_DIR}/${title}-detailed-report-${new Date().getTime()}-${file_index}.csv`;
              reportStreams[file_index] = fs.createWriteStream(new_filename);

            }

          }

          // >>>>>>>>>> start reporting 
          if (report === "EDR10001") {

            /* alerts report */

            // get query from data
            let query = generateSearchQuery(data);

            if (agent && agent !== "all") {
              query["agent.id"] = agent;
            }

            // initiate file stream
            // write header
            if (data.full_log == 'true') {
              reportStreams[file_index].write("Date, Time, Log ID, Agent ID, Agent Name, Rule ID, Description, Level, Log\n");

            } else {
              reportStreams[file_index].write("Date, Time, Log ID, Agent ID, Agent Name, Rule ID, Description, Level\n");

            }

            for (const collection of log_collections) {

              // data cursor
              let result_cursor = await database.collection(collection).find(
                query
              ).sort({ _id: -1 }).limit(limit_logs);

              for await (const log of result_cursor) {

                let time = new Date(log.timestamp);

                let log_array = [
                  time.toLocaleDateString(),
                  time.toLocaleTimeString(),
                  `log: ${log?.id}`,
                  `agent: ${log?.agent?.id}`,
                  log?.agent?.name,
                  log?.rule?.id,
                  log?.rule?.description,
                  log?.rule?.level,
                ]

                if (data.full_log == 'true') {
                  log_array.push(`"${log.full_log}"`);
                }

                let log_string = log_array.join(",") + "\n";

                reportStreams[file_index].write(log_string);

                fileLimitCheck();

              }

            }

          } else if (report === "EDR10002") {

            /* fim report - detailed */

            // write header
            reportStreams[file_index].write("Date, Time, Path, Action, Changes, Agent ID, Log ID, MD5_After, SHA_1_After, SHA_256_After\n");

            // prepare query for searching
            let search = data?.file_path;
            let filter = {};

            if (search) {

              filter = { path: RegExp(safeRegex(search), 'i') };

              if (data?.operator === "equal_to") {

                filter = { path: search };

              }

            }

            if (agent && agent !== "all") {

              filter.agent = agent;

            }

            // find day difference
            let from = new Date(timestamp_from);
            let to = new Date(timestamp_to);

            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);

            let data_cursor = null;

            if (from.toDateString() === to.toDateString()) {

              // today search
              data_cursor = await database.collection(DB.fim).find(filter).sort({ _id: -1 }).limit(MAX_FETCH);

            } else {

              // aggreagate with archive
              data_cursor = await database.collection(DB.fim).aggregate([
                {
                  $match: {
                    ...filter,
                    date: {
                      $gte: from,
                      $lte: to
                    }
                  }
                },
                {
                  $unionWith: {
                    coll: DB.fim_a,
                    pipeline: [
                      {
                        $match: {
                          ...filter,
                          date: {
                            $gte: from,
                            $lte: to
                          }
                        }
                      }
                    ]
                  }
                },
                {
                  $sort: { _id: -1 }
                },
                {
                  $limit: MAX_FETCH
                }
              ]).toArray();

            }

            for await (const data of data_cursor) {

              let log_string = fimLogString(data);

              reportStreams[file_index].write(log_string);

              fileLimitCheck();

            }

            function fimLogString(data) {
              let time = data.date;
              return [
                time.toLocaleDateString(),
                time.toLocaleTimeString(),
                data.path,
                data.event,
                data.changes,
                data.agent,
                `log: ${data.log_id}`,
                data.md5_after,
                data.sha1_after,
                data.sha256_after,
              ].join(",") + "\n";
            }


          } else if (report === "EDR10003") {

            /* cve report - detailed */

            // write header
            reportStreams[file_index].write("Date, Time, CVE ID, Log ID, Agent ID, Agent IP, Agent Name\n");

            // prepare query for searching
            let search = data?.cve_id;
            let filter = { id: RegExp(safeRegex(search), 'i') };
            if (data?.operator === "equal_to") {

              filter = { id: search };

            }
            if (agent && agent !== "all") {

              filter.agent = agent;

            }

            // find day difference
            let from = new Date(timestamp_from);
            let to = new Date(timestamp_to);

            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);

            let data_cursor = null;

            if (from.toDateString() === to.toDateString()) {

              // today search
              data_cursor = await database.collection(DB.v_cve).find(filter).sort({ _id: -1 }).limit(MAX_FETCH);

            } else {

              // aggreagate with archive
              data_cursor = await database.collection(DB.v_cve).aggregate([
                {
                  $match: {
                    ...filter,
                    lastModified: {
                      $gte: from,
                      $lte: to
                    }
                  }
                },
                {
                  $unionWith: {
                    coll: DB.v_cve_a,
                    pipeline: [
                      {
                        $match: {
                          ...filter,
                          lastModified: {
                            $gte: from,
                            $lte: to
                          }
                        }
                      }
                    ]
                  }
                },
                {
                  $sort: { _id: -1 }
                },
                {
                  $limit: MAX_FETCH
                }
              ]).toArray();

            }

            for await (const cve_info of data_cursor) {

              let log_string = cveLogString(cve_info);
              reportStreams[file_index].write(log_string);
              fileLimitCheck();

            }

            function cveLogString(cve_info) {
              let time = cve_info.lastModified;
              return [
                time.toLocaleDateString(),
                time.toLocaleTimeString(),
                cve_info.id,
                `log: ${cve_info.log?.id}`,
                `agent: ${cve_info.log?.agent?.id}`,
                cve_info.log?.agent?.ip,
                cve_info.log?.agent?.name
              ].join(",") + "\n";
            }

          } else if (report === "EDR10004") {

            /* ioc report - detailed */

            // write header
            reportStreams[file_index].write("Date,Time,Source,Data,Log ID,Repetitions,MISP Count\n");

            // prepare query for searching
            let search = data?.ioc_data;
            let filter = { data: RegExp(safeRegex(search), 'i') };
            if (data?.operator === "equal_to") {

              filter = { data: search };

            }
            if (agent && agent !== "all") {

              filter.agent = agent;

            }

            // find day difference
            let from = new Date(timestamp_from);
            let to = new Date(timestamp_to);

            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);

            let data_cursor = null;

            if (from.toDateString() === to.toDateString()) {

              // today search
              data_cursor = await database.collection(DB.ioc).find(filter).sort({ _id: -1 }).limit(MAX_FETCH);

            } else {

              // aggreagate with archive
              data_cursor = await database.collection(DB.ioc).aggregate([
                {
                  $match: {
                    ...filter,
                    date: {
                      $gte: from,
                      $lte: to
                    }
                  }
                },
                {
                  $unionWith: {
                    coll: DB.a_ioc,
                    pipeline: [
                      {
                        $match: {
                          ...filter,
                          date: {
                            $gte: from,
                            $lte: to
                          }
                        }
                      }
                    ]
                  }
                },
                {
                  $sort: { _id: -1 }
                },
                {
                  $limit: MAX_FETCH
                }
              ]).toArray();

            }

            for await (const ioc of data_cursor) {

              let time = ioc.date;

              let log_string = [
                time?.toLocaleDateString(),
                time?.toLocaleTimeString(),
                ioc.source,
                ioc.data,
                `log: ${ioc.log_id}`,
                ioc.s_count,
                ioc.ioc_count
              ].join(",") + "\n";

              reportStreams[file_index].write(log_string);

              fileLimitCheck();

            }

          } else if (report === "EDR10005") {

            /* pci dss report */

            // write header
            reportStreams[file_index].write("Date,Time,Log ID,Agent ID, Agent Name,PCI DSS,Description\n");

            // filters
            let agent_filter = {};
            if (agent && agent !== "all") agent_filter = { "agent.id": agent };
            let query = {
              $and: [
                agent_filter,
                {
                  "rule.pci_dss": RegExp(safeRegex(data.pci_dss), 'i')
                }
              ]
            };

            for (const collection of log_collections) {

              let result_cursor = await database.collection(collection).find(
                query
              ).sort({ _id: -1 }).limit(limit_logs);

              for await (const log of result_cursor) {

                let time = new Date(log.timestamp);

                let log_string = [
                  time.toLocaleDateString(),
                  time.toLocaleTimeString(),
                  `log: ${log.id}`,
                  `agent: ${log.agent?.id}`,
                  log.agent?.name,
                  log.rule?.pci_dss?.join(" | "),
                  log.rule?.description,
                ].join(",") + "\n";

                reportStreams[file_index].write(log_string);

                fileLimitCheck();

              }

            }

          } else if (report === "EDR10006") {

            /* authentication failure report */

            // write header
            reportStreams[file_index].write("Date, Time, Log ID, Agent ID, Agent Name, Rule ID, Description, Level\n");

            // filters
            let agent_filter = {};
            if (agent && agent !== "all") agent_filter = { "agent.id": agent };

            for (const collection of log_collections) {

              let result_cursor = await database.collection(collection).find({
                $and: [
                  agent_filter,
                  {
                    "rule.id": {
                      $in: [
                        "60122",
                        "411",
                        "427",
                        "2501",
                        "2502",
                        "2509",
                        "5301",
                        "5302",
                        "5405",
                        "3332",
                        "3357",
                        "3601",
                        "3651",
                        "3902",
                        "3910",
                        "4321",
                        "4324",
                        "4334",
                        "4336",
                        "4386",
                        "4811",
                        "5503",
                        "5551",
                        "5557",
                        "5710",
                        "5711",
                        "5716",
                        "5720",
                        "5728",
                        "5733",
                        "5738",
                        "5755",
                        "5758",
                        "5760",
                        "5763",
                        "6104",
                        "6106",
                        "6210",
                        "6211",
                        "6256"
                      ]
                    }
                  }
                ]
              }).sort({ _id: -1 }).limit(limit_logs);

              for await (const log of result_cursor) {

                let time = new Date(log.timestamp);

                let log_string = [
                  time.toLocaleDateString(),
                  time.toLocaleTimeString(),
                  `log: ${log.id}`,
                  `agent: ${log.agent?.id}`,
                  log?.agent?.name,
                  log?.rule?.id,
                  log?.rule?.description,
                  log?.rule?.level,
                ].join(",") + "\n";

                reportStreams[file_index].write(log_string);

                fileLimitCheck();

              }

            }

          } else if (report === "EDR10007") {

            /* uba outside working hour report - detailed */

            // write header
            reportStreams[file_index].write("Date, Time, Username, Action, Frequency, Logs\n");

            let { working_hour_ends, working_hour_starts } = org_data;
            let [s_hour, s_min] = working_hour_starts.split(":");
            let [e_hour, e_min] = working_hour_ends.split(":");

            let starting_hour = new Date().setHours(parseInt(s_hour) ?? 9, parseInt(s_min) ?? 0, 0, 0);
            let ending_hour = new Date().setHours(parseInt(e_hour) ?? 15, parseInt(e_min) ?? 0, 0, 0);

            // prepare query for searching
            let search = data?.username;
            let filter = {
              sequence: { $in: [3, 12, 28, 32] },
              timestamp: {
                $not: {
                  $gte: new Date(starting_hour),
                  $lte: new Date(ending_hour)
                }
              }
            };

            if (search) {

              filter.username = RegExp(safeRegex(search), 'i');

              if (data?.operator === "equal_to") {

                filter.username = search;

              }

            }

            if (agent && agent !== "all") {

              filter.agent = agent;

            }

            // find day difference
            let from = new Date(timestamp_from);
            let to = new Date(timestamp_to);

            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);

            let data_cursor = null;

            // today search
            data_cursor = await database.collection(DB.uba_acts).find(filter).sort({ _id: -1 }).limit(MAX_FETCH);

            for await (const data of data_cursor) {

              let log_string = ubaLogString(data);

              reportStreams[file_index].write(log_string);

              fileLimitCheck();

            }

            function ubaLogString(data) {
              let time = data.timestamp;
              return [
                time.toLocaleDateString(),
                time.toLocaleTimeString(),
                data.username,
                data.action,
                data.frequency,
                data.logs.map(log => `log: ${log}`).join(" "),
              ].join(",") + "\n";
            }


          } else {
            callback(false, {
              message: "Report not found"
            });
          }

          // >>>>>>>>>> END OF REPORT <<<<<<<<<<
          if (reportStreams.length > 1) {

            // zip all the streams
            const archive = archiver('zip', {
              zlib: { level: 9 } // Sets the compression level.
            });
            let zip_filename = `${REPORT_DIR}/${title}-detailed-report-${new Date().getTime()}.zip`;
            const zip_stream = fs.createWriteStream(zip_filename);
            archive.pipe(zip_stream);

            for (const stream of reportStreams) {
              archive.file(stream.path, { name: stream.path });
            }

            await archive.finalize();

            // use new zip filename
            filename = zip_filename;

          } else {

            reportStreams[file_index].end();

          }

          // >>>>>>>>> Update the notification
          await database.collection(DB.notifs).updateOne({
            nid
          }, {
            $set: {
              message: `
                        <div class="d-flex align-items-center gap-2">
                            <div>
                                <i class="fa-solid fa-download fs-4 text-success"></i>
                            </div>
                            <div>
                                Detailed report <strong>(${title})</strong> is completed. <br>
                                <strong>Click to download now!</strong>
                            </div>
                        </div>
                    `,
              redirect: `/dashboard/reports/download?file=${filename}`,
            }
          })

          // >>>>>>>>>> Flag the start of reporting
          await database.collection(DB.eitix).updateOne({
            title: "eitix"
          }, {
            $set: {
              detailed_reporting: false
            }
          }, { upsert: true });

          // callback upon completion
          callback(filename, false);


        } catch (err) {

          callback(false, err);

        }

      })

  },

}

function centeredHeading(doc, custom_text, title) {
  doc.fontSize(S.font_size.small).text(custom_text, {
    align: "center"
  });
  doc.moveDown(0.5);
  doc.font(S.font.bold).fontSize(S.font_size.h3)
    .fillColor(S.color.primary).text(title, {
      align: "center"
    });
  resetStyles(doc);
  doc.moveDown(2);
}

module.exports = {

  REPORTER

}