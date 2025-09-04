const cron = require('node-cron');
const {
  DB, getDatabase
} = require("../libraries/database");
const {
  sysLog, timeDif, getDateString
} = require("../libraries/globals");
const { MAILER, SMS, selectTargetUsers } = require('../libraries/sender');
const { REPORTER } = require('../libraries/reporter');
const { bootWorker } = require('../libraries/worker-tools');
const reportPlaybooks = require('./notifications/report-playbooks');

const WORKER_NAME = "Charlie Crane";
const WORKER_FILE = "charlie_crane";

const MAX_ITERATION = 1;
let DEBUG = false;

function main() {

  getDatabase()
    .then(async database => {

      const worker_ready = await bootWorker(database, WORKER_NAME, WORKER_FILE, true);

      if (worker_ready) {

        for (let i = 0; i < MAX_ITERATION; i++) {

          // update reports
          if (DEBUG) console.log("updateReports entry");

          await updateReports(database);

          if (DEBUG) console.log("updateReports exit");

          // send report schedules
          if (DEBUG) console.log("reportSchedules entry");

          await reportSchedules(database);

          if (DEBUG) console.log("reportSchedules exit");

          // report playbook messages
          if (DEBUG) console.log("reportPlaybooks entry");

          await reportPlaybooks(database);

          if (DEBUG) console.log("reportPlaybooks exit");

          // report ai playbook messages
          if (DEBUG) console.log("reportAIPlaybooks entry");

          await reportAIPlaybooks(database);

          if (DEBUG) console.log("reportAIPlaybooks exit");

          // report uba playbook messages
          if (DEBUG) console.log("reportUBAPlaybooks entry");

          await reportUBAPlaybooks(database);

          if (DEBUG) console.log("reportUBAPlaybooks exit");

        }

        await bootWorker(database, WORKER_NAME, WORKER_FILE, false);

      } else {

        if (DEBUG) console.log(`${WORKER_NAME} is not ready (Instance already running)`);

      }

    }).catch(err => {

      sysLog(`${WORKER_NAME} encountered server error`, err);

    });

}

async function updateReports(database) {

  try {

    let today = getDateString();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    // count sms
    let sms_sent = await database.collection(DB.rep_sms).aggregate([
      { $match: { sent: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: "$length" } } }
    ]).toArray() || [];

    if (sms_sent[0]) {

      await database.collection(DB.track).updateOne({ date: today }, {
        $set: { sms_sent: sms_sent[0]?.total || 0 }
      }, { upsert: true });

    }

    // count emails
    let emails_sent = await database.collection(DB.rep_email).countDocuments({
      sent: { $gte: start, $lt: end }
    });

    return database.collection(DB.track).updateOne({ date: today }, {
      $set: { emails_sent }
    }, { upsert: true });

  } catch (error) {

    sysLog(`${WORKER_NAME} encountered server error`, err);

  }

}

