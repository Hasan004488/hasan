const { getDatabase, DB } = require("./database");

analyzeDB();

async function analyzeDB() {
    try {
        const database = await getDatabase();
        const collections = await database.collections();
        for (const collection of collections) {
            const { indexDetails, wiredTiger, ...info } = await collection.stats();
            console.log(`${collection.collectionName}`, { count: info.count, size: (info.size / 1024 / 1024).toFixed(2) + " MB" });
        }
    } catch (error) {
        console.error("Error analyzing database:", error);
    }
}
