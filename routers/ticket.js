// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const path = require("path");
const ObjectId = require('mongodb').ObjectId;
const {
  DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
  permit,
  actLog,
  renderJSONInfo,
  EITIX, format,
  getLogCollection,
  getMongoQuery,
  RISKS
} = require("../libraries/globals");
const { MAILER, SMS, selectTargetUsers } = require("../libraries/sender");
const { UPLOADER } = require("../libraries/uploader");

const ALLOWED_FILE_ATTACHMENTS = ".doc,.docx,.odt,.txt,.json,.jpg,.jpeg,.png,.xls,.xlsx,.ods,.ppt,.pptx";
const QUERY_LIMIT = EITIX.query_limit;
const TICKET_PROJCTION = {
  selected_users: 0,
  assets: 0,
  remediation: 0
}

app.get("/tickets", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let tab = req.query.tab || "open";

        return res.render("pages/dashboard", {
          title: tab + "-tickets",
          track: "Tickets",
          file: 'tickets.ejs',
          active: tab,
          table: {
            url: `/dashboard/tickets/data/${tab}`,
            query: {},
            dropdown: true,
            actions: true,
            headers: [
              { text: "Opening" },
              { text: "Ticket ID" },
              { text: "Title" },
              { text: "Phase", class: "text-center" },
              { text: "Type", class: "text-center" },
              { text: "Criticality", class: "text-center" }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/tickets/data/:tab", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let tab = req.params.tab || "open";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.tickets;

      // extra query
      if (tab !== "all") {
        req.query.status = tab;
      }

      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

        if (result.length > 0) {

          return res.render("components/table/ticket-table-data", {
            no_layout: true,
            data: result,
          });

        } else {

          return res.send(false);

        }

      }

    } catch (err) {

      console.error(err);
      return res.send(false);

    }

  })

})


app.get("/tickets/create", permit('createTicket'), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        const { event_id, log_id, breach_id } = req.query;
        let log_data;
        let pre_detec;

        let roles = await database.collection(DB.roles).find().sort({ name: 1 }).toArray() || [];
        let assets = await database.collection(DB.assets).find().toArray() || [];
        let templates = await database.collection(DB.temps).find({ type: "ticket" }).project({ title: 1, sid: 1, action: 1 }).toArray() || [];
        /* get workflows */
        const workflows = await database.collection(DB.workf).find().project({ sid: 1, title: 1 }).toArray() || [];

        if (event_id) {

          // event data
          /* log_data = await database.collection(DB.a_surface).find({_id: ObjectId(event_id)}).sort({ _id: -1 }).limit(1).toArray().then(results => results[0]); */
          log_data = await database.collection(DB.a_surface).findOne({ _id: ObjectId(event_id) }, { sort: { _id: -1 } });

          if (typeof log_data?.log === "string") {

            // if log data need to be fetched from wazuh logs
            const wazuh_log = await database.collection(getLogCollection()).find({ id: log_data.log }).sort({ _id: -1 }).limit(1).toArray().then(results => results[0]);

            if (wazuh_log) {
              log_data.log = wazuh_log;
            }

          }

        } else if (log_id) {

          // log data
          let wazuh_log = await database.collection(getLogCollection()).find({ id: log_id }).sort({ _id: -1 }).limit(1).toArray().then(results => results[0]);

          if (wazuh_log) {

            const attacksc = await database.collection(DB.eitix).findOne({ title: "attack_surface" }) || {};

            log_data = {
              date: wazuh_log.timestamp,
              description: wazuh_log.rule?.description,
              risk: RISKS.getRisk(wazuh_log.rule?.level, attacksc)
            }
            log_data.log = wazuh_log;

          }

        } else if (breach_id) {

          // log data
          let breach_log = await database.collection(DB.dw_logs).findOne({ breach_id: breach_id });

          if (breach_log) {

            log_data = {
              date: breach_log.ingestedAt,
              description: `Dark web breach detected${breach_log.email ? ` for ${breach_log.email}` : ""}`,
              risk: "High"
            }
            log_data.log = breach_log;

          }

        } else {

          // create ticket without event data
          return res.render("pages/dashboard", {
            title: "Create-a-Ticket",
            track: "Tickets",
            file: 'create-ticket',
            allowed_files: ALLOWED_FILE_ATTACHMENTS,
            roles, assets, templates, workflows,
            event_id: null,
            log_data: null,
            pre_detec: null,
            renderJSONInfo
          });

        }

        if (log_data) {

          // making sure the date is ISO string (seperated by T)
          let date = log_data.date instanceof Date ? log_data.date.toISOString() : log_data.date;
          let today = new Date().toLocaleDateString();

          pre_detec = {
            title: `${today} - ${log_data.description}`,
            critic: log_data.risk,
            date: date?.split('T')[0],
            time: date?.split('T')[1],
            refId: log_data.log?.id,
            ruleId: log_data.log?.rule?.id,
            firedTimes: log_data.log?.rule?.firedtimes,
            pci_dss: log_data.log?.rule?.pci_dss?.join(', '),
            sourceIP: log_data.log?.data?.srcip
          };

          if (breach_id) {
            pre_detec.title = `${today} - ${log_data.description} - ${breach_id}`;
          }

          res.render("pages/dashboard", {
            title: "Create-a-Ticket",
            track: "Tickets",
            file: 'create-ticket',
            roles, assets, templates,
            allowed_files: ALLOWED_FILE_ATTACHMENTS,
            event_id, log_id, log_data, pre_detec,
            renderJSONInfo, workflows
          });

        } else {

          req.flash("error", "Ticket can't be created from that event yet.");
          res.redirect(req.get('Referrer') || '/');

        }


      } catch (err) {
        next(err);
      }

    });

});

