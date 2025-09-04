// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const bcrypt = require("bcrypt");
const ObjectId = require('mongodb').ObjectId;
const {
  DB, getDatabase, CREDENTIALS, MongoCRUD
} = require("../libraries/database");
const {
  ACCESS_LIST,
  permit,
  safeRole,
  actLog,
  EITIX,
  access,
  getMongoQuery
} = require("../libraries/globals");
const { UPLOADER } = require("../libraries/uploader");

const QUERY_LIMIT = EITIX.query_limit;
const MAX_USER_ADD = 200;
const TEXT_MAX_LEN = 100;
const PASS_MAX_LEN = 255;
const HASING_SALT = 9;

app.get("/users/manage", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let active = req.query.role || "user";
        let roles = await database.collection(DB.roles).find({}).sort({ name: 1 }).toArray()
        let selected_role = roles.find(obj => obj.name == active) ?? [];

        return res.render("pages/dashboard", {
          title: "User-Management",
          track: "Users",
          file: "user-management",
          active, roles, selected_role,
          table: {
            url: `/dashboard/users/manage/data/user`,
            query: {},
            dropdown: false,
            actions: true,
            headers: [
              { text: "User ID" },
              { text: "User Account" },
              { text: "Role" },
              { text: "Online Status", class: "text-center" },
              { text: "Enable Status", class: "text-center" }
            ]
          }
        });

      } catch (err) {
        // server error
        next(err)
      }

    })

});

app.get("/users/manage/data/:role", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let role = req.params.role || "user";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.users;

      let filter = getMongoQuery(req.query);

      if (role !== "user") {

        filter.role = role;

      }

      // ensure default user are not shown
      filter.default = { $ne: true };

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({ total: total_results });

      } else {

        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];
        let role_data = await database.collection(DB.roles).findOne({ name: result[0]?.role })

        if (result.length > 0) {

          return res.render("components/table/users-table-data", {
            no_layout: true,
            data: result,
            role: role_data,
            active: role
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

app.get("/users/manage/roles", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let active = req.query.role || "user";
      let roles = await database.collection(DB.roles).find({ name: { $ne: "Super Admin" } }).sort({ name: 1 }).toArray()
      let selected_role = roles.find(obj => obj.name == active) ?? roles[0];

      res.render("pages/dashboard", {
        track: "Users",
        title: "Role-Management",
        file: "role-management",
        roles, selected_role,
        access_list: ACCESS_LIST,
      });

    } catch (error) {

      next(error);

    }

  });

});

app.get("/users/manage/roles/:role", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let active = req.params.role || "user";
      let roles = await database.collection(DB.roles).find({ name: { $ne: "Super Admin" } }).sort({ name: 1 }).toArray()
      let selected_role = roles.find(obj => obj.name == active) ?? roles[0];

      res.render("components/update-roles", {
        no_layout: true,
        role: selected_role,
        default_pass: CREDENTIALS.default_user_pass,
        access_list: ACCESS_LIST,
      });

    } catch (error) {

      next(error);

    }

  });

});


app.get("/users/create", permit("createUser"), (req, res, next) => {

  getDatabase()
    .then(database => {

      let protected_filter = { protected: { $ne: true }, name: { $ne: "Super Admin" } };

      if (access("admin", req.session.permissions)) {

        // no filter if it's the super admin
        protected_filter = { name: { $ne: "Super Admin" } };

      }

      database.collection(DB.roles).find(protected_filter).sort({ name: 1 }).toArray()
        .then(async results => {

          let all_roles = results ?? [];

          data = {
            roles: all_roles
          }

          res.render("pages/dashboard", {
            title: "Create-User",
            file: "user-creation",
            track: "Users",
            default_pass: CREDENTIALS.default_user_pass,
            access_list: ACCESS_LIST
          });

        }).catch(err => {
          next(err)
        })

    })

});

