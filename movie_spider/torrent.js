var fs = require('fs');
var events = require('events');
var colors  = require('colors');
var promise = require('promise');
var mongoose = require('mongoose');
var changeCase = require('change-case');
var torrentStream = require('torrent-stream');

var Movie = require('../schemas/movie');

var mimeTypes = require('./mime_types');
var settings = require('./config.json');

var handler = new events.EventEmitter();
var spiderStreamer = require('./streamer');

var hasValidExtension = function(filename) {
	var extension = filename.match(/.*(\..+?)$/);
	if (extension !== null && extension.length === 2 && mimeTypes[extension[1].toLowerCase()] !== undefined) {
		return true;
	}
	return false;
}

var engineCount = 0;
var engineHash = {};
var enginePaths = {};

var getMovieStream = function(magnet, torrent_path, movie, resolution) {
	return new Promise(function(fulfill, reject) {
		/* FIXME: Only do this engine bullshit if it hasn't been done already; add 'data' field in database to make this work. */
		var original = true;
		var engine = torrentStream(magnet, {
			path: torrent_path
		});
		enginePaths[torrent_path] = enginePaths[torrent_path] ? enginePaths[torrent_path] : 1;
		engineHash[(engine.hashIndex = engineCount++)] = engine;
		console.log('spiderTorrent Notice: Waiting for torrentStream engine')
		engine.on('ready', function() {
			/* Check if original engine */
			for (var i = 0; i < engine.hashIndex; i++) {
				if (engineHash[i] && engineHash[i].path === engine.path) {
					console.log('spiderTorrent Notice: Engine', engine.hashIndex, 'not original: copying engine', i);
					engineHash[engine.hashIndex] = undefined;
					engine.destroy();
					engine = engineHash[i];
					original = false;
					break;
				}
			}
			/* Actual Engine Manipulation */
			var movie_file;
			engine.files.forEach(function(file) {
				/* Look for valid movie file extension and biggest file */
				if (hasValidExtension(file.name) && (!movie_file || file.length > movie_file.length)) {
					console.log('Movie file found:', file.name, '| size:', file.length);
					if (movie_file) {
						console.log('Skipping item:', movie_file.name, '| size:', movie_file.length);
						// movie_file.deselect();
					}
					movie_file = file;
				} else {
					/* Ignore non-movie files */
					console.log('Skipping item:', file.name, '| size:', file.length);
					// file.deselect();
				}
			});
			/* If movie found */
			if (movie_file) {
				/* Torrent movie */
				movie_file.select();
				/* Create movie file data hash and send it back */
				var movie_data = {
					name: movie_file.name,
					length: movie_file.length,
					date: movie.released,
					// stream: movie_file.createReadStream({ flags: "r", start: 0, end: movie_file.length - 1 })
					path: engine.path + '/' + movie_file.path
				};
				console.log('spiderTorrent Notice: Movie data obtained:', movie_data);
				fulfill(movie_data);
				/* Save hash to database */
				resolution.data = {
					name: movie_file.name,
					length: movie_file.length,
					path: engine.path + '/' + movie_file.path,
					torrent_date: new Date
				}
				movie.save().then(
					/* Promise fulfill callback */
					function(ret_movie) {
						console.log('Mongoose Notice:', 'Title updated:'.cyan, ret_movie.title);
						return fulfill(true);
					},
					/* Promise reject callback */
					function(err) {
						console.error('Mongoose Error:'.red, movie.title+':', clean_mongoose_err(err));
						return fulfill(false);
					}
				);
				/* Set up engine logger */
				if (original) {
					movie_file.createReadStream({ start: movie_file.length - 1025, end: movie_file.length - 1 });
					engine.on('download', function(piece_index) {
						// if (piece_index % 10 == 0) {
						console.log('torrentStream Notice: Engine', engine.hashIndex, 'downloaded piece: Index:', piece_index, '(', engine.swarm.downloaded, '/', movie_file.length, ')');
						// }
					});
					engine.on('idle', function() {
						console.log('torrentStream Notice: Engine', engine.hashIndex, 'idle');
						if (engine.selection.length === 0) {//(engine.swarm.downloaded < movie_data.length) {
							// console.log('torrentStream Notice: Engine', engine.hashIndex, 'downloaded (', engine.swarm.downloaded, '/', movie_data.length, ')');
							console.log('torrentStream Notice: Engine', engine.hashIndex, 'no files selected');
						} // else {
							console.log('torrentStream Notice: Engine', engine.hashIndex, 'downloaded (', engine.swarm.downloaded, '/', movie_data.length, '); destroying');
							/* FIXME: If fds are still open, maybe turn this back on */
							engine.removeAllListeners();
							engine.destroy();
							console.log('torrentStream Notice: Movie set as downloaded:', movie_data.title, resolution.resolution);
							resolution.data.downloaded = true;
							movie.save().then(
								/* Promise fulfill callback */
								function(ret_movie) {
									console.log('Mongoose Notice:', 'Title updated:'.cyan, ret_movie.title);
									return fulfill(true);
								},
								/* Promise reject callback */
								function(err) {
									console.error('Mongoose Error:'.red, movie.title+':', clean_mongoose_err(err));
									return fulfill(false);
								}
							);
						// }
					});
				}
			} else {
				engine.removeAllListeners();
				engine.destroy();
				return reject({
					message: 'No valid movie file was found'
				});
			}
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
	// console.log('spiderTorrent Notice: Request:', req);
	console.log('spiderTorrent Notice: Query:', req.query);
	console.log('spiderTorrent Notice: Headers:', req.headers);
	var movie_id;
	var resolution;
	var range = req.headers.range;
	try {
		/* Get movie._id and resolution in req.params */
		if (req.query.id)         movie_id   = decodeURIComponent(req.query.id);
		if (req.query.resolution) resolution = decodeURIComponent(req.query.resolution);
	} catch (exception) {
		/* On exception, redirect */
		console.log('spiderTorrent Error:'.red, 'Could not decode params:', req.params);
		handler.emit("badRequest", res);
		return false;
	}
	if (movie_id && resolution && resolution.resolution == undefined) {
		/* Query for movie */
		Movie.findById(movie_id, function(err, movie) {
			if (err || movie == null) {
				/* If none match, redirect */
				console.log('Mongoose Error:'.red, err);
				handler.emit("noMovie", res, err);
				return false;
			}
			console.log('spiderTorrent Notice: Found title:', movie.title);
			/* Get resolution info from movie */
			movie.resolutions.forEach(function(m_res) {
				if (m_res.resolution == resolution) {
					resolution = m_res;
				}
			});
			if (resolution.resolution === undefined) {
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
			// console.log('spiderTorrent Notice: Resolution info:', resolution.data.name);
			var torrent_path = './torrents/'+movie._id+'/'+resolution.resolution;
			if (resolution.data.path && resolution.data.length) {
				console.log('spiderTorrent Notice: Movie data found for', movie.title, resolution.resolution);
				var file_size;
				try {
					file_size = fs.statSync(resolution.data.path).size;
				} catch(exception) {
					console.log('spiderTorrent Error:'.red, 'Movie size not found');
					file_size = 0;
				}
				// console.log('spiderTorrent Notice: Movie size comparison:', file_size, resolution.data.length);
				if (file_size >= resolution.data.length && (enginePaths[torrent_path] === 1 || resolution.data.downloaded)) {
					/* Does not work: file always final size; poential fix? */
					console.log('spiderTorrent Notice: Movie already torrented; streaming:', movie.title, resolution.resolution);
					spiderStreamer({
						name: resolution.data.name,
						length: resolution.data.length,
						date: movie.released,
						path: resolution.data.path
					}, req.query, range, res);
					return true;
				}
			}
			/* DONE BY TORRET-STREAM: Create folder './torrents/'+movie._id+'/'+resolution.resolution in a way that does not destroy it if it exists */
			/* Get filestream, filename and file size from torrent-stream, with the file created in folder above */
			console.log('spiderTorrent Notice: Movie not yet torrented; torrenting:', movie.title, resolution.resolution);
			getMovieStream(resolution.magnet, torrent_path, movie, resolution).then(
				/* Promise fulfill callback */
				function(data) {
					/* Hand filestream, filename and file size to vid-streamer hack */
					// console.log('spiderTorrent Notice: Sending data spiderStreamer: { name: "'+data.name+'", size: '+data.length+', date: [Date], stream: [Stream] }');
					spiderStreamer(data, req.query, range, res);
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
		console.log('spiderTorrent Error:'.red, 'Invalid request:', req.query);
		handler.emit("badRequest", res);
		return false;
	}
	return true;
}

var errorHeader = function(res, code) {
	var header = {
		"Content-Type": "text/html",
		Server: settings.server
	};

	res.writeHead(code, header);
};

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