app.post("/tickets/create",
  permit("createTicket"),
  UPLOADER.attachments.fields([
    { name: "file-0" },
    { name: "file-1" },
    { name: "file-2" },
    { name: "file-3" },
    { name: "file-4" },
  ]),
  (req, res, next) => {

    getDatabase()
      .then(async database => {

        try {

          let new_ticket = req.body || {};
          let log_id = req.body.log_id;

          // event data
          let wazuh_log = await database.collection(getLogCollection()).findOne({ id: log_id }, { sort: { _id: -1 } });

          new_ticket.event = wazuh_log || {};

          new_ticket.status = "open";
          new_ticket.created_by = req.session.email;

          // get file names
          new_ticket.files = [];
          if (req.files) {
            Object.keys(req.files).forEach(key => {
              let file = req.files[key]?.[0];
              if (file) {
                new_ticket.files.push(file.filename);
              }
            });
          }

          // all the dates here
          let today = new Date();

          new_ticket.opening = today;

          new_ticket.root_cause = '<p><br></p>';
          new_ticket.remediation = '<p><br></p>';
          new_ticket.prevention = '<p><br></p>';

          new_ticket.phase = 1;

          // get the workflow
          let workf = await database.collection(DB.workf).findOne({ sid: new_ticket?.workflow });
          let interval_dates = [];
          let cur = new Date();

          if (workf.interval) {

            let workf_intervals = format.toArray(workf.interval);
            let workf_intervals_h = format.toArray(workf.interval_h);
            let workf_intervals_m = format.toArray(workf.interval_m);

            workf_intervals.forEach((workf_interval, idx) => {

              // workf_interval = "1", "2", "4"
              cur.setDate(cur.getDate() + parseInt(workf_interval));

              if (workf_intervals_h[idx]) {
                cur.setHours(cur.getHours() + parseInt(workf_intervals_h[idx]));
              }
              if (workf_intervals_m[idx]) {
                cur.setMinutes(cur.getMinutes() + parseInt(workf_intervals_m[idx]));
              }

              interval_dates.push(new Date(cur));
              // if it's the last one add an expiry date
              if (idx === workf_intervals.length - 1) {
                cur.setDate(cur.getDate() + 1);
                interval_dates.push(new Date(cur));
              }
            });

          } else {

            cur.setDate(cur.getDate() + 1);
            interval_dates.push(new Date(cur));

          }

          workf.interval = interval_dates;
          new_ticket.workflow = workf || {};

          MongoCRUD.seqInsert(req, res, next, {

            prefix: "ET",
            collection: DB.tickets,
            data: new_ticket,
            response: async (sid, err) => {
              if (sid) {

                actLog(`User(${req.session.email}) just created a new ticket ${sid}`);
                req.flash("success", `New ticket ${sid} was created!`);
                res.redirect("/dashboard/tickets?tab=open");

                // update tickets count
                database.collection(DB.eitix).updateOne({
                  title: "notices"
                }, {
                  $inc: {
                    info_tickets: 1,
                  }
                }, { upsert: true });

                let users = await selectTargetUsers(database, new_ticket.workflow?.users);
                let user_emails = users.map(user => user.email);

                database.collection(DB.notifs).updateOne({
                  nid: "EN" + sid + "created"
                }, {
                  $set: {
                    type: "Ticket",
                    message: `
                            <div class="d-flex align-items-center gap-2">
                                <div>
                                    <i class="fa-solid fa-ticket fs-4 text-primary"></i>
                                </div>
                                <div class="">
                                    A <strong>new ticket ${sid}</strong> with title "${new_ticket.title}" has been created. You are assigned to this ticket.
                                </div>
                            </div>
                          `,
                    redirect: `/dashboard/tickets/info?id=${sid}`,
                    updated: new Date(),
                    targets: user_emails,
                    targets_unseen: user_emails
                  }
                }, { upsert: true });

                if (new_ticket.send_email === 'on') {

                  // send the ticket creation email
                  MAILER.ticketCreation(sid, err => {
                    if (err) next(err);
                  });

                }


                if (new_ticket.send_sms === 'on') {

                  SMS.ticket("created", sid, err => {
                    if (err) next(err);
                  })

                }

                let captions = Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions];

                // upload all the attachment files
                let file_uploads = [];

                if (req.files) {
                  Object.keys(req.files).forEach((key, i) => {

                    let file = req.files[key]?.[0];
                    file.caption = captions[i];
                    if (file) {
                      file_uploads.push(file);
                    }

                  });
                }

                if (file_uploads.length > 0) {

                  database.collection(DB.attach).insertMany(file_uploads);

                }

              } else {

                next(err);

              }
            }

          });


        } catch (err) {

          next(err);

        }

      })

  });