app.post("/users/create", permit("createUser"), UPLOADER.profile.fields([
  { name: "profile_image" }
]), (req, res, next) => {

  try {

    let fname = req.body.full_name;
    let email = req.body.email;
    let password = req.body.password;
    let created_by = req.session.email;
    let date = new Date();

    if (req.body.email != email) {

      // send error to the user
      req.flash("error", "You can't use those characters in email!");
      // go back to the previous page
      return res.redirect(req.get('Referrer') || '/');

    }

    if (!fname || !email || !password) {

      // send error to the user
      req.flash("error", "Something is not defined as expected!");
      // go back to the previous page
      return res.redirect(req.get('Referrer') || '/');

    }
    else if (fname?.length > TEXT_MAX_LEN) {

      // send error to the user
      req.flash("error", "Fullname length exceeded!");
      // go back to the previous page
      return res.redirect(req.get('Referrer') || '/');

    }
    else if (!email.includes('@')) {

      // send error to the user
      req.flash("error", "Email is not valid!");
      // go back to the previous page
      return res.redirect(req.get('Referrer') || '/');

    }
    else if (email?.length > TEXT_MAX_LEN) {

      // send error to the user
      req.flash("error", "Email length exceeded!");
      // go back to the previous page
      return res.redirect(req.get('Referrer') || '/');

    }
    else if (password?.length > PASS_MAX_LEN) {

      // send error to the user
      req.flash("error", "Password length exceeded!");
      // go back to the previous page
      return res.redirect(req.get('Referrer') || '/');

    }
    else {

      getDatabase()
        .then(async database => {

          try {

            // hash encrypt the password
            const encrypted_pass = await bcrypt.hash(password, HASING_SALT);

            let user_data = req.body;

            user_data.hash = encrypted_pass;
            user_data.created = date;
            user_data.created_by = created_by;
            delete user_data.password;

            if (req.files?.profile_image) {

              req.body.profile_image = req.files.profile_image[0].filename

            }

            let user_count = await database.collection(DB.users).countDocuments({}) || 0;

            if (MAX_USER_ADD > user_count) {

              MongoCRUD.seqInsert(req, res, next, {

                prefix: "EU",
                collection: DB.users,
                data: user_data,
                success: "New EITIx User Created!",
                response: (success, err) => {
                  if (success) {

                    req.flash("success", "New EITIx User Created!");
                    actLog(`User(${req.session.email}) created a new user(${user_data.email})`);
                    return res.redirect("/dashboard/users/manage");

                  } else {

                    req.flash("error", "User may already exists or something went wrong!");
                    console.log(err);
                    return res.redirect(req.get('Referrer') || '/');

                  }
                }

              });

            } else {

              req.flash("error", `Maximum of user creation is reached! (${MAX_USER_ADD})`);
              req.flash("info", `Delete some users to create more.`);
              return res.redirect(req.get('Referrer') || '/');

            }

          } catch (err) {

            next(err);

          }

        })

    }
  } catch (err) {

    // internal server error
    next(err)
  }

})

app.get("/users/deleteable", (req, res, next) => {

  getDatabase()
    .then(async database => {

      if (!req.query.id) {

        return res.send({
          deletable: false,
          message: "User ID not given"
        })

      } else {

        let user_id = req.query.id;

        let user_involvement = await database.collection(DB.workf).find({
          users: { $elemMatch: { $regex: user_id } }
        }).toArray();

        if (user_involvement.length > 0) {

          return res.send({
            deletable: false,
            message: "User involved",
            involvement: user_involvement.map(x => x.sid)
          })

        } else {

          return res.send({
            deletable: true,
            message: "No user involvement"
          })

        }

      }

    })

})

app.get("/users/delete", (req, res, next) => {

  if (!req.query.id) {

    req.flash("error", "User ID not given")
    return res.redirect(req.get('Referrer') || '/')

  } else {

    getDatabase()
      .then(database => {

        let user_id = req.query.id;

        database.collection(DB.users).findOne({ sid: user_id })
          .then(results => {

            let user_created = results?.created_by ?? "";
            let user_deleting = req.session.email;
            let user_role = results?.role;

            if (user_role === "Admin") {

              if (!access("admin", req.session.permissions)) {

                req.flash("error", "You're not allowed to delete admin user");
                return res.redirect(req.get('Referrer') || '/');

              }

            }

            if (user_deleting === user_created || access("deleteUser", req.session.permissions) || access("control", req.session.permissions)) {

              database.collection(DB.users).deleteOne({ sid: user_id })
                .then(results => {

                  if (results?.deletedCount == 0) {

                    req.flash("error", "Couldn't access the user to delete");
                    return res.redirect(req.get('Referrer') || '/');

                  } else {

                    req.flash("success", "An user was deleted permanently")
                    actLog(`User(${req.session.email}) deleted an user with ID ${user_id}, who was created by the user(${user_created})`);
                    return res.redirect(req.get('Referrer') || '/');

                  }

                })
                .catch(err => {
                  next(err)
                })

            } else {

              req.flash("error", "You're not the creator nor have the permission to delete user")
              return res.redirect(req.get('Referrer') || '/');

            }

          })
          .catch(err => {
            next(err)
          })

      })

  }

})

