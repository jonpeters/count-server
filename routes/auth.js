let express = require('express');
let bcrypt = require('bcrypt-nodejs');
let jwt = require('jsonwebtoken');

// TODO verify that this creates a new router instance and that installing middleware to it only
// affects this instance
let router = express.Router();

router.post("/", handleAuthenticate);

async function handleAuthenticate(req, res) {
    let db = req.app.get("db");
    let username = req.body.username;
    let password = req.body.password;

    // TODO add index to username collection
    let user = await db.collection("users").findOne({ username: username });

    if (!user) {
        res.json({
            success: false,
            message: 'Authentication failed. User not found.'
        });

        return;
    }

    bcrypt.compare(password, user.password, function(err, result) {
        if (result) {
            var token = jwt.sign(user, req.app.get('secret'), {
                // 24 hours
                expiresIn: 24*60*60
            });

            res.json({
                success: true,
                token: token
            });
        } else {
            res.json({
                success: false,
                message: 'Authentication failed. Wrong password.'
            });
        }
    });
}

module.exports = router;