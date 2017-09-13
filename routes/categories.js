var express = require('express');
var expressJoi = require('express-joi');
var router = express.Router();
let mongo = require('mongodb');

let categoriesCollectionName = "categories";
let instantsCollectionName = "instants";

let _1_HOUR_IN_MS = 60*60*1000;
let _24_HOURS_IN_MS = 24*_1_HOUR_IN_MS;

var Joi = expressJoi.Joi;

/**
 * retrieve all categories in the system
 */

router.get('/categories', handleGetCategories);

async function handleGetCategories(req, res, next) {
    let db = req.app.db;
    let items = await db.collection(categoriesCollectionName).find({}).toArray();
    res.send(items);
}

/**
 * retrieve a specified category
 */

router.get('/category/:id', handleGetCategory);

async function handleGetCategory(req, res, next) {
    let categoryIdAsMongoDbObjectId = mongo.ObjectId(req.params.id);
    let db = req.app.db;
    let result = await db.collection(categoriesCollectionName).findOne({ _id: categoryIdAsMongoDbObjectId });
    res.send(result);
}

/**
 * create a new category
 */

router.post('/category', handlePostCategory);

async function handlePostCategory(req, res, next) {
    let db = req.app.db;
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

    let db = req.app.db;
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
    let db = req.app.db;
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

var getTimeSeriesSchema = {
    start: Joi.types.number().required(),
    end: Joi.types.number().required(),
    category_id: Joi.types.string().required(),
    groupBy: Joi.types.string().valid("hour", "day").required()
};

router.get('/time-series', expressJoi.joiValidate(getTimeSeriesSchema), handleGetTimeseries);

async function handleGetTimeseries(req, res, next) {
    let groupByLevel = req.query["groupBy"];
    let groupByValue = groupByLevel === "hour" ? _1_HOUR_IN_MS : _24_HOURS_IN_MS;

    let start = req.query["start"];

    // truncate to start of unit, e.g. when grouping by hour, it's more
    // correct to get all data for that entire hour, thus if 11:47:00
    // is provided as the start time, truncate it to 11:00:00
    start = start - (start % groupByValue);

    let end = req.query["end"];

    // truncate to start of unit then add 1 unit, e.g. again this gets
    // the full hour of data for the hour in which the end date falls
    end = end - (end % groupByValue) + groupByValue;

    let db = req.app.db;
    let instantsCollection = await db.collection(instantsCollectionName);

    // execute query via mongo aggregation framework
    let results = await instantsCollection.aggregate(getTimeSeriesQuery(groupByLevel, req.query["category_id"], start, end)).toArray();

    // map the component date returned by the query back to a single unix timestamp value
    results = results.map(r => {
       return {
           unix_timestamp: Date.UTC(r._id.year, r._id.month-1, r._id.day, (r._id.hour != null ? r._id.hour : 0), 0, 0),
           count: r.count
       };
    });

    res.send(results);
}

// ordered by increasing dependency; i.e. "month" is dependant on "year", "day" is dependent on "month" AND "year", etc.
let groupByDefinition = [ "year", "month", "day", "hour" ];

function getTimeSeriesQuery(groupByLevel, categoryId, start, end) {
    let match = {
        "$match": {
            "$and": [
                {
                    "category_id": mongo.ObjectId(categoryId)
                },
                {
                    "unix_timestamp": {
                        "$gte": start
                    }
                },
                {
                    "unix_timestamp": {
                        "$lt": end
                    }
                }
            ]
        }
    };

    let projectDate = {
        "$project": {
            "unix_timestamp": {
                "$add": [
                    new Date(0),
                    "$unix_timestamp"
                ]
            }
        }
    };

    let projectDateSplit = {
        $project: {
            "year": {
                "$year": "$unix_timestamp"
            },
            "month": {
                "$month": "$unix_timestamp"
            },
            "day": {
                "$dayOfMonth": "$unix_timestamp"
            },
            "hour": {
                "$hour": "$unix_timestamp"
            }
        }
    };

    let index = groupByDefinition.indexOf(groupByLevel);

    // since the grouping levels in the array are defined in order of increasing dependency
    // all grouping levels to the right of the selected grouping level can be removed
    // from the aggregation objects
    for (let i=index+1; i<groupByDefinition.length; i++) delete projectDateSplit.$project[groupByDefinition[i]];

    let groupBy = {
        "$group": {
            "_id": {
                "year": "$year",
                "month": "$month",
                "day": "$day",
                "hour": "$hour"
            },
            "count": {
                "$sum": 1
            }
        }
    };

    for (let i=index+1; i<groupByDefinition.length; i++) delete groupBy.$group._id[groupByDefinition[i]];

    let sort = {
        "$sort": {
            "_id.year": 1,
            "_id.month": 1,
            "_id.day": 1,
            "_id.hour": 1
        }
    };

    return [match, projectDate, projectDateSplit, groupBy, sort];
}

module.exports = router;
