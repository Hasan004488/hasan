require("dotenv").config();
const bcrypt = require("bcrypt");
const fs = require("fs");
// static data files
const default_templates = require("./data/default_templates");
const default_playbook_templates = require("./data/default_playbook_templates");
const default_roles = require("./data/default_roles");
const default_workers = require("./data/default_workers");
const default_tlds = require("./data/default_tld");
const { getDatabase, DB, CREDENTIALS } = require("./database");
const { getLogCollection } = require('./globals');


function createSchema(config, error) {

  getDatabase(config).then(async database => {

    try {

      const promises = [];
      let date = new Date();

      // create database indexes
      if (config.create_indexes == 'on') {
        // unique key indexes
        promises.push(
          database.collection(DB.temps).createIndex({ "rule": 1 }, { unique: true })
        )
        promises.push(
          database.collection(DB.users).createIndex({ "email": 1 }, { unique: true })
        )
        promises.push(
          database.collection(DB.roles).createIndex({ "name": 1 }, { unique: true })
        )
        promises.push(
          database.collection(DB.uba_users).createIndex({ "username": 1 }, { unique: true })
        )
        promises.push(
          database.collection(DB.uba_pats).createIndex({ "pattern": 1 }, { unique: true })
        )
        promises.push(
          database.collection(DB.uba_actions).createIndex({ "sequence": 1, "action": 1 }, { unique: true })
        )
        promises.push(
          database.collection(DB.dw_logs).createIndex({ "breachId": 1 }, { unique: true })
        )
        // normal indexes for faster reading
        promises.push(
          database.collection(DB.a_surface).createIndexes([
            { key: { agent_id: 1 } },
            { key: { rule_id: 1 } },
            { key: { risk: 1 } },
            { key: { discovered: 1 } }
          ])
        )
        promises.push(
          database.collection(getLogCollection()).createIndexes([
            { key: { 'id': 1 } },
            { key: { 'timestamp': 1 } },
            { key: { 'agent.id': 1 } },
            { key: { 'rule.id': 1 } },
            { key: { 'tenant_id': 1 } },
            { key: { 'agent.ip': 1 } },
            { key: { 'agent.name': 1 } },
            { key: { 'rule.level': 1 } },
            { key: { 'rule.firedtimes': 1 } },
            { key: { 'rule.description': 1 } },
            { key: { 'source': 1 } },
            { key: { 'attack_type': 1} },
            { key: { 'scanned': 1, _id: -1 } }
          ])
        )
        // date indexes to help pruning
        promises.push(
          database.collection(DB.fim_a).createIndexes([
            { key: { date: 1 } }
          ])
        )
        promises.push(
          database.collection(DB.a_ioc).createIndexes([
            { key: { date: 1 } }
          ])
        )
        promises.push(
          database.collection(DB.uba_alerts_a).createIndexes([
            { key: { date: 1 } }
          ])
        )
        promises.push(
          database.collection(DB.uba_acts_a).createIndexes([
            { key: { timestamp: 1 } }
          ])
        )
        promises.push(
          database.collection(DB.eph).createIndexes([
            { key: { date: 1 } }
          ])
        )
        promises.push(
          database.collection(DB.v_cve_a).createIndexes([
            { key: { lastModified: 1 } }
          ])
        )
        // scanning index required
        promises.push(
          database.collection(DB.uba_logs).createIndexes([
            { key: { scanned: 1, _id: -1 } }
          ])
        )

      }

      // load eitix default templates
      if (config.reload_templates == 'on') {

        // resetting previously selected template default status 
        // ensure no two templates of the same category are default
        promises.push(
          database.collection(DB.temps).updateMany({}, { $set: { default: false } })
        )

        default_templates.forEach(template => {

          promises.push(
            database.collection(DB.temps).updateOne({
              sid: template.sid
            }, {
              $set: {
                ...template, date
              }
            }, { upsert: true })
          )

        });

        default_playbook_templates.forEach(playbook_template => {

          promises.push(
            database.collection(DB.playb_temps).updateOne({
              sid: playbook_template.sid
            }, {
              $set: {
                ...playbook_template, date
              }
            }, { upsert: true })
          )

        });

      }

      // cleaner worker housekeeping data
      if (config.reset_cleaner == 'on') {

        promises.push(
          database.collection(DB.eitix).updateOne({
            title: "cleaner"
          }, {
            $set: {
              latest: date,
              backup_frequency: 7,
              syslog_ret: 7,
              wlog_ret: 30,
              retention: 90
            }
          }, { upsert: true })
        )

      }

      // reset worker configures
      if (config.reset_ioc == 'on') {

        let tld_array = default_tlds.split(",");

        // worker resting times in minutes
        promises.push(
          database.collection(DB.eitix).updateOne({
            title: "ioc"
          }, {
            $set: {
              whitelist: tld_array
            }
          }, { upsert: true })
        )

      }


      // adding all default roles with permissions
      if (config.reset_roles == 'on') {

        default_roles.forEach(role => {

          promises.push(
            database.collection(DB.roles).updateOne({
              name: role.name
            }, {
              $set: role
            }, { upsert: true })
          )

        });

      }

      // reset worker configures
      if (config.reset_workers == 'on') {

        // worker resting times in minutes
        promises.push(
          database.collection(DB.eitix).updateOne({
            title: "workers"
          }, {
            $set: default_workers
          }, { upsert: true })
        )

      }

      // default admin user
      if (config.db_admin == 'on') {

        const default_pass = await bcrypt.hash(CREDENTIALS.default_admin_pass, 9);
        promises.push(
          database.collection(DB.users).updateOne({
            default: true
          }, {
            $set: {
              hidden: true,
              updated: true,
              full_name: CREDENTIALS.default_admin_user,
              email: CREDENTIALS.default_admin_email,
              role: "Super Admin",
              hash: default_pass,
              created: date,
              created_by: "EITIx"
            }
          }, { upsert: true })
        )

      }

      // write organization template
      if (config.reset_org == 'on') {

        promises.push(
          database.collection(DB.eitix).updateOne({
            title: "organization"
          }, {
            $set: {
              name: "Rajshahi Krishi Unnayan Bank",
              image: "./public/images/organization.png",
              address: "272, Banolata C/A\n Airport Road, Rajshahi",
              email: "info@rakub.org.bd",
              phone: "+8802 5831 4424",
              working_hour_ends: '15:00',
              working_hour_starts: '09:00'
            }
          }, { upsert: true })
        )

      }

      Promise.all(promises)
        .then(results => {

          return error();

        })
        .catch(err => {

          console.error(err);
          return error(err);

        })
    } catch (err) {

      return error(err);

    }

  })

}

module.exports = {

  createSchema

}