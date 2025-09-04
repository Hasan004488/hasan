module.exports = [
  {
    "rule": "EDRULE001",
    sid: 'ETM10001',
    title: '(Default) Scheduled Reports',
    author: 'EITIx',
    type: 'schedule',
    protected: true,
    subject: 'Scheduled report of ${title} by ${reporter_name}!',
    section_a: '<h3><strong>Report Schedule: </strong><strong style="color: rgb(255, 127, 63);">${title}</strong></h3><br/><p>Dear EITIx User,</p><p>Please check the scheduled report file for ${title} by ${reporter_name}. The file is attached in this email.</p>',
    footer: '<br/><p><span style="color: rgb(94, 101, 128);">This is an automated email. Please do not reply to this message.</span></p>'
  },
  {
    "rule": "EDRULE002",
    sid: 'ETM10002',
    title: '(Default) Ticket Creation',
    author: 'EITIx',
    action: 'ticket_created',
    type: 'ticket',
    protected: true,
    subject: 'New Ticket ${ticket_sid} was created by ${opener_full_name}!',
    section_a: '<h3><strong>Open Ticket: </strong><strong style="color: rgb(255, 127, 63);">${ticket_sid}</strong><strong> - ${ticket_title}</strong></h3><br/><p>Dear EITIx User,</p><p>We would like to inform you that a new ticket has been created for your attention! The details of the ticket are as follows:</p>',
    summary: '<br/><strong>Ticket Summary: </strong> <div class="res w-100 py"> <div class="w-half me"> <div class="py bb res-rev"> <div>ID: </div><div class="t-primary">${ticket_sid}</div></div><div class="py bb res-rev"> <div>Wazuh Log ID: </div><div class="t-primary">${log_id}</div></div><div class="py bb res-rev"> <div>Phase: </div><div class="t-primary">${ticket_phase}</div></div><div class="py bb res-rev"> <div>Type: </div><div class="t-primary">${ticket_type}</div></div></div><div class="w-half me"> <div class="py bb res-rev"> <div>Criticality: </div><div class="t-primary">${ticket_criticality}</div></div><div class="py bb res-rev"> <div>Status: </div><div class="t-primary">${ticket_status}</div></div><div class="py bb res-rev"> <div>Opening: </div><div class="t-primary">${ticket_opening_date}</div></div><div class="py bb res-rev"> <div>Next Escalation: </div><div class="t-primary">${next_escalation_date}</div></div></div></div><div> <a href="${redirect}/dashboard/tickets/info?id=${ticket_sid}" class="mail-btn">Open this ticket on EITIx</a> </div><br/><p> Or please open it by logging in to EITIx Dashboard and navigate to the "Tickets" section. </p>',
    section_b: '<p>If you have any questions or concerns, please do not hesitate to reach out to me or our SOC team. We appreciate your understanding and support as we work to resolve this ticket.</p><br/><p>Sincerely,</p><p>${opener_full_name} (${opener_role})</p>',
    footer: '<br/><p><span style="color: rgb(94, 101, 128);">This is an automated email. Please do not reply to this message.</span></p>',
    sms_text: 'Ticket ${ticket_sid} "${ticket_title}" was created by ${opener_full_name}! Phase: ${ticket_phase}, Type: ${ticket_type}, Criticality: ${ticket_criticality}. Please open it by logging in to EITIx and navigate to the "Tickets" section.'
  },
  {
    "rule": "EDRULE003",
    sid: 'ETM10003',
    title: '(Default) Ticket Closing',
    author: 'EITIx',
    action: 'ticket_closed',
    type: 'ticket',
    protected: true,
    subject: 'Ticket ${ticket_sid} has been closed!',
    section_a: '<h3><strong>Closed Ticket: ${ticket_sid} - ${ticket_title}</strong></h3><br/><p>Dear EITIx User,</p><p>We would like to inform you that the ticket ${ticket_sid} has been closed! The details of the ticket are as follows:</p>',
    summary: '<br/><strong>Ticket Summary:</strong><div class="res w-100 py"><div class="w-half me"><div class="py bb res-rev"><div>ID:</div><div class="t-primary">${ticket_sid}</div></div><div class="py bb res-rev"><div>Wazuh Log ID:</div><div class="t-primary">${log_id}</div></div><div class="py bb res-rev"><div>Phase:</div><div class="t-primary">${ticket_phase}</div></div></div><div class="w-half me"><div class="py bb res-rev"><div>Type:</div><div class="t-primary">${ticket_type}</div></div><div class="py bb res-rev"><div>Criticality:</div><div class="t-primary">${ticket_criticality}</div></div><div class="py bb res-rev"><div>Opened:</div><div class="t-primary">${ticket_opening_date}</div></div></div></div><div><a href="${redirect}/dashboard/tickets/info?id=${ticket_sid}" class="mail-btn">Open this ticket on EITIx</a></div><br/><p>Or please open it by logging in to EITIx Dashboard and navigate to the "Tickets" section.</p>',
    section_b: '<p>Thanks for your cooperation and efforts. If you have any questions or concerns, please do not hesitate to reach out to me or our SOC team.</p><br/><p>Sincerely,</p><p>${opener_full_name} (${opener_role})</p>',
    footer: '<br/><p><span style="color: rgb(94, 101, 128);">This is an automated email. Please do not reply to this message.</span></p>',
    sms_text: 'The ticket ${ticket_sid} "${ticket_title}" has been closed. Ticket Phase: ${ticket_phase}, Type: ${ticket_type}, Criticality: ${ticket_criticality}. For more details, please check the EITIx Dashboard.'
  },
  {
    "rule": "EDRULE004",
    sid: 'ETM10004',
    title: '(Default) Ticket Expiry',
    author: 'EITIx',
    action: 'ticket_expired',
    type: 'ticket',
    protected: true,
    subject: 'Attention, Ticket ${ticket_sid} has expired!',
    section_a: '<h3><strong>Ticket Expired: </strong><strong style="color: rgb(255, 127, 63);">${ticket_sid}</strong><strong> - ${ticket_title}</strong></h3><br/><p>Dear EITIx User,</p><p>We would like to inform you that the ticket ${ticket_sid} has been automatically expired at level ${ticket_phase} due to exceeding of it\'s expiry date! The details of the ticket are as follows:</p>',
    summary: '<br/><strong>Ticket Summary:</strong><div class="res w-100 py"><div class="w-half me"><div class="py bb res-rev"><div>ID:</div><div class="t-primary">${ticket_sid}</div></div><div class="py bb res-rev"><div>Wazuh Log ID:</div><div class="t-primary">${log_id}</div></div><div class="py bb res-rev"><div>Phase:</div><div class="t-primary">${ticket_phase}</div></div></div><div class="w-half me"><div class="py bb res-rev"><div>Type:</div><div class="t-primary">${ticket_type}</div></div><div class="py bb res-rev"><div>Criticality:</div><div class="t-primary">${ticket_criticality}</div></div><div class="py bb res-rev"><div>Opened:</div><div class="t-primary">${ticket_opening_date}</div></div></div></div><div><a href="${redirect}/dashboard/tickets/info?id=${ticket_sid}" class="mail-btn">Open this ticket on EITIx</a></div><br/><p>Or please open it by logging in to EITIx Dashboard and navigate to the "Tickets" section.</p>',
    section_b: '',
    footer: '<br/><p><span style="color: rgb(94, 101, 128);">This is an automated email. Please do not reply to this message.</span></p>',
    sms_text: 'The ticket ${ticket_sid} "${ticket_title}" has expired. Ticket Phase: ${ticket_phase}, Type: ${ticket_type}, Criticality: ${ticket_criticality}. For more details, please check the EITIx Dashboard.'
  },
  {
    "rule": "504",
    "sid": "ETM10005",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Agent disconnected",
    "template": "EPT10001"
  },
  {
    "rule": "505",
    "sid": "ETM10006",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Agent removed",
    "template": "EPT10001"
  },
  {
    "rule": "510",
    "sid": "ETM10007",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host-based anomaly detection event (rootcheck)",
    "template": "EPT10001"
  },
  {
    "rule": "511",
    "sid": "ETM10008",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "NTFS Alternate data stream found",
    "template": "EPT10002"
  },
  {
    "rule": "513",
    "sid": "ETM10009",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Windows malware detected",
    "template": "EPT10002"
  },
  {
    "rule": "518",
    "sid": "ETM10010",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Windows Adware/Spyware application found",
    "template": "EPT10002"
  },
  {
    "rule": "520",
    "sid": "ETM10011",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Trying to add an agent with duplicate IP",
    "template": "EPT10001"
  },
  {
    "rule": "521",
    "sid": "ETM10012",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Possible kernel level rootkit",
    "template": "EPT10002"
  },
  {
    "rule": "553",
    "sid": "ETM10013",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "File deleted",
    "template": "EPT10001"
  },
  {
    "rule": "580",
    "sid": "ETM10014",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host information changed",
    "template": "EPT10001"
  },
  {
    "rule": "593",
    "sid": "ETM10015",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Microsoft Event log cleared",
    "template": "EPT10003"
  },
  {
    "rule": "597",
    "sid": "ETM10016",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "syscheck registry key deleted",
    "template": "EPT10001"
  },
  {
    "rule": "601",
    "sid": "ETM10017",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host Blocked by firewall-drop Active Response",
    "template": "EPT10004"
  },
  {
    "rule": "603",
    "sid": "ETM10018",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host Blocked by host-deny Active Response",
    "template": "EPT10004"
  },
  {
    "rule": "605",
    "sid": "ETM10019",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host Blocked by $(script) Active Response",
    "template": "EPT10004"
  },
  {
    "rule": "651",
    "sid": "ETM10020",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host Blocked by firewall-drop Active Response",
    "template": "EPT10004"
  },
  {
    "rule": "653",
    "sid": "ETM10021",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Host Blocked by host-deny Active Response",
    "template": "EPT10004"
  },
  {
    "rule": "751",
    "sid": "ETM10022",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Registry Value Entry Deleted",
    "template": "EPT10001"
  },
  {
    "rule": "204",
    "sid": "ETM10023",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Agent event queue is flooded. Check the agent configuration",
    "template": "EPT10001"
  },
  {
    "rule": "211",
    "sid": "ETM10024",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Remote installation alert",
    "template": "EPT10005"
  },
  {
    "rule": "424",
    "sid": "ETM10025",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Wazuh API Critical error event",
    "template": "EPT10001"
  },
  {
    "rule": "427",
    "sid": "ETM10026",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Wazuh API: Authentication failure",
    "template": "EPT10007"
  },
  {
    "rule": "428",
    "sid": "ETM10027",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "IP blocked due to exceeded number of logins attempts",
    "template": "EPT10006"
  },
  {
    "rule": "2501",
    "sid": "ETM10028",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Failed to authenticate user",
    "template": "EPT10008"
  },
  {
    "rule": "2502",
    "sid": "ETM10029",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "User missed the password more than one time",
    "template": "EPT10006"
  },
  {
    "rule": "2504",
    "sid": "ETM10030",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Illegal root login",
    "template": "EPT10001"
  },
  {
    "rule": "2509",
    "sid": "ETM10031",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "OpenLDAP authentication failed",
    "template": "EPT10008"
  },
  {
    "rule": "2550",
    "sid": "ETM10032",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Connection to rshd from unprivileged port. Possible network scan",
    "template": "EPT10009"
  },
  {
    "rule": "5132",
    "sid": "ETM10033",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Unsigned kernel module was loaded",
    "template": "EPT10002"
  },
  {
    "rule": "5133",
    "sid": "ETM10034",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Signed but untrusted kernel module was loaded",
    "template": "EPT10002"
  },
  {
    "rule": "2834",
    "sid": "ETM10035",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Crontab opened for editing",
    "template": "EPT10007"
  },
  {
    "rule": "2832",
    "sid": "ETM10036",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Crontab entry changed",
    "template": "EPT10007"
  },
  {
    "rule": "2833",
    "sid": "ETM10037",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Root's crontab entry changed",
    "template": "EPT10007"
  },
  {
    "rule": "5301",
    "sid": "ETM10038",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "User missed the password to change UID",
    "template": "EPT10008"
  },
  {
    "rule": "5302",
    "sid": "ETM10039",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "User missed the password to change UID to root",
    "template": "EPT10008"
  },
  {
    "rule": "5306",
    "sid": "ETM10040",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "A user has attempted to su to an unknown class",
    "template": "EPT10001"
  },
  {
    "rule": "5902",
    "sid": "ETM10041",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "New user added to the system",
    "template": "EPT10001"
  },
  {
    "rule": "5905",
    "sid": "ETM10042",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "failed adding user",
    "template": "EPT10001"
  },
  {
    "rule": "5401",
    "sid": "ETM10043",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Failed attempt to run sudo",
    "template": "EPT10008"
  },
  {
    "rule": "5404",
    "sid": "ETM10044",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Three failed attempts to run sudo",
    "template": "EPT10006"
  },
  {
    "rule": "5405",
    "sid": "ETM10045",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Unauthorized user attempted to use sudo",
    "template": "EPT10010"
  },
  {
    "rule": "5406",
    "sid": "ETM10046",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Command not allowed",
    "template": "EPT10001"
  },
  {
    "rule": "2961",
    "sid": "ETM10047",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "User added to group sudo",
    "template": "EPT10010"
  },
  {
    "rule": "2964",
    "sid": "ETM10048",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Multiple connection attempts from same source",
    "template": "EPT10007"
  },
  {
    "rule": "3103",
    "sid": "ETM10049",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sendmail: Rejected by access list",
    "template": "EPT10001"
  },
  {
    "rule": "3105",
    "sid": "ETM10050",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Sender domain is not found",
    "template": "EPT10001"
  },
  {
    "rule": "3151",
    "sid": "ETM10051",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Sender domain has bogus MX record",
    "template": "EPT10001"
  },
  {
    "rule": "3152",
    "sid": "ETM10052",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Multiple attempts to send e-mail from a",
    "template": "EPT10001"
  },
  {
    "rule": "3155",
    "sid": "ETM10054",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Multiple attempts to send e-mail from",
    "template": "EPT10001"
  },
  {
    "rule": "3156",
    "sid": "ETM10055",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Multiple rejected e-mails from same source ip",
    "template": "EPT10001"
  },
  {
    "rule": "3302",
    "sid": "ETM10056",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Rejected by access list",
    "template": "EPT10001"
  },
  {
    "rule": "3306",
    "sid": "ETM10057",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "IP Address black-listed by anti-spam",
    "template": "EPT10001"
  },
  {
    "rule": "3332",
    "sid": "ETM10058",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Postfix SASL authentication failure",
    "template": "EPT10008"
  },
  {
    "rule": "3357",
    "sid": "ETM10059",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Multiple SASL authentication failures",
    "template": "EPT10008"
  },
  {
    "rule": "3601",
    "sid": "ETM10060",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Imapd user login failed",
    "template": "EPT10008"
  },
  {
    "rule": "3651",
    "sid": "ETM10061",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Imapd Multiple failed logins from same source ip",
    "template": "EPT10008"
  },
  {
    "rule": "3702",
    "sid": "ETM10062",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "mailscanner: spam detected",
    "template": "EPT10001"
  },
  {
    "rule": "3752",
    "sid": "ETM10063",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Phishing bad sites list updated",
    "template": "EPT10011"
  },
  {
    "rule": "3902",
    "sid": "ETM10064",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Courier (imap/pop3) authentication failed",
    "template": "EPT10008"
  },
  {
    "rule": "3910",
    "sid": "ETM10065",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Courier brute force (multiple failed logins)",
    "template": "EPT10006"
  },
  {
    "rule": "4324",
    "sid": "ETM10066",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PIX: Password mismatch while running 'enable'",
    "template": "EPT10001"
  },
  {
    "rule": "4325",
    "sid": "ETM10067",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PIX: ARP collision detected",
    "template": "EPT10001"
  },
  {
    "rule": "4326",
    "sid": "ETM10068",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Attempt to connect from a blocked (shunned) IP",
    "template": "EPT10001"
  },
  {
    "rule": "4330",
    "sid": "ETM10069",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PIX: Attack in progress detected",
    "template": "EPT10007"
  },
  {
    "rule": "4332",
    "sid": "ETM10070",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PIX: Attack in progress detected",
    "template": "EPT10007"
  },
  {
    "rule": "4333",
    "sid": "ETM10071",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PIX: Attack in progress detected",
    "template": "EPT10007"
  },
  {
    "rule": "4334",
    "sid": "ETM10072",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "AAA (VPN) authentication failed",
    "template": "EPT10008"
  },
  {
    "rule": "5503",
    "sid": "ETM10073",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PAM: User login failed",
    "template": "EPT10001"
  },
  {
    "rule": "5504",
    "sid": "ETM10074",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PAM: Attempt to login with an invalid user",
    "template": "EPT10001"
  },
  {
    "rule": "5551",
    "sid": "ETM10075",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "PAM: Multiple failed logins in a small period of `time",
    "template": "EPT10006"
  },
  {
    "rule": "5557",
    "sid": "ETM10076",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "password check failed",
    "template": "EPT10001"
  },
  {
    "rule": "5701",
    "sid": "ETM10077",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: Possible attack on the ssh server",
    "template": "EPT10005"
  },
  {
    "rule": "5703",
    "sid": "ETM10078",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: Possible breakin attempt",
    "template": "EPT10001"
  },
  {
    "rule": "5705",
    "sid": "ETM10079",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: Possible scan or breakin attempt",
    "template": "EPT10001"
  },
  {
    "rule": "5707",
    "sid": "ETM10080",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: OpenSSH challenge-response exploit",
    "template": "EPT10007"
  },
  {
    "rule": "5711",
    "sid": "ETM10081",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "User not known to the underlying authentication module for illegal user",
    "template": "EPT10001"
  },
  {
    "rule": "5712",
    "sid": "ETM10082",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: brute force trying to get access to the system",
    "template": "EPT10006"
  },
  {
    "rule": "5714",
    "sid": "ETM10083",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: SSH CRC-32 Compensation attack",
    "template": "EPT10007"
  },
  {
    "rule": "5719",
    "sid": "ETM10084",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: Multiple access attempts using a denied user",
    "template": "EPT10006"
  },
  {
    "rule": "5720",
    "sid": "ETM10085",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: Multiple authentication failures",
    "template": "EPT10006"
  },
  {
    "rule": "5732",
    "sid": "ETM10086",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: Possible port forwarding failure",
    "template": "EPT10001"
  },
  {
    "rule": "5733",
    "sid": "ETM10087",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: User entered incorrect password",
    "template": "EPT10008"
  },
  {
    "rule": "5755",
    "sid": "ETM10088",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "Authentication refused due to owner/permissions of authorized_keys",
    "template": "EPT10001"
  },
  {
    "rule": "5758",
    "sid": "ETM10089",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "maximum authentication attempts exceeded",
    "template": "EPT10006"
  },
  {
    "rule": "5760",
    "sid": "ETM10090",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "sshd: authentication failed",
    "template": "EPT10001"
  },
  {
    "rule": "5763",
    "sid": "ETM10091",
    "author": "EITIx",
    "type": "playbook",
    "protected": true,
    "title": "brute force trying to get access to the syste",
    "template": "EPT10006"
  }
]