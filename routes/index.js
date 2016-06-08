var express = require('express');
var router = express.Router();
var spiderTorrent = require("../movie_spider/torrent");
var torrentStream = require('torrent-stream');
// var ffmpeg = require('fluent-ffmpeg');
var changeCase = require('change-case');

/* GET Homepage */
router.get('/', function(req, res, next) {
	res.render('index', { title: 'Hypertube' });
});

/* GET Video Stream */
router.get('/torrent', spiderTorrent);

var mimeTypes = require('../movie_spider/mime_types');

// /* POST Add Torrent */
// router.post('/add_torrent', function(req, res, next) {
// 	var engine = torrentStream(req.body.torrent, {path: './torrents'});

// 	engine.on('ready', function() {
// 		engine.files.forEach(function(file) {
// 			console.log('Filename:', file.name);
// 			var extension = file.name.match(/.*(\..+?)$/);
// 			if (extension !== null && extension.length === 2 && mimeTypes[extension[1].toLowerCase()] !== undefined) {
// 				console.log('Downloading item');
// 				file.select(); // downloads without attaching filestream
// 			} else {
// 				console.log('Skipping item');
// 			}
// 			// var stream = file.createReadStream(); // fs stream containing file contents
// 		});
// 	});

// 	engine.on('idle', function() {
// 		console.log('Engine idle; destroying');
// 		// FIXME If fds are still open, maybe turn this back on
// 		// engine.removeAllListeners();
// 		engine.destroy();
// 	});

// 	res.redirect('/');
// });

// /* GET Player */
// router.get('/player/:adapter/:movie_id/:resolution', function(req, res, next) {
// 	// console.log('REQ.BODY:', req.query);
// 	// res.send('<pre>'+req.params.adapter+' - '+req.params.video+' - '+req.params.resolution+'</pre>');
// 	res.render('player', { title: 'Player', video: encodeURIComponent('id='+encodeURIComponent(req.params.movie_id)+'&resolution='+encodeURIComponent(req.params.resolution)), adapter: req.params.adapter });
// });

// /* GET Video (iframe) */
// router.get('/adapter/:adapter/:video', function(req, res, next) {
// 	var path = '/torrent?' + decodeURIComponent(req.params.video);
// 	res.render('adapter_'+changeCase.snakeCase(req.params.adapter), { title: 'Video', video_path: path }, function(err, html) {
// 		if (err) {
// 			// if (err.message.indexOf('Failed to lookup view') !== -1) {
// 			// 	return res.send('Error: Adapter "'+changeCase.pascalCase(req.params.adapter)+'" does not exist');
// 			// }
// 			// return res.send(err.message);
// 			return res.send('Error: Adapter "'+changeCase.pascalCase(req.params.adapter)+'" does not exist');
// 		}
// 		res.send(html);
// 	});
// });

module.exports = router;
