// modules
require("dotenv").config();
const express = require("express");
const app = express.Router();
const { ObjectId } = require("mongodb");
const {
    DB, getDatabase, MongoCRUD
} = require("../libraries/database");
const {
    EITIX,
    getMongoQuery
} = require("../libraries/globals");

// email templates

app.get("/manage/:type", (req, res, next) => {

  getDatabase()
  .then(async database => {

      try {

        let type = req.params.type || "schedule";

        return res.render("pages/dashboard",{
          title: `${type}-templates`,
          track: "Templates",
          file: "templates/templates", type,
          table: {
            url: `/dashboard/templates/manage/data/${type}`,
            query: {},
            dropdown: false,
            actions: true,
            headers: [
              { text: "Template ID" },
              { text: "Title" },
              { text: "Added by" },
              { text: "Updated time" }
            ]
          }
        });

      } catch (err) {
          // server error
          next(err)
      }

  })

});

app.get("/manage/data/:type", (req, res, next) => {

  getDatabase().then(async database => {

    try {

      let type = req.params.type || "schedule";
      let page = parseInt(req.query.page) || 1;
      let collection = DB.temps;

      req.query.type = type;
      
      let filter = getMongoQuery(req.query);

      if (req.query.count === "1") {

        const total_results = await database.collection(collection).countDocuments(filter);
        return res.json({total: total_results});
  
      } else {
  
        let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];
  
        if (result.length > 0) {
      
          return res.render("components/table/template-table-data", {
            no_layout: true,
            data: result
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


app.post("/delete", (req, res, next) => {

  MongoCRUD.delete(req, res, next, {
      collection: DB.temps,
      filter: {
          _id: ObjectId(req.body.id)
      }
  });

})

app.get("/edit/:action", (req, res, next) => {

  getDatabase()
  .then(async database => {

    try {

      let action = req.params.action || "create";
      let { id, type } = req.query;
      let data = {};
      let page = {};

      if (action === "update") {

        // update template
        data = await database.collection(DB.temps).findOne({ _id: ObjectId(id) }) || {};

        if (!data) {

          req.flash("error", "Template not found");
          return res.redirect(req.get('Referrer') || '/');

        } else {

          page.title = `Update-${type}-template`;

        }

      } else {

        // create template

        if (type === "ticket") {

          // copy over the summary
          let sample_data = await database.collection(DB.temps).findOne({ sid: 'ETM10002' }) || {};
          data.summary = sample_data.summary;
          data.redirect = sample_data.redirect;
          data.section_a = sample_data.section_a;
          data.section_b = sample_data.section_b;

        } else if (type === "schedule") {

          let sample_data = await database.collection(DB.temps).findOne({ sid: 'ETM10001' }) || {};
          data.summary = sample_data.summary;
          data.section_a = sample_data.section_a;

        }

        page.title = `Create-${type}-template`;

      }

      if (type === "playbook") {

        // copy over the general or linked template for playbook creation
        if (!data.body) {

          let sid = 'EPT10000';

          if (data.template) sid = data.template;

          let general_data = await database.collection(DB.playb_temps).findOne({ sid }) || {};
          data.body = general_data.body;
          data.sms_text = general_data.sms_text;

        }

      }

      res.render("pages/dashboard", {
        ...page, data, type,
        track: "Templates",
        file: `templates/edit-${ data.type || type }-template`
      });
      
    } catch (err) {

      next(err);
      
    }

  })

})

app.post("/edit", (req, res, next) => {

  getDatabase()
  .then(() => {

      try {

          let edit = req.body.edit;
          let title = req.body.title;
          let id = req.body.id;

          req.body.date = new Date();

          if (edit == 'update') {

            delete req.body.edit;
            delete req.body.id;

            MongoCRUD.update(req, res, next, {
                collection: DB.temps,
                filter: {_id: ObjectId(id)},
                data: {
                    $set: req.body
                },
                success: `Template (${title}) updated successfully`,
                redirect: `/dashboard/templates/manage/${req.body.type}`
            });
              
          } else {

              delete req.body.edit;
              delete req.body.id;

              if (req.body.type !== "playbook") {

                // generate a random id to rule for collusion avoidance
                req.body.rule = "EDRULE" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

              }

              req.body.author = req.session.email;
              req.body.reporter_name = req.session.username;

              MongoCRUD.seqInsert(req, res, next, {
                prefix: "ETM",
                collection: DB.temps,
                data: req.body,
                redirect: `/dashboard/templates/manage/${req.body.type}`,
                success: `New template (${title}) created successfully`
              });

          }
                    
      } catch (err) {

          next(err);
          
      }

  })

})

app.get("/check/unique/:rule", (req, res, next) => {

  try {
    
    getDatabase().then(async database => {
      
      let value = req.params.rule;

      if (value) {

        let check = await database.collection(DB.temps).findOne({rule: value});

        return res.send({
          unique: check ? false : true
        });

      } else {

        return res.send({
          error: "Something went wrong"
        });

      }
      
    })
    
  } catch (err) {
   
    return res.send({
      error: err
    });

  }

});

module.exports = app;