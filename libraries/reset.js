const { resetConfig } = require("./getConfig");

resetConfig(err => {

  if (!err) {

    console.log("EITIx reset successful!");

    setTimeout(() => {

      console.log("Closing...");
      process.exit(0);

    }, 1000);

  } else {

    console.log("EITIx failed to reset configuration file!");
    console.error(err);

    setTimeout(() => {

      console.log("Closing...");
      process.exit(0);

    }, 1000);
    
  }
});