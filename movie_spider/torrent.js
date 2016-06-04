var events = require('events');
var colors  = require('colors');
var promise = require('promise');
var mongoose = require('mongoose');
var changeCase = require('change-case');
var torrentStream = require('torrent-stream');

var Movie = require('../schemas/movie');

var mimeTypes = require('./mime_types');

var handler = new events.EventEmitter();
var spiderStreamer = require('./streamer');

var hasValidExtension = function(filename) {
	var extension = filename.match(/.*(\..+?)$/);
	if (extension !== null && extension.length === 2 && mimeTypes[extension[1].toLowerCase()] !== undefined) {
		return true;
	}
	return false;
}

var getMovieStream = function(magnet, torrent_path) {
	return new Promise(function(fulfill, reject) {
		var engine = torrentStream(magnet, {
			path: torrent_path
		});

		engine.on('ready', function() {
			var movie_file;
			engine.files.forEach(function(file) {
				/* Look for valid movie file extension */
				if (!movie_file && hasValidExtension(file.name)) {
					console.log('Movie file found:', file.name);
					movie_file = file;
				} else {
					/* Ignore non-movie files */
					console.log('Skipping item:', file.name);
					file.deselect();
				}
			});
			/* If movie found, hand it back */
			if (movie_file) {
				return fulfill({
					name: file.name,
					size: file.length,
					stream: file.createReadStream()
				});
			}
			return reject({
				message: 'No valid movie file was found'
			});
		});

		engine.on('idle', function() {
			console.log('Engine idle; destroying');
			/* FIXME: If fds are still open, maybe turn this back on */
			engine.removeAllListeners();
			engine.destroy();
		});
	});
}
// console.log('Torrent Stream Error:'.red, err.message);

/* Helper to output prettier Mongoose error */
var clean_mongoose_err = function(err) {
	// var str = err.name+': '+err.message;
	var str = err.message;
	if (err.errors) {
		str += ':';
		for (error in err.errors) {
			str += ' '+err.errors[error].message;
		}
	}
	return str;
}

/* Called by video player */
var spiderTorrent = function(req, res) {
	var movie_id;
	var resolution;
	try {
		/* Get movie._id and resolution in req.params */
		if (req.params.id)         movie_id   = decodeURIComponent(req.params.id);
		if (req.params.resolution) resolution = decodeURIComponent(req.params.resolution);
	} catch (exception) {
		/* On exception, redirect */
		console.log('spiderTorrent Error:'.red, 'Could not decode params:', req.params);
		handler.emit("badRequest", res);
		return false;
	}
	if (movie_id && resolution && resolution.resolution == undefined) {
		/* Query for movie */
		this.findById(movie_id, function(err, movie) {
			if (err) {
				/* If none match, redirect */
				console.log('Mongoose Error:'.red, err);
				handler.emit("noMovie", res, err);
				return false;
			}
			/* Get resolution info from movie */
			movie.resolutions.forEach(function(m_res) {
				if (m_res.resolution == resolution) {
					resolution = m_res.resolution;
				}
			});
			if (!resolution.resolution) {
				/* If missing, log error and pick whatever is first resolution */
				console.log('spiderTorrent Error:'.red, 'Resolution not found:', resolution);
				if (movie.resolutions[0]) {
					console.log('spiderTorrent Notice:', 'Defaulting to resolution:', movie.resolutions[0].resolution);
					resolution = movie.resolutions[0];
				} else {
					/* If there are no resolutions, delete movie and redirect */
					movie.remove().then(
						/* Promise fulfill callback */
						function(ret_movie) {
							console.log('Mongoose Notice:', ('Movie '+movie.title+' deleted:').cyan, 'no magnets remaining');
						},
						/* Promise reject callback */
						function(err) {
							console.error('Mongoose Error:'.red, 'Movie '+movie.title+' NOT deleted, despite no magnet links:', clean_mongoose_err(err));
						}
					);
					console.log('spiderTorrent Error:'.red, 'Movie has no resolutions');
					handler.emit("noMovie", res);
					return false;
				}
			}
			/* DONE BY TORRET-STREAM: Create folder './torrents/'+movie._id+'/'+resolution.resolution in a way that does not destroy it if it exists */
			/* Get filestream, filename and file size from torrent-stream, with the file created in folder above */
			getMovieStream(resolution.magnet, '../torrents/'+movie._id+'/'+resolution.resolution).then(
				/* Promise fulfill callback */
				function(data) {
					/* Hand filestream, filename and file size to vid-streamer hack */
					spiderStreamer(data, res);
				},
				/* Promise reject callback */
				function(err) {
					console.log('spiderTorrent Error:'.red, err.message);
					handler.emit("noMovie", res);
					return false;
				}
			);
		});
	} else {
		/* If missing (or someone tried to hack resolution) redirect */
		console.log('spiderTorrent Error:'.red, 'Invalid request:', req.params);
		handler.emit("badRequest", res);
		return false;
	}
}

handler.on("noMovie", function(res) {
	errorHeader(res, 404);
	res.end("<!DOCTYPE html><html lang=\"en\">" +
		"<head><title>404 Not found</title></head>" +
		"<body>" +
		"<h1>Sorry...</h1>" +
		"<p>I can't play that movie.</p>" +
		"</body></html>");
});

handler.on("badRequest", function(res) {
	errorHeader(res, 400);
	res.end("<!DOCTYPE html><html lang=\"en\">" +
		"<head><title>400 Bad request</title></head>" +
		"<body>" +
		"<h1>Sorry...</h1>" +
		"<p>Request is missing parameters, can't find movie.</p>" +
		"</body></html>");
});

module.exports = spiderTorrent;





