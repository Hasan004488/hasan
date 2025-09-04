const { htmlToText } = require('html-to-text');

const S = {
    color: {
        primary: "#ff7f3f",
        secondary: "#5e6580",
        danger: "red",
        light: "white",
        dark: "#21293d"
    },
    padding: {
        small: 5,
        normal: 10,
        large: 20
    },
    margin: {
        top: 100,
        bottom: 90,
        x: 40,
        y: 25
    },
    font: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
    },
    font_size: {
        d1: 48,
        d2: 36,
        h1: 24,
        h2: 18,
        h3: 14,
        normal: 12,
        small: 10,
        mini: 8
    }
}

function sumAgentData(track_data, agent, tenant = "tenant") {

    let all_agent_data = track_data.map(o => o.tenants?.[tenant]);
    let agent_data = all_agent_data;
    let total_agent_data = {
        all: 0,
        Medium: 0,
        Low: 0,
        High: 0
    };

    if (agent && agent !== "all") {

        all_agent_data = track_data.map(o => o.tenants?.[tenant]?.agents);
        agent_data = all_agent_data.filter(item => item && item.hasOwnProperty(agent));

        agent_data.forEach(item => {
            if (item && item[agent]) {
              total_agent_data.all += item[agent].all || 0;
              total_agent_data.Medium += item[agent].Medium || 0;
              total_agent_data.Low += item[agent].Low || 0;
              total_agent_data.High += item[agent].High || 0;
            }
        });

    } else {

        agent_data.forEach(item => {
            if (item) {
              total_agent_data.all += item.all || 0;
              total_agent_data.Medium += item.Medium || 0;
              total_agent_data.Low += item.Low || 0;
              total_agent_data.High += item.High || 0;
            }
        });

    }
  
    return total_agent_data || [];
  
}

function sortObject(r) {
    if (!r) return {};
    {
        let t = [],
            n = new Map;
        for (var e in r) t.push([e, r[e]]);
        return t.sort(function(r, t) {
            return t[1] - r[1]
        }), t.forEach(r => {
            n.set(r[0], r[1])
        }), n
    }
}

function removeDuplicatesWithCountAndSum(arr, suffix = "") {

    const countMap = new Map();
    const uniqueItems = new Map();
  
    // Count the occurrences and sum the fourth values for each unique (first, third) tuple
    arr.forEach(item => {
      const key = JSON.stringify([item[0], item[2]]);
      if (countMap.has(key)) {
        const [count, sum] = countMap.get(key);
        countMap.set(key, [count + 1, sum + item[3]]);
      } else {
        countMap.set(key, [1, item[3]]);
      }
  
      // Store the first occurrence of each unique (first, third) tuple
      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, item);
      }
    });
  
    // Update each unique item with the count and the summed value
    return Array.from(uniqueItems.entries()).map(([key, item]) => {
      const [count, sum] = countMap.get(key);
      return [item[0], item[1], item[2], sum, count + " " + suffix];
    });

}

async function getChartsData(database, collection, date_field, range = 7)  {

    try {

        let data = {
            range: [],
            values: []
        };

        for(let i = range - 1, j = 0; i >= 0; i--, j++) {

            // set dates respectively
            let today = new Date();
            today.setDate(today.getDate() - i);
            let date = today.toISOString().split("T")[0];
            data.range.push(date);

            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

            let count_data = await database.collection(collection).aggregate([
                {
                    $match: {
                        [date_field]: { $gte: startOfDay, $lte: endOfDay }
                    }
                },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 }
                    }
                }
            ]).toArray();

            // console.log(i, count_data);

            if (count_data[0]?.count) {

                data.values.push(count_data[0]?.count);

            } else {

                data.values.push(0);

            }

        };

        return data;

    } catch (err) {

        console.error("reporter.js", err);
        return null;

    } 

}