async function reportAIPlaybooks(database) {

  try {

    // find active ai playbooks
    let ai_playbooks = await database.collection(DB.playb)
      .find({
        source: "AI",
        disabled: "false",
      })
      .toArray();

    if (ai_playbooks.length > 0) {

      sysLog(`${WORKER_NAME} is processing ${ai_playbooks.length} active ai playbooks`);

      // get the ai data
      let date = getDateString();
      let result = await database.collection(DB.track).findOne({ date }) || {};

      if (!result.attacks) return;

      let attacks = result.attacks.map(a => ({ name: a.name, count: a.count }));

      // for each playbook
      return ai_playbooks.forEach(async playbook => {

        const {

          last_fired = false,
          max_fire, meantime, sid, notified,
          ai_logs_count

        } = playbook;

        if (notified < parseInt(max_fire)) {

          // if last fired time is greater then the mean difference
          if (!last_fired || timeDif(last_fired, "minute") > parseInt(meantime)) {

            let matched_vector = attacks.find(a => a.name === playbook?.ai_vector && a.count > playbook?.ai_logs_count);

            if (matched_vector) {

              let notification = { email: false, sms: false };

              if (playbook.send_sms === 'on') {

                notification.sms = true;
                // send bulk sms and record
                SMS.playbookAI(playbook, (err) => {

                  if (err) {

                    sysLog(`${WORKER_NAME} failed to send SMS for a playbook ${sid}`, err);

                  }

                })

              }

              if (playbook.send_email === "on") {

                notification.email = true;
                MAILER.playbookAI(playbook, (err) => {

                  if (err) {

                    sysLog(`${WORKER_NAME} failed to send Email for a playbook ${sid}`, err);

                  }

                })

              }

              if (notification.email || notification.sms) {

                // notify users
                let users = await selectTargetUsers(database, playbook?.users);
                let user_emails = users.map(user => user.email);

                database.collection(DB.notifs).insertOne({
                  type: "Playbook",
                  message: `
                    <div class="d-flex align-items-center gap-2">
                        <div>
                            <i class="fa fa-filter fs-4 text-secondary"></i>
                        </div>
                        <div class="">
                            Playbook Email/SMS for <strong>${playbook.title}</strong> has been sent to you.
                        </div>
                    </div>
                  `,
                  redirect: `#`,
                  updated: new Date(),
                  targets: user_emails,
                  targets_unseen: user_emails
                });

              }

            }

          }

        }

      });

    }


  } catch (err) {

    sysLog(`${WORKER_NAME} encountered server error`, err);

  }

}

