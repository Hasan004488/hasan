require("dotenv").config();
const { sysLog, timeDif } = require("../../libraries/globals");
const { SMS, MAILER, selectTargetUsers } = require("../../libraries/sender");
const {
  DB
} = require("../../libraries/database");

const WORKER_NAME = "reportAssetPlaybooks";

module.exports = async function reportAssetPlaybooks(database) {

  try {

    // find active ai playbooks
    let asset_playbooks = await database.collection(DB.playb)
      .find({
        source: "Asset",
        disabled: "false",
      })
      .toArray();

    if (asset_playbooks.length > 0) {

      sysLog(`${WORKER_NAME} is processing ${asset_playbooks.length} active asset playbooks`);

      // for each playbook
      for (let i = 0; i < asset_playbooks.length; i++) {

        const playbook = asset_playbooks[i];
        let notification = { email: false, sms: false };

        const {
          last_fired = false,
          max_fire, meantime, sid, notified,
          asset
        } = playbook;

        if (asset && notified < parseInt(max_fire)) {

          // if last fired time is greater then the mean difference
          if (!last_fired || timeDif(last_fired, "minute") > parseInt(meantime)) {

            // check for the activity playbook☻
            if (playbook.send_sms === 'on') {
              // send sms
              SMS.playbookAsset(asset, playbook, (err) => {
                if (err) {

                  sysLog(`${WORKER_NAME} failed to send SMS for a playbook ${sid}`, err);

                }
              })
            }
            if (playbook.send_email === 'on') {
              // send email
              MAILER.playbookAsset(asset, playbook, (err) => {
                if (err) {

                  sysLog(`${WORKER_NAME} failed to send email for a playbook ${sid}`, err);

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