function getEventsData(range = 7)  {

    try {
            
        let data = {
            range: [],
            values: []
        };

        for(let i = range - 1, j = 0; i >= 0; i--, j++) {

            // set default amount 0
            data.values.push(0);
            
            // set dates respectively
            let today = new Date();
            today.setDate(today.getDate() - i);
            let date = today.toISOString().split("T")[0];

            data.range.push(date);

        };

        return data;
        
    } catch (err) {

        console.error("reporter.js", err);
        return null;
        
    }

}

function countTotal(arrayOfArrays, field) {

    const totalChanges = {};
  
    arrayOfArrays.forEach(subArray => {
        subArray?.forEach(item => {
            let prop = item[field];
            let changes = item.changes;
            totalChanges[prop] = (totalChanges[prop] || 0) + changes;
        });
    });
  
    return totalChanges;

}

function calculateCounts(data, field, is_string = false, separator = ", ") {

    const result = {};
  
    data.forEach(track => {
  
      let counts = track?.tenants?.tenant?.agents;
  
      if (counts) {
  
        for (const agent in counts) {
          if (counts.hasOwnProperty(agent)) {

            if (is_string) {

                if (counts[agent][field] && counts[agent][field].length > 0) {

                    if (result[agent]) {

                        result[agent].push(...counts[agent][field]);

                    } else {

                        result[agent] = [...counts[agent][field]];

                    }

                }

            } else {

                result[agent] = (result[agent] || 0) + (counts[agent][field] || 0);

            }
      
      
          }
        }
  
      }
      
    });

    if (is_string) {
        
        for (const agent in result) {

          if (result.hasOwnProperty(agent)) {

            result[agent] = result[agent].join(separator);

          }

        }

    }

    return result;
  
}

