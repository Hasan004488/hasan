// modules
require("dotenv").config()
const express = require("express");
const app = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
    DB, getDatabase
} = require("../libraries/database");
const {
    actLog
} = require("../libraries/globals");
const axios = require("axios");

const HASING_SALT = 9;
const PASS_MAX_LEN = 255;
const PASS_MIN_LEN = 8;

function safeRole(role) {

    if (!role || role === "undefined") {
        return "User";
    } else {
        return role;
    }

}

app.get("/login", (req, res, next) => {

    res.render("pages/auth/login", {title: "Login"});

});

app.post("/login", (req, res, next) => {
    
    getDatabase()
    .then(database => {

        try {

        const email = req.body.email || "";
        const password = req.body.password || "";

        database.collection(DB.users).findOne({ email: email })
        .then(async result => {
            
            if (result != null) {

                if (result.blocked == true) {
                    
                    // send error to the user
                    req.flash("error", "This user account is temporarily blocked");
                    actLog(`Someone tried to log into blocked account ${result.sid}`);
                    // go back to the previous page
                    return res.redirect(req.get('Referrer') || '/');

                }
    
                if (await bcrypt.compare(password, result.hash)) {
    
                    // successful user object
                    let user = {
                        email: email,
                        role: safeRole(result.role)
                    }
    
                    // `````````````````````````````
                    // signing login web token here
                    // _____________________________
                    let access_token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                            expiresIn: '1d'
                        }
                    );
    
                    // set the jwt token for later validation
                    req.session.token = access_token;

                    // log in status to the database
                    database.collection(DB.users).updateOne({ email: email }, { $set: {
                        logged_in: true,
                        browser: req.headers["user-agent"],
                        last_login: new Date()
                    } });
                    
                    // redirect to the dashboard
                    res.redirect("/dashboard");

                    // immediate logging
                    actLog(`User(${email}) logged into the system`);

                    // collect the location info safely
                    try {

                        let user_ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

                        let location = await axios.get(`http://208.95.112.1/json/${user_ip}`) || {};

                        if (location.data?.city) {

                            location_info = `${location.data.city}, ${location.data.country} (${location.data.query})`;
                            // send the log
                            actLog(`User(${email}) was logged in from ${location_info}`);
                        
                        }
                      
                    } catch (err) {

                      console.error("Failed to collect user location for", email);
                      
                    }
    
                } else {

                    // send error to the user
                    req.flash("error", "Email or Password was wrong!");
                    actLog(`User(${email}) tried to login with wrong password`);
                    // go back to the previous page
                    return res.redirect(req.get('Referrer') || '/');

                }
    
            } else {
    
                // send error to the user
                req.flash("error", "Email or Password was wrong!");
                actLog(`Someone tried to login with unknown email ${email}`);
                // go back to the previous page
                return res.redirect(req.get('Referrer') || '/');
    
            }
            
        })
        .catch(err => {
    
            // database error
            next(err)
    
        })} catch (err) {

            // internal server error
            next(err)
            
        }
    })

});

