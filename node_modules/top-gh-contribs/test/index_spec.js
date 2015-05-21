/*jshint expr:true */
var expect = require('chai').expect;
var nock = require('nock');
var rewire = require('rewire');

var topContribs = rewire('../index.js');

nock.disableNetConnect();

describe('top-gh-contribs', function () {
    it('retry delay should be an exponential backoff in milliseconds', function () {
        var retryDelay = topContribs.__get__('retryDelay');

        expect(retryDelay(0)).to.be.above(1000).and.below(2000);
        expect(retryDelay(1)).to.be.above(2000).and.below(3000);
        expect(retryDelay(2)).to.be.above(4000).and.below(5000);
        expect(retryDelay(3)).to.be.above(8000).and.below(9000);
        expect(retryDelay(4)).to.be.above(16000).and.below(17000);
    });

    describe('getReleaseDatePromise', function () {
        it('should return a date in seconds if releaseDate is passed in as milliseconds', function (done) {
            var ninetyDaysAgo = Date.now() - (1000 * 60 * 60 * 24 * 90);

            topContribs.getReleaseDatePromise(ninetyDaysAgo).then(function (result) {
                expect(result).to.equal(ninetyDaysAgo / 1000);

                done();
            }).catch(done);
        });

        it('should return 0 if not given a releaseDate or releaseTag', function (done) {
            topContribs.getReleaseDatePromise().then(function (result) {
                expect(result).to.equal(0);

                done();
            }).catch(done);
        });

        it('should return a value based on releaseDate if both releaseDate and releaseTag are passed in', function (done) {
            var ninetyDaysAgo = Date.now() - (1000 * 60 * 60 * 24 * 90);

            topContribs.getReleaseDatePromise(ninetyDaysAgo, 'v1.0.0').then(function (result) {
                expect(result).to.equal(ninetyDaysAgo / 1000);

                done();
            }).catch(done);
        });

        it('should make an API request to resolve the release tag', function (done) {
            after(function () {
                nock.cleanAll();
            });

            var repo = 'https://api.github.com/tryghost/ghost';
            var publishedAt = Date.parse('2015-01-12T19:46:50Z') / 1000;

            nock('https://api.github.com')
                .get('/tryghost/ghost/releases')
                .replyWithFile(200, __dirname + '/fixtures/releases.json');

            topContribs.getReleaseDatePromise(null, '0.5.8', repo).then(function (result) {
                expect(result).to.equal(publishedAt);

                done();
            }).catch(done).finally(function () {
                nock.cleanAll();
            });
        });

        it('should return a rejected promise if the release tag cannot be found', function (done) {
            after(function () {
                nock.cleanAll();
            });

            var repo = 'https://api.github.com/tryghost/ghost';

            nock('https://api.github.com')
                .get('/tryghost/ghost/releases')
                .replyWithFile(200, __dirname + '/fixtures/releases.json');

            topContribs.getReleaseDatePromise(null, '1.0.0', repo).then(function () {
                done(new Error('Expected getReleaseDatePromise to reject but it did not'));
            }).catch(function (err) {
                expect(err).to.be.an.instanceof(Error);

                done();
            });
        });
    });

    describe('getTopContributors', function () {
            var fixture = require(__dirname + '/fixtures/contributors.json');

        it('should return all contributors if release date is zero', function () {
            var result = topContribs.getTopContributors(0, fixture, fixture.length);

            expect(result.length).to.equal(fixture.length);
        });

        it('should return contributor objects with the correct properties', function () {
            var result = topContribs.getTopContributors(0, fixture, fixture.length);

            expect(result[3].commitCount).to.equal(197);
            expect(result[3].name).to.equal('jaswilli');
            expect(result[3].githubUrl).to.equal('https://github.com/jaswilli');
            expect(result[3].avatarUrl).to.equal('https://avatars.githubusercontent.com/u/214142?v=3');
        });

        it('should return the list of contributors sorted by number of contributions', function () {
            var result = topContribs.getTopContributors(0, fixture, fixture.length);

            expect(result[0].commitCount).to.be.above(result[1].commitCount);
            expect(result[1].commitCount).to.be.above(result[2].commitCount);
            expect(result[2].commitCount).to.be.above(result[3].commitCount);
            expect(result[3].commitCount).to.be.above(result[4].commitCount);
        });

        it('should not return more contributors than requested', function () {
            var result = topContribs.getTopContributors(0, fixture, 3);

            expect(result.length).to.equal(3);
        });

        it('should not return contributors with no commits in the requested date range', function () {
            // five days ago from when the fixture data was obtained
            var fiveDaysAgo = Date.now('2015-02-05') / 1000 - (60 * 60 * 24 * 5);

            var result = topContribs.getTopContributors(fiveDaysAgo, fixture, 20);

            expect(result.length).to.equal(2);
            expect(result[0].name).to.equal('jaswilli');
            expect(result[1].name).to.equal('PaulAdamDavis');
        });
    });

    describe('requestPromise', function () {
        var requestPromise = topContribs.__get__('requestPromise');

        afterEach(function () {
            nock.cleanAll();
        });

        it('should reject on a status code of >= 500', function (done) {
            nock('http://example.com')
                .get('/')
                .reply(500);

            requestPromise({url: 'http://example.com/'}).then(function () {
                done(new Error('expected requestPromise to reject but it did not'));
            }).catch(function (err) {
                expect(err).to.be.instanceof(Error);

                done();
            });
        });

        it('should reject on a status code of >= 400', function (done) {
            nock('http://example.com')
                .get('/')
                .reply(404);

            requestPromise({url: 'http://example.com/'}).then(function () {
                done(new Error('expected requestPromise to reject but it did not'));
            }).catch(function (err) {
                expect(err).to.be.an.instanceof(Error);

                done();
            });
        });

        it('should return the response body on a status code of 200', function (done) {
            nock('http://example.com')
                .get('/')
                .reply(200, {some: 'thing'});

            requestPromise({url: 'http://example.com/'}).then(function (response) {
                expect(response).to.exist;
                expect(response.some).to.exist;
                expect(response.some).to.equal('thing');

                done();
            }).catch(done);
        });

        it('should reject if status code is 202 and retry is not enabled', function (done) {
            nock('http://example.com')
                .get('/')
                .reply(202);

            requestPromise({url: 'http://example.com/'}).then(function () {
                done(new Error('expected requestPromise to reject but it did not'));
            }).catch(function (err) {
                expect(err).to.be.an.instanceof(Error);

                done();
            });
        });

        it('should retry if status code is 202 and retry is enabled', function (done) {
            this.timeout(5000);

            nock('http://example.com')
                .get('/')
                .reply(202)
                .get('/')
                .reply(200, {r: 'retry worked'});

            requestPromise({url: 'http://example.com/', retry: true}).then(function (response) {
                expect(response).to.exist;
                expect(response.r).to.exist;
                expect(response.r).to.equal('retry worked');

                done();
            }).catch(done);
        });
    });
});
