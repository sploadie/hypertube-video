var colors  = require('colors');
var promise = require('promise');
var mongoose = require('mongoose');
var changeCase = require('change-case');

var Movie = require('../schemas/movie');

const search_fields = {
	title: 10,
	genres: 4,
	director: 3,
	writers: 2,
	actors: 3,
	plot: 1
}

var search = function(req) {
	return new Promise(function(fulfill, reject) {
		if (!req || !req.body) {
			console.log('SpiderSearch Error:'.red, 'Empty Request');
			return reject({message: 'Empty Request'});
		}
		var request = req.body;
		var text_regex;
		/* Prepare '$and' array */
		var search_terms = [];
		if (request.resolutions && request.resolutions.length != 0) {
			var temp = [];
			request.resolutions.forEach(function(resolution) {
				temp.push({ "resolutions.resolution": new RegExp(resolution, 'i') });
			});
			search_terms.push({ $or: temp });
		}
		if (request.text) {
			text_regex = new RegExp(request.text.replace(/\s+/g,' ').trim(), 'i');
			var temp = [];
			for (field in search_fields) {
				temp.push({ [field]: text_regex });
			};
			search_terms.push({ $or: temp });
		}
		/* Return promise */
		Movie.find({ $and: search_terms }, function(err, movies) {
			if (err) {
				console.log('Mongoose Error:'.red, err);
				return reject(err);
			}
			/* Sort movies by weight */
			if (text_regex) {
				movies.forEach(function(movie) {
					movie.weight = 0;
					for (field in search_fields) {
						// console.log('SpiderSearch Notice:', field, movie[field]);
						if ((movie[field]+'').match(text_regex)) {
							movie.weight += search_fields[field];
						}
					};
				});
			}
			/* Return movies */
			return fulfill(movies.sort(function(a, b) {
				return b.weight - a.weight;
			}));
		});
	});
}

/* TESTING START */
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
var search_movies = function(mongo_db, req) {
	open_db(mongo_db, function(close_db) {
		search(req).then(
			function(movies) {
				// console.log('SpiderSearch Notice: Movies:', movies);
				movies.forEach(function(movie) {
					console.log('Weight:', movie.weight, 'Title:', movie.title);
				});
				close_db();
			},
			function(err) {
				console.log('SpiderSearch Error:'.red, 'Promise rejected:', err);
				close_db();
			}
		);
	});
}

search_movies('mongodb://52.30.199.218:27017/hypertube', {body: {text: 'action'}});
/* TESTING END */

module.exports = search;
