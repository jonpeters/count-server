var express = require('express');
var router = express.Router();
let mongo = require('mongodb');
let mongoClient = mongo.MongoClient;
let mongoUrl = "mongodb://localhost:27017/count";
let categoriesCollectionName = "categories";
let instantsCollectionName = "instants";

/**
 * retrieve all categories in the system
 */

router.get('/categories', handleGetCategories);

async function handleGetCategories(req, res, next) {
    let db = await mongoClient.connect(mongoUrl);
    let items = await db.collection(categoriesCollectionName).find({}).toArray();
    res.send(items);
}

/**
 * create a new category
 */

router.post('/category', handlePostCategory);

async function handlePostCategory(req, res, next) {
    let db = await mongoClient.connect(mongoUrl);
    let categoriesCollection = await db.collection(categoriesCollectionName);
    let result = await categoriesCollection.insertOne(req.body);
    res.send(result.ops[0]);
}

/**
 * delete existing categories. this is done using POST because the endpoint
 * supports multi-delete as opposed to requiring the client to
 * initiate many delete requests and express seems to choke on
 * a DELETE request that contains a body
 */

router.post('/categories', handleDeleteCategories);

async function handleDeleteCategories(req, res, next) {

    // need to map string IDs back to mongo types
    let categoryIdsAsMongoDbObjectIds = req.body.map(id => mongo.ObjectId(id));

    let db = await mongoClient.connect(mongoUrl);
    let categoriesCollection = await db.collection(categoriesCollectionName);

    let result = await categoriesCollection.deleteMany({ _id: {
        $in: categoryIdsAsMongoDbObjectIds
    }});

    res.send(result);
}

/**
 * increment count value
 */

router.post('/increment-category-count/:id', handleIncrementCategoryCount);

async function handleIncrementCategoryCount(req, res, next) {
    let categoryIdAsMongoDbObjectId = mongo.ObjectId(req.params.id);
    let db = await mongoClient.connect(mongoUrl);
    let categoriesCollection = await db.collection(categoriesCollectionName);

    // increment the category's count
    let result = await categoriesCollection.findOneAndUpdate(
        { _id: categoryIdAsMongoDbObjectId },
        { $inc: { count: 1 }},
        { returnOriginal: false });

    let instantsCollection = await db.collection(instantsCollectionName);

    // add the actual instant
    instantsCollection.insertOne({
        category_id: categoryIdAsMongoDbObjectId,
        unix_timestamp: Date.now()
    });

    res.send(result.value);
}

/**
 * retrieve instants data
 */

router.get('/time-series', handleGetTimeseries);

async function handleGetTimeseries(req, res, next) {
    let oneHourInMs = 60*60*1000;

    let start = req.query.start;
    // truncate to hour
    start = start - (start % oneHourInMs);

    let end = req.query.end;
    // truncate to hour then add 1 hour
    end = end - (end % oneHourInMs) + oneHourInMs;

    let categoryIdAsMongoDbObjectId = mongo.ObjectId(req.query.category_id);

    let db = await mongoClient.connect(mongoUrl);
    let instantsCollection = await db.collection(instantsCollectionName);

    let cursor = await instantsCollection.find({ $and: [{ "category_id": categoryIdAsMongoDbObjectId }, { "unix_timestamp": { $gte: start }}, { "unix_timestamp": { $lt: end }} ] });

    // store count per hour, keyed by hour
    let hash = {};

    // perform in-memory aggregation
    while (await cursor.hasNext()) {
        let instantDoc = await cursor.next();
        // round to hour
        let value = instantDoc.unix_timestamp - (instantDoc.unix_timestamp % oneHourInMs);
        // add the hash key, if does not exist
        if (!hash[value]) hash[value] = 0;
        // increment
        hash[value]++;
    }

    let result = [];

    Object.keys(hash).forEach(key => result.push({ unix_timestamp: parseInt(key), value: hash[key] }));

    res.send(result);
}

module.exports = router;
