"use strict";

var fs = require('fs');
var url = require('url');
var events = require('events');
var colors  = require('colors');
var settings = require('./config.json');
var Throttle = require('throttle');

var handler = new events.EventEmitter();

var mimeTypes = require('./mime_types');

var spiderStreamer = function(data, res) {
	var stream;
	var info = {};
	var ext;

	ext = data.name.match(/.*(\..+?)$/);

	if (ext === null || ext.length !== 2 || (info.mime = mimeTypes[ext[1].toLowerCase()]) === undefined) {
		console.error('spiderStreamer Error:'.red, 'Invalid mime type:', name);
		handler.emit("badMime", res);
		return false;
	}

	info.file = data.name;
	info.path = data.path;
	info.start = 0;
	info.end = data.length - 1;
	info.size = data.length;
	info.modified = data.date;
	info.rangeRequest = false; /* Tinker with this is something breaks */

	info.length = info.end - info.start + 1;

	console.log('spiderStreamer Notice: Sending header');
	downloadHeader(res, info);

	// Flash vids seem to need this on the front, even if they start part way through. (JW Player does anyway.)
	if (info.start > 0 && info.mime === "video/x-flv") {
		res.write("FLV" + pack("CCNN", 1, 5, 9, 9));
	}
	// stream = fs.createReadStream(info.path, { flags: "r", start: info.start, end: info.end });
	// stream = data.stream; /* Use torrent-stream rather than file */
	stream = fs.createReadStream(info.path, { flags: "r", start: info.start, end: info.end });

	if (settings.throttle) {
		stream = stream.pipe(new Throttle(settings.throttle));
	}

	console.log('spiderStreamer Notice: Piping stream');
	stream.pipe(res);
	console.log('spiderStreamer Notice: Pipe set');
	return true;
};

spiderStreamer.settings = function(s) {
	for (var prop in s) { settings[prop] = s[prop]; }
	return spiderStreamer;
};

var downloadHeader = function(res, info) {
	var code = 200;
	var header;

	// 'Connection':'close',
	// 'Cache-Control':'private',
	// 'Transfer-Encoding':'chunked'

	if (settings.forceDownload) {
		header = {
			Expires: 0,
			"Cache-Control": "must-revalidate, post-check=0, pre-check=0",
			//"Cache-Control": "private",
			"Content-Type": info.mime,
			"Content-Disposition": "attachment; filename=" + info.file + ";"
		};
	} else {
		header = {
			"Cache-Control": "public; max-age=" + settings.maxAge,
			Connection: "keep-alive",
			"Content-Type": info.mime,
			"Content-Disposition": "inline; filename=" + info.file + ";",
			"Accept-Ranges": "bytes"
		};

		if (info.rangeRequest) {
			// Partial http response
			code = 206;
			header.Status = "206 Partial Content";
			header["Content-Range"] = "bytes " + info.start + "-" + info.end + "/" + info.size;
		}
	}

	header.Pragma = "public";
	header["Last-Modified"] = info.modified.toUTCString();
	header["Content-Transfer-Encoding"] = "binary";
	header["Content-Length"] = info.length;
    if(settings.cors){
        header["Access-Control-Allow-Origin"] = "*";
        header["Access-Control-Allow-Headers"] = "Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept";
    }
    header.Server = settings.server;
	
	res.writeHead(code, header);
};

var errorHeader = function(res, code) {
	var header = {
		"Content-Type": "text/html",
		Server: settings.server
	};

	res.writeHead(code, header);
};

// A tiny subset of http://phpjs.org/functions/pack:880
var pack = function(format) {
	var result = "";

	for (var pos = 1, len = arguments.length; pos < len; pos++) {
		if (format[pos - 1] == "N") {
			result += String.fromCharCode(arguments[pos] >> 24 & 0xFF);
			result += String.fromCharCode(arguments[pos] >> 16 & 0xFF);
			result += String.fromCharCode(arguments[pos] >> 8 & 0xFF);
			result += String.fromCharCode(arguments[pos] & 0xFF);
		} else {
			result += String.fromCharCode(arguments[pos]);
		}
	}

	return result;
};

handler.on("badMime", function(res) {
	errorHeader(res, 403);
	res.end("<!DOCTYPE html><html lang=\"en\">" +
		"<head><title>403 Forbidden</title></head>" +
		"<body>" +
		"<h1>Sorry...</h1>" +
		"<p>Cannot stream that movie format.</p>" +
		"</body></html>");
});

/*process.on('uncaughtException', function(e) {
	util.debug(e);
});*/

module.exports = spiderStreamer;
