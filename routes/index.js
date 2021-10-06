var express = require('express');
const requestIp = require('request-ip');
const crypto = require('crypto');
var router = express.Router();

var mysql = require('mysql');
var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'miner_settings'
});

connection.connect();

/* GET home page. */
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

  let query = 'SELECT * FROM settings';
  let queryParams = [];

  if (typeof req.query.coin !== 'undefined') {
    query = 'SELECT * FROM settings WHERE coin = ?'
    queryParams = [req.query.coin]
  }
  console.log(req.query.coin)

  if (typeof req.query.id !== 'undefined') {
    query = 'SELECT * FROM settings WHERE id = ?'
    queryParams = [req.query.id]
  }

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
            votedSetting.votedDownByUser = true
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
  connection.query('INSERT INTO settings (title, coin, gpu, coreClock, memClock, powerTarget, voltage, hashrate, wattage) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [body.title, body.coin, body.gpu, body.coreClock, body.memClock, body.powerTarget, body.volate, body.hashrate, body.wattage],
    function (error, results, fields) {
      error ? res.json(false) : res.json(true);
    });
});

router.post('/rate', async function(req, res, next) {
  const body = req.body
  const ip = requestIp.getClientIp(req);
  const ipHash = crypto.createHash('md5').update(ip).digest('hex');

  const response = { error: false, message: '' }

  connection.query('SELECT * FROM rating_log WHERE ipHash = ? AND setting = ? AND upvote = ? AND downvote = ?',
    [ipHash, body.id, body.upvote ? 1 : 0, body.downvote ? 1 : 0],
    function (error, results, fields) {
      if (error) {
        response.error = true;
        response.message = 'Something went wrong while requesting rating log!';
      }
      if (results.length > 0) {
        response.error = true;
        response.message = 'You already casted this vote for this setting!'
        res.json(response);
      } else {
        connection.query('SELECT * FROM rating_log WHERE ipHash = ? AND setting = ? AND upvote = ? AND downvote = ?',
        [ipHash, body.id, !body.upvote, !body.downvote],
        function (error, results, fields) {
          const voteChanged = results.length > 0;
          if (voteChanged && body.upvote) {
            connection.query('UPDATE miner_settings.settings SET downvotes = downvotes - 1 WHERE id = ?', [body.id]);
            deleteVoteFromLog(ipHash, body.id, !body.upvote, !body.downvote);
          } else if (voteChanged && body.downvote) {
            connection.query('UPDATE miner_settings.settings SET upvotes = upvotes - 1 WHERE id = ?', [body.id]);
            deleteVoteFromLog(ipHash, body.id, !body.upvote, !body.downvote);
          }
          if (body.upvote) {
            connection.query('UPDATE miner_settings.settings SET upvotes = upvotes + 1 WHERE id = ?',
              [body.id],
              function (error, results, fields) {
                if (error) {
                  response.error = true;
                  response.message == 'Something went wrong while counting the vote!';
                  res.json(response);
                } else {
                  logVote(ipHash, body.id, body.upvote, body.downvote)
                  response.message == 'Vote casted!';
                  res.json(response);
                }
              }
            );
          } else if (body.downvote) {
            connection.query('UPDATE miner_settings.settings SET downvotes = downvotes + 1 WHERE id = ?',
              [body.id],
              function (error, results, fields) {
                if (error) {
                  response.error = true;
                  response.message == 'Something went wrong while counting the vote!';
                  res.json(response);
                } else {
                  logVote(ipHash, body.id, body.upvote, body.downvote)
                  response.message == 'Vote casted!';
                  res.json(response);
                }
              }
            );
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
