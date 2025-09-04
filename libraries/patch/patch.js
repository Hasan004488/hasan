const { getDatabase, DB } = require("../database");

getDatabase().then(async database => {

  try {

    console.log("Removing asset index...");
    
    let action = await database.collection(DB.assets).dropIndex("ip_1_port_1");
    
    console.log(action);


  } catch (err) {

    console.log("Patch Error!");
    console.log(err);

  }

});