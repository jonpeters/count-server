var express = require('express');
var router = express.Router();
let mongo = require('mongodb');
let mongoClient = mongo.MongoClient;
let mongoUrl = "mongodb://localhost:27017/count";
let categoriesCollectionName = "categories";

/**
 * GET all categories in the system
 */

router.get('/categories', handleGetCategories);

async function handleGetCategories(req, res, next) {
    let db = await mongoClient.connect(mongoUrl);
    let items = await db.collection(categoriesCollectionName).find({}).toArray();
    res.send(items);
}

/**
 * POST a new category
 */

router.post('/category', handlePostCategory);

async function handlePostCategory(req, res, next) {
    let db = await mongoClient.connect(mongoUrl);
    let categoriesCollection = await db.collection(categoriesCollectionName);
    let result = await categoriesCollection.insert(req.body);
    res.send(result.ops[0]);
}

module.exports = router;
