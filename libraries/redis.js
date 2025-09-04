require("dotenv").config();
const IORedis = require('ioredis');

// Create a Redis connection and export it
const connection = new IORedis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
  password: process.env.REDIS_CRED,
});

module.exports = connection;