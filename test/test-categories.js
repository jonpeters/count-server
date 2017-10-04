process.env.NODE_ENV = 'test';

var config = require('../config');
var mongo = require('mongodb');
var chai = require('chai');
var chaiHttp = require('chai-http');
var app = require('../app');
var should = chai.should();

chai.use(chaiHttp);

describe('Categories', () => {

    var db = null;
    var token = null;

    before((done) => {
        mongo.MongoClient.connect(config.mongoURI[app.settings.env], (err, resultDb) => {
            db = resultDb;
            db.collection("users").drop();

            chai.request(app)
                .post('/api/sign-up')
                .send({ username: "test", password: "test" })
                .end((err, res) => {
                    token = res.body.token;
                    done();
                });
        });
    });

    /**
     * TODO this is temporary just to ensure the token works
     */
    it('should pass', (done) => {
        chai.request(app)
            .get('/api/secure/categories')
            .set('x-access-token', token)
            .end((err, res) => {
                res.should.have.status(200);
                done();
            });
    });
});