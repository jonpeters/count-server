let mongo = require('mongodb');

let _1_HOUR_IN_MS = 60*60*1000;
let _24_HOURS_IN_MS = 24*_1_HOUR_IN_MS;

async function generate(db, numDays, userId, categoryId) {

    // get collection refs
    let categoriesCollection = await db.collection("categories");
    let instantsCollection = await db.collection("instants");

    // start with today, and work backwards
    let today = Date.now();
    let current = today - (today % _24_HOURS_IN_MS);
    let end = current - (numDays * _24_HOURS_IN_MS);

    while (current > end) {
        // add the work to the end of the queue
        setTimeout(((timestamp) => () => generateOneDay(timestamp, categoryId, userId, instantsCollection, categoriesCollection))(current), 0);
        current -= _24_HOURS_IN_MS;
    }
}

async function generateOneDay(unixTimestamp, categoryId, userId, instantsCollection, categoriesCollection) {
    let nextDay = unixTimestamp + _24_HOURS_IN_MS;

    // prevent data from being added in the "future"
    let hourOfExecution = Date.now();
    hourOfExecution -= (hourOfExecution % _1_HOUR_IN_MS);

    for (let i=unixTimestamp; i < nextDay && i < hourOfExecution; i+= _1_HOUR_IN_MS) {
        // generate between 0-5 instants / hour
        let numInstants = Math.floor(Math.random() * 6);

        if (numInstants == 0) {
            continue;
        }

        let instants = [];

        for (let j=0; j<numInstants; j++) {

            // create the instant object
            instants.push({
                category_id: mongo.ObjectId(categoryId),
                unix_timestamp: i,
                user_id: mongo.ObjectId(userId)
            });

        }

        await instantsCollection.insertMany(instants);

        // inc the de-normalized count field on in
        await categoriesCollection.findOneAndUpdate(
            { _id: mongo.ObjectId(categoryId) },
            { $inc: { count: numInstants }},
            { returnOriginal: false }
        );
    }
}

module.exports = {
    generate: generate
}