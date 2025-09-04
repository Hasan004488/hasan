// modules
require("dotenv").config();

const express = require("express");
const rateLimiter = require('express-rate-limit');
const ejs_layout = require("express-ejs-layouts");
const session = require("cookie-session");
const helmet = require("helmet");
const flash = require("express-flash");
const path = require("path");
const { EQ, getQueue } = require('./libraries/queue')

const {
    format,
    access
} = require("./libraries/globals");

// server main settings
const app = express();

// use helmet 
app.use(helmet({
    contentSecurityPolicy: false,
    referrerPolicy: {
        policy: 'same-origin'
    }
}));

// limit requests
app.use(rateLimiter({ 

    windowMs: 1 * 60 * 1000, // 1 minute
    max: process.env.NODE_ENV === 'development' ? 5000 : 1000, // max api calls
    message: 'Too many requests, please try again later.'

}));

// set view engine and directories
app.set("view engine", "ejs");
app.set('views', [
    path.join(__dirname, 'views'),
    path.join(__dirname, 'views/components')
]);

// use parser, layout, and static files
app.use(express.urlencoded({ limit: process.env.PARSER_LIMIT, extended: true }));
app.use(ejs_layout);
app.use(express.static(path.join(__dirname, '/public')));

// session object
app.use(session({

    name: 'session',
    secret: process.env.SESSION_SECRET,
    /* maxAge: 12 * 60 * 60 * 1000, // 12 hours max session time */
    resave: false,
    saveUninitialized: true,
    cookie: {
        sameSite: 'strict',
        secure: true
    }

}));

// global middleware
app.use((req, res, next) => {

    // set session variables (available from any middlewares through req.session)
    // local infomation (available from any ejs file through locals)
    res.locals.version = process.env.EITIX_VERSION;
    res.locals.format = format;
    res.locals.access = access;
    res.locals.session = req.session;

    // check for session
    if (!req.session) {
        return next('Session not found!') //handle error
    }

    // move to next middleware
    next();

});

// use flash messages
app.use(flash());

// Eitix Routes
const mother_router = require("./routers/mother");
app.use("/", mother_router);

// export express app
module.exports = app;