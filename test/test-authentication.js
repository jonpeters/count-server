process.env.NODE_ENV = 'test';

var config = require('../config');
var mongo = require('mongodb');
var chai = require('chai');
var chaiHttp = require('chai-http');
var app = require('../app');
var should = chai.should();

chai.use(chaiHttp);

describe('Authentication', () => {

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

    it('should successfully authenticate', (done) => {
        chai.request(app)
            .post('/api/authenticate')
            .send({ username: "test", password: "test" })
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.property('success');
                res.body.success.should.equal(true);
                res.body.should.have.property('token');
                done();
            });
    });
});