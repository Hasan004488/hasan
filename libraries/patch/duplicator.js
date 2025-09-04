const { DB, getDatabase } = require("../database");

const repeat = 10;
const amount = 10000;

main();

async function main() {

  for (let i = 0; i < repeat; i++) {
    
    console.log("Data Insertion Step " + parseInt(i + 1));
    await sleep(2 * 1000);
    await duplicate();

  }

  process.exit(0);

}


async function duplicate() {

  await getDatabase().then(async database => {
    
    try {

      // collect old data
      const col1 = await database.collection(DB.wlog).find().project({_id: 0}).limit(amount).toArray();
      const col3 = await database.collection(DB.a_surface).find().project({_id: 0}).limit(amount).toArray();
      // insert them again
      await database.collection(DB.wlog).insertMany(col1);
      await database.collection(DB.a_surface).insertMany(col3);

      console.log("Data Insertion Success");
      
    } catch (error) {

      console.error(error);
      
    }

  })

}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}