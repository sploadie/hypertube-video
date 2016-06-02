var jsdom = require('jsdom');
var ptn   = require('parse-torrent-name');
var colors  = require('colors');
var omdb  = require('omdb');
var mongoose = require('mongoose');
var promise = require('promise');
var Movie = require('../schemas/movie');

/* Kickass.to torrent source */
var kickass = {
	name: 'Kickass',
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

/* Pirate Bay torrent source */
var pirate_bay = {
	name: 'Pirate Bay',
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

/* Integrates parsed data into database (promise returns true only if a magnet was added) */
var add_torrent_to_database = function(torrent, verbose) {
	return new Promise(function(fulfill) {
		Movie.findByTitle(torrent.omdb.title, function(err, movies) {
			if (err) {
				console.log('Mongoose Error:'.red, err);
				return fulfill(false);
			}
			var movie;
			if (movies.length === 0) {
				// console.log('Mongoose Notice: Title not yet added:', torrent.omdb.title);
				/* Preparing Movie object for database */
				movie = new Movie({
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
				/* Mongoose call and promises */
				movie.save().then(
					/* Promise fulfill callback */
					function(ret_movie) {
						console.log('Mongoose Notice:', 'Title added:'.green, ret_movie.title);
						fulfill(true);
					},
					/* Promise reject callback */
					function(err) {
						console.error('Mongoose Error:'.red, movie.title+':', clean_mongoose_err(err));
						fulfill(false);
					}
				);
				return;
			}
			/* Get preexisting Movie object from database */
			movie = movies[0];
			/* Delete extras if movie found several times, as this should not happen (Fix?) */
			if (movies.length > 1) {
				console.log('Mongoose Error:'.red, 'Title found '+movies.length+' times:', movie.title);
				console.log('Mongoose Notice:', 'Deleting extra copies of:'.cyan, movie.title);
				movies.forEach(function(m, index) {
					if (index != 0) {
						m.remove().then(
							/* Promise fulfill callback */
							function(ret_movie) {
								console.log('Mongoose Notice:', ('Extra copy '+index+' removed:').cyan, ret_movie.title);
							},
							/* Promise reject callback */
							function(err) {
								console.error('Mongoose Error:'.red, 'Extra copy '+index+' not removed:', movie.title+':', clean_mongoose_err(err));
							}
						);
					}
				});
			}
			// console.log('Mongoose Notice: Title already added:', movie.title);
			var resolution_found = false;
			var save_movie = false;
			/* Check if resolution already exists for this movie */
			movie.resolutions.forEach(function(elem) {
				if (elem.resolution == torrent.resolution) {
					if (verbose) console.log('Mongoose Notice: Resolution already added:', movie.title, elem.resolution);
					resolution_found = true;
					/* If resolution exists, check if new magnet has more seeds; if so, overwrite old magnet */
					if (elem.seeds < torrent.seeds) {
						console.log('Mongoose Notice:', 'Old magnet had less seeds:'.green, movie.title, elem.resolution, '('+elem.seeds+' < '+torrent.seeds+')');
						save_movie = true;
						elem.seeds = torrent.seeds;
						elem.magnet = torrent.magnet;
					}
				}
			});
			/* Add new resolution if not found */
			if (resolution_found === false) {
				console.log('Mongoose Notice:', 'Resolution not yet added:'.green, movie.title, torrent.resolution);
				save_movie = true;
				movie.resolutions.push({
					resolution: torrent.resolution,
					seeds: torrent.seeds,
					magnet: torrent.magnet
				});
			}
			/* Update only if change was made */
			if (save_movie) {
				/* Mongoose call and promises */
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
			} else {
				/* Do not update if no changes were made */
				fulfill(false);
			}
		});
	});
}

/* Merge two hashes, giving priority to second hash */
var merge_hash = function(a, b) {
	for (var key in b) { a[key] = b[key]; }
	return a;
}

// var debug_counter = 0;

/* Reads passes data from torrent sites to add_torrent_to_database */
var parse_torrents = function(torrent_source, page, verbose) {
	/* Promise returns array, with each true meaning a new magnet link was added to database */
	return new Promise(function(all_fulfill) {
		var torrent_source_url = torrent_source.url(page)
		console.log('Spiderbot Notice:', ('Started crawling '+torrent_source_url).yellow);
		/* JsDom retrieves torrent site window for parsing */
		jsdom.env(
			torrent_source_url,
			["http://code.jquery.com/jquery.js"],
			function (err, window) {
				if (err) {
					console.log('Spiderbot Error: could not crawl', torrent_source_url);
					console.log('JsDom Error:'.red, err);
					return all_fulfill({ error: 'JsDom encountered an error and aborted' });
				}
				/* Each source can parse it's own data using jQuery object */
				var array = window.$.makeArray(torrent_source.parse(window.$));
				/* Window doesn't seem to close automatically */
				window.close();
				/* Clean up trash that might have slipped in */
				array = array.filter(function(t) { return t.name != undefined && t.magnet != undefined && t.seeds != undefined });
				/* Abort if no torrents found */
				if (array.length === 0) {
					console.log('Spiderbot Error:'.red, torrent_source_url, 'did not return any torrents');
					return all_fulfill({ error: torrent_source_url + ' did not return any torrents' });
				}
				/* Wait for each torrent to accrue information and interface with database */
				Promise.all(array.map(function(torrent) {
					return new Promise(function(torrent_fulfill) {
						// console.log('Debug Counter UP:'.blue, ++debug_counter);
						/* Parse relevant information from torrent name */
						torrent = merge_hash(torrent, ptn(torrent.name));
						/* Abort if torrent not found */
						if (torrent.title != undefined && torrent.title != '') {
							if (verbose) console.log('PTN Notice: Title found:', torrent.title);
							/* Turn all resolutions to String values (undefined, numbers, etc) */
							torrent.resolution = torrent.resolution + '';
							/* Request information from OpenMovieDatabase */
							omdb.get({title: torrent.title, year: torrent.year}, function(err, movie) {
								if (err) {
									console.log('OMDB Error:'.red, err);
									return torrent_fulfill(false); // console.log('Debug Counter DOWN:'.blue, --debug_counter);
								}
								if (movie !== undefined) {
									if (verbose) console.log('OMDB Notice: Title found:', torrent.title, '('+torrent.year+')');
									/* Add OMDB information to torrent object */
									torrent.omdb = movie;
									/* add_torrent_to_database takes it from here */
									add_torrent_to_database(torrent, verbose).then(function(value) {
										torrent_fulfill(value); // console.log('Debug Counter DOWN:'.blue, --debug_counter);
									});
								} else {
									if (verbose) console.log('OMDB Notice: Title not found:', torrent.title, '('+torrent.year+')');
									torrent_fulfill(false); // console.log('Debug Counter DOWN:'.blue, --debug_counter);
								}
							});
						} else {
							if (verbose) console.log('PTN Notice: Title not found:', torrent.name);
							torrent_fulfill(false); // console.log('Debug Counter DOWN:'.blue, --debug_counter);
						}
					});
				})).then(
					function(values) {
						var new_magnets = 0;
						values.forEach(function(v) {
							if (v == true) new_magnets += 1;
						});
						console.log('Spiderbot Notice:', ('Done crawling '+torrent_source_url).yellow);
						console.log('                 ', new_magnets, 'new magnets added to database');
						all_fulfill({ new_magnets: new_magnets });
					},
					function(err) {
						console.log('Spiderbot Error:'.red, 'Promise rejected:', err);
						all_fulfill({ error: 'Parse Torrents\' Promise.all was rejected' });
					}
				);
				return;
			}
		);
	});
};

var open_db = function(callback) {
	/* Prepare MongoDB & Mongoose */
	mongoose.connect('mongodb://localhost/test');
	var db = mongoose.connection;
	db.on('error', console.error.bind(console, 'Mongoose Error: Connection error:'.red));
	db.once('open', function() {
		callback(function() {
			console.log('Mongoose Notice: Killing database connection');
			db.close();
		});
	});
}

var spin_movies = function(count, pages, original_sources, verbose) {
	var sources = original_sources.filter(function(s) {
		return s.name != undefined && s.url != undefined && s.parse != undefined;
	});
	open_db(function(close_db) {
		new_magnets = 0;
		var spin = function(page) {
			Promise.all(sources.map(function(source) {
				return parse_torrents(source, page, verbose);
			})).then(
				function(source_returns) {
					source_returns.forEach(function(source_return, index) {
						if (source_return.new_magnets != undefined) {
							new_magnets += source_return.new_magnets;
							console.log('Movie Spiderbot Notice:', 'New magnets found:'.yellow, sources[index].name, 'page', page+':', source_return.new_magnets);
						} else {
							console.log('Movie Spiderbot Error:'.red, source_return.error);
							console.log('Movie Spiderbot Notice:', 'Removing source:'.red, sources[index].name);
							sources[index] = null;
						}
					});
					console.log('Movie Spiderbot Notice:', 'New magnets found overall:'.yellow, new_magnets);
					sources = sources.filter(function(s) { return s != null });
					if (sources.length < 1) {
						console.log('Movie Spiderbot Notice:'.yellow, 'All sources have been exhausted');
					} else if (new_magnets >= count) {
						console.log('Movie Spiderbot Notice:'.yellow, new_magnets, 'new magnets found!');
					} else if (page == pages.last) {
						console.log('Movie Spiderbot Notice:'.yellow, 'Last page crawled');
					} else {
						page += pages.iter;
						return spin(page);
					}
					close_db();
				},
				function(err) {
					console.log('Movie Spiderbot Error:'.red, 'Promise rejected:', err);
					close_db();
				}
			);
		};
		spin(pages.first);
	});
}

spin_movies(1000, { first: 1, last: 50, iter: 1 }, [kickass, pirate_bay]);
// spin_movies(1000, { first: 1, last: 50, iter: 1 }, [pirate_bay]);
