var express = require('express');
require('dotenv').config();
const requestIp = require('request-ip');
const crypto = require('crypto');
var router = express.Router();

var mysql = require('mysql');

var connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_MAIN_DATABASE
});

connection.connect();

router.get('/coins', function(req, res, next) {
  connection.query('SELECT * FROM coins', function(err, rows, fields) {
    res.json(rows);
  });
});

router.get('/gpus', function(req, res, next) {
  connection.query('SELECT * FROM gpus', function(err, rows, fields) {
    res.json(rows);
  });
});

router.get('/settings', function(req, res, next) {
  const ip = requestIp.getClientIp(req);
  const ipHash = crypto.createHash('md5').update(ip).digest('hex');

  let query = 'SELECT s.*, IFNULL(SUM(rl.upvote), 0) AS upvotes, IFNULL(SUM(rl.downvote), 0) AS downvotes FROM settings s LEFT JOIN rating_log rl ON rl.setting = s.id';
  let queryParams = [];

  if (typeof req.query.coin !== 'undefined') {
    query = `${query} WHERE s.coin = ?`;
    queryParams = [req.query.coin];
  } else if (typeof req.query.id !== 'undefined') {
    query = `${query} WHERE s.id = ?`;
    queryParams = [req.query.id];
  }

  query = `${query} GROUP BY s.id`;

  connection.query(query, queryParams, function(err, settings, fields) {
    if (settings.length) {
      // enrich with vote information for current user
      connection.query('SELECT * FROM rating_log WHERE ipHash = ?', [ipHash], function(err, castedVotes, fields) {
        castedVotes.forEach(vote => {
          const forSetting = vote.setting;
          const votedSetting = settings.find(setting => setting.id === forSetting);
          if (votedSetting && vote.upvote) {
            votedSetting.votedUpByUser = true;
          } else if (votedSetting && vote.downvote) {
            votedSetting.votedDownByUser = true;
          }
        });
        res.json(settings);
      });
    } else {
      res.json([]);
    }
  });
});

router.post('/settings', function(req, res, next) {
  const body = req.body

  if (typeof body.title === 'undefined' || typeof body.coin === 'undefined' || typeof body.coreClock === 'undefined' ||
    typeof body.gpu === 'undefined' || typeof body.memClock === 'undefined' || typeof body.powerTarget === 'undefined' ||
    typeof body.voltage === 'undefined' || typeof body.hashrate === 'undefined' || typeof body.wattage === 'undefined'
  ) {
    res.json(false);
    return;
  }
  connection.query('INSERT INTO settings (title, coin, gpu, coreClock, memClock, powerTarget, voltage, hashrate, wattage) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [body.title, body.coin, body.gpu, body.coreClock, body.memClock, body.powerTarget, body.voltage, body.hashrate, body.wattage],
    function (error, results, fields) {
      error ? res.json(false) : res.json(true);
    });
});

router.post('/rate', async function(req, res, next) {
  const body = req.body;
  const ip = requestIp.getClientIp(req);
  const ipHash = crypto.createHash('md5').update(ip).digest('hex');

  const response = { error: false, message: '' };

  // query: Did the user already cast the same vote for the same setting?
  connection.query('SELECT * FROM rating_log WHERE ipHash = ? AND setting = ? AND upvote = ? AND downvote = ?',
    [ipHash, body.id, body.upvote ? 1 : 0, body.downvote ? 1 : 0],
    function (error, currentVoteResult) {
      if (error) {
        response.error = true;
        response.message = 'Something went wrong while requesting rating log!';
      }
      const alreadyVoted = currentVoteResult.length > 0;
      if (alreadyVoted) {
        response.error = true;
        response.message = 'You already casted this vote for this setting!';
        res.json(response);
      } else {
        // query: Did the user already cast another vote for the same setting?
        connection.query('SELECT * FROM rating_log WHERE ipHash = ? AND setting = ? AND upvote = ? AND downvote = ?',
        [ipHash, body.id, !body.upvote, !body.downvote],
        function (error, wouldBeVoteResult) {
          const voteChanged = wouldBeVoteResult.length > 0;
          if (voteChanged || !alreadyVoted) {
            deleteVoteFromLog(ipHash, body.id, !body.upvote, !body.downvote);
            logVote(ipHash, body.id, body.upvote, body.downvote);
            res.json(response);
          }
        });
      }
    }
  );
});

function logVote (ipHash, id, upvote, downvote) {
  connection.query('INSERT INTO rating_log VALUES(?, ?, ?, ?)', [ipHash, id, upvote ? 1 : 0, downvote ? 1 : 0]);
}

function deleteVoteFromLog (ipHash, id, upvote, downvote) {
  connection.query('DELETE FROM rating_log WHERE ipHash = ? AND setting = ? AND upvote = ? AND downvote = ?', [ipHash, id, upvote ? 1 : 0, downvote ? 1 : 0]);
}

module.exports = router;