app.get("/tickets/info", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let ticket_sid = req.query.id ?? null;
        let data = await database.collection(DB.tickets).findOne({ sid: ticket_sid });

        if (data != null) {

          let files = [];
          if (data.files) {

            files = await database.collection(DB.attach).find({ filename: { $in: data.files } }).limit(1000).toArray() || [];

          }

          res.render("pages/dashboard", {
            title: `Ticket-${ticket_sid}`,
            track: "Tickets",
            file: 'ticket-info.ejs',
            data, files,
            allowed_files: ALLOWED_FILE_ATTACHMENTS,
            renderJSONInfo
          });

        } else {

          req.flash("error", "Ticket not found or not supported");
          res.redirect(req.get('Referrer') || '/');

        }


      } catch (err) {

        next(err);

      }

    });

});

app.post("/tickets/update", permit("modifyTicket"), (req, res, next) => {

  MongoCRUD.update(req, res, next, {
    collection: DB.tickets,
    filter: { sid: req.body.sid },
    data: {
      $set: req.body
    }
  })

});

app.get("/tickets/delete", permit("control"), (req, res, next) => {

  getDatabase().then(database => {

    let sid = req.query.id;

    if (!sid) {
      return res.status(500).send({ error: "Ticket ID not given" });
    }

    database.collection(DB.tickets).deleteOne({
      sid
    }).then(result => {

      if (result.deletedCount > 0) {

        return res.send({ status: "Ticket has been deleted permanently!" });

      } else {

        return res.status(400).send({ error: "Ticket not found or not supported" });

      }
    })

  });

});

app.post("/tickets/close", permit("modifyTicket"), (req, res, next) => {

  const ticket_id = req.body.id;

  if (ticket_id != "") {

    getDatabase()
      .then(database => {

        database.collection(DB.tickets).findOneAndUpdate({
          sid: ticket_id
        }, {
          $set: {
            status: "closed",
            closing_date: new Date()
          }
        }, {
          returnOriginal: false
        })
          .then(async result => {

            let updated_ticket = result.value;
            let sid = updated_ticket.sid;

            req.flash("info", "Ticket is now closed!");
            actLog(`User(${req.session.email}) closed an open ticket`);
            res.send({ status: "Ticket is now closed!" });

            let users = await selectTargetUsers(database, updated_ticket.workflow?.users);
            let user_emails = users.map(user => user.email);

            database.collection(DB.notifs).updateOne({
              nid: "EN" + sid + "closed"
            }, {
              $set: {
                type: "Ticket",
                message: `
                            <div class="d-flex align-items-center gap-2">
                                <div>
                                    <i class="fa-solid fa-ticket fs-4 text-secondary"></i>
                                </div>
                                <div class="">
                                    <strong>Ticket ${sid}</strong> with title "${updated_ticket.title}" is <strong>closed</strong>!
                                </div>
                            </div>
                        `,
                redirect: `/dashboard/tickets/info?id=${sid}`,
                updated: new Date(),
                targets: user_emails,
                targets_unseen: user_emails
              }
            }, { upsert: true });

            if (updated_ticket.send_email === "on") {

              MAILER.ticketClosure(ticket_id, err => {
                if (err) next(err);
              });

            }

            if (updated_ticket.send_sms === "on") {

              SMS.ticket("closed", ticket_id, err => {
                if (err) next(err);
              })

            }

          })
          .catch(err => {
            next(err)
          })

      })

  } else {

    return res.status(403).send({ error: "Ticket ID not given" });

  }

});

