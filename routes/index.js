var express = require('express');
var router = express.Router();
var vidStreamer = require("../vid-streamer");
var torrentStream = require('torrent-stream');
// var ffmpeg = require('fluent-ffmpeg');
var changeCase = require('change-case');

/* GET Homepage */
router.get('/', function(req, res, next) {
	res.render('index', { title: 'Hypertube' });
});

/* GET Video Stream */
router.get('/videos/*', vidStreamer);

var extension_list = {
	".flv":		"video/x-flv",
	".f4v":		"video/mp4",
	".f4p":		"video/mp4",
	".mp4":		"video/mp4",
	".mkv":		"video/mp4", /* FAST PATCH (POSSIBLY MUST FIX LATER) (SHOULD ACTUALLY BE CONVERTED FROM video/mkv TO WHATEVER) */
	".asf":		"video/x-ms-asf",
	".asr":		"video/x-ms-asf",
	".asx":		"video/x-ms-asf",
	".avi":		"video/x-msvideo",
	".mpa":		"video/mpeg",
	".mpe":		"video/mpeg",
	".mpeg":	"video/mpeg",
	".mpg":		"video/mpeg",
	".mpv2":	"video/mpeg",
	".mov":		"video/quicktime",
	".movie":	"video/x-sgi-movie",
	".mp2":		"video/mpeg",
	".qt":		"video/quicktime",
	".webm":	"video/webm",
	".ts":		"video/mp2t",
	".ogg":		"video/ogg"
};

/* POST Add Torrent */
router.post('/add_torrent', function(req, res, next) {
	var engine = torrentStream(req.body.torrent, {path: './torrents'});

	engine.on('ready', function() {
		engine.files.forEach(function(file) {
			console.log('Filename:', file.name);
			var extension = file.name.match(/.*(\..+?)$/);
			if (extension !== null && extension.length === 2 && extension_list[extension[1].toLowerCase()] !== undefined) {
				console.log('Downloading item');
				file.select(); // downloads without attaching filestream
			} else {
				console.log('Skipping item');
			}
			// var stream = file.createReadStream(); // fs stream containing file contents
		});
	});

	engine.on('idle', function() {
		console.log('Engine idle; destroying');
		// FIXME If fds are still open, maybe turn this back on
		// engine.removeAllListeners();
		engine.destroy();
	});

	res.redirect('/');
});

/* GET Player */
router.get('/player/:adapter/:video', function(req, res, next) {
	res.render('player', { title: 'Player', video: encodeURIComponent(req.params.video), adapter: req.params.adapter });
});

/* GET Video (iframe) */
router.get('/adapter/:adapter/:video', function(req, res, next) {
	var path = '/videos/' + decodeURIComponent(req.params.video);
	var extension = path.match(/.*(\..+?)$/);
	var type;
	if (extension === null || extension.length !== 2 || (type = extension_list[extension[1].toLowerCase()]) === undefined) {
		return res.send('Error: ' + path + ' is not a valid video file');
	}
	res.render('adapter_'+changeCase.snakeCase(req.params.adapter), { title: 'Video', video_path: path, video_type: type }, function(err, html) {
		if (err) {
			// if (err.message.indexOf('Failed to lookup view') !== -1) {
			// 	return res.send('Error: Adapter "'+changeCase.pascalCase(req.params.adapter)+'" does not exist');
			// }
			// return res.send(err.message);
			return res.send('Error: Adapter "'+changeCase.pascalCase(req.params.adapter)+'" does not exist');
		}
		res.send(html);
	});
});

module.exports = router;
