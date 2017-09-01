let mongo = require('mongodb');
let mongoClient = mongo.MongoClient;
let mongoUrl = "mongodb://localhost:27017/count";
let categoriesCollectionName = "categories";
let instantsCollectionName = "instants";

async function execute() {
    let db = await mongoClient.connect(mongoUrl);
    let categoriesCollection = await db.collection(categoriesCollectionName);
    let instantsCollection = await db.collection(instantsCollectionName);

    // add a category
    let result = await categoriesCollection.insertOne({"name": "Test Category", "count": 0});
    result = result.ops[0];

    let today = Date.now();
    today = today - (today % 60 * 60 * 1000);

    for (let i = 0; i < 12; i++) {
        for (let j = 0; j < i + 1; j++) {
            await instantsCollection.insertOne({
                "category_id": result._id,
                "unix_timestamp": today + (i * 60 * 60 * 1000)
            });
        }
    }

    console.log("start=" + today + "&end=" + (today+(24*60*60*1000)) + "&category_id=" + result._id);
    process.exit(-1);
}

execute();