app.get("/users/block", permit("blockUser"), (req, res, next) => {

  if (!req.query.id) {

    return res.status(403).send({ error: "User ID not given" });

  } else {

    getDatabase()
      .then(database => {

        let user_id = req.query.id;
        let type = req.query.type;
        let blocker = req.session.email;

        if (type == 'block') {

          database.collection(DB.users).updateOne({
            $and: [
              { protected: { $ne: true } },
              { sid: user_id }
            ]
          }, {
            $set: {
              blocked: true,
              blocker: blocker
            }
          })
            .then(results => {

              if (results?.modifiedCount > 0) {

                actLog(`User '${blocker}' temporarily blocked user with ID ${user_id}`);
                return res.send({ status: `User with ID ${user_id} was blocked` });

              } else {

                return res.status(400).send({ error: `Couldn't find or update the user with ID ${user_id}` });

              }

            })
            .catch(err => {
              next(err)
            })

        } else if (type == 'unblock') {

          database.collection(DB.users).updateOne({
            $and: [
              { protected: { $ne: true } },
              { sid: user_id }
            ]
          }, {
            $set: {
              blocked: false,
              blocker: ''
            }
          })
            .then(results => {

              if (results?.modifiedCount > 0) {

                actLog(`User '${req.session.email}' unblocked user with ID ${user_id}`);
                return res.send({ status: `User with ID ${user_id} was unblocked and ready to use` });

              } else {

                return res.status(400).send({ error: `Couldn't find or update the user with ID ${user_id}` });

              }

            })
            .catch(err => {
              next(err)
            })


        } else {

          return res.status(500).send({ error: "Something went wrong, can't block or unblock" });

        }

      })

  }

})

app.get("/users/edit", permit("modifyUser"), (req, res, next) => {

  if (!req.query.id) {

    req.flash("error", "User ID not given")
    return res.redirect(req.get('Referrer') || '/')

  } else {

    getDatabase()
      .then(async database => {

        let user_id = req.query.id;

        let protected_filter = { protected: { $ne: true }, name: { $ne: "Super Admin" } };

        if (access("admin", req.session.permissions)) {

          // no filter if it's the super admin
          protected_filter = { name: { $ne: "Super Admin" } };

        }

        let roles = await database.collection(DB.roles).find(protected_filter).sort({ name: 1 }).toArray() || [];

        database.collection(DB.users).findOne({ sid: user_id })
          .then(result => {

            // render data
            res.render("pages/dashboard", {
              title: "Edit-Profile-" + result.full_name,
              track: "Users",
              file: 'edit-user.ejs',
              data: result, roles
            });

          })
          .catch(err => {
            next(err)
          })

      })

  }

});

app.post("/users/edit", permit("modifyUser"), UPLOADER.profile.fields([
  { name: "profile_image" }
]), (req, res, next) => {

  if (!req.body.id) {

    req.flash("error", "User ID not given")
    return res.redirect(req.get('Referrer') || '/')

  } else {


    let user_id = req.body.id;
    delete req.body.id;

    if (req.files?.profile_image) {
      req.body.profile_image = req.files.profile_image[0].filename
    }

    MongoCRUD.update(req, res, next, {
      collection: DB.users,
      filter: { sid: user_id },
      data: {
        $set: req.body
      },
      success: "User information updated successfully"
    })

  }

});

app.get("/users/logout", (req, res, next) => {

  getDatabase().then(async database => {

    let user_id = req.query.id;

    await database.collection(DB.users).updateOne({ sid: user_id }, {
      $set: {

        logged_in: false

      }
    })

    return res.send({ status: "User was logged out forcefully" });

  })

})

app.get("/users/policy", permit("control"), (req, res, next) => {

  getDatabase()
    .then(database => {

      res.render("pages/dashboard", {
        title: "manage-policy",
        file: "manage-policy",
        track: "Users"
      });

    })

});

app.get("/roles/create", permit("createRole"), (req, res, next) => {

  getDatabase()
    .then(database => {

      res.render("pages/dashboard", {
        title: "Create-Role",
        file: "role-creation",
        track: "Users",
        access_list: ACCESS_LIST
      });

    })

});

app.post("/roles/create", permit("createRole"), (req, res, next) => {

  let name = req.body.name ?? "";
  let level = req.body.level ?? "";
  let permissions = "default";

  if (name == "" && req.body.name != name) {
    req.flash("error", "Role name is not allowed");
    return res.redirect(req.get('Referrer') || '/');
  }

  if (level == "" && req.body.level != level) {
    req.flash("error", "Level is not valid");
    return res.redirect(req.get('Referrer') || '/');
  }

  if (req.body.permissions) {

    if (typeof req.body.permissions === 'string') {

      permissions = req.body.permissions;

    } else {

      permissions = req.body.permissions.join(",");

    }

  }

  getDatabase()
    .then(database => {

      database.collection(DB.roles).insertOne({
        name: name,
        permissions: permissions,
        level: level,
        editable: true,
        protected: false
      })
        .then(results => {

          req.flash("success", `New role "${name}" has been created!`)
          actLog(`User(${req.session.email}) just created new role named "${name}"`);
          return res.redirect("/dashboard/users/manage");

        })
        .catch(err => {

          if (err.code == 11000) {

            // user duplicate error found
            req.flash("error", "A role with this name already exists!")
            return res.redirect(req.get('Referrer') || '/')

          } else {

            // some other error while inserting 
            next(err)

          }

        })

    })

})