app.post("/password/update", (req, res, next) => {

    getDatabase()
    .then(async database => {

        try {

        const current = req.body.current;
        const password = req.body.password;
        const confirm = req.body.confirm;
        const user_email = req.session.email;

        if (password != confirm) {

            // send unusual activity log
            actLog(`User(${user_email}) was trying to change password without matching the password`);

            // send error to the user
            req.flash("error", "Password didn't match!");
            return res.redirect(req.get('Referrer') || '/');

        } else if (password.length > PASS_MAX_LEN || password.length < PASS_MIN_LEN) {

            // send unusual activity log
            actLog(`User(${user_email}) was trying to change password through bypasing the frontend validation. [Unusual Activity]`);

            // send error to the user
            req.flash("error", "Password length not valid!");
            // go back to the previous page
            return res.redirect(req.get('Referrer') || '/');
    
        } else {

            database.collection(DB.users).findOne({ email: user_email })
            .then(async result => {
                
              if (result != null) {
      
                  if (await bcrypt.compare(current, result.hash)) {

                      let new_pass = await bcrypt.hash(password, HASING_SALT);
      
                      database.collection(DB.users).updateOne({
                          email: user_email
                      },{
                          $set: {
                              updated: true,
                              hash: new_pass
                          }
                      })

                      // send the log
                      actLog(`User(${user_email}) successfully changed the previous password`);

                      // redirect to the dashboard
                      req.flash("info", "Password Successfully changed!");
                      res.redirect(req.get('Referrer') || '/');

                      actLog(`User(${user_email}) changed the previous password`);

                      try {

                        let user_ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                        let location = await axios.get(`http://208.95.112.1/json/${user_ip}`) || {};
                        let location_info = `- From ${location.data.city}, ${location.data.country} (${location.data.query})`;
  
                        if (location.data?.city) {
  
                            location_info = `- From ${location.data.city}, ${location.data.country} (${location.data.query})`;

                            actLog(`User(${user_email}) changed the previous password ${location_info}`);
  
                        } else location_info = "";

                      } catch (err) {

                        console.error("Failed to collect user location for", user_email);
                        
                      }
      
                  } else {

                      // send the log
                      actLog(`User(${user_email}) tried to change password with wrong current password`);

                      // send error to the user
                      req.flash("error", "Password didn't match");
                      // go back to the previous page
                      return res.redirect(req.get('Referrer') || '/');

                  }
      
              } else {
      
                  // send error to the user
                  req.flash("error", "There's no user found. Please re-configure EITIx.");
                  // go back to the previous page
                  return res.redirect(req.get('Referrer') || '/');
      
              }
              
            })
            .catch(err => {
        
                // database error
                next(err);
        
            })

        }} catch(err) {

            // server error
            next(err);

        }

    })

});

app.post("/password/update/user", (req, res, next) => {

  getDatabase()
  .then(async database => {

      try {

      const user_id = req.body.id;
      const password = req.body.password;
      const user_email = req.session.email;

      if (password.length > PASS_MAX_LEN || password.length < PASS_MIN_LEN) {

          // send unusual activity log
          actLog(`User(${user_email}) was trying to change password through bypasing the frontend validation. [Unusual Activity]`);

          // send error to the user
          req.flash("error", "Password length not valid!");
          // go back to the previous page
          return res.redirect(req.get('Referrer') || '/');
  
      } else {

          database.collection(DB.users).findOne({ sid: user_id })
          .then(async result => {
              
            if (result != null) {
    
              let new_pass = await bcrypt.hash(password, HASING_SALT);
    
              database.collection(DB.users).updateOne({
                  _id: result._id
              },{
                  $set: {
                      updated: true,
                      hash: new_pass
                  }
              })

              // redirect to the dashboard
              req.flash("info", "Password Successfully changed!");
              res.redirect(req.get('Referrer') || '/');
    
            } else {
    
                // send error to the user
                req.flash("error", "There's no user found. Please re-configure EITIx.");
                // go back to the previous page
                return res.redirect(req.get('Referrer') || '/');
    
            }
            
          })
          .catch(err => {
      
              // database error
              next(err);
      
          })

      }} catch(err) {

          // server error
          next(err);

      }

  })

});

app.get("/check", (req, res, next) => {

    getDatabase()
    .then(async database => {

        try {

            let user_email = req.session.email;

            let user = await database.collection(DB.users).findOne({ email: user_email });

            res.send(user);

        } catch(err) {
            
        }

    })

});

app.get("/logout", (req, res, next) => {

    getDatabase().then(database => {

        try {

            // logout from the database
            database.collection(DB.users).updateOne({ email: req.session.email }, { $set: {
                logged_in: false,
            } }).then(() => {

                // destroy the session properly
                req.flash("info", "You're successfully logged out from EITIx!");
                req.session = null;
        
                return res.redirect("/auth/login");
                
            })
            
        } catch (err) {
    
            next(err);
            
        }

    })
    
});

module.exports = app;