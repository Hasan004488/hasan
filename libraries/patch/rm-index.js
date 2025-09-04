const { getDatabase } = require("../database");
const readline = require("readline");

const args = process.argv.slice(2);
const [collection] = args;

if (collection) {

  getDatabase().then(async database => {

    try {

      const indexs = await database.collection(collection).listIndexes().toArray();
      const index_names = indexs.map(doc => doc.name);
      index_names.shift();

      console.log(`${collection} collection has ${index_names.length} extra indexes.`);

      index_names.forEach((index, idx) => {
        console.log(idx, index);
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      if (index_names.length > 0) {

        rl.question('Enter the number of the index to drop: ', (userInput) => {
  
          database.collection(collection).dropIndex(index_names[parseInt(userInput)]).then((result) => {
  
            console.log("Patch Result: ", result);
            process.exit(0);
  
          });
  
          rl.close();
  
        });

      } else {

        process.exit(0);

      }


    } catch (err) {

      console.log("Patch Error!");
      console.log(err);

    }

  });

} else {

  console.error("Invalid argument: /rm-index-patch collection");

}