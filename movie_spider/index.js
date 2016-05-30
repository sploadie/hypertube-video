var jsdom = require('jsdom');
var ptn   = require('parse-torrent-name');
var omdb  = require('omdb');
var mongoose = require('mongoose');
var Movie = require('../schemas/movie');

var kickass = {
	url: function(page) {
		return 'https://kat.cr/usearch/category%3Amovies/' + page;
	},
	parse: function($) {
		return $(".odd").map(function(index, torrent) {
			// $(torrent).attr('id');
			var elem = $(torrent);
			return {
				name: elem.find('.filmType a.cellMainLink').text(),
				magnet: elem.find('a.icon16').attr('href'),
				seeds: 8
			};
			// console.log($(torrent).attr('id'));
		});
	}
};

var pirate_bay = {
	url: function(page) {
		return 'https://thepiratebay.org/browse/201/' + (page - 1) + '/7';
	},
	parse: function($) {
		return $("#searchResult tbody tr").map(function(index, torrent) {
			// $(torrent).attr('id');
			var elem = $(torrent);
			return {
				name: elem.find('.detName .detLink').text(),
				magnet: elem.find('a[title="Download this torrent using magnet"]').attr('href'),
				seeds: 8
			};
			// console.log($(torrent).attr('id'));
		});
	}
};

var add_torrent_to_database = function(torrent) {
	Movie.findByTitle(torrent.omdb.title, function(err, movies) {
		if (err) return console.log(err);
		if (movies.length === 0) {
			var movie = new Movie({
				title: torrent.omdb.title,
				year: torrent.omdb.year,
				resolutions: [{
					resolution: torrent.resolution,
					seeds: torrent.seeds,
					magnet: torrent.magnet
				}],
				rated: torrent.omdb.rated,
				released: new Date(torrent.omdb.released),
				genres: torrent.omdb.genres,
				director: torrent.omdb.director,
				writers: torrent.omdb.writers,
				actors: torrent.omdb.actors,
				plot: torrent.omdb.plot,
				poster: torrent.omdb.poster,
				imdb: {
					url: 'http://www.imdb.com/title/'+torrent.omdb.imdb.id,
					rating: torrent.omdb.imdb.rating,
					votes: torrent.omdb.imdb.votes
				}
			});
			movie.save(function(err, new_movie) {
				if (err) return console.error(err);
				console.log('New Movie:', new_movie);
			});
		} else if (movies.length === 1) {
			var movie = movies[0];
			var resolution_found = false;
			console.log(movie.resolutions);
			movie.resolutions.each(function(index, elem) {
				if (elem.resolution === torrent.resolution) {
					resolution_found = true;
					if (elem.seeds < torrent.seeds) {
						elem.seeds = torrent.seeds;
						elem.magnet = torrent.magnet;
					}
				}
			});
			if (resolution_found === false) {
				movie.resolutions.push({
					resolution: torrent.resolution,
					seeds: torrent.seeds,
					magnet: torrent.magnet
				});
			}
			movie.save(function(err, updated_movie) {
				if (err) return console.error(err);
				console.log('Updated Movie:', new_movie);
			});
		} else {
			console.log('Error: the movie', torrent.omdb.title, 'already exists twice!');
		}
	});
}

var parse_torrents = function(torrent_source, first_page, last_page) {
	var page = first_page;
	while (page <= last_page) {
		jsdom.env(
			torrent_source.url(page),
			["http://code.jquery.com/jquery.js"],
			function (err, window) {
				if (err) {
					console.log(err);
					window.close();
					return false
				}
				var array = torrent_source.parse(window.$);
				if (array.length === 0) {
					console.log('Error: torrent site did not return any torrents');
					window.close();
					return false;
				}
				array.filter(function(t) { return t.name != undefined && t.magnet != undefined && t.seeds != undefined });
				array.each(function(index, torrent) {
					window.$.extend(torrent, ptn(torrent.name));
					if (torrent.title != undefined) {
						torrent.resolution = torrent.resolution + '';
						omdb.get({title: torrent.title, year: torrent.year}, function(err, movie) {
							if (err) return console.log(err);
							// console.log(movie);
							torrent.omdb = movie;
							if (torrent.omdb) {
								console.log(torrent);
								// add_torrent_to_database(torrent);
							} else {
								console.log('OMDB data not found:', torrent.title, torrent.year);
							}
						});
					} else {
						console.log('Title not found:', torrent.name);
					}
				});
				// array.filter(function(t) { return t.title != undefined });
				// console.log(array);
				window.close();
				return true;
			}
		);
		page += 1;
	}
};

/* Prepare MongoDB & Mongoose */
// mongoose.connect('mongodb://localhost/test');
// var db = mongoose.connection;
// db.on('error', console.error.bind(console, 'Connection error:'));
// db.once('open', function() {
	parse_torrents(kickass, 1, 1);
	// parse_torrents(pirate_bay, 1, 1);
// });
