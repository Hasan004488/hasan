// modules
require("dotenv").config();
const express = require("express");
const fs = require('fs'); // Required for file system operations (download/delete)
const app = express.Router();
const { scanDarkweb } = require("../workers/tools/scan-darkweb");

// --- Core App Libraries ---
const {
  getDatabase,
  DB,
} = require("../libraries/database");
const { generateDarkWebPdf } = require('../libraries/darkweb-reporter');
const { getMongoQuery } = require("../libraries/globals");

// --- Routes ---

// GET /darkWeb - Renders the main dashboard page.
app.get("/darkWeb", (req, res, next) => {
  getDatabase().then(async database => {

    try {

      const darkweb_org = await database.collection(DB.eitix).findOne({ title: "darkweb_org" });
      return res.render("pages/dashboard", {
        title: "Add-darkweb-organization",
        track: 'Darkweb',
        file: 'darkweb.ejs',
        asset: darkweb_org
      });

    } catch (error) {
      next(error);
    }

  }).catch(err => {

    next(err);

  });
});

// GET /darkWeb/details - Renders the detailed report page.
app.get("/darkWeb/details", (req, res, next) => {
  getDatabase().then(async database => {

    const data = await database.collection(DB.eitix).findOne({ title: "darkweb_org" });
    if (!data) {

      req.flash("error", "No organization found to generate a report.");
      return res.redirect('/dashboard/darkweb');

    }

    data.total_breaches = await database.collection(DB.dw_logs).countDocuments();
    data.total_resolved = await database.collection(DB.dw_logs).countDocuments({ manualStatus: "resolved" });
    data.total_false = await database.collection(DB.dw_logs).countDocuments({ manualStatus: "false-positive" });
    data.last_breach = await database.collection(DB.dw_logs).findOne({}, { sort: { createdAt: -1 } });

    return res.render("pages/dashboard", {
      title: "Monitor-darkweb",
      track: 'Darkweb',
      file: 'darkweb-details.ejs',
      data,
      table: {
        url: `/dashboard/darkWeb/details/logs/default`,
        query: {},
        dropdown: false,
        actions: true,
        view: "basic",
        headers: [
          { text: "Ingested At", width: "13%" },
          { text: "Breach ID", width: "14%", },
          { text: "Breached At", view: "basic" },
          { text: "Breached Account", view: "basic" },
          { text: "Status", view: "basic" },
          { text: "Leak Name", view: "source" },
          { text: "Source", view: "source" },
          { text: "DB Name", view: "source" },
          { text: "Found In", view: "source" },
          { text: "Domain", view: "security" },
          { text: "IP Address", view: "security" },
          { text: "Username", view: "security" },
          { text: "Password", view: "security" },
        ]
      }
    });

  }).catch(err => {

    return next(err);

  });
});

app.get("/darkweb/logs/data/raw", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        const data = await database.collection(DB.dw_logs).findOne({ breach_id: req.query.id });
        return res.send(data);

      } catch (err) {

        return res.send(false);

      }

    });

})

