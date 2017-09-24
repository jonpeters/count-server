let jwt = require('jsonwebtoken');

module.exports = {
    returnSucessfulResponseWithToken: function(req, res, user) {
        var token = jwt.sign(user, req.app.get('secret'), {
            // 24 hours
            expiresIn: 24*60*60
        });

        res.json({
            success: true,
            token: token
        });
    }
};