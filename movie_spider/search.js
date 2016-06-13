var colors  = require('colors');
var promise = require('promise');
var mongoose = require('mongoose');
var changeCase = require('change-case');

var Movie = require('../schemas/movie');

const search_fields = {
	title : 10,
	genres : 4,
	director : 3,
	writers : 2,
	actors : 3,
	plot : 1
}

const filter_fields = {
	title:       'title',
	genres:      'genres',
	genre:       'genres',
	director:    'director',
	directors:   'director',
	writer:      'writers',
	writers:     'writers',
	actor:       'actors',
	actors:      'actors',
	resolution:  'resolutions.resolution',
	resolutions: 'resolutions.resolution',
	plot:        'plot',
	year:        'year',
	created:     'year',
	published:   'year',
	out:         'year',
	rating:      'imdb.rating',
	rated:       'imdb.rating',
	IMDB:        'imdb.rating',
	imdb:        'imdb.rating',
	score:       'imdb.rating'
}

var search = function(req) {
	return new Promise(function(fulfill, reject) {
		if (!req || !req.params) {
			console.log('SpiderSearch Error:'.red, 'Empty Request');
			return reject({ message : 'Empty Request' });
		}
		var request = req.params;
		var text;
		var filters = {};
		var text_array = [];
		/* Prepare '$and' array */
		var search_terms = [];
		// if (request.resolutions && request.resolutions.length !== 0) {
		// 	var temp = [];
		// 	request.resolutions.forEach(function(resolution) {
		// 		temp.push({ "resolutions.resolution": new RegExp(resolution, 'i') });
		// 	});
		// 	search_terms.push({ $or: temp });
		// }
		if (request.text) {
			text = request.text.replace(/\s+/g,' ').trim();
			// text_regex = new RegExp(request.text.replace(/\s+/g,' ').trim(), 'i');
			// var temp = [];
			// for (field in search_fields) {
			// 	temp.push({ [field]: text_regex });
			// };
			// search_terms.push({ $or: temp });
			console.log('spiderSearch Notice: Text Before:', text);
			var filter;
			var content;
			var tmp;
			while (text.indexOf('[') != -1) {
				if (text.indexOf(']') === -1) break;
				text_array = text.split('[')[0].split(' ');
				filter = text_array.pop();
				content = text.slice(text.indexOf('[')+1).split(']')[0];
				tmp = text.slice(text.indexOf('['));
				text_array.push(tmp.slice(tmp.indexOf(']')+1));
				text = text_array.join(' ').replace(/\s+/g,' ').trim();
				if (!filters[filter]) filters[filter] = [];
				filters[filter].push(content);
			}
			console.log('spiderSearch Notice: Text After:', text);
			console.log('spiderSearch Notice: Filters:', filters);
			var or_array = [];
			text_array = text.split(' ');
			text_array = text_array.map(function(word) {
				return new RegExp(word, 'i');
			});
			console.log('spiderSearch Notice: Text Array:', text_array);
			for (field in search_fields) {
				text_array.forEach(function(word) {
					or_array.push({ [field]: word });
				});
			}
			console.log('spiderSearch Notice: OR Array:', or_array);
			search_terms.push({ $or: or_array });
			for (filter_key in filters) {
				if (filter_fields[filter_key]) {
					if (filter_fields[filter_key] === 'year' || filter_fields[filter_key] === 'imdb.rating') {
						filters[filter_key].forEach(function(filter) {
							try {
								if (filter.indexOf('-') != -1) {
									filter = filter.split('-');
									search_terms.push({ [filter_fields[filter_key]]: { $gte: parseInt(filter[0]), $lte: parseInt(filter[1]) } });
								} else {
									search_terms.push({ [filter_fields[filter_key]]: parseInt(filter) });
								}
							} catch(exception) {
								console.log('spiderSearch Error:'.red, filter_fields[filter_key]+':', exception);
							}
						});
					} else {
						filters[filter_key].forEach(function(filter) {
							search_terms.push({ [filter_fields[filter_key]]: new RegExp(filter, 'i') });
						});
					}
				}
			}
		}
		console.log('spiderSearch Notice: Search Terms:', search_terms);
		/* Return promise */
		Movie.find({ $and: search_terms }, function(err, movies) {
			if (err) {
				console.log('Mongoose Error:'.red, err);
				return reject(err);
			}
			/* Sort movies by weight */
			if (request.text) {
				movies.forEach(function(movie) {
					movie.weight = 0;
					for (field in search_fields) {
						text_array.forEach(function(word) {
							if ((movie[field]+'').match(word)) {
								movie.weight += search_fields[field];
							}
						});
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
