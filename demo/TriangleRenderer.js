var TextRenderer = require('../index.js'); //require the fontpath-renderer base


var smoothstep = require('interpolation').smoothstep;
var decompose = require('fontpath-shape2d');
var triangulate = require('shape2d-triangulate');
var inherits = require('inherits');

var Vector2 = require('vecmath').Vector2;
var tmpvec = new Vector2();
var tmpvec2 = new Vector2();
var center = new Vector2();
var glyphCenter = new Vector2();

//for example purposes we will only support a very limited set of glyphs
//(e.g. basic ASCII)
var MAX_CODE_POINT = 1024;

function TriangleRenderer(opt) {
	if (!(this instanceof TriangleRenderer))
		return new TriangleRenderer(opt);
	TextRenderer.call(this, opt);

	this.simplifyAmount = 0.05;
	this.context = null;
	this.triangles = [];

	this.shapeCache = new Array(MAX_CODE_POINT);

	//The origin to scale all triangles by
	this.animationOrigin = new Vector2();
	this.explode = 0;
	this.animationDistance = 100;

	//some random unit vectors
	this.randomVectors = new Array(1000);
	for (var i=0; i<this.randomVectors.length; i++)
		this.randomVectors[i] = new Vector2().random();

	//A really efficient cache would use array buffer views...
	//So one typed array would hold ALL the triangles of the glyphs.
	//Then we would have views into that array for each glyph
}

//inherits from TextRenderer
inherits(TriangleRenderer, TextRenderer);

TriangleRenderer.prototype.renderGlyph = function(i, glyph, scale, x, y) {
	var chr = this.text.charAt(i);
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
	
	var maxDistSq = this.animationDistance*this.animationDistance;

	for (var i=0; i<cached.length; i+=3) {
		var rnd = this.randomVectors[ i % this.randomVectors.length ];
		
		var a = cached[i+0];
		var b = cached[i+1];
		var c = cached[i+2];

		center.x = (a.x+b.x+c.x)/3;
		center.y = (a.y+b.y+c.y)/3;

		tmpvec.x = center.x * scale + x;
		tmpvec.y = center.y * -scale + y;
		
		//add some randomization into the distance check
		tmpvec.x += rnd.x*10;
		tmpvec.y += rnd.y*10;

		var dist = tmpvec.distSq(this.animationOrigin)/maxDistSq;
		var anim = 1-Math.max(0, Math.min(1, dist));

		// get unit vector from triangle center to glyph center
		tmpvec.copy(center).sub(glyphCenter).normalize();

		// add some randomization to the explosion
		tmpvec.add(rnd);

		// explode the unit vector outward
		tmpvec.scale(500 * this.explode);

		// add the unit vector to move center
		center.add(tmpvec);

		//animate our vertices...
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
	this.context = context;
	this.strokeUnderline = false;
	context.beginPath();
	this.render(x, y, start, end);
	context.fill();
};

TriangleRenderer.prototype.stroke = function(context, x, y, start, end) {
	if (!context)
		throw "stroke() must be specified with a canvas context";
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

module.exports = TriangleRenderer;