async function reportUBAPlaybooks(database) {

  try {

    // find active ai playbooks
    let uba_playbooks = await database.collection(DB.playb)
      .find({
        source: "UBA",
        disabled: "false",
      })
      .toArray();

    const org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

    if (uba_playbooks.length > 0) {

      sysLog(`${WORKER_NAME} is processing ${uba_playbooks.length} active uba playbooks`);

      // for each playbook
      for (let i = 0; i < uba_playbooks.length; i++) {

        const playbook = uba_playbooks[i];
        let notification = { email: false, sms: false };

        const {
          last_fired = false,
          max_fire, meantime, sid, notified,
          uba_username, uba_activity, uba_act_count,
          uba_alert
        } = playbook;

        if (notified < parseInt(max_fire)) {

          // if last fired time is greater then the mean difference
          if (!last_fired || timeDif(last_fired, "minute") > parseInt(meantime)) {

            let read_cursor = await database.collection(DB.eitix).findOne({ title: "uba_read_cursor" }) || { activity_playbook: null, alert_playbook: null };

            if (playbook.uba_type === "alert") {

              // alert based
              let query = {};

              if (uba_username && uba_username !== '') query.username = uba_username;
              if (uba_alert && uba_alert !== '') query.attack = uba_alert;

              let matched_alert = await database.collection(DB.uba_alerts).findOne({

                _id: read_cursor.alert_playbook ? { $gte: read_cursor.alert_playbook } : { $exists: true },
                ...query

              }, {
                projection: {
                  _id: 1, attack: 1, username: 1
                }
              });

              if (matched_alert) {

                let { username, attack } = matched_alert;

                if (DEBUG) console.log("Alert playbook matched");

                if (playbook.send_sms === 'on') {

                  let message_text = `Important Notice! ${attack ? attack : "Suspicious User Behavior"} detected by ${username ? username : "an user"}. Please investigate and take appropriate action as needed.`;

                  notification.sms = true;
                  // send bulk sms and record
                  SMS.playbookUBA(playbook, message_text, (err) => {

                    if (err) {

                      sysLog(`${WORKER_NAME} failed to send SMS for a playbook ${sid}`, err);

                    }

                  })

                }

                if (playbook.send_email === "on") {

                  let subject = `Important Notice: ${attack ? attack : "Suspicious User Behavior pattern"} detected by ${uba_username ? uba_username : "a user"} - Immediate Action Required.`;

                  let body = `<body class="email-body">
                  <div class="template-container" style="padding: 20px">
                    <p>Dear Recipients,</p><br><p>Important Notice! ${uba_activity ? uba_activity : "Suspicious User Behavior"} detected by ${uba_username ? uba_username : "a user"}. Please investigate and take appropriate action as needed.<br><br>For questions or assistance, please contact our IT security team at ${org_data.email}. Thank you for your cooperation in safeguarding our data. Please ignore this message if you have already resolved the issue.</p><br><p>Sincerely,<br>EITIx SOC System<br>${org_data.name}<br>Contact Detail: ${org_data.email}</p><br>
                  </div>
                  </body>`;

                  notification.email = true;
                  MAILER.playbookUBA(playbook, { subject, body }, (err) => {

                    if (err) {

                      sysLog(`${WORKER_NAME} failed to send Email for a playbook ${sid}`, err);

                    }

                  })

                }

              }

            } else {

              // activity based
              let query = {};

              if (uba_username && uba_username !== '') query.username = uba_username;
              if (uba_activity && uba_activity !== '') query.action = uba_activity;
              if (uba_act_count && uba_act_count !== '') query.frequency = { $gte: parseInt(uba_act_count) };

              let matched_activity = await database.collection(DB.uba_acts).findOne({

                _id: read_cursor.activity_playbook ? { $gte: read_cursor.activity_playbook } : { $exists: true },
                ...query

              }, {

                projection: {
                  _id: 1, frequency: 1, action: 1, username: 1
                }

              });

              if (DEBUG) console.log({

                _id: read_cursor.activity_playbook ? { $gte: read_cursor.activity_playbook } : { $exists: true },
                ...query

              });

              if (matched_activity) {

                if (DEBUG) console.log("Activity playbook matched");

                if (playbook.send_sms === 'on') {

                  let message_text = `We would like to inform you that there was ${uba_activity ? uba_activity : "some activity"} from ${uba_username ? uba_username : "a user"} more than ${uba_act_count} times in the system. A playbook consider this to be a potential security issue. Please investigate and take appropriate action as needed.`;

                  notification.sms = true;
                  // send bulk sms and record
                  SMS.playbookUBA(playbook, message_text, (err) => {

                    if (err) {

                      sysLog(`${WORKER_NAME} failed to send SMS for a playbook ${sid}`, err);

                    }

                  })

                }

                if (playbook.send_email === "on") {

                  let subject = `Playbook Alert: ${playbook.title} - ${uba_activity ? uba_activity : "some activity"} from ${uba_username ? uba_username : "a user"} more than ${uba_act_count} times in the system.`;

                  let body = `<body class="email-body">
                  <div class="template-container" style="padding: 20px">
                    <p>Dear Recipients,</p><br><p>We want to inform you that ${uba_activity ? uba_activity : "some activity"} from ${uba_username ? uba_username : "a user"} was detected more than ${uba_act_count} times in the system. Please investigate and take appropriate action as needed.<br><br>For questions or assistance, please contact our IT security team at ${org_data.email}. Thank you for your cooperation in safeguarding our data. Please ignore this message if you have already resolved the issue.</p><br><p>Sincerely,<br>EITIx SOC System<br>${org_data.name}<br>Contact Detail: ${org_data.email}</p><br>
                  </div>
                  </body>`;

                  notification.email = true;
                  MAILER.playbookUBA(playbook, { subject, body }, (err) => {

                    if (err) {

                      sysLog(`${WORKER_NAME} failed to send Email for a playbook ${sid}`, err);

                    }

                  })

                }

              }

            }

            if (notification.email || notification.sms) {

              // notify users
              let users = await selectTargetUsers(database, playbook?.users);
              let user_emails = users.map(user => user.email);

              await database.collection(DB.notifs).insertOne({
                type: "Playbook",
                message: `
                  <div class="d-flex align-items-center gap-2">
                      <div>
                          <i class="fa fa-user-xmark fs-4 text-secondary"></i>
                      </div>
                      <div class="">
                          Playbook Email/SMS for <strong>${playbook.title}</strong> has been sent to you.
                      </div>
                  </div>
                `,
                redirect: `#`,
                updated: new Date(),
                targets: user_emails,
                targets_unseen: user_emails
              });

            }

          }

        }

      }

      // get the second last activity and the last alert
      let last_alert = await database.collection(DB.uba_alerts).findOne({}, { sort: { _id: -1 } });
      let last_activity = await database.collection(DB.uba_acts).findOne({}, { sort: { _id: -1 } });

      // updating the read cursor for playbooking
      return database.collection(DB.eitix).updateOne({
        title: "uba_read_cursor"
      }, {
        $set: {
          activity_playbook: last_activity?._id || null,
          alert_playbook: last_alert?._id || null
        }
      }, {
        upsert: true
      });

    }


  } catch (err) {

    sysLog(`${WORKER_NAME} encountered server error`, err);

  }

}

