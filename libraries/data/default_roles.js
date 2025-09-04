module.exports = [
  {
    name: "Super Admin",
    permissions: "admin",
    level: 0,
    protected: true
  },
  {
    name: "Admin",
    permissions: "view,report,syslog,control,createUser,deleteUser,blockUser,manageUser,modifyUser,createAsset,modifyAsset,deleteAsset,createTicket,modifyTicket,manageRole,createRole",
    level: 0,
    protected: true
  },
  {
    name: "User",
    permissions: "view",
    level: 0,
    protected: true
  },
  {
    name: "Asset Manager",
    permissions: "view,report,syslog,createAsset,modifyAsset,deleteAsset",
    level: 1
  },
  {
    name: "Incident Commander",
    permissions: "view,report,syslog,createTicket,modifyTicket",
    level: 1
  },
  {
    name: "Observer",
    permissions: "view,syslog",
    level: 1
  },
  {
    name: "Malware Analyzer",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Network Admin",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Database Admin",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Advertise Admin",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Email Admin",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Domain Admin",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Web Master",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "Server Admin",
    permissions: "view,report,syslog",
    level: 1
  },
  {
    name: "CISO",
    permissions: "view,report,syslog",
    level: 2
  },
  {
    name: "CTO",
    permissions: "view,report,syslog",
    level: 2
  },
  {
    name: "CIO",
    permissions: "view,report,syslog",
    level: 2
  },
  {
    name: "HoIT",
    permissions: "view,report,syslog",
    level: 2
  }
]