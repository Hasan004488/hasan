const fs = require('fs');
const https = require('https');
const axios = require("axios");
const nodemailer = require("nodemailer");
const { DB, getDatabase } = require("./database");
const { getConfig } = require("../libraries/getConfig");
const { getDateString } = require('./globals');

// server
const NA_TEXT = "not provided";
// read template css
let template_css = fs.readFileSync('./public/styles/template.css');

function sendMail(contents, error, res) {

  const { postfix_mail_server, postfix_host, postfix_port, postfix_user, postfix_pass } = getConfig();

  let authentication = {};

  if (postfix_user && postfix_pass) {
    authentication = {
      auth: {
        user: postfix_user,
        pass: postfix_pass,
      }
    }
  }

  const transporter = nodemailer.createTransport({
    host: postfix_host,
    port: postfix_port,
    ...authentication,
    secure: false, // no TLS
    tls: {
      rejectUnauthorized: false // allow ssc
    }
  });
    
  transporter.sendMail({ from: postfix_mail_server, ...contents }, (err, info) => {
  
      if (err) {
  
          if (error) error(err);
  
      } else {

          if (res) res(info);

      }
      
  })

}

// track email or sms sent info
async function updateReports(database, type, data) {

  let collection = DB.rep_email;

  if (type === "sms") {

    collection = DB.rep_sms;

  }

  await database.collection(collection).insertOne(data).then(async () => {

    let today = getDateString();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (type === "sms") {

      // count characters
      let sms_sent = await database.collection(DB.rep_sms).aggregate([
        { $match: { sent: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$length" } } }
      ]).toArray() || [];

      if (sms_sent[0]) {

        await database.collection(DB.track).updateOne({ date: today }, {
          $set: { sms_sent: sms_sent[0]?.total || 0 }
        }, { upsert: true });

      }
      

    } else {

      // count emails
      let emails_sent = await database.collection(DB.rep_email).countDocuments({
        sent: { $gte: start, $lt: end }
      });

      await database.collection(DB.track).updateOne({ date: today }, {
        $set: { emails_sent }
      }, { upsert: true });

    }

  });
  
}

// placeholder populator
function populate(template, placeholders) {

    return template.replace(/\$\{(.+?)\}/g, (match, key) => {

        const trimmedKey = key.trim();
        return placeholders[trimmedKey] !== undefined ? placeholders[trimmedKey] : "";

    });

}

function ticketPlaceholders(ticket, opener) {

    let next_esc = ticket.level == 1 ? ticket.first_escalation : ticket.level == 2 ? ticket.second_escalation : ticket.expiry_date;
    const config = getConfig();

    return {
        opener_full_name: opener?.full_name,
        opener_role: opener?.role,
        log_id: ticket.event?.log?.id,
        ticket_sid: ticket.sid,
        ticket_title: ticket.title,
        ticket_phase: ticket?.phase,
        ticket_type: ticket.type,
        ticket_criticality: ticket.criticality,
        ticket_status: ticket.status,
        ticket_opening_date: ticket.opening?.toLocaleString(),
        next_escalation_date: next_esc?.toLocaleString(),
        expiry_date: ticket.expiry_date?.toLocaleString(),
        closing_date: ticket.closing_date?.toLocaleString(),
        server_ip: config.server_ip,
        redirect: config.server_ip
    };

}

// mailing body helper templates
const TEMPLATE = {

    header_css: `
        <head>
            <meta charset="utf-8">
            <style>${template_css}</style>
        </head>
    `,

    ticket_summary(ticket) {

        return new Promise((resolve, reject) => {
            getDatabase()
            .then(async database => {

                let template = await database.collection(DB.temps).findOne({sid: "ETM10002"}) || {};
                let populated = populate(template.summary, ticketPlaceholders(ticket));

                resolve(populated);

            }).catch((err) => {
                reject(err);
            });
        });
        
    },

    footer_text: `<br/><p><span style="color: rgb(94, 101, 128);">This is an automated email. Please do not reply to this message.</span></p>`

}

async function selectTargetUsers(database, user_list, phase) {

  let target_users = [];
  let phase_sids = user_list?.map(str => {

    // ex. str = phase1-EU10003-nonforward
    let options = str?.split("-") || [];
    if (phase) {
      
      if (options[0] === "phase" + phase) return options[1];
      else return "";

    } else {

      return options[1];

    }
    
  }) || [];

  if (phase_sids.length > 0) {

    target_users = await database.collection(DB.users).find({sid: {$in: phase_sids}}).toArray() || [];

  }

  /* console.log("sender.js", phase, user_list, phase_sids, target_users); */

  return target_users;
    
}

// template loader function (heavy)
async function loadTemplate(type, data, response) {

    // callback: response(subject, body, error){}

    getDatabase()
    .then(async database => {

      try {

        let subject = body = "";
        let placeholders = {};

        if (type.includes("reporting")) {

          const template = await database.collection(DB.temps).findOne({
            sid: data.template || "ETM10001"
          });

          if (!template) return response(false, false, {
            err_message: "No template found"
          });

          let schedule = data;

          placeholders = {
            title: schedule.title,
            type: schedule.type,
            reporter_name: schedule.reporter_name,
            repetition: schedule.repeat,
            logs_limitation: schedule.limit_logs,
            last_reported_date: schedule.last_report,
            next_reporting_date: schedule.next_report
          }

          body = `

              <!DOCTYPE html>
              <html>
              
              ${TEMPLATE.header_css}
              
              <body class="email-body">
                <div class="template-container">
                    <!-- Hero Section -->
                    <div class="template-hero-section">
                        <div style="padding: 20px"></div>
                        <h1>${schedule.title}</h1>
                        <h3>Schedule Report</h3>
                        <div class="text-center" style="font-weight: bold;">
                            EITIx
                        </div>
                    </div>

                    <!-- Content Section -->
                    <div class="content">
                        <p>Dear EITIx User,</p>
                        <p>
                            We are pleased to inform you that the scheduled report for <strong>${schedule.title}</strong> has been
                            successfully prepared and is now ready for your review.
                            The report, meticulously compiled by <strong>${schedule.reporter_name}</strong>, is attached to this
                            email for your convenience.
                        </p>
                        <p>
                            Please take a moment to review the document at your earliest convenience. Should you have any questions
                            or require further clarification, do not hesitate to reach out to us. The next reporting date is
                            scheduled for <strong>${schedule.next_report.toLocaleString()}</strong>.
                        </p>
                        <p>
                            Sincerely, <br>
                            ${schedule.reporter_name}
                        </p>
                        <p></p>
                    </div>

                    <!-- Footer Section -->
                    <div class="footer">
                        <div>If you are not the intended recipient, please delete this email and notify us immediately.</div>
                        <div>
                            This is an automated email. Please do not reply to this message.
                        </div>
                    </div>

                </div>
            </body>
              
            </html>

          `;

          subject = populate(template.subject, placeholders);
          body = populate(body, placeholders);
          
          response(subject, body, false);

        } else if (type.includes("ticket")) {

          const ticket = data.ticket;
          // ticket creation
          let template_id = "";

          if (type === "ticket_expired") template_id = ticket.template[2];
          else if (type === "ticket_closed") template_id = ticket.template[1];
          else template_id = ticket.template[0]; // ticket creation

          const template = await database.collection(DB.temps).findOne({
            sid: template_id
          });

          if (!template) return response(false, false, {
            err_message: "No template found"
          });

          placeholders = ticketPlaceholders(ticket, data.opener);

          body = `

              <!DOCTYPE html>
              <html>
              
              ${TEMPLATE.header_css}
              
              <body class="email-body">
                  <div class="mail-container w-half">

                      ${template.section_a}
                      ${template.summary}
                      ${template.section_b}
                      ${TEMPLATE.footer_text}
              
                  </div>
              </body>
              
              </html>

          `;

          subject = populate(template.subject, placeholders);
          body = populate(body, placeholders);
          
          response(subject, body, false);

        } else if (type === "playbook") {

          const template = await database.collection(DB.temps).findOne({
            sid: data.template
          });

          let playbook_body = template?.body;

          if (!playbook_body) {

            const playbooK_template = await database.collection(DB.playb_temps).findOne({
              sid: template?.template || "EPT10000"
            });

            playbook_body = playbooK_template.body;

          }

          if (!playbook_body) return response(false, false, {
            err_message: "No template found"
          });
  
          const org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

          if (!data?.data?.id) return response(false, false, {
            err_message: "No log data found for this playbook"
          });

          placeholders = {
            playbook_title: data.title,
            event_date: new Date(data.data?.timestamp).toLocaleDateString() || NA_TEXT,
            event_time: new Date(data.data?.timestamp).toLocaleTimeString() || NA_TEXT,
            log_id: data.data?.id || NA_TEXT,
            event_source: data.data?.source || NA_TEXT,
            agent_name: data.data?.agent.name || NA_TEXT,
            agent_id: data.data?.agent.id || NA_TEXT,
            agent_ip: data.data?.agent?.ip || NA_TEXT,
            rule_id: data.data?.rule.id || NA_TEXT,
            rule_level: data.data?.rule.level || NA_TEXT,
            organization_name: org_data.name || NA_TEXT,
            organization_email: org_data.email || NA_TEXT,
            organization_phone: org_data.phone || NA_TEXT,
            file: data.data?.syscheck?.path || NA_TEXT
          }

          body = `

              <!DOCTYPE html>
              <html>
              
              ${TEMPLATE.header_css}
              
              <body class="email-body">
                  <div class="mail-container w-half">

                    ${playbook_body}
                    ${TEMPLATE.footer_text}
              
                  </div>
              </body>
              
              </html>

          `;

          /* console.log("sender.js", data.title); */

          subject = populate(data.title, placeholders);
          body = populate(body, placeholders);
          
          response(subject, body, false);

        } else if (type === "playbook-ai") {
  
          const org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

          let vector_name = data.ai_vector;
          let vector_count = data.ai_logs_count;
          subject = `Potential Security Issue: "${vector_name}" attack vector detected more than ${vector_count} times!`;
          body = `

              <!DOCTYPE html>
              <html>
              
              ${TEMPLATE.header_css}
              
              <body class="email-body">
                  <div class="mail-container w-half">

                    <p>Dear Recipients,</p><br><p>We would like to inform you that the vector ${vector_name} was found in more than ${vector_count} logs in the system. We consider this to be a potential security issue. Please investigate and take appropriate action as needed.</p><br><p>Sincerely,<br>EITIx SOC System<br>${org_data.name}<br>Contact Detail: ${org_data.email}</p><br>

                    ${TEMPLATE.footer_text}
              
                  </div>
              </body>
              
              </html>

          `;
          
          response(subject, body, false);

        } else {

          response(false, false, { err_message: "No type matched: " + type });

        }
          
      } catch (err) {

          response(false, false, err);
          
      }

    })
}

const MAILER = {

    ticketCreation(ticket_id, error) {

        getDatabase()
        .then(async database => {

            let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});
            // get the workflow (skip if not found)
            let workflow = ticket?.workflow;

            if (ticket && workflow) {

                /* if (ticket.send_email !== "on") return error(false); */

                // get the phase1 users
                let workflow_user_list = workflow?.users || [];
                let users = await selectTargetUsers(database, workflow_user_list, 1);

                let opener = await database.collection(DB.users).findOne({email: ticket.created_by});

                if (users.length > 0 && opener) {

                  loadTemplate("ticket_created", {ticket, opener}, async (subject, body, err) => {

                    if (err) {

                      return error(err);
                    
                    } else {

                      try {

                        // map the emails and send email
                        let recipients = users.map(user => user.email);

                        /* console.log("sender.js", recipients); */

                        sendMail({
                            to: recipients.join(","),
                            subject: subject,
                            html: body
                        },  err => {
    
                            return error(err);
    
                        }, async info => {

                          let time = new Date();
                          let today = time.toISOString().split("T")[0];

                          await updateReports(database, "email", {
                            message_id: info.messageId,
                            status: "ACCEPTED",
                            receiver: info.accepted,
                            source: ticket_id,
                            date: today,
                            sent: time,
                          });
                          
                          await database.collection(DB.tickets).updateOne({
                            sid: ticket_id
                          },{
                            $set: {
                              message_id: info.messageId,
                              email_recipients: recipients
                            }
                          });

                          return error(false);
    
                        })
                      
                      } catch (err) {
          
                        return error({err_message: "Something went wrong while sending email: " + err.message});
                          
                      }

                    }

                  })

                } else {

                  return error({err_message: "Ticket users not found or ticket opener is not present in the system"});

                }

            } else {

              return error({err_message: "Ticket email request detected but ticket is not supported anymore or not found in the system."});

            }

        })

    },

    ticketClosure(ticket_id, error) {

        getDatabase()
        .then(async database => {

            let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});
            let workflow = ticket?.workflow;

            if (ticket && workflow) {

                /* if (ticket.no_email) return; */

                let opener = await database.collection(DB.users).findOne({email: ticket.created_by});
                let workflow_user_list = workflow?.users || [];
                let users = await selectTargetUsers(database, workflow_user_list, ticket?.phase);

                if (opener) {

                    loadTemplate("ticket_closed", {ticket, opener}, (subject, body, err) => {

                        if (err) {
    
                            return error(err);
                        
                        } else {
    
                            try {

                            let recipients = users.map(o => o.email);
    
                            sendMail({
                                to: recipients.join(","),
                                subject: subject,
                                html: body
                            },  err => {
        
                                return error(err);
        
                            }, async info => {

                              let time = new Date();
                              let today = time.toISOString().split("T")[0];

                              await updateReports(database, "email", {
                                message_id: info.messageId,
                                status: "ACCEPTED",
                                receiver: info.accepted,
                                source: ticket_id,
                                date: today,
                                sent: time,
                              });

                              return error(false);
        
                            })} catch (err) {
            
                                return error({err_message: "Something went wrong while sending email: " + err.message});
                                
                            }
    
                        }
    
                    })

                } else {

                    if (error) return error("Ticket opener is not present in the system");

                }

            } else {

                if (error) return error("Ticket not supported");

            }

        })

    },

    ticketExpiry(ticket_id, error) {

        getDatabase()
        .then(async database => {

            let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});
            let workflow = ticket?.workflow;

            if (ticket && workflow) {

                /* if (ticket.no_email) return; */

                let opener = await database.collection(DB.users).findOne({email: ticket.created_by});
                let workflow_user_list = workflow?.users || [];
                let users = await selectTargetUsers(database, workflow_user_list, ticket?.phase);

                if (opener) {

                    loadTemplate("ticket_expired", {ticket, opener}, (subject, body, err) => {

                        if (err) {
    
                            return error(err);
                        
                        } else {
    
                            try {
                            
                            let recipients = users.map(o => o.email);
    
                            sendMail({
                                to: recipients.join(","),
                                subject: subject,
                                html: body
                            },  err => {
        
                                return error(err);
        
                            }, async info => {

                              let time = new Date();
                              let today = time.toISOString().split("T")[0];

                              await updateReports(database, "email", {
                                message_id: info.messageId,
                                status: "ACCEPTED",
                                receiver: info.accepted,
                                source: ticket_id,
                                date: today,
                                sent: time,
                              });

                              return error(false);
        
                            })} catch (err) {
            
                                return error({err_message: "Something went wrong while sending email: " + err.message});
                                
                            }
    
                        }
    
                    })

                } else {

                    return error({err_message: "Ticket opener is not present in the system"});

                }

            } else {

                return error({err_message: "ticket not supported"});

            }

        })

    },

    ticketEscalation(ticket_id, error) {

        getDatabase()
        .then(async database => {

            let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});
            let workflow = ticket?.workflow;

            if (ticket && workflow) {

                /* if (ticket.no_email) return; */

                let subject = '';

                if (ticket.level == 3) {

                    subject = `Ticket ${ticket.sid} escalated to last level and about to expire!`;

                } else {

                    subject = `Ticket ${ticket.sid} escalated to higher level and requires more priority!`;

                }

                let email_body = `

                  <!DOCTYPE html>
                  <html>
                    
                    ${TEMPLATE.header_css}
                    
                    <body class="email-body">
                        <div class="mail-container w-half">

                            <h3>
                                <span class="t-primary">Open Ticket:</span>
                                ${ticket.sid}:
                                ${ticket.title}<br />
                            </h3>
                            <p>
                                Dear EITIx User,
                            </p>
                            <p>
                                We would like to inform you that the ticket ${ticket.sid} has been automatically escalated to higher level ${ticket.level} and it requires your attention! <br/>
                                The details of the ticket are as follows:
                            </p>

                            ${await TEMPLATE.ticket_summary(ticket)}
                    
                            ${TEMPLATE.footer_text}
                    
                        </div>
                    </body>
                    
                  </html>
                    
                    
                `;

                try {

                    let workflow_user_list = workflow?.users || [];
                    let users = await selectTargetUsers(database, workflow_user_list, ticket?.phase);
                    let recipients = users.map(o => o.email);

                    sendMail({
                        to: recipients.join(","),
                        subject: subject,
                        html: email_body,
                        replyTo: `"EITIx" ${ticket?.message_id}`
                    }, err => {

                        if (err && error) return error("Couldn't send email " + err?.message);

                    }, async info => {

                      let time = new Date();
                      let today = time.toISOString().split("T")[0];

                      await updateReports(database, "email", {
                        message_id: info.messageId,
                        status: "ACCEPTED",
                        receiver: info.accepted,
                        source: ticket_id,
                        date: today,
                        sent: time,
                      });

                      return error(false);
    
                    });
                    
                } catch (err) {

                    return error("Something went wrong while sending email: " + err.message);
                    
                }

            } else {

                return error("ticket not supported");

            }

        })

    },

    ticketReminder(ticket_id, error) {

        getDatabase()
        .then(async database => {

            let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});
            let workflow = ticket?.workflow;

            if (ticket && workflow) {

                /* if (ticket.no_email) return; */

                let next_esc = ticket.level == 1 ? ticket.first_escalation : ticket.level == 2 ? ticket.second_escalation : ticket.expiry_date;

                let subject = `Reminder: Ticket ${ticket.sid} is open and seeks your attention!`;

                let email_body = `

                    <!DOCTYPE html>
                    <html>
                    
                    ${TEMPLATE.header_css}
                    
                    <body class="email-body">
                        <div class="mail-container w-half">

                            <h3>
                                <span class="t-primary">Open Ticket:</span>
                                ${ticket.sid}:
                                ${ticket.title}<br />
                            </h3>
                            <p>
                                Dear EITIx User,
                            </p>
                            <p>
                                We would like to inform you that the ticket ${ticket.sid} was created at ${ticket.opening?.toLocaleString()} and it's still open. Next escalation of this will happen at ${next_esc?.toLocaleString()} Please consider checking it out. <br/>
                                The details of the ticket are as follows:
                            </p>

                            ${await TEMPLATE.ticket_summary(ticket)}
                    
                            ${TEMPLATE.footer_text}
                    
                        </div>
                    </body>
                    
                    </html>
                    
                    
                `;

                try {

                    let workflow_user_list = workflow?.users || [];
                    let users = await selectTargetUsers(database, workflow_user_list, ticket?.phase);
                    let recipients = users.map(o => o.email);

                    sendMail({
                        to: recipients.join(","),
                        subject: subject,
                        html: email_body,
                        replyTo: `"EITIx" ${ticket?.message_id}`
                    }, err => {

                        if (err && error) return error("Couldn't send email " + err?.message);

                    }, async info => {

                      let time = new Date();
                      let today = time.toISOString().split("T")[0];

                      await updateReports(database, "email", {
                        message_id: info.messageId,
                        status: "ACCEPTED",
                        receiver: info.accepted,
                        source: ticket_id,
                        date: today,
                        sent: time,
                      });

                      return error(false);
    
                    });
                    
                } catch (err) {

                    if (error) return error("Something went wrong while sending email: " + err.message);
                    
                }

            } else {

                if (error) return error("ticket not supported");

            }

        })

    },

    ticketComments(ticket_id, commenter, error) {

      /* commenter = {
        full_name, email
      } */

        getDatabase()
        .then(async database => {

            let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});

            if (ticket) {

                /* if (ticket.no_email) return error("Emailing is not allowed on this ticket"); */

                let subject = `${commenter.full_name} posted new comments on Ticket ${ticket.sid}!`;

                let email_body = `

                    <!DOCTYPE html>
                    <html>
                    
                    ${TEMPLATE.header_css}
                    
                    <body class="email-body">
                        <div class="mail-container w-half">

                            <h3>
                                New comments posted on
                                <span class="t-primary">Ticket ${ticket.sid}</span>
                            </h3>
                            <p>
                                Dear EITIx User,
                            </p>
                            <p>
                                There's new activity on ticket ${ticket.sid}. Visit that ticket to check the new comments posted by ${commenter.full_name} and others.
                            </p>

                            <div> <a href="http://localhost:4000/dashboard/tickets/info?id=${ticket.sid}#ticket-comments" class="mail-btn">Check comments on EITIx</a> </div>
                    
                            ${TEMPLATE.footer_text}
                    
                        </div>
                    </body>
                    
                    </html>
                    
                `;

                try {

                    let workflow_user_list = workflow?.users || [];
                    let users = await selectTargetUsers(database, workflow_user_list, ticket.phase);
                    
                    let recipients = users.map(user => user.email);
                    let post_recipients = recipients?.filter(u => u.email !== commenter.email);

                    if (post_recipients.length < 1) {
                      return error("No recipent found to send email");
                    }

                    if (!post_recipients.includes(commenter.email)) {
                        post_recipients.push(commenter.email);
                    }

                    sendMail({
                        to: recipients.join(","),
                        subject: subject,
                        html: email_body,
                        replyTo: `"EITIx" ${ticket.message_id}`
                    }, err => {

                        if (error) return error("Couldn't send email " + err.message);

                    }, async info => {

                      let time = new Date();
                      let today = time.toISOString().split("T")[0];

                        await updateReports(database, "email", {
                          message_id: info.messageId,
                          status: "ACCEPTED",
                          receiver: info.accepted,
                          source: ticket_id,
                          date: today,
                          sent: time,
                        });

                        await database.collection(DB.tickets).updateOne({
                            sid: ticket_id
                        },{
                            $set: {
                                email_recipients: post_recipients.join(",")
                            }
                        }).then(res => {

                            return error(false);

                        }).catch(err => {

                            return error("Couldn't send email " + err.message);

                        })
    
                    });
                    
                } catch (err) {

                    return error("Something went wrong while sending email: " + err.message);
                    
                }

            } else {

                return error("ticket not supported");

            }

        })

    },

    report(report_file, recipients, oid, error) {

        getDatabase()
        .then(async database => {

            try {

                let schedule = await database.collection(DB.rep_sch).findOne({_id: oid});

                if (schedule) {

                    loadTemplate('reporting', schedule, (subject, body, err) => {

                        if (err) {

                            return error(err);
                        
                        } else {
                            
                            sendMail({
                                to: recipients.direct,
                                subject: subject,
                                html: body,
                                attachments: [{
                                    path: report_file
                                }]
                            }, err => {
        
                                return error(err);
        
                            }, async (info) => {

                              let time = new Date();
                              let today = time.toISOString().split("T")[0];

                              await updateReports(database, "email", {
                                message_id: info.messageId,
                                status: "ACCEPTED",
                                receiver: info.accepted,
                                source: schedule.sid,
                                date: today,
                                sent: time,
                              });
        
                              return error(false);
        
                            });

                        }

                    })

                } else {

                    return error({err_message: "Schedule or template is not found"});

                }

            } catch (err) {

                return error(err);
                
            }

        })

    },

    playbook(playbook_id, callback) {

      getDatabase().then(async database => {

        try {

          // get the playbook
          const playbook = await database.collection(DB.playb).findOne({ sid: playbook_id });

          if (playbook) {

            // get the selected users
            let user_list = playbook?.users || [];
            let users = await selectTargetUsers(database, user_list, null);
            let recipient_emails = users.map(o => o.email);

            if (recipient_emails.length < 1) return callback("This playbook not supported anymore (No users found)");
  
            // get the selected template body
            loadTemplate("playbook", playbook, (subject, body, err) => {

                if (err) {

                    return callback(err);
                
                } else {

                  try {
                    
                    sendMail({
                      to: recipient_emails.join(","),
                      subject: subject,
                      html: body,
                    }, err => {
          
                      if (callback) return callback("Couldn't send email " + err.message);
          
                    }, async (info) => {

                      let time = new Date();
                      let today = time.toISOString().split("T")[0];

                      await updateReports(database, "email", {
                        message_id: info.messageId,
                        status: "ACCEPTED",
                        receiver: info.accepted,
                        source: playbook_id,
                        date: today,
                        sent: time,
                      });
          
                      // flag last fired time into the playbook
                      await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
                        $set: { last_fired: new Date(), firing_required: false },
                        $inc: { notified: 1 }
                      })
          
                      return callback(null);
          
                    });

                  } catch (err) {
    
                    return callback({err_message: "Something went wrong while sending email: " + err.message});
                      
                  }

                }

            })

          } else {

            callback({ message: "No playbook found with id" + playbook_id });

          }
          
        } catch (err) {

          return callback(err);
          
        }

      })

    },

    playbookAI(playbook, callback) {

      getDatabase().then(async database => {

        try {

          if (playbook) {

            // sid
            let playbook_id = playbook.sid;

            // get the selected users
            let user_list = playbook?.users || [];
            let users = await selectTargetUsers(database, user_list, null);
            let recipient_emails = users.map(o => o.email);
            if (recipient_emails.length < 1) return callback("This playbook not supported anymore (No users found)");
  
            // get the selected template body
            loadTemplate("playbook-ai", playbook, (subject, body, err) => {

                if (err) {

                    return callback(err);
                
                } else {

                  try {
                    
                    sendMail({
                      to: recipient_emails.join(","),
                      subject: subject,
                      html: body,
                    }, err => {
          
                      if (callback) return callback("Couldn't send email " + err.message);
          
                    }, async (info) => {

                      let time = new Date();
                      let today = time.toISOString().split("T")[0];

                      /* console.log("sender.js", "emails sent"); */

                      await updateReports(database, "email", {
                        message_id: info.messageId,
                        status: "ACCEPTED",
                        receiver: info.accepted,
                        source: playbook_id,
                        date: today,
                        sent: time,
                      });
          
                      // flag last fired time into the playbook
                      await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
                        $set: { last_fired: new Date(), firing_required: false },
                        $inc: { notified: 1 }
                      })
          
                      return callback(null);
          
                    });

                  } catch (err) {
    
                    return callback({err_message: "Something went wrong while sending email: " + err.message});
                      
                  }

                }

            })

          } else {

            callback({ message: "No playbook found with id" + playbook_id });

          }
          
        } catch (err) {

          return callback(err);
          
        }

      })

    },

    playbookUBA(playbook, message, callback) {

      getDatabase().then(async database => {

        try {

          if (playbook) {

            // sid
            let playbook_id = playbook.sid;

            // get the selected users
            let user_list = playbook?.users || [];
            let users = await selectTargetUsers(database, user_list, null);
            let recipient_emails = users.map(o => o.email);
            if (recipient_emails.length < 1) return callback("This playbook not supported anymore (No users found)");

            let subject = message.subject;
            let body = message.body;

            sendMail({
              to: recipient_emails.join(","),
              subject: subject,
              html: body,
            }, err => {
  
              if (callback) return callback("Couldn't send email " + err.message);
  
            }, async (info) => {

              let time = new Date();
              let today = time.toISOString().split("T")[0];

              /* console.log("sender.js", "emails sent"); */

              await updateReports(database, "email", {
                message_id: info.messageId,
                status: "ACCEPTED",
                receiver: info.accepted,
                source: playbook_id,
                date: today,
                sent: time,
              });
  
              // flag last fired time into the playbook
              await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
                $set: { last_fired: new Date(), firing_required: false },
                $inc: { notified: 1 }
              })
  
              return callback(null);
  
            });

          } else {

            callback({ message: "No playbook found with id" + playbook_id });

          }
          
        } catch (err) {

          return callback(err);
          
        }

      })

    },

    playbookAsset(asset, playbook, callback) {

      getDatabase().then(async database => {

        try {

          if (playbook) {

            // sid
            let playbook_id = playbook.sid;

            const org_data = await database.collection(DB.eitix).findOne({ title: "organization" }) || {};

            // get the selected users
            let user_list = playbook?.users || [];
            let users = await selectTargetUsers(database, user_list, null);
            let recipient_emails = users.map(o => o.email);
            if (recipient_emails.length < 1) return callback("This playbook not supported anymore (No users found)");

            let { name, category, ip, status } = asset;

            let subject = `The asset '${name}' has changed to the '${status === 'active' ? 'Up' : 'Down'}' state as of ${new Date().toLocaleString()} (server time).`;
            
            let extra_info = `Asset name: ${name}, Category: ${category}, IP: ${ip}. Please open it by logging in to EITIx and navigate to the "Assets" section.`;

            let body = `<body class="email-body">
              <div class="template-container" style="padding: 20px">
                <p>Dear Recipients,</p>
                <p>Subject: ${subject}</p><br>
                <p>${extra_info}<br><br>For questions or assistance, please contact our IT security team at ${org_data.email}. Thank you for your cooperation in safeguarding our data. Please ignore this message if you have already resolved the issue.</p><br><p>Sincerely,<br>EITIx SOC System<br>${org_data.name}<br>Contact Detail: ${org_data.email}</p><br>
              </div>
            </body>`;

            sendMail({
              to: recipient_emails.join(","),
              subject: subject,
              html: body,
            }, err => {
  
              if (callback) return callback("Couldn't send email " + err.message);
  
            }, async (info) => {

              let time = new Date();
              let today = time.toISOString().split("T")[0];

              /* console.log("sender.js", "emails sent"); */

              await updateReports(database, "email", {
                message_id: info.messageId,
                status: "ACCEPTED",
                receiver: info.accepted,
                source: playbook_id,
                date: today,
                sent: time,
              });
  
              // flag last fired time into the playbook
              await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
                $set: { last_fired: new Date(), asset: null },
                $inc: { notified: 1 }
              })
  
              return callback(null);
  
            });

          } else {

            callback({ message: "No playbook found with id" + playbook_id });

          }
          
        } catch (err) {

          return callback(err);
          
        }

      })

    },

}

