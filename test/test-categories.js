process.env.NODE_ENV = 'test';

var config = require('../config');
var mongo = require('mongodb');
var chai = require('chai');
var chaiHttp = require('chai-http');
var app = require('../app');
var should = chai.should();
var expect = chai.expect;

chai.use(chaiHttp);
chai.use(require('chai-like'));
chai.use(require('chai-things'));

const TOKEN = 'x-access-token';

function doCreateNewCategory(name, cb, done, token) {
    chai.request(app)
        .post('/api/secure/category')
        .send({ name: name })
        .set(TOKEN, token)
        .end((err, res) => {
            res.should.have.status(200);

            // retrieve the new category
            chai.request(app)
                .get('/api/secure/categories')
                .set(TOKEN, token)
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.an('array');
                    res.body.should.contain.something.like({ name: name, count: 0 });
                    cb(done, res);
                });
        });
}

describe('Categories', () => {

    var db = null;
    var token = null;

    before((done) => {
        mongo.MongoClient.connect(config.mongoURI[app.settings.env], (err, resultDb) => {
            db = resultDb;
            db.collection("users").drop();
            db.collection("categories").drop();
            db.collection("instants").drop();

            chai.request(app)
                .post('/api/sign-up')
                .send({ username: "test", password: "test" })
                .end((err, res) => {
                    token = res.body.token;
                    done();
                });
        });
    });

    it('should create a new category', (done) => {
       doCreateNewCategory("a_brand_new_test_category", (d) => d(), done, token);
    });

    it('should increment a category', (done) => {
        doCreateNewCategory("increment_test_category", (done, res) => {
            let category = res.body.filter(c => c.name == 'increment_test_category')[0];

            db.collection("categories")
                .find({ _id: mongo.ObjectId(category._id) })
                .toArray()
                .then(category => {
                    expect(category).to.contain.something.like({ count: 0 });
                })
                .then(() => {
                    chai.request(app)
                        .post('/api/secure/increment-category-count/' + category._id)
                        .set(TOKEN, token)
                        .end((err, res) => {
                            res.should.have.status(200);

                            db.collection("categories")
                                .find({ _id: mongo.ObjectId(category._id) })
                                .toArray()
                                .then(category => {
                                    expect(category).to.contain.something.like({ count: 1 });
                                })
                                .then(() => db.collection("instants").find({ category_id: mongo.ObjectId(category._id) }).toArray())
                                .then(instants => {
                                    expect(instants).to.have.lengthOf(1);
                                })
                                .then(done)
                                .catch(done);
                        });
                })
                .catch(done);
        }, done, token);
    });

});