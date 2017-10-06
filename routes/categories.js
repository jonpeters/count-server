var express = require('express');
var router = express.Router();
let mongo = require('mongodb');
let secureRoute = require('./secure');
let moment = require("moment");
let util = require("./util");
let Joi = require('joi');
let expressJoi = require('express-joi-validator');

router.use(secureRoute);

let categoriesCollectionName = "categories";
let instantsCollectionName = "instants";

let _1_HOUR_IN_MS = 60*60*1000;
let _24_HOURS_IN_MS = 24*_1_HOUR_IN_MS;

/**
 * retrieve all instants for a category
 */

var getInstantsSchema = {
    query: {
        categoryId: Joi.string().required()
    }
};

router.get('/instants', expressJoi(getInstantsSchema), util.asyncErrorHandler(handleGetInstants));

async function handleGetInstants(req, res) {
    let db = req.app.get("db");

    let criteria = {
        category_id: mongo.ObjectId(req.query.categoryId),
        user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
    };

    // TODO support paging
    let instants = await db.collection(instantsCollectionName).find(criteria).toArray();

    res.send(instants);
}

/**
 * edit a category. as part of the edit, the client may pass an array of
 * instant ids to be deleted
 */

var editCategorySchema = {
    body: {
        instantIds: Joi.array().required(),
        categoryId: Joi.string().required(),
        categoryName: Joi.string().required()
    }
};

router.put('/category', expressJoi(editCategorySchema), util.asyncErrorHandler(handleEditCategory));

async function handleEditCategory(req, res) {
    let db = req.app.get("db");

    // instant ids to delete
    let instantIds = req.body.instantIds;

    // use the mongo-reported number of deleted records, in the off-chance that a user
    // tries to delete an instant that they do not own, to ensure that the updated
    // category count value is accurate/in-sync
    let deletedCount = 0;

    if (instantIds.length > 0) {
        let criteria = {
            $and: [
                {
                    _id: {
                        $in: instantIds.map(id => mongo.ObjectId(id))
                    }
                },
                {
                    user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
                }
            ]
        };

        // delete any provided instants
        let results = await db.collection(instantsCollectionName).removeMany(criteria);
        deletedCount = results.deletedCount;
    }

    let criteria = {
        _id: mongo.ObjectId(req.body.categoryId),
        user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
    };

    let updateOperation = {
        $set: {
            name: req.body.categoryName
        },
        $inc: {
            count: -1*deletedCount
        }
    };

    // update category name
    await db.collection(categoriesCollectionName).updateOne(criteria, updateOperation);

    res.send({});
}

/**
 * retrieve all categories in the system
 */

/**
 * NOTE no input validation required; gets all categories for user based on user token
 */

router.get('/categories', util.asyncErrorHandler(handleGetCategories));

async function handleGetCategories(req, res) {
    let db = req.app.get("db");

    let criteria = {
        user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
    };

    let items = await db.collection(categoriesCollectionName).find(criteria).toArray();
    res.send(items);
}

/**
 * retrieve a specified category
 */

var getCategorySchema = {
    params: {
        categoryId: Joi.string().required()
    }
};

router.get('/category/:categoryId', expressJoi(getCategorySchema), util.asyncErrorHandler(handleGetCategory));

async function handleGetCategory(req, res) {
    let db = req.app.get("db");

    let criteria = {
        _id: mongo.ObjectId(req.params.categoryId),
        user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
    };

    let result = await db.collection(categoriesCollectionName).findOne(criteria);

    res.send(result);
}

/**
 * create a new category
 */

var postCategorySchema = {
    body: {
        name: Joi.string().required()
    }
};

router.post('/category', expressJoi(postCategorySchema), util.asyncErrorHandler(handlePostCategory));

async function handlePostCategory(req, res) {
    let db = req.app.get("db");
    let categoriesCollection = await db.collection(categoriesCollectionName);

    // set the parent user reference
    let object = Object.assign({}, req.body, { user_id: mongo.ObjectId(req.tokenDecoded._id), count: 0 });

    // insert
    let result = await categoriesCollection.insertOne(object);

    // return the inserted record
    res.send(result.ops[0]);
}

/**
 * delete existing categories. this is done using POST because the endpoint
 * supports multi-delete as opposed to requiring the client to
 * initiate many delete requests and express seems to choke on
 * a DELETE request that contains a body
 */

var deleteCategoriesSchema = {
    body: Joi.array().items(Joi.string()).required()
};

router.post('/categories', expressJoi(deleteCategoriesSchema), util.asyncErrorHandler(handleDeleteCategories));

