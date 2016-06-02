var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var movieSchema = new Schema({
  title: { type: String, unique: true, required: true, dropDups: true },
  year:  { type: Number, required: true },
  resolutions: [{
  	resolution: { type: String, required: true },
  	seeds:      { type: Number, required: true },
  	magnet:     { type: String, required: true }
  }],
  rated: String,
  released: Date,
  genres: { type: [String], index: true },
  director: String,
  writers: [String],
  actors: [String],
  plot: String,
  poster: { type: String, required: true },
  imdb: {
  	url: String,
  	rating: { type: Number, required: true },
  	votes: Number
  }
});

movieSchema.statics.findByTitle = function (name, cb) {
  return this.find({ title: new RegExp('^'+name+'$', 'i') }, cb);
}

var Movie = mongoose.model('Movie', movieSchema);
module.exports = Movie;

/*
{ name: 'Warcraft (2016) CAMRip | Rus',
  magnet: 'magnet:?xt=urn:btih:ba52b18286e00fe23e25f1e2b30de4c24dac0fb5&dn=Warcraft+%282016%29+CAMRip+%7C+Rus&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Fopen.demonii.com%3A1337&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Fexodus.desync.com%3A6969',
  year: 2016,
  quality: 'CAM',
  title: 'Warcraft',
  group: 'Rus',
  excess: [ 'Rip', '|' ],
  omdb:
   { title: 'Warcraft',
     year: 2016,
     rated: 'PG-13',
     released: Fri Jun 10 2016 00:00:00 GMT+0200 (CEST),
     runtime: 123,
     countries: [ 'USA' ],
     genres: [ 'Action', 'Adventure', 'Fantasy' ],
     director: 'Duncan Jones',
     writers: [ 'Duncan Jones', 'Charles Leavitt', 'Chris Metzen' ],
     actors:
      [ 'Travis Fimmel',
        'Paula Patton',
        'Ben Foster',
        'Dominic Cooper' ],
     plot: 'The peaceful realm of Azeroth stands on the brink of war as its civilization faces a fearsome race of invaders: orc warriors fleeing their dying home to colonize another. As a portal opens ...',
     poster: 'http://ia.media-imdb.com/images/M/MV5BMjIwNTM0Mzc5MV5BMl5BanBnXkFtZTgwMDk5NDU1ODE@._V1_SX300.jpg',
     imdb: { id: 'tt0803096', rating: 9, votes: 1620 },
     tomato: undefined,
     metacritic: null,
     awards: { wins: 0, nominations: 0, text: '' },
     type: 'movie' }
*/
