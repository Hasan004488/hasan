const watch_options = {
  followSymlinks: false,
  ignored: [
    "node_modules",
    "config.eitix",
    "logs",
    "tests",
    "assets",
    "logs",
    "reports",
    "backups",
    ".git",
    ".idea",
    ".vscode",
    "coverage"
  ]
}
const timezone = "Asia/Dhaka";
module.exports = {
  apps: [
    {
      name: "EITIx",
      script: "EITIx.js",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch_options,
      env: {
        TZ: timezone,
        NODE_ENV: "production",
        EITIX_VERSION: "2.8.5",
        PORT: "4000",
        SESSION_SECRET: "dae075512c36c6b9f10301a3a5eb862fab142c0936202a010a8fb9ab6f1c84ca1b23e39904c1f777c1de2d14aecd8d9c12d1378e99a92067654dfbdc2ef54039",
        ACCESS_TOKEN_SECRET: "c10c184bbc29fa677da750f6766001277ff1478ef23a136b98d771c00f9d0f73131580acc6f265f5d69323ff564d9804e806f0e8d5c2ef5f2d29b77338f14e2f",
        DATABASE_NAME: "eitix_dashboard",
        PARSER_LIMIT: "51mb",
        REDIS_CRED: "ERJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
      }
    },
    {
      name: 'EITIxQueue',
      script: 'EITIxQueue.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch_options,
      env: {
        TZ: timezone,
        DATABASE_NAME: "eitix_dashboard",
        REDIS_CRED: "ERJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
      }
    },
    {
      name: 'EITIxAI',
      version: "1.0.0",
      script: "gunicorn",
      args: 'EITIxAI:app -b 0.0.0.0:5304',
      cwd: './apps/EITIxAI',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch_options,
      env: {
        TZ: timezone,
        DATABASE_NAME: "eitix_dashboard"
      }
    }
  ]
}