app.post("/tickets/open", permit("modifyTicket"), (req, res, next) => {

  const ticket_id = req.body.id;

  if (ticket_id != "") {

    getDatabase()
      .then(database => {

        database.collection(DB.tickets).findOneAndUpdate({
          sid: ticket_id
        }, {
          $set: {
            phase: 1,
            status: "open",
            reopened: true,
            reopening_date: new Date()
          }
        }, {
          returnOriginal: false
        })
          .then(async result => {

            actLog(`User(${req.session.email}) re-opened a ticket ` + ticket_id);
            res.send({ status: "Ticket is now re-opened successfully!" });

            let updated_ticket = result.value;
            let sid = updated_ticket.sid;

            let users = await selectTargetUsers(database, updated_ticket.workflow?.users);
            let user_emails = users.map(user => user.email);

            database.collection(DB.notifs).updateOne({
              nid: "EN" + sid + "open"
            }, {
              $set: {
                type: "Ticket",
                message: `
                            <div class="d-flex align-items-center gap-2">
                                <div>
                                    <i class="fa-solid fa-ticket fs-4 text-success"></i>
                                </div>
                                <div class="">
                                    <strong>Ticket ${sid}</strong> with title "${updated_ticket.title}" has been <strong>re-opened</strong> for further investigation!
                                </div>
                            </div>
                        `,
                redirect: `/dashboard/tickets/info?id=${sid}`,
                updated: new Date(),
                targets: user_emails,
                targets_unseen: user_emails
              }
            }, { upsert: true });

          })
          .catch(err => {
            next(err)
          })

      })

  } else {

    return res.status(403).send({ error: "Ticket ID not given" });

  }

});

app.post("/tickets/comments/add", (req, res, next) => {

  getDatabase()
    .then(async database => {

      let ticket = req.body.ticket;
      let body = req.body.body;
      let type = req.body.type;
      // find the commenter
      let commenter = await database.collection(DB.users).findOne({ email: req.body.commenter });

      if (commenter != null || body != '') {

        database.collection(DB.t_comments).insertOne({
          comment_for: ticket,
          commenter: req.body.commenter,
          name: commenter.full_name,
          role: commenter.role,
          type: req.body.type,
          body: body,
          time: new Date(),
          reply_to: req.body.reply_to
        })
          .then(result => {

            if (type != 'comment') {

              req.flash("success", "Reply added to a comment");
              res.redirect(req.get('Referrer') || '/');

            } else {

              actLog(`User '${req.session.email}' commented on Ticket ${ticket}`);
              res.status(200).send(result);

            }

            // send a notification

            database.collection(DB.tickets).findOne({ sid: ticket }).then(result => {

              try {

                let target_users = result.email_recipients;

                database.collection(DB.notifs).updateOne({
                  nid: "EN" + ticket + "comment"
                }, {

                  $set: {
                    type: "Ticket",
                    message: `
                                <div class="d-flex align-items-center gap-2">
                                    <div>
                                        <i class="fa-solid fa-ticket fs-4 text-info"></i>
                                    </div>
                                    <div class="">
                                        <strong>${commenter.full_name}</strong> posted comments on <strong>ticket ${ticket}</strong>!
                                    </div>
                                </div>
                              `,
                    redirect: `/dashboard/tickets/info?id=${ticket}#ticket-comments`,
                    updated: new Date(),
                    targets: target_users?.split(","),
                    targets_unseen: target_users?.split(",")
                  }

                }, { upsert: true })
                  .then(res => {

                    // send the email now
                    if (result.send_email === 'on') {

                      MAILER.ticketComments(ticket, commenter, err => {

                        if (err) next(err);

                      });

                    }

                    if (result.send_sms === "on") {

                      SMS.ticket("comment", ticket, err => {
                        if (err) next(err);
                      })

                    }

                  })
                  .catch(err => {

                    next(err);

                  });

              } catch (err) {

                next(err);

              }

            })



          }).catch(err => {

            res.status(500).send("Something went wrong");

          })

      } else {

        res.status(500).send("Something went wrong");

      }


    })

});

