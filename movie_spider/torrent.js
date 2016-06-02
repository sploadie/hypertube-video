var colors  = require('colors');
var promise = require('promise');
var mongoose = require('mongoose');
var changeCase = require('change-case');
var torrentStream = require('torrent-stream');

var Movie = require('../schemas/movie');

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

var hasValidExtension = function(filename) {
	var extension = filename.match(/.*(\..+?)$/);
	if (extension !== null && extension.length === 2 && extension_list[extension[1].toLowerCase()] !== undefined) {
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
var torrentMovie = function(req, res) {
	/* Get movie._id and resolution in req.params */
	var movie_id = req.params.id
	var resolution = req.params.resolution;
	if (movie_id && resolution && resolution.resolution == undefined) {
		/* Query for movie */
		this.findById(movie_id, function(err, movie) {
			if (err) {
				console.log('Mongoose Error:'.red, err);
				/* If none match, redirect */
				// REDIRECT
			}
			/* Get resolution info from movie */
			movie.resolutions.forEach(function(m_res) {
				if (m_res.resolution == resolution) {
					resolution = m_res.resolution;
				}
			});
			if (!resolution.resolution) {
				/* If missing, log error and pick whatever is first resolution */
				console.log('torrentMovie Error:'.red, 'Resolution not found:', resolution);
				if (movie.resolutions[0]) {
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
					// REDIRECT
				}
			}
			/* DONE BY TORRET-STREAM: Create folder './torrents/'+movie._id+'/'+resolution.resolution in a way that does not destroy it if it exists */
			/* Get filestream, filename and file size from torrent-stream, with the file created in folder above */
			getMovieStream(resolution.magnet, '../torrents/'+movie._id+'/'+resolution.resolution).then(
				function(data) {
					/* Hand filestream, filename and file size to vid-streamer hack */
					// VID STREAMER HACK
				},
				function(err) {
					console.log('torrentMovie Error:'.red, err.message);
					// REDIRECT
				}
			);
		});
	} else {
		/* If missing (or someone tried to hack resolution) redirect */
		// REDIRECT
	}
}