async function renderTicketReport(report_data) {

    const { doc, data, requester, users } = report_data;
    const log = data.event;
    let doc_width = doc.page.width - S.margin.x;
    let ticket_type = data.type ?? "Ticket";

    // heading
    doc.font(S.font.bold).fontSize(S.font_size.h2).fillColor(S.color.primary);
    doc.text(`EITIx ${ticket_type} Reporting`);
    doc.moveDown(0.5);
    resetStyles(doc);

    // body

    // ticket information
    await doc.table({
        title: `${ticket_type} Information`,
        headers: [
          `Ticket Number: ${data.sid}`, `SIEM LOG ID: ${log?.id || "Not Provided"}` 
        ],
        rows: [
            [`Date/Time Detected: ${data.opening?.toLocaleString()}`, `Reserved`],
            [
              `Requester Name: ${requester.full_name ?? 'No Information'}`,
              `Requester Phone: ${requester.phone_number ?? 'Not Provided'}`
            ],
            [`Requester Email: ${data.created_by}`, `Reserved`],
            [
              `Opening Date: ${data.opening?.toLocaleString() || "No Information"}`,
              `First Escalation Date: ${data.first_escalation?.toLocaleString() || "No Information"}`
            ],
            [
              `Second Escalation Date: ${data.second_escalation?.toLocaleString() || "No Information"}`,
              `Expiry Date: ${data.expiry_date?.toLocaleString() || "No Information"}`
            ],
            [
              `Ticket Criticality: ${data.criticality || "No Information"}`,
              `Reminder Frequency: ${data.reminder_frequency || "No Information"} Day(s)`
            ]
        ]
    }, {
        width: doc.page.width - (S.margin.x * 2),
        columnSpacing: S.padding.normal,
        prepareHeader: () => doc.font(S.font.bold).fontSize(S.font_size.small),
        prepareRow: (row, i) => doc.font(S.font.normal).fontSize(S.font_size.small)
    });
    doc.moveDown();

    // Ticket summary
    // ignore if log not found
    if (log) {

        await doc.table({
            title: `${ticket_type} Summary`,
            headers: [
              `Agent Name: ${log.agent?.name || "No Information"}`,
              `Agent ID: ${log.agent?.id || "No Information"}`
            ],
            rows: [
              [
                `Source Address: ${log.source || "No Information"}`,
                `Destination Address: ${log.destination || "No Information"}`
              ],
              [
                `Technique: ${log.rule?.mitre?.technique?.join(', ') || "No Information"}`,
                `Tactics: ${log.rule?.mitre?.tactic?.join(', ') || "No Information"}`
              ],
              [
                `Program Name: ${log.decoder?.name || "No Information"}`,
                `Fired Times: ${log.rule?.firedtimes || "No Information"}`
              ],
              [
                `PCI DSS: ${log.rule?.pci_dss?.join(', ') || "No Information"}`,
                `NIST: ${log.rule?.nist_800_53?.join(', ') || "No Information"}`
              ],
              [
                `Rule ID: ${log.rule?.id || "No Information"}`,
                `Reserved: "No Information"}`
              ],
              [
                `Source Port: ${log.data?.srcport || "No Information"}`,
                `Destination Port: ${log.data?.dstport || "No Information"}`
              ]
            ]
        }, {
            width: doc.page.width - (S.margin.x * 2),
            columnSpacing: S.padding.normal,
            prepareHeader: () => doc.font(S.font.bold).fontSize(S.font_size.small),
            prepareRow: (row, i) => doc.font(S.font.normal).fontSize(S.font_size.small)
        });

        doc.moveDown();

    }

    // Ticket Assigned Users
    /* let users_rows = [];

    users.init.forEach(user => {
        users_rows.push([user.name, user.role, getType(user.type)]);
    })

    users.first.forEach(user => {
        users_rows.push([user.name, user.role, getType(user.type)]);
    })

    users.second.forEach(user => {
        users_rows.push([user.name, user.role, getType(user.type)]);
    }) */

    /* doc.addPage();
    await doc.table({
        title: `Assigned People`,
        headers: [`Name`, `Role`, 'Type'],
        rows: users_rows
    }, {
        width: doc.page.width - (S.margin.x * 2),
        columnSpacing: S.padding.normal,
        prepareHeader: () => doc.font(S.font.bold).fontSize(S.font_size.small),
        prepareRow: (row, i) => doc.font(S.font.normal).fontSize(S.font_size.small)
    });
    doc.moveDown(); */
    
    // ticket root cause
    doc.addPage();
    doc.font(S.font.bold).fontSize(S.font_size.h3);
    doc.text(`Root Cause of this ${data.type}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(doc.x, doc.y).lineTo(doc_width, doc.y).lineWidth(1).stroke('gray');
    doc.moveDown(1);
    resetStyles(doc);

    let clean_root_case = data.root_cause?.replace(/<p><br><\/p>/g, "");
    let root_cause = htmlToText(clean_root_case);
    doc.text(root_cause);
    doc.moveDown(2);

    // ticket preventive control
    doc.addPage();
    doc.font(S.font.bold).fontSize(S.font_size.h3);
    doc.text(`Prevention of this ${data.type}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(doc.x, doc.y).lineTo(doc_width, doc.y).lineWidth(1).stroke('gray');
    doc.moveDown(1);
    resetStyles(doc);

    let clean_prevention = data.prevention?.replace(/<p><br><\/p>/g, "");
    let prevention = htmlToText(clean_prevention);
    doc.text(prevention);
    doc.moveDown(2);

    // ticket remediation
    doc.addPage();
    doc.font(S.font.bold).fontSize(S.font_size.h3);
    doc.text(`Ticket Remediation`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(doc.x, doc.y).lineTo(doc_width, doc.y).lineWidth(1).stroke('gray');
    doc.moveDown(1);
    resetStyles(doc);
    let clean_remediation = data.remediation?.replace(/<p><br><\/p>/g, "");
    let remediation = htmlToText(clean_remediation);
    doc.text(remediation);

    if (log) {

        // Ticket full log
        doc.addPage();
        doc.font(S.font.bold).fontSize(S.font_size.h3);
        doc.text(`Full log of this event`, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(doc.x, doc.y).lineTo(doc_width, doc.y).lineWidth(1).stroke('gray');
        doc.moveDown(1);
    
        resetStyles(doc);
    
        let full_log = JSON.stringify(log, null, 2);
        doc.text(full_log);
        doc.moveDown(2);

    }

    resetStyles(doc);
    
}

function renderExtras(doc, org_data, reporter_name = "EITIx",  skip = 0) {

    let pages = doc.bufferedPageRange();
    let today = new Date();

    for (let i = skip; i < pages.count; i++) {

        doc.switchToPage(i);

        // set header
        renderHeader(doc, org_data);

        //Footer: Add page number
        doc.fontSize(S.font_size.small)
            .text(`Page: ${i + 1} of ${pages.count} (Generated at ${today.toLocaleString()} by ${reporter_name})`,
                S.margin.x,
                doc.page.height - S.margin.x, {
                lineBreak: false
            }
        );

    }
    
}

function renderHeader(doc, org_data) {

    let doc_width = doc.page.width;
    let padding = 0;

    let rect_width = 200;
    let rect_x = doc_width - S.margin.x - rect_width;
    let rect_y = S.margin.y;

    // name: 70
    // address: 150

    resetStyles(doc);
    doc.image(org_data.image, S.margin.x, S.margin.y, {
        fit: [250, 55]
    });
    doc.rect(rect_x, rect_y, rect_width, 40);
    doc.fontSize(S.font_size.small);
    doc.font(S.font.bold);
    doc.text(org_data.name || "No Information", rect_x + padding, rect_y + padding, {
        align: "right"
    });
    doc.font(S.font.normal).fontSize(S.font_size.mini);
    doc.text(`${org_data.address || "No Information"}\nPhone: ${org_data.phone || "No Information"}\nEmail: ${org_data.email || "No Information"}`, {
        align: "right"
    });

    return doc.y;

}

function resetStyles(doc) {
    doc.fillColor(S.color.dark).font(S.font.normal).fontSize(S.font_size.normal);
}

function getType(type) {

    if (type == 'fesc') return `First Escalation member`;
    else if (type == 'sesc') return `Second Escalation member`;
    else return `Initial Target member`;
    
}

function calculatePercentage(values) {

    let sum = values.reduce((acc, value) => acc + value, 0);

    return values.map((value) => {

        let percentage = parseFloat((value / sum * 100).toFixed(2)) || 0
        return percentage >= 1 ? Math.round(percentage) : percentage;

    });

}

function docTitle(doc, string) {

    let doc_width = doc.page.width - S.margin.x;

    // page header
    doc.font(S.font.bold).fontSize(S.font_size.h2).text(string);
    resetStyles(doc);
    doc.moveDown(0.5);
    // border line
    doc.fillColor(S.color.primary)
    .rect(S.margin.x, doc.y - 6, doc_width, 2).fill();
    resetStyles(doc);
    doc.moveDown(2);
}

function docCoverPage(doc, custom_title, report_title, reporter_name) {

    let doc_width = doc.page.width - S.margin.x;

    doc.moveDown(8).image('./public/images/logo512.png', {
        fit: [doc_width, 200],
        align: 'center'
    }).moveDown(2);

    doc.font(S.font.bold)
        .fontSize(S.font_size.h1)
        .fillColor(S.color.primary)
        .text(custom_title, { align: "center" })
        .moveDown()
    resetStyles(doc);

    doc.font(S.font.bold)
        .fontSize(S.font_size.h2)
        .text(report_title, { align: "center" })
        .moveDown(0.5)
    resetStyles(doc);

    doc.font(S.font.bold)
        .fontSize(S.font_size.h3)
        .text(reporter_name, { align: "center" })
        .moveDown()
    resetStyles(doc);

    let today = new Date();
    doc.text(today.toLocaleString(), { align: "center" });
    resetStyles(doc);
    
}

module.exports = {
  S, docCoverPage,
  renderTicketReport,
  renderExtras,
  renderHeader,
  resetStyles,
  getType,
  calculatePercentage,
  removeDuplicatesWithCountAndSum,
  htmlToText,
  sumAgentData,
  sortObject,
  getChartsData,
  getEventsData,
  countTotal,
  calculateCounts,
  docTitle
};