app.post("/roles/update", permit("manageRole"), (req, res, next) => {

  let role = req.query.role;
  let name = req.body.name;
  let level = req.body.level;
  let permissions = req.body.permissions ? req.body.permissions.join(",") : "default";

  if (access("admin", req.session.permissions) || safeRole(role)) {

    getDatabase()
      .then(database => {

        database.collection(DB.roles).updateOne({
          name: role
        }, {
          $set: {
            name: name,
            permissions: permissions,
            level: level
          }
        }, { upsert: true })
          .then(results => {

            req.flash("success", `"${name}" role has been updated!`)
            actLog(`User(${req.session.email}) updated ${name} role`);
            return res.redirect(req.get('Referrer') || '/')

          })
          .catch(err => {

            next(err)

          })

      })

  } else {

    req.flash("error", "This role can't be updated")
    return res.redirect(req.get('Referrer') || '/')

  }

})

app.post("/roles/add", permit("manageRole"), (req, res, next) => {

  let role = req.query.role;
  let user_id = req.body.users ? ObjectId(req.body.users) : null;

  if (role && safeRole(role)) {

    getDatabase()
      .then(async database => {

        let target_user = await database.collection(DB.users).findOne({ _id: user_id }) || "";

        if (target_user.role == 'Admin') {

          // protected roles can't be moved to any role
          req.flash("error", "This user can't be added to any role")
          return res.redirect(req.get('Referrer') || '/')

        } else {

          // update by user_id
          database.collection(DB.users).updateOne({
            _id: user_id
          }, {
            $set: {
              role: role
            }
          })
            .then(results => {

              req.flash("success", `An user added successfully!`)
              actLog(`User(${req.session.email}) added an user to ${role} role`);
              return res.redirect(req.get('Referrer') || '/')

            })
            .catch(err => {
              next(err)
            })

        }
      })

  } else {

    req.flash("error", "EITIx couldn't add the user")
    return res.redirect(req.get('Referrer') || '/')

  }

})

app.get("/roles/remove", permit("manageRole"), (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let user_id = req.query.id ? ObjectId(req.query.id) : null;
        let from_role = req.query.from;

        if (!user_id || !from_role || !safeRole(from_role)) {

          return res.status(400).send({ error: "The request was not valid or you can't remove an user from this role!" })

        } else {

          // update by user_id
          database.collection(DB.users).updateOne({
            _id: user_id
          }, {
            $set: {
              // setting it to default user role
              role: "User"
            }
          })
            .then(results => {

              actLog(`User(${req.session.email}) removed an user from ${from_role} role`);
              return res.send({ status: "User removed successfully!" })

            })

        }

      } catch (error) {

        return res.status(500).send({ error })

      }

    });

})

app.get("/roles/delete", permit("createRole"), (req, res, next) => {

  let role = req.query.role;

  if (role && safeRole(role)) {

    getDatabase()
      .then(database => {

        database.collection(DB.users).find({ role: role }, { role: 1 }).toArray()
          .then(results => {

            if (results.length < 1) {

              // when there's no user in the role just delete the role
              database.collection(DB.roles).deleteOne({ name: role })
                .then(results => {

                  if (results?.deletedCount == 0) {

                    req.flash("error", "Couldn't access the role to delete");
                    return res.redirect(req.get('Referrer') || '/');

                  } else {

                    req.flash("success", `A role has been deleted!`)
                    actLog(`User(${req.session.email}) deleted ${role} role`);
                    return res.redirect("/dashboard/users/manage/roles")

                  }

                })
                .catch(err => {
                  next(err)
                })

            } else {

              let promises = [];

              results.forEach(user => {

                if (user._id) {

                  promises.push(
                    // search by user id
                    database.collection(DB.users).updateOne({
                      _id: ObjectId(user._id)
                    }, {
                      $set: {
                        role: "User"
                      }
                    })
                  )

                }

              })

              promises.push(
                database.collection(DB.roles).deleteOne({ name: role })
                  .then(results => {

                    if (results?.deletedCount == 0) {

                      req.flash("error", "Couldn't access the role to delete");
                      return res.redirect(req.get('Referrer') || '/');

                    } else {

                      req.flash("success", `A role has been deleted!`)
                      return res.redirect("/dashboard/users/manage")

                    }

                  })
              )

              Promise.all(promises).then(e => {

                req.flash("success", `Role Deleted successfully!`)
                actLog(`User(${req.session.email}) deleted ${role} role`);
                return res.redirect("/dashboard/users/manage")

              })

            }

          })
          .catch(err => {
            next(err)
          })

      })

  } else {

    req.flash("error", "This role can't be deleted")
    return res.redirect(req.get('Referrer') || '/')

  }

})


module.exports = app;