var _ = require('lodash');
var request = require('request');
var Promise = require('bluebird');

function main(options) {
    options = options || {};
    var user = options.user;
    var repo = options.repo;
    var oauthKey = options.oauthKey;
    var releaseDate = options.releaseDate;
    var releaseTag = options.releaseTag;
    var count = options.count || Infinity;

    if (!(user && repo)) {
        throw new Error('Must specify both github user and repo.');
    }
    //Looks like we're good to go. Start making promises baby!
    var repoApiUrl = ['https://api.github.com/repos/', user, '/', repo].join('');

    var releaseDatePromise = getReleaseDatePromise(releaseDate, releaseTag, repoApiUrl, user, oauthKey);
    var contributorsPromise = requestPromise({
        url: repoApiUrl + '/stats/contributors',
        userAgent: user,
        oauthKey: oauthKey,
        retry: options.retry
    });

    return Promise.join(releaseDatePromise, contributorsPromise, count, getTopContributors);
}

function getReleaseDatePromise(releaseDate, releaseTag, repoApiUrl, user, oauthKey) {
    if (releaseDate) {
        //Divide by 1k to remove milliseconds to match GH datestamps
        return Promise.resolve(releaseDate / 1000);
    }
    // If neither releaseDate or releaseTag were specified
    // sum all commits since the beginning of time.
    if (!releaseTag) {
        return Promise.resolve(0); // All time!
    }

    return requestPromise({
        url: repoApiUrl + '/releases',
        userAgent: user,
        oauthKey: oauthKey
    }).then(function (releases) {
        var lastRelease = _.find(releases, function findLastRelease(release) {
            return release.tag_name === releaseTag;
        });

        if (!lastRelease) {
            return Promise.reject(new Error(releaseTag + ' not found in github releases\'s tags.'));
        }
        //Divide by 1k to remove milliseconds to match GH datestamps
        return Date.parse(lastRelease.published_at) / 1000;
    });
}

function getTopContributors(releaseDate, contributors, count) {
    contributors =  _.map(contributors, function (contributor) {
        var numCommitsSinceReleaseDate = _.reduce(contributor.weeks,
            function (commits, week) {
                if (week.w >= releaseDate) {
                    commits += week.c;
                }
                return commits;
            }, 0);

        return {
            commitCount: numCommitsSinceReleaseDate,
            name: contributor.author.login,
            githubUrl: contributor.author.html_url,
            avatarUrl: contributor.author.avatar_url
        };
    });
    //Get the top `count` contributors by commits
    return _.chain(contributors).filter(function (c) {
        return c.commitCount > 0;
    }).sortBy('commitCount')
      .reverse()
      .slice(0, count)
      .value();
}

/*
 * @param {Object} options
 * @param {string} url - the url to request
 * @param {string} [userAgent]
 * @param {string} [oauthKey] - a GitHub oauth key with access to the repository being queried
 * @param {boolean} [retry] - retry on status code 202
 * @param {number} [retryCount]
 */
function requestPromise(options) {
    options = options || {};
    var headers = {'User-Agent': options.userAgent || 'request'};

    if (options.oauthKey) {
        headers.Authorization = 'token ' + options.oauthKey;
    }

    return new Promise(function (resolve, reject) {
        request({
            url: options.url,
            json: true,
            headers: headers
        }, function (error, response, body) {
            if (error) {
                return reject(error);
            }

            function decorateError(error) {
                if (!error) {
                    throw new Error('error is required.');
                }

                error.url = options.url;
                error.http_status = response.statusCode;
                error.ratelimit_limit = response.headers['x-ratelimit-limit'];
                error.ratelimit_remaining = response.headers['x-ratelimit-remaining'];
                error.ratelimit_reset = parseInt(response.headers['x-ratelimit-reset'], 10);

                return error;
            }

            if (response.statusCode >= 500) {
                return reject(decorateError(new Error('Server error on url ' + options.url)));
            }
            if (response.statusCode >= 400) {
                return reject(decorateError(new Error('Client error on url ' + options.url)));
            }
            if (response.statusCode === 202) {
                if (!options.retry || options.retryCount > 4) {
                    return reject(decorateError(new Error('API returned status 202. Try again in a few moments.')));
                }

                var retryCount = parseInt(options.retryCount, 10) || 0;

                var retryPromise = Promise.delay(retryDelay(retryCount)).then(function () {
                    return requestPromise({
                        url: options.url,
                        userAgent: options.userAgent || 'request',
                        oauthKey: options.oauthKey,
                        retry: true,
                        retryCount: retryCount + 1
                    });
                });

                return resolve(retryPromise);
            }

            return resolve(body);
        });
    });
}

function retryDelay(count) {
    return Math.floor((Math.pow(2, count) + Math.random()) * 1000);
}

main.getReleaseDatePromise = getReleaseDatePromise;
main.getTopContributors = getTopContributors;

module.exports = main;
