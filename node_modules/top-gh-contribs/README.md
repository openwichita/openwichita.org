top-gh-contribs
===============

A simple tool for grabbing the top contributors for a repo from github, with some convenient options.

Usage
----------------------

```
npm install top-gh-contribs
```

Returns a promise for an array of contributors with the following attributes

* `name` *The contributor's github username*
* `githubUrl` *The contributors github profile url*
* `avatarUrl` *The contributor's github avatar image url*
* `commitCount` *The number of commits the contributor has since the specified release*

```js
var topGithubContributors = require('top-gh-contribs');

var options = {
    user: 'tryghost',
    repo: 'ghost',
    releaseDate: Date.now() - 1000*60*60*24*90, //within the last 90 days
    count: 20
};

topGithubContributors(options).then(function (contributors) {
    /* Do stuff with contributors*/
});
```

### Options

* `user` **required**
* `repo` **required**
    If you're looking for contributors to `tryghost/ghost`, then your `user` is `"tryghost"` and `repo` is `"ghost"`.
* `oauthKey` ::
    If a GitHub oauth key is provided it will be used when making requests against the API.
* `releaseTag` ::
    A release tag. If provided, top-gh-contribs will pull down your list of releases from github and look for the date of the matching release.
* `releaseDate` ::
    A date, in milliseconds (ala `Date.now()`) from which to count releases. Takes precedence over `releaseTag`

    If neither `releaseTag` nor `releaseDate` is provided, all commits in the last year will be counted.
* `count`
    The number of contributors to return. If not specified, all contributors will be returned.
* `retry`
    Default `false`.  If `true`, the request will be retried in the event GitHub returns a status of 202
    (retry momentarily).