async function reportSchedules(database) {

  try {

    let active_schedules = await database.collection(DB.rep_sch)
      .find({
        disabled: false
      })
      .project({ root_cause: 0, event: 0, log: 0 })
      .toArray() || [];

    return active_schedules.forEach((schedule) => {

      let {
        _id, title, last_report, repeat, reporter_name,
        next_report, time
      } = schedule;

      let today = new Date();
      let report_required = false;

      if (last_report === 'not-yet') {

        report_required = true;

      } else {

        if (today >= next_report) {

          report_required = true;

        } else report_required = false;

      }

      if (report_required) {

        // generate quick report

        let rand = Math.floor(Math.random() * 1000000000);
        let filename = `scheduled-quick-report-${rand}.pdf`;

        schedule.range = 7;

        REPORTER.report(schedule, reporter_name, filename, async (report_file, err) => {

          if (err) {

            if (err.code == 404) {

              console.log(`${WORKER_NAME} found no logs for the schedule "${title}" to make a report.`);


            } else {

              sysLog(`${WORKER_NAME} encountered error while generating report`, err);

            }

          }
          else {

            const recipient_sids = schedule.recipients?.split(",") || [];
            const recipients = await database.collection(DB.users).find({ sid: { $in: recipient_sids } }).project({ email: 1 }).toArray() || [];

            if (recipients.length > 0) {

              let email_recipients = {
                direct: recipients.map(user => user.email),
              }

              MAILER.report(report_file, email_recipients, _id, err => {

                if (err) {

                  sysLog(`${WORKER_NAME} encountered error while emailing report`, err);

                }
                else {

                  // set next report and last report

                  let last_report = new Date();

                  today.setDate(today.getDate() + parseInt(repeat));
                  today.setHours(...time.split(":").map(Number), 0, 0);

                  database.collection(DB.rep_sch).updateOne({
                    _id: _id
                  }, {
                    $set: {
                      last_report, next_report: today
                    }
                  }).then(async () => {

                    sysLog(`${WORKER_NAME} emailed scheduled report for a schedule (${_id})`);

                    // notify users
                    let users = await selectTargetUsers(database, schedule?.users);
                    let user_emails = users.map(user => user.email);

                    database.collection(DB.notifs).insertOne({
                      type: "Schedule",
                      message: `
                        <div class="d-flex align-items-center gap-2">
                            <div>
                                <i class="fa-solid fa-file-pdf fs-4 text-primary"></i>
                            </div>
                            <div class="">
                                Schedule report email for <strong>${schedule.title}</strong> has been sent to you.
                            </div>
                        </div>
                      `,
                      redirect: `#`,
                      updated: new Date(),
                      targets: user_emails,
                      targets_unseen: user_emails
                    });

                  })
                    .catch(err => {

                      sysLog(`${WORKER_NAME} failed to update schedule`, err);

                    })

                }

              })

            }

          }

        })

      }

    });

  } catch (err) {

    sysLog(`${WORKER_NAME} encountered error while reporting`, err);

  }

}

module.exports = (rest_time, active) => {

  let scheduled = false;

  if (active) {

    // immediate call
    main();
    // schedule at first
    scheduled = true

  }

  return cron.schedule(`*/${rest_time} * * * *`, main, { scheduled });

};