async function handleDeleteCategories(req, res) {
    let db = req.app.get("db");

    let instantsCollection = await db.collection(instantsCollectionName);

    // delete instants associated to categories being deleted
    let deleteInstantsCriteria = {
        $and: [
            {
                category_id: {
                    $in: req.body.map(id => mongo.ObjectId(id))
                }
            },
            {
                user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
            }
        ]
    };

    await instantsCollection.deleteMany(deleteInstantsCriteria);

    let categoriesCollection = await db.collection(categoriesCollectionName);

    // delete categories
    let deleteCategoriesCriteria = {
        $and: [
            {
                _id: {
                    $in: req.body.map(id => mongo.ObjectId(id))
                }
            },
            {
                user_id: mongo.ObjectId(req.tokenDecoded._id)   // allow access to only requesting user's data
            }
        ]
    };

    let result = await categoriesCollection.deleteMany(deleteCategoriesCriteria);

    res.send(result);
}

/**
 * increment count value
 */

var incrementCategoryCountSchema = {
    params: {
        categoryId: Joi.string().required()
    }
};

router.post('/increment-category-count/:categoryId', expressJoi(incrementCategoryCountSchema),
    util.asyncErrorHandler(handleIncrementCategoryCount));

async function handleIncrementCategoryCount(req, res) {
    let db = req.app.get("db");
    let categoriesCollection = await db.collection(categoriesCollectionName);

    let categoryId = mongo.ObjectId(req.params.categoryId);
    let userId = mongo.ObjectId(req.tokenDecoded._id);

    let criteria = {
        $and: [
            {
                _id: categoryId
            },
            {
                user_id: userId // allow access to only requesting user's data
            }
        ]
    };

    // increment the category's count
    let result = await categoriesCollection.findOneAndUpdate(
        criteria,
        { $inc: { count: 1 }},
        { returnOriginal: false });

    let instantsCollection = await db.collection(instantsCollectionName);

    // add the actual instant
    instantsCollection.insertOne({
        category_id: categoryId,
        unix_timestamp: Date.now(),
        user_id: userId     // allow access to only requesting user's data
    });

    res.send(result.value);
}

/**
 * retrieve instants data
 */

var getTimeSeriesSchema = {
    query: {
        start: Joi.number().required(),
        end: Joi.number().required(),
        categoryId: Joi.string().required(),
        groupBy: Joi.string().valid("hour", "day").required(),
        offset: Joi.number().required()
    }
};

router.get('/time-series', expressJoi(getTimeSeriesSchema), util.asyncErrorHandler(handleGetTimeseries));

async function handleGetTimeseries(req, res) {
    let groupByLevel = req.query.groupBy;
    let groupByValue = groupByLevel === "hour" ? _1_HOUR_IN_MS : _24_HOURS_IN_MS;
    let offset = req.query.offset * -1 * 60 * 1000;

    let start = req.query.start;

    // truncate to start of unit, e.g. when grouping by hour, it's more
    // correct to get all data for that entire hour, thus if 11:47:00
    // is provided as the start time, truncate it to 11:00:00
    start = start - (start % groupByValue);

    let end = req.query.end;

    // truncate to start of unit then add 1 unit, e.g. again this gets
    // the full hour of data for the hour in which the end date falls
    end = end - (end % groupByValue) + groupByValue;

    let db = req.app.get("db");
    let instantsCollection = await db.collection(instantsCollectionName);

    // execute query via mongo aggregation framework
    let timeSeriesQuery = getTimeSeriesQuery(groupByLevel, req.query.categoryId, req.tokenDecoded._id, start, end, offset);
    let results = await instantsCollection.aggregate(timeSeriesQuery).toArray();

    // map the component date returned by the query back to a single unix timestamp value
    results = results.map(r => {
       return {
           unix_timestamp: new Date(r._id.year, r._id.month-1, r._id.day, (r._id.hour != null ? r._id.hour : 0), 0, 0).getTime(),
           count: r.count
       };
    });

    res.send(results);
}

// ordered by increasing dependency; i.e. "month" is dependant on "year", "day" is dependent on "month" AND "year", etc.
let groupByDefinition = [ "year", "month", "day", "hour" ];

function getTimeSeriesQuery(groupByLevel, categoryId, userId, start, end, offset) {
    let match = {
        "$match": {
            "$and": [
                {
                    "category_id": mongo.ObjectId(categoryId)
                },
                {
                    "user_id": mongo.ObjectId(userId)   // allow access to only requesting user's data
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
                    new Date(offset),
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
