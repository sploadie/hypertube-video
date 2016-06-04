/* Stuff to serve. Don't add null or "null" to the list (".null" should be fine)                */
/* as the regex extension check will fail and you'll have a big security hole.                  */
/* And obviously don't add .js, .php or anything else you don't want to serve as source either. */
var mimeTypes = {
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

module.exports = mimeTypes;