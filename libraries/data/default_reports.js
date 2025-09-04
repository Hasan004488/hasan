module.exports = [
    {
      sid: "ERE10001",
      title: "Security Events: Top 10 Agents",
      top: "This report sheds light on the most concerning actors in your network security landscape, revealing the top 10 Agents responsible for security events detected by Wazuh. Understanding these origins empowers you to prioritize mitigation efforts and make informed decisions.",
      bottom: "",
    },
    {
      sid: "ERE10002",
      title: "Security Events: Total Alerts",
      top: "This section likely displays the overall number of security-related events detected by Wazuh within your monitored systems. The Total Alerts number provides a high-level overview of your security posture.",
      bottom: "",
      detailed: "This report gives you a comprehensive overview of the total number of security events detected by your Wazuh system. It's a vital piece of information as it provides a snapshot of the overall security posture of your environment. Understanding the total number of security events helps you establish a baseline and track the progression of security incidents over time. This insight enables you to make informed decisions regarding your security strategies and resources allocation."
    },
    {
      sid: "ERE10003",
      title: "Security Events: Level 12 Alerts or Above",
      top: "This report displays potentially critical security events detected by your Wazuh system. It focuses on alerts with a severity level 12 or exceeding 12, indicating a high risk of compromise or malicious activity. These events warrant immediate attention and investigation to minimize potential damage.",
      bottom: "",
    },
    {
      sid: "ERE10004",
      title: "Security Events: Authentication Failure",
      top: "This report shines a light on 'Authentication Failure' events, acting as your digital guardian against unauthorized access attempts. These events signify instances where someone tried and failed to gain entry to your system, be it through an incorrect password, invalid credentials, or brute-force attacks.",
      bottom: "Each event provides valuable clues. It typically includes details like the username involved, the source IP address, and the timestamp of the attempt.",
    },
    {
      sid: "ERE10005",
      title: "Security Events: Authentication Failure (Top 10 Agents)",
      top: "This particular report focuses on the top 10 agents experiencing these failures, highlighting the areas most vulnerable to attack.",
      bottom: "",
    },
    {
      sid: "ERE10006",
      title: "Security Events: Authentication Success",
      top: "Report showing events to provide crucial insights into user access activity across your systems. These events indicate a successful login attempt, whether via local console, remote connection, or any other authorized method.",
      bottom: "",
    },
    {
      sid: "ERE10007",
      title: "File Integrity Monitoring: Total Changes",
      top: "File Integrity Monitoring (FIM) acts as a vigilant guardian for your critical files and directories. Wazuh continuously monitors them, ready to spring into action at any sign of unauthorized changes. Imagine having a real-time security camera trained on your most important data, that's essentially what Wazuh FIM does. It performs several key actions to ensure the integrity of your files.",
      bottom: "At its core, file integrity monitoring involves the systematic tracking and verification of changes made to files, directories, and configurations within an operating environment. This process extends across the entire IT infrastructure, from critical system files to application binaries and configuration files. The primary goal is to detect any unauthorized or unexpected alterations to these elements, which could indicate a security breach, malware intrusion, or potential system vulnerabilities.",
    },
    {
      sid: "ERE10008",
      title: "File Integrity Monitoring: Common FIM Actions",
      top: "File Integrity Monitoring (FIM) acts as a vigilant guardian for your critical files and directories. Wazuh continuously monitors them, ready to spring into action at any sign of unauthorized changes. Imagine having a real-time security camera trained on your most important data, that's essentially what Wazuh FIM does. It performs several key actions to ensure the integrity of your files",
      bottom: "",
    },
    {
      sid: "ERE10009",
      realtime: true,
      title: "File Integrity Monitoring: Top 10 FIM Agents",
      top: "We have created a bar chart to visually represent the top 10 agents. This graphical representation allows us to easily identify the proportion of each agent's activity and their overall contribution to the system or application.",
      bottom: "At its core, file integrity monitoring involves the systematic tracking and verification of changes made to files, directories, and configurations within an operating environment. This process extends across the entire IT infrastructure, from critical system files to application binaries and configuration files. The primary goal is to detect any unauthorized or unexpected alterations to these elements, which could indicate a security breach, malware intrusion, or potential system vulnerabilities.",
    },
    {
      sid: "ERE10010",
      realtime: true,
      title: "Vulnerabilities: Total CVE Detections",
      top: "This report section provides a critical overview of potential security weaknesses identified on monitored systems. These vulnerabilities are commonly referred to as Common Vulnerabilities and Exposures (CVEs). The total count in this section indicates the number of unique CVEs discovered during the latest scan. Analyzing this data helps assess the overall security posture of monitored systems and prioritize remediation efforts. A higher number of CVEs often signifies increased risk and necessitates immediate attention to mitigate potential exploits.",
      bottom: "Not all vulnerabilities carry the same level of risk. Analyzing the vulnerabilities alongside additional data like exploit availability and potential impact can help prioritize which vulnerabilities need immediate attention and which can be addressed in a controlled manner.",
    },
    {
      sid: "ERE10011",
      realtime: true,
      title: "Indicators of Compromise: Total IoC Events",
      top: "This report provides an insight into the number of indicators of compromise (IOCs) detected on your monitored systems. IOCs are specific pieces of data that can indicate the presence of malicious activity. A higher number of detected IOCs may indicate increased security risks and necessitate prompt investigation. These indicators are also scanned by the MISP community and can provide valuable information on the scope and nature of potential threats. Analyzing this data helps security professionals.",
      bottom: "The number of events can serve as a starting point for prioritizing which potential threats demand immediate attention. This can be done by considering factors such as the potential severity and urgency of the threats, the potential impact on the systems or data at risk, and the likelihood of a successful exploit. Analyzing these factors alongside the number of events can help security professionals make informed decisions on how to allocate resources and allocate resources effectively to address the most critical threats first.",
    },
    {
      sid: "ERE10012",
      title: "PCI DSS: Total Compliance of Agents",
      top: "This report provides insights into the overall PCI DSS compliance posture of your monitored agents. PCI DSS (Payment Card Industry Data Security Standard) is a set of security standards that organizations should follow to protect cardholder data. A higher number of non-compliant agents indicates increased security risks and necessitates immediate attention to address potential vulnerabilities. Analyzing this data helps security professionals understand the compliance status of monitored agents and prioritize remediation efforts.",
      bottom: "PCI DSS compliance involves a set of controls that protect cardholder data. Agents that are compliant with the PCI DSS standard have successfully implemented all the necessary controls. A higher number of non-compliant agents indicates a higher risk of potential security breaches and necessitates immediate attention to address these issues.",
    },
    {
      sid: "ERE10013",
      title: "SMS: Notifications Sent",
      realtime: true,
      long_report: true,
      top: "This report provides detailed insights into the number of SMS notifications sent by your monitored system. Understanding the volume and patterns of SMS notifications can help security professionals identify potential misconfigurations, unauthorized access, or unusual activity. Analyzing this data assists in maintaining the overall security posture and ensuring that communication channels are used appropriately.",
      bottom: "",
    },
    {
      sid: "ERE10014",
      realtime: true,
      long_report: true,
      title: "Email: Notifications Sent",
      top: "This report provides detailed insights into the number of email notifications sent by your monitored system. Understanding the volume and patterns of email notifications can help security professionals identify potential misconfigurations, unauthorized access, or unusual activity. Analyzing this data assists in maintaining the overall security posture and ensuring that communication channels are used appropriately.",
      bottom: "",
    },
    {
      sid: "ERE10015",
      realtime: true,
      long_report: true,
      title: "Login Activity Outside Working Hours",
      top: "This report displays the number of login activity outside of regular working hours. Login activity outside working hours could indicate unauthorized access or unusual activity. Analyzing this data helps security professionals identify potential security risks and take appropriate action.",
      bottom: "",
    },
    {
      sid: "EDR10001",
      type: "detailed",
      title: "Security Events: Alerts Report",
      description: "This report gives you a comprehensive overview of the total number of security events detected by your Wazuh system. It's a vital piece of information as it provides a snapshot of the overall security posture of your environment. Understanding the total number of security events helps you establish a baseline and track the progression of security incidents over time. This insight enables you to make informed decisions regarding your security strategies and resources allocation."
    },
    {
      sid: "EDR10002",
      type: "detailed",
      title: "File Integrity Monitoring: FIM Report",
      description: "This report provides insights into the file integrity monitoring (FIM) activities within your environment. It tracks the number of files that have been modified, added, or deleted at a specific path. This information helps you identify any suspicious file changes that may indicate potential security threats. By analyzing this report, you can proactively address potential security incidents, enhance file integrity monitoring, and ensure the integrity of your system."
    },
    {
      sid: "EDR10003",
      type: "detailed",
      title: "Vulnerabilities: CVE Report",
      description: "This report provides a detailed overview of the number of vulnerabilities detected based on CVE (Common Vulnerabilities and Exposures) IDs. CVE is a dictionary of publicly known information about different security vulnerabilities and risks. Analyzing this data helps security professionals understand the potential risks and threats associated with the vulnerabilities detected on monitored agents. It provides valuable insights into the security posture of monitored agents and helps prioritize remediation efforts.",
    },
    {
      sid: "EDR10004",
      type: "detailed",
      title: "Indicators of Compromise: IoC Report",
      description: "This report provides insights into the number of detected Indicators of Compromise (IoCs) across your monitored agents. IoCs are artifacts used to identify and detect potential security threats. Keeping track of the number of detected IoCs can help security professionals understand the scope and nature of potential threats. Analyzing this data helps security professionals understand the potential security risks and prioritize remediation efforts."
    },
    {
      sid: "EDR10005",
      type: "detailed",
      title: "PCI DSS Compliance of Agents",
      description: "This report provides insights into the overall PCI DSS compliance posture of your monitored agents. PCI DSS (Payment Card Industry Data Security Standard) is a set of security standards that organizations should follow to protect cardholder data. A higher number of non-compliant agents indicates increased security risks and necessitates immediate attention to address potential vulnerabilities. Analyzing this data helps security professionals understand the compliance status of monitored agents and prioritize remediation efforts."
    },
    {
      sid: "EDR10006",
      type: "detailed",
      title: "Security Events: Authentication Failures",
      description: "This report provides insights into the overall PCI DSS compliance posture of your monitored agents. PCI DSS (Payment Card Industry Data Security Standard) is a set of security standards that organizations should follow to protect cardholder data. A higher number of non-compliant agents indicates increased security risks and necessitates immediate attention to address potential vulnerabilities. Analyzing this data helps security professionals understand the compliance status of monitored agents and prioritize remediation efforts."
    },
    {
      sid: "EDR10007",
      type: "detailed",
      title: "Login Activity Outside Working Hours",
      description: "This report displays the number of login activity outside of regular working hours. Login activity outside working hours could indicate unauthorized access or unusual activity. Analyzing this data helps security professionals identify potential security risks and take appropriate action."
    }
];