let express = require('express');
let bcrypt = require('bcrypt-nodejs');
let jwt = require('jsonwebtoken');
let common = require('./common');

let router = express.Router();

router.post("/", handleSignUp);

async function handleSignUp(req, res) {
    let db = req.app.get("db");
    let username = req.body.username;
    let password = req.body.password;

    // TODO add index to username collection
    let user = await db.collection("users").findOne({ username: username });

    if (user) {
        res.json({
            success: false,
            message: 'Sign up failed. Username already exists.'
        });

        return;
    }

    var result = await db.collection("users").insertOne({ username: username, password: bcrypt.hashSync(password) });
    user = result.ops[0];

    common.returnSucessfulResponseWithToken(req, res, user);
}

module.exports = router;