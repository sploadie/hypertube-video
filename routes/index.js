var express = require('express');
var router = express.Router();
var vidStreamer = require("vid-streamer");
var torrentStream = require('torrent-stream');
var ffmpeg = require('fluent-ffmpeg');
// var newSettings = {
// 		rootFolder: "~/hypertube/torrents/",
//     rootPath: "torrents/",
//     forceDownload: true
// }

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', { title: 'Express' });
});

/* GET home page. */
router.get('/videos/:type', vidStreamer);

/* POST add torrent. */
router.post('/add_torrent', function(req, res, next) {
	var engine = torrentStream(req.body.torrent, {path: './videos'});

	engine.on('ready', function() {
	    engine.files.forEach(function(file) {
	        console.log('filename:', file.name);
	        var stream = file.createReadStream();
	        var converted = ffmpeg(stream)
				.videoCodec('mpeg4')
				.audioCodec('aac')
				.on('progress', function(info) { console.log('Progress: ' + info.keys + '%'); })
				.on('end', function() { console.log('Done processing input stream'); })
				.on('error', function(err) { console.log('Error: ' + err.message); })
				.save('./videos/converted.mp4');
	        // stream is readable stream to containing the file content
	    });
	});

	engine.on('idle', function() {
		console.log('Event: idle');
		// FIXME if fds are still open, maybe turn this back on
		// engine.removeAllListeners();
		engine.destroy();
	});


	// res.redirect('/video/');
});

module.exports = router;
