var colors  = require('colors');
var fs = require('fs');
var promise = require('promise');
var mongoose = require('mongoose');
var changeCase = require('change-case');

var Movie = require('../schemas/movie');

var open_db = function(mongo_db, callback) {
	/* Prepare MongoDB & Mongoose */
	mongoose.connect(mongo_db);
	var db = mongoose.connection;
	db.on('error', console.error.bind(console, 'Mongoose Error: Connection error:'.red));
	db.once('open', function() {
		callback(function() {
			console.log('Mongoose Notice: Killing database connection');
			mongoose.disconnect();
		});
	});
}
var clean_movies = function(mongo_db) {
	open_db(mongo_db, function(close_db) {
		Movie.find().then(
			function(movies) {
				// console.log('SpiderCleaner Notice: Movies:', movies);
				var date = new Date;
				movies.forEach(function(movie) {
					if ((date - movie.last_viewed) > 2592000) {
						movies.resolutions.forEach(function(resolution) {
							if (resolution.data && resolution.data.path) {
								fs.unlink(resolution.data.path, function(err) {
									if (err) console.log('SpiderCleaner Error:'.red, err);
								});
							}
						});
					}
				});
				close_db();
			},
			function(err) {
				console.log('SpiderCleaner Error:'.red, 'Promise rejected:', err);
				close_db();
			}
		);
	});
}

setInterval(function() {
	clean_movies('mongodb://52.30.199.218:27017/hypertube');
}, 86400000);
// }, 4000);
