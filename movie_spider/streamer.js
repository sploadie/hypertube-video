"use strict";

var fs = require('fs');
var url = require('url');
var events = require('events');
var colors  = require('colors');
var settings = require('./config.json');
var Throttle = require('throttle');

var handler = new events.EventEmitter();

var mimeTypes = require('./mime_types');

var spiderStreamer = function(data, query, range_string, res) {
	var stream;
	var info = {};
	var ext;
	var range;
	var i;
	var timer_id;

	ext = data.name.match(/.*(\..+?)$/);

	if (ext === null || ext.length !== 2 || (info.mime = mimeTypes[ext[1].toLowerCase()]) === undefined) {
		console.error('spiderStreamer Error:'.red, 'Invalid mime type:', name);
		handler.emit("badMime", res);
		return false;
	}

	if (range_string && (range = range_string.match(/bytes=(.+)-(.+)?/)) !== null) {
		info.start = isNumber(range[1]) && range[1] >= 0 && range[1] < info.end ? range[1] - 0 : info.start;
		info.end = isNumber(range[2]) && range[2] > info.start && range[2] <= info.end ? range[2] - 0 : info.end;
		info.rangeRequest = true;
	} else {
		
	}

	info.file = data.name;
	info.path = data.path;
	info.size = data.length;
	info.modified = data.date;
	info.rangeRequest = false;
	info.start = 0;
	info.end = data.length - 1;

	if (range_string && (range = range_string.match(/bytes=(.+)-(.+)?/)) !== null) {
		info.start = isNumber(range[1]) && range[1] >= 0 && range[1] < info.end ? range[1] - 0 : info.start;
		info.end = isNumber(range[2]) && range[2] > info.start && range[2] <= info.end ? range[2] - 0 : info.end;
		info.rangeRequest = true;
	} else if (query.start || query.end) {
		// This is a range request, but doesn't get range headers. So there.
		info.start = isNumber(query.start) && query.start >= 0 && query.start < info.end ? query.start - 0 : info.start;
		info.end = isNumber(query.end) && query.end > info.start && query.end <= info.end ? query.end - 0 : info.end;
	}

	info.length = info.end - info.start + 1;

	console.log('spiderStreamer Notice: Sending header');
	downloadHeader(res, info);

	// Flash vids seem to need this on the front, even if they start part way through. (JW Player does anyway.)
	if (info.start > 0 && info.mime === "video/x-flv") {
		res.write("FLV" + pack("CCNN", 1, 5, 9, 9));
	}
	// stream = fs.createReadStream(info.path, { flags: "r", start: info.start, end: info.end });
	// stream = data.stream; /* Use torrent-stream rather than file */
	stream = null;
	i = 0;
	timer_id = setInterval(function() {
		++i;
		if (stream == null) {
			if (i === 5) {
				clearInterval(timer_id);
				console.error('spiderStreamer Error:'.red, 'Could not stream file:', info.path);
				handler.emit("badFile", res);
				return;
			}
			try {
				stream = fs.createReadStream(info.path, { flags: "r", start: info.start, end: info.end });
			} catch(exception) {
				console.log('spiderStreamer Error:'.red, exception);
				console.log('spiderStreamer Notice: Retrying in 1 second...');
				stream = null
			}
			if (stream !== null) {
				if (settings.throttle) {
					stream = stream.pipe(new Throttle(settings.throttle));
				}
				console.log('spiderStreamer Notice: Piping stream');
				stream.pipe(res);
				console.log('spiderStreamer Notice: Pipe set');
			}
		}
		if (stream !== null) {
			clearInterval(timer_id);
		}
	}, 1000);
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

var isNumber = function (n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
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
handler.on("badRange", function(res) {
	errorHeader(res, 403);
	res.end("<!DOCTYPE html><html lang=\"en\">" +
		"<head><title>403 Forbidden</title></head>" +
		"<body>" +
		"<h1>Sorry...</h1>" +
		"<p>Cannot stream that byte range.</p>" +
		"</body></html>");
});
handler.on("badFile", function(res) {
	errorHeader(res, 404);
	res.end("<!DOCTYPE html><html lang=\"en\">" +
		"<head><title>404 Not Found</title></head>" +
		"<body>" +
		"<h1>Sorry...</h1>" +
		"<p>Cannot stream that file.</p>" +
		"</body></html>");
});

/*process.on('uncaughtException', function(e) {
	util.debug(e);
});*/

module.exports = spiderStreamer;
