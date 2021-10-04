var express = require('express');
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
  connection.query('SELECT * FROM settings', function(err, rows, fields) {
    res.json(rows);
  });
});

router.post('/settings', function(req, res, next) {
  const body = req.body
  connection.query('INSERT INTO settings (title, coin, gpu, coreClock, memClock, powerTarget, voltage, hashrate, wattage) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [body.title, body.coin, body.gpu, body.coreClock, body.memClock, body.poweTarget, body.volate, body.hashrate, body.wattage],
    function (error, results, fields) {
      error ? res.json(false) : res.json(true);
    });
});

router.post('/rate', function(req, res, next) {
  const body = req.body
  if (body.upvote) {
    connection.query('UPDATE miner_settings.settings SET upvotes = upvotes + 1 WHERE id = ?',
      [body.id],
      function (error, results, fields) {
        error ? res.json(false) : res.json(true);
      }
    );
  } else if (body.downvote) {
    connection.query('UPDATE miner_settings.settings SET downvotes = downvotes + 1 WHERE id = ?',
      [body.id],
      function (error, results, fields) {
        error ? res.json(false) : res.json(true);
      }
    );
  }
});

module.exports = router;
