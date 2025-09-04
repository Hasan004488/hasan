const {
  DB
} = require("../../libraries/database");
const {
  sysLog, timeDif
} = require("../../libraries/globals");
const { MAILER, SMS, selectTargetUsers } = require('../../libraries/sender');

const WORKER_NAME = "reportPlaybooks";

module.exports = async function reportPlaybooks(database) {

  try {

    // find active wazuh playbooks
    let wazuh_playbooks = await database.collection(DB.playb)
      .find({
        source: "Wazuh",
        disabled: "false",
        firing_required: true
      })
      .toArray();

    if (wazuh_playbooks.length > 0) {

      sysLog(`${WORKER_NAME} is processing ${wazuh_playbooks.length} active wazuh playbooks`);

      // for each playbook
      for (const playbook of wazuh_playbooks) {

        const {

          last_fired = false,
          max_fire, meantime, sid, notified

        } = playbook;

        if (notified < parseInt(max_fire)) {

          let notification = { email: false, sms: false };

          // if last fired time is greater then the mean difference
          if (!last_fired || timeDif(last_fired, "minute") > parseInt(meantime)) {

            if (playbook.send_sms === 'on') {

              notification.sms = true;
              // send bulk sms and record
              SMS.playbook(sid, (err) => {

                if (err) {

                  sysLog(`${WORKER_NAME} failed to send SMS for a playbook ${sid}`, err);

                }

              })

            }

            if (playbook.send_email === "on") {

              notification.email = true;
              MAILER.playbook(sid, (err) => {

                if (err) {

                  sysLog(`${WORKER_NAME} failed to send Email for a playbook ${sid}`, err);

                }

              })

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

      };

      return true;


    } else {

      return true; // no active playbooks no problem

    }

  } catch (err) {

    sysLog(`${WORKER_NAME} encountered server error`, err);

  }

}