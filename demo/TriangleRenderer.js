var TextRenderer = require('../index.js'); //require the fontpath-renderer base

var decompose = require('fontpath-shape2d');
var triangulate = require('shape2d-triangulate');

var Vector2 = require('vecmath').Vector2;
var tmpvec = new Vector2();
var center = new Vector2();
var glyphCenter = new Vector2();

//for example purposes we will only support a very limited set of glyphs
//(e.g. basic ASCII)
var MAX_CODE_POINT = 1024;

function TriangleRenderer(font, fontSize) {
	TextRenderer.call(this, font, fontSize);

	this.simplifyAmount = 0.05;
	this.context = null;
	this.triangles = null;

	this.shapeCache = new Array(MAX_CODE_POINT);

	//The origin to scale all triangles by
	this.animationOrigin = new Vector2();
	this.explode = 0;


	//some random unit vectors
	this.randomVectors = new Array(1000);
	for (var i=0; i<this.randomVectors.length; i++)
		this.randomVectors[i] = new Vector2().random();

	//A really efficient cache would use array buffer views...
	//So one typed array would hold ALL the triangles of the glyphs.
	//Then we would have views into that array for each glyph
}

//inherits from TextRenderer
TriangleRenderer.prototype = Object.create(TextRenderer.prototype);
TriangleRenderer.constructor = TriangleRenderer;

//copy statics
TriangleRenderer.Align = TextRenderer.Align;

TriangleRenderer.prototype.renderGlyph = function(chr, glyph, scale, x, y) {
	var codepoint = chr.charCodeAt(0);
	var cached = this.shapeCache[ codepoint ];
	if (!cached) {
		var shapes = decompose(glyph);

		for (var i=0; i<shapes.length; i++) {
			shapes[i].simplify( this.font.units_per_EM*this.simplifyAmount, shapes[i] );
		}
		
		var triList = triangulate(shapes);

		// unroll into a single array
		var tris = new Array(triList.length*3);
		for (var i=0; i<triList.length; i++) {
			var t = triList[i].getPoints();
			tris[i*3+0] = { x: t[0].x, y: t[0].y };
			tris[i*3+1] = { x: t[1].x, y: t[1].y };
			tris[i*3+2] = { x: t[2].x, y: t[2].y };
			triList[i] = null;
		}

		shapes = null;
		triList = null;

		cached = tris;
		this.shapeCache[ codepoint ] = tris;
	}

	var context = this.context;

	glyphCenter.set(glyph.width/2, glyph.height/2);

	for (var i=0; i<cached.length; i+=3) {
		var a = cached[i+0];
		var b = cached[i+1];
		var c = cached[i+2];

		center.x = (a.x+b.x+c.x)/3;
		center.y = (a.y+b.y+c.y)/3;

		tmpvec.x = center.x * scale + x;
		tmpvec.y = center.y * -scale + y;

		var maxDist = 300;
		var anim = 1-Math.max(0, Math.min(1, tmpvec.dist(this.animationOrigin)/maxDist));
		// anim = 1;

		// get unit vector from triangle center to glyph center
		tmpvec.copy(center).sub(glyphCenter).normalize();

		// add some randomization to the explosion
		var rnd = this.randomVectors[ i % this.randomVectors.length ];
		tmpvec.add(rnd);

		tmpvec.scale(500 * this.explode);

		center.add(tmpvec);

		tmpvec.copy(a).lerp(center, anim);
		context.moveTo(tmpvec.x * scale + x, tmpvec.y * -scale + y);

		tmpvec.copy(b).lerp(center, anim);
		context.lineTo(tmpvec.x * scale + x, tmpvec.y * -scale + y);

		tmpvec.copy(c).lerp(center, anim);
		context.lineTo(tmpvec.x * scale + x, tmpvec.y * -scale + y);

		tmpvec.copy(a).lerp(center, anim);
		context.lineTo(tmpvec.x * scale + x, tmpvec.y * -scale + y);
	}
};

TriangleRenderer.prototype.renderUnderline = function(x, y, width, height) {
	this.context.rect(x, y, width, height);
};

TriangleRenderer.prototype.fill = function(context, x, y, start, end) {
	if (!context)
		throw "fill() must be specified with a canvas context";
	if (this.triangles === null)
		this.process();

	this.context = context;
	this.strokeUnderline = false;
	context.beginPath();
	this.render(x, y, start, end);
	context.fill();
};

TriangleRenderer.prototype.stroke = function(context, x, y, start, end) {
	if (!context)
		throw "stroke() must be specified with a canvas context";
	if (this.triangles === null)
		this.process();

	this.context = context;
	this.strokeUnderline = true;
	context.beginPath();
	this.render(x, y, start, end);
	context.stroke();
};

TriangleRenderer.prototype.release = function() {
	this.triangles.length = 0;
	this.triangles = null;
	this.shapeCache = {};
};

//Processes the current state into triangles. 
TriangleRenderer.prototype.process = function() {
	if (this.triangles === null)
		this.triangles = [];

	this.triangles.length = 0;
};

module.exports = TriangleRenderer;