app.post("/tickets/comments/delete", (req, res, next) => {

  getDatabase()
    .then(async database => {

      let id = req.body.id;
      let comment = await database.collection(DB.t_comments).findOne({ _id: ObjectId(id) }) || {};
      let current_user = req.session.email;
      let commenter = comment.commenter;

      if (current_user == commenter) {

        database.collection(DB.t_comments).deleteOne({
          _id: ObjectId(id)
        }).then(result => {

          req.flash("success", "A comment has been deleted");
          res.redirect(req.get('Referrer') || '/');

        }).catch(err => {

          req.flash("error", "Something went wrong");
          res.redirect(req.get('Referrer') || '/');


        })

      } else {

        req.flash("error", "You're not allowed to delete this comment");
        actLog(`User '${req.session.email}' tried to delete someone else's comment [Unusual activity]`);
        res.redirect(req.get('Referrer') || '/');

      }

    })

});

app.post("/tickets/upload/attachments",
  permit("modifyTicket"),
  UPLOADER.attachments.fields([
    { name: "file-0" },
    { name: "file-1" },
    { name: "file-2" },
    { name: "file-3" },
    { name: "file-4" },
  ]),
  (req, res, next) => {

    getDatabase().then(async database => {

      try {

        let user = req.session.email;
        let ticket_id = req.body.id;
        let captions = Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions];

        if (user === null || ticket_id === null || captions === null) {

          throw { message: "Something went wrong, please try again", details: "user or ticket id is null" };

        }

        // get file names
        let files = [];

        if (req.files) {

          // console.log("ticket.js", "files uploaded by multer")

          Object.keys(req.files).forEach(key => {
            let file = req.files[key]?.[0];
            if (file) {
              files.push(file.filename);
            }
          });

          if (files.length > 0) {

            // console.log("ticket.js", "files processed, uploading...")

            // upload the file names into that ticket
            await database.collection(DB.tickets).updateOne(
              { _id: ObjectId(ticket_id) },
              { $push: { files: { $each: files } } }
            ).catch(err => {

              req.flash("error", `Uploaded files couldn't be saved: ${err.message}`);
              console.error(err);
              return res.redirect(req.get('Referrer') || '/');

            });

          } else throw { message: "Uploaded files couldn't be processed" };


        } else throw { message: "No files could be uploaded" };


        // upload new the attachment files
        let file_uploads = [];

        if (req.files) {
          let time = new Date();
          Object.keys(req.files).forEach((key, i) => {

            let file = req.files[key]?.[0];
            if (file) {
              file_uploads.push({
                ...file,
                uploaded_by: user,
                uploaded_at: time,
                caption: captions[i]
              });
            }

          });
        }

        if (file_uploads) {

          // console.log("ticket.js", "Uploading files into the database");

          await database.collection(DB.attach).insertMany(file_uploads)
            .then(() => {

              req.flash("success", "All files are uploaded successfully");
              res.redirect(req.get('Referrer') || '/');

            })
            .catch(err => {

              req.flash("error", `Something went wrong while uploading files: ${err.message}`);
              console.error(err);
              return res.redirect(req.get('Referrer') || '/');

            });

        } else {

          throw { message: "Something went wrong while storing the files" };

        }


      } catch (err) {

        req.flash("error", err.message);
        console.error(err);
        return res.redirect(req.get('Referrer') || '/');

      }

    });

  });

app.get("/tickets/download/attachments", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let filename = req.query.file;
      let file = await database.collection(DB.attach).findOne({ filename });

      if (file) {

        // Set response to the user
        res.set('Content-disposition', `attachment; filename="${file.originalname}"`);
        res.set('Content-type', file.mimetype);

        let filepath = path.join(__dirname, "..", file.path);

        res.sendFile(filepath, (err) => {

          if (err) {

            next(err);

          }

        });

      } else {

        req.flash("error", "File not found");
        res.redirect(req.get('Referrer') || '/');

      }


    } catch (err) {

      next(err)

    }

  })

})

app.get("/tickets/delete/attachments", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let _id = req.query.id;

      if (_id) {

        await database.collection(DB.attach).deleteOne({ _id: ObjectId(_id) });

        req.flash("success", "File deleted permanently!");
        res.redirect(req.get('Referrer') || '/');

      } else {

        req.flash("error", "File not found");
        res.redirect(req.get('Referrer') || '/');

      }


    } catch (err) {

      next(err)

    }

  })

})

module.exports = app;