app.get("/darkWeb/details/logs/:org", (req, res, next) => {

  getDatabase()
    .then(async database => {

      try {

        let page = parseInt(req.query.page) || 1;
        let collection = DB.dw_logs;
        let org = req.params.org || "default";
        let view = req.query.view || "basic";

        let filter = getMongoQuery(req.query);

        if (req.query.count === "1") {

          const total_results = await database.collection(collection).countDocuments(filter);
          return res.json({ total: total_results });

        } else {

          let result = await database.collection(collection).find(filter).skip(page - 1).limit(1).sort({ _id: -1 }).toArray() || [];

          if (result.length > 0) {

            return res.render("components/table/darkweb-table-data", {
              no_layout: true, active: org,
              data: result, view
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

// POST /darkWeb/update-monitoring - Adds or updates the single monitored organization.
app.post("/darkWeb/update-monitoring", (req, res, next) => {
  getDatabase().then(async database => {

    const existingAsset = await database.collection(DB.eitix).findOne({ title: "darkweb_org" });

    const {
      organizationName, organizationDescription, searchType,
      domain, ip, username, phone, apiKey,
      primaryContactName, primaryContactEmail, primaryContactPhone, primaryContactAddress,
      secondaryContactName, secondaryContactEmail, secondaryContactPhone, secondaryContactAddress,
      tertiaryContactName, tertiaryContactEmail, tertiaryContactPhone, tertiaryContactAddress
    } = req.body;

    // --- NEW: Validation for Primary Contact Address ---
    if (!primaryContactAddress || primaryContactAddress.trim() === '') {
      req.flash("error", "Primary Contact Address is required.");
      return res.redirect(req.get("Referrer") || "/");
    }

    let searchValue = '';
    let apiFieldType = '';

    // Use a switch statement for clarity and to ensure correct API field types
    switch (searchType) {
      case 'domain':
        searchValue = domain;
        apiFieldType = 'domain';
        break;
      case 'ip':
        searchValue = ip;
        apiFieldType = 'ipAddress';
        break;
      case 'username':
        searchValue = username;
        apiFieldType = 'username';
        break;
      case 'phone':
        searchValue = phone;
        apiFieldType = 'phone';
        break;
      default:
        req.flash("error", "Invalid search type specified.");
        return res.redirect(req.get("Referrer") || "/");
    }

    if (!searchValue) {
      req.flash("error", "Search value is required.");
      return res.redirect(req.get("Referrer") || "/");
    }

    // Use existing API key if a new one isn't provided during an update
    const finalApiKey = apiKey || (existingAsset ? existingAsset.customApiKey : null);

    if (!finalApiKey) {
      req.flash("error", "API Key is required. Please provide your own key.");
      return res.redirect(req.get("Referrer") || "/");
    }

    const assetData = {
      organizationName, organizationDescription,
      searchType, searchValue,
      name: domain || null,
      ip: ip || null,
      username: username || null,
      phone: phone || null,
      customApiKey: finalApiKey, // Persist the API key
      contacts: {
        primary: { name: primaryContactName, email: primaryContactEmail, phone: primaryContactPhone, address: primaryContactAddress },
        secondary: { name: secondaryContactName, email: secondaryContactEmail, phone: secondaryContactPhone, address: secondaryContactAddress },
        tertiary: { name: tertiaryContactName, email: tertiaryContactEmail, phone: tertiaryContactPhone, address: tertiaryContactAddress },
      },
      lastUpdated: new Date(),
      updatedBy: req.session.email,
      updatedAt: new Date(),
      last_page: 0
    };

    // no_p = remove from here
    /* await scanDarkweb(database, {
      fieldType: apiFieldType,
      searchValue,
      userApiKey: finalApiKey
    }); */

    await database.collection(DB.eitix).updateOne(
      { title: "darkweb_org" },
      {
        $set: assetData,
        $setOnInsert: {
          createdAt: new Date(),
          createdBy: req.session.email
        }
      },
      { upsert: true }
    );

    res.redirect("/dashboard/darkWeb/details");

  }).catch(err => {

    next(err);

  });
});


// POST /darkWeb/update-breach-status - Updates the manual status of a specific breach.
app.post("/darkWeb/update-breach-status", (req, res) => {
  getDatabase().then(async database => {
    try {

      const { breachId, status } = req.body;
      const validStatuses = ['unresolved', 'resolved', 'false-positive'];

      if (!breachId || !status || !validStatuses.includes(status)) {
        return res.redirect(req.get("Refferer") || "/");
      }

      await database.collection(DB.dw_logs).updateOne({ breachId }, {
        $set: {
          manualStatus: status
        },
        $push: {
          statusUpdateHistory: {
            changedAt: new Date(),
            changedBy: req.session.email,
            status: status
          }
        }
      });

      req.flash("success", "Breach status updated successfully.");
      res.redirect(req.get("Refferer") || "/dashboard/darkWeb/details");

    } catch (err) {

      next(err);

    }

  }).catch(err => {

    next(err);

  });
});

app.post("/darkWeb/update-breach-status", (req, res) => {
  getDatabase().then(async database => {
    try {

      const { breachId, status } = req.body;
      const validStatuses = ['unresolved', 'resolved', 'false-positive'];

      if (!breachId || !status || !validStatuses.includes(status)) {
        return res.redirect(req.get("Refferer") || "/");
      }

      await database.collection(DB.dw_logs).updateOne({ breachId }, {
        $set: {
          manualStatus: status
        },
        $push: {
          statusUpdateHistory: {
            changedAt: new Date(),
            changedBy: req.session.email,
            status: status
          }
        }
      });

      req.flash("success", "Breach status updated successfully.");
      res.redirect(req.get("Refferer") || "/dashboard/darkWeb/details");

    } catch (err) {

      next(err);

    }

  }).catch(err => {

    next(err);

  });
});

// POST /darkWeb/delete-monitoring - Removes the monitored organization.
app.post("/darkWeb/delete-monitoring", (req, res) => {
  getDatabase().then(async database => {

    await database.collection(DB.eitix).deleteOne({ title: "darkweb_org" });
    res.redirect("/dashboard/darkWeb");

  }).catch(err => {
    next(err);
  });
});

// --- NEW ROUTE: POST /darkWeb/generate-report - Generates a PDF report.
app.post("/darkWeb/generate-report", (req, res) => {
  getDatabase().then(async database => {
    const domainData = await database.collection(DB.eitix).findOne({ title: "darkweb_org" });
    if (!domainData) {
      return res.redirect('/dashboard/darkWeb?error=No organization found to generate a report.');
    }

    // TODO: Replace 'System Admin' with the actual logged-in user from your session (e.g., req.user.full_name)
    const reporterName = req.session.full_name || 'System Admin';

    generateDarkWebPdf(domainData, reporterName, (filePath, error) => {
      if (error) {
        console.error("PDF generation failed:", error);
        return res.redirect('/dashboard/darkWeb/details?error=Failed to generate PDF report.');
      }

      // Send the file for download, then delete it from the server
      res.download(filePath, (err) => {
        if (err) {
          console.error("Error sending file to client:", err);
        }
        // Clean up the file from the './reports' directory after sending
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
            console.error("Error deleting report file:", unlinkErr);
          }
        });
      });
    });

  }).catch(err => {
    console.error("DB error during report generation:", err);
    res.redirect("/dashboard/darkWeb/details?error=A database error occurred.");
  });
});


module.exports = app;
