let express = require('express');
let bcrypt = require('bcrypt-nodejs');
let common = require('./common');

// TODO verify that this creates a new router instance and that installing middleware to it only
// affects this instance
let router = express.Router();

router.post("/", handleAuthenticate);

const authenticationFailureMessage = "Username/password combination is not valid.";

async function handleAuthenticate(req, res) {
    let db = req.app.get("db");
    let username = req.body.username;
    let password = req.body.password;

    // TODO add index to username collection
    let user = await db.collection("users").findOne({ username: username });

    if (!user) {
        res.json({
            success: false,
            message: authenticationFailureMessage
        });

        return;
    }

    bcrypt.compare(password, user.password, function(err, result) {
        if (result) {
            common.returnSucessfulResponseWithToken(req, res, user);
        } else {
            res.json({
                success: false,
                message: authenticationFailureMessage
            });
        }
    });
}

module.exports = router;