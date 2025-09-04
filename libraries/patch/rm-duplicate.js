// remove duplicate from the database - patch

const { getDatabase } = require("../database");

const args = process.argv.slice(2);
const [collection, field] = args;

if (collection && field) {

  getDatabase()
    .then(async database => {

      try {

        const groups = await database.collection(collection).aggregate([
          {
            $group: {
              _id: "$" + field,
              docIds: { $addToSet: "$_id" },
              count: { $sum: 1 }
            }
          },
          {
            $match: {
              count: { $gt: 1 }
            }
          }
        ]);

        console.log("Patch removing duplicates from " + collection + "...");
        
        if (await groups.hasNext()) {

          groups.forEach((group) => {
  
            // Keep the first document
            group.docIds.shift();
            // Remove duplicates
            database.collection(collection).deleteMany({ _id: { $in: group.docIds } })
            .then(result => {
  
              console.log("Patch removed", result.deletedCount, "duplicates");
              process.exit(0);
  
            })
            .catch(err => {
    
              console.log("Patch Error!");
              console.error(err);
    
            });
    
          });
          
        } else {

          console.log("Patch found no duplicates in", collection);
          process.exit(0);

        }
        
      } catch (err) {

        console.log("Patch Error!");
        console.error(err);
        
      }

    })

} else {

  console.error("Invalid argument: /rm-dup-patch collection field");

}