// send sms
async function sendSMS(phones, message) {
  
  try {
  
    const promises = [];
    const messages = [];
    const encoded_message = encodeURIComponent(message);
    const {
      sms_host, sms_api_key, sms_secret_key, sms_caller_id, sms_sid, sms_api_type
    } = getConfig();

    phones = [...new Set(phones)];

    phones.forEach(phone => {

      if (sms_host && sms_host !== '') {

        if (sms_api_type === "reve") {
  
          // reve sms
          const url = `${sms_host}/sendtext?apikey=${sms_api_key}&secretkey=${sms_secret_key}&callerID=${sms_caller_id}&toUser=${phone}&messageContent=${encoded_message}`;

          /* console.log("sender.js", url); */

          promises.push(
            
            axios.get(url, {}, {
          
              httpsAgent: new https.Agent({ rejectUnauthorized: false, family: 4 })
          
            }).then(response => {

              /* console.log("sender.js", response); */

              if (response.data?.Message_ID) {

                messages.push({ ...response.data, phone, characters: message?.length || 0 });

              } else {

                console.error("Sender.js : SMS : Bad Response");
                console.log(response.data);

              }
          
            }).catch(err => {
              
              console.error("Sender.js : SMS : Axios", err);
          
            })
      
          )
  
        } else if (sms_api_type === "ssl") {

          // ssl wireless
          
          const data = {
            api_token: sms_api_key,
            sid: sms_sid,
            sms: message,
            msisdn: phone,
            csms_id: sms_caller_id
          };
  
          promises.push(
    
            axios.post(sms_host, data, {
              httpsAgent: new https.Agent({ rejectUnauthorized: false, family: 4 }),
              headers: {
                'Content-Type': 'application/json'
              }
            }).then(response => {

              /* console.log("sender.js", response.data); */
          
              messages.push({ ...response.data, phone, characters: message?.length || 0 });
          
            }).catch(err => {
              
              console.error("Axios", err); 
          
            })
      
          )
  
        } else if (sms_api_type === "rtcom") {
  
          // reve sms
          const url = `${sms_host}?acode=${sms_secret_key}&api_key=${sms_api_key}&senderid=${sms_sid}&type=text&msg=${encoded_message}&contacts=${phone}&transactionType=T&contentID=`;

          /* console.log("sender.js", url); */

          promises.push(
            
            axios.get(url, {}, {
          
              httpsAgent: new https.Agent({ rejectUnauthorized: false, family: 4 })
          
            }).then(response => {

              /* console.log("sender.js", response); */

              if (response.data?.response?.code === 200) {

                messages.push({
                  Message_id: response.data?.info?.requestID,
                  Text: response.data?.response?.message,
                  phone, characters: message?.length || 0
                });

              } else {

                console.log(response.data);

              }
          
            }).catch(err => {
              
              console.error("Sender.js : SMS : Axios", err);
          
            })
      
          )
  
        } 

      }
      
    });
    

    return await Promise.allSettled(promises).then(() => {

      return messages;

    })
  
    
  } catch (err) {
    
    console.error("Server", err);

  }

}

const SMS = {

  playbook(playbook_id, callback) {

    // wazuh playbook

    getDatabase().then(async database => {

      try {

        // get the playbook
        const playbook = await database.collection(DB.playb).findOne({ sid: playbook_id });

        if (playbook) {

          // get the selected users
          let user_list = playbook?.users || [];
          let users = await selectTargetUsers(database, user_list, null);
          let recipient_phones = users.map(o => o.phone_number);

          /* console.log("sender.js", recipient_phones); */

          if (recipient_phones.length < 1) return callback("This playbook not supported anymore (No users found)");
  
          // get the selected template body
          const template = await database.collection(DB.temps).findOne({
            sid: playbook.template
          });

          let playbook_body = template.sms_text;

          if (!playbook_body) {

            const playbooK_template = await database.collection(DB.playb_temps).findOne({
              sid: template.template || "EPT10000"
            });

            playbook_body = playbooK_template.sms_text;

          }

          if (!playbook_body) return callback({err_message: "No template found"});

          let data = playbook;

          // populate sms template
          const message_text = populate(playbook_body, {
            playbook_title: data.title,
            event_date: new Date(data.data?.timestamp).toLocaleDateString() || NA_TEXT,
            event_time: new Date(data.data?.timestamp).toLocaleTimeString() || NA_TEXT,
            log_id: data.data?.id || NA_TEXT,
            event_source: data.data?.source || NA_TEXT,
            agent_name: data.data?.agent.name || NA_TEXT,
            agent_id: data.data?.agent.id || NA_TEXT,
            agent_ip: data.data?.agent?.ip || NA_TEXT,
            rule_id: data.data?.rule.id || NA_TEXT,
            rule_level: data.data?.rule.level || NA_TEXT,
            file: data.data?.syscheck?.path || NA_TEXT
          });
  
          // collect all the message ids and for each
          const sent_messages = await sendSMS(recipient_phones, message_text) || [];
  
          // flag last fired time into the playbook
          await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
            $set: { last_fired: new Date(), firing_required: false },
            $inc: { notified: 1 }
          })
            
          // list the sms in the report list
          sent_messages.forEach(async message => {

            let time = new Date();
            let today = time.toISOString().split("T")[0];
            let chars = message.characters;

            await updateReports(database, "sms", {
              message_id: message.Message_ID || "NONE",
              status: message.Text || "NONE",
              receiver: message.phone,
              characters: chars,
              length: Math.ceil(chars / 160),
              source: playbook_id,
              response: message,
              date: today,
              sent: time
            });
            
          });
  
          return callback(null);

        } else {

          callback({ message: "No playbook found with id" + playbook_id });

        }
        
      } catch (err) {

        return callback(err);
        
      }

    })

  },

  playbookAI(playbook, callback) {

    getDatabase().then(async database => {

      try {

        // playbook sid
        let playbook_id = playbook.sid;

        if (playbook) {

          // get the selected users
          let user_list = playbook?.users || [];
          let users = await selectTargetUsers(database, user_list, null);
          let recipient_phones = users.map(o => o.phone_number);

          /* console.log("sender.js", recipient_phones); */

          if (recipient_phones.length < 1) return callback("This playbook not supported anymore (No users found)");


          let vector_name = playbook.ai_vector;
          let vector_count = playbook.ai_logs_count;

          const message_text = `We would like to inform you that the vector ${vector_name} was found in more than ${vector_count} logs in the system. We consider this to be a potential security issue. Please investigate and take appropriate action as needed.`;
  
          // collect all the message ids and for each
          const sent_messages = await sendSMS(recipient_phones, message_text) || [];
  
          // flag last fired time into the playbook
          await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
            $set: { last_fired: new Date(), firing_required: false },
            $inc: { notified: 1 }
          })

          /* console.log("sender.js", Object.keys(sent_messages)); */
            
          // list the sms in the report list
          sent_messages.forEach(async message => {

            let time = new Date();
            let today = time.toISOString().split("T")[0];
            let chars = message.characters;

            await updateReports(database, "sms", {
              message_id: message.Message_ID || "NONE",
              status: message.Text || "NONE",
              receiver: message.phone,
              characters: chars,
              length: Math.ceil(chars / 160),
              source: playbook_id,
              response: message,
              date: today,
              sent: time
            });
            
          });
  
          return callback(null);

        } else {

          callback({ message: "No playbook found with id" + playbook_id });

        }
        
      } catch (err) {

        return callback(err);
        
      }

    })

  },

  playbookUBA(playbook, message, callback) {

    getDatabase().then(async database => {

      try {

        // playbook sid
        let playbook_id = playbook.sid;

        if (playbook) {

          // get the selected users
          let user_list = playbook?.users || [];
          let users = await selectTargetUsers(database, user_list, null);
          let recipient_phones = users.map(o => o.phone_number);

          /* console.log("sender.js", recipient_phones); */

          if (recipient_phones.length < 1) return callback("This playbook not supported anymore (No users found)");

          const message_text = message;
  
          // collect all the message ids and for each
          const sent_messages = await sendSMS(recipient_phones, message_text) || [];
  
          // flag last fired time into the playbook
          await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
            $set: { last_fired: new Date(), firing_required: false },
            $inc: { notified: 1 }
          })

          /* console.log("sender.js", Object.keys(sent_messages)); */
            
          // list the sms in the report list
          sent_messages.forEach(async message => {

            let time = new Date();
            let today = time.toISOString().split("T")[0];
            let chars = message.characters;

            await updateReports(database, "sms", {
              message_id: message.Message_ID || "NONE",
              status: message.Text || "NONE",
              receiver: message.phone,
              characters: chars,
              length: Math.ceil(chars / 160),
              source: playbook_id,
              response: message,
              date: today,
              sent: time
            });
            
          });
  
          return callback(null);

        } else {

          callback({ message: "No playbook found with id" + playbook_id });

        }
        
      } catch (err) {

        return callback(err);
        
      }

    })

  },

  ticket(action, ticket_id, callback) {

    getDatabase()
    .then(async database => {

        let ticket = await database.collection(DB.tickets).findOne({sid: ticket_id});
        // get the workflow (skip if not found)
        let workflow = ticket?.workflow;

        if (debug) console.log("sender.js - ticketCreation - ticket, workflow: \n", ticket, workflow);

        if (ticket && workflow) {

            // get the phase1 users
            let workflow_user_list = workflow?.users || [];
            let users = await selectTargetUsers(database, workflow_user_list, ticket.phase);
            let opener = await database.collection(DB.users).findOne({email: ticket.created_by});

            if (users.length > 0 && opener) {

              // map the emails and send email
              let recipients = users.map(user => user.phone_number);
              let message_text = "";
              let extra_info = `Title: ${ticket.title}, Phase: ${ticket.phase}, Type: ${ticket.type}, Criticality: ${ticket.criticality}. Please open it by logging in to EITIx and navigate to the "Tickets" section.`;

              switch (action) {
                case "created":
                  message_text = `New Ticket ${ticket.sid} was created by ${opener.full_name}! ${extra_info}`;
                  break;
                case "closed":
                  message_text = `Ticket ${ticket.sid} has been closed. ${extra_info}`;
                  break;
                case "expired":
                  message_text = `Ticket ${ticket.sid} has expired. ${extra_info}`;
                  break;
                case "reminder":
                  message_text = `Reminder: Ticket ${ticket.sid} is open and seeks your attention! ${extra_info}`;
                  break;
                case "escalated":
                  message_text = `Ticket ${ticket.sid} has been escalated to higher phase and requires your attention! New ${extra_info}`;
                  break;
                case "comment":
                  message_text = `New comment added on ticket ${ticket.sid}. Please check the latest comments for this ticket. ${extra_info}`;
                  break;
                default:
                  return callback({ message: "action is not supported" });
              }

              if (debug) console.log("sender.js - ticketCreation - recipients, message_text: \n", recipients, message_text);

              const sent_messages = await sendSMS(recipients, message_text) || [];

              if (debug) console.log("sender.js - ticketCreation - sent_messages: \n", sent_messages);

              // list the sms in the report list
              sent_messages.forEach(async message => {

                let time = new Date();
                let today = time.toISOString().split("T")[0];
                let chars = message.characters;

                await updateReports(database, "sms", {
                  message_id: message.Message_ID || "NONE",
                  status: message.Text || "NONE",
                  receiver: message.phone,
                  characters: chars,
                  length: Math.ceil(chars / 160),
                  source: ticket.sid,
                  response: message,
                  date: today,
                  sent: time
                });
                
              });
      
              return callback(null);

            } else {

              return callback({err_message: "Ticket users not found or ticket opener is not present in the system"});

            }

        } else {

          return error({err_message: "Ticket SMS request detected but ticket is not supported anymore or not found in the system."});

        }

    })

  },

  playbookAsset(asset, playbook, callback) {

    getDatabase().then(async database => {

      try {

        // playbook sid
        let playbook_id = playbook.sid;

        if (playbook) {

          // get the selected users
          let user_list = playbook?.users || [];
          let users = await selectTargetUsers(database, user_list, null);
          let recipient_phones = users.map(o => o.phone_number);

          if (recipient_phones.length < 1) return callback("This playbook not supported anymore (No users found)");

          let { name, category, ip, status } = asset;
          let message_text = `The asset '${name}' has changed to the '${status === 'active' ? 'Up' : 'Down'}' state as of ${new Date().toLocaleString()} (server time). Category: ${category}, IP: ${ip}. Please open it by logging in to EITIx and navigate to the "Assets" section.`;
  
          // collect all the message ids and for each
          const sent_messages = await sendSMS(recipient_phones, message_text) || [];
  
          // flag last fired time into the playbook
          await database.collection(DB.playb).updateOne({ sid: playbook_id }, {
            $set: { last_fired: new Date(), asset: null },
            $inc: { notified: 1 }
          })
            
          // list the sms in the report list
          sent_messages.forEach(async message => {

            let time = new Date();
            let today = time.toISOString().split("T")[0];
            let chars = message.characters;

            await updateReports(database, "sms", {
              message_id: message.Message_ID || "NONE",
              status: message.Text || "NONE",
              receiver: message.phone,
              characters: chars,
              length: Math.ceil(chars / 160),
              source: playbook_id,
              response: message,
              date: today,
              sent: time
            });
            
          });
  
          return callback(null);

        } else {

          callback({ message: "No playbook found with id" + playbook_id });

        }
        
      } catch (err) {

        return callback(err);
        
      }

    })

  }

}

module.exports = {

  MAILER, SMS, sendMail, sendSMS, selectTargetUsers

}
