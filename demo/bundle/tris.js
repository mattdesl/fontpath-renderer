(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var TextRenderer = require('../index.js'); //require the fontpath-renderer base


var smoothstep = require('interpolation').smoothstep;
var decompose = require('fontpath-shape2d');
var triangulate = require('shape2d-triangulate');

var Vector2 = require('vecmath').Vector2;
var tmpvec = new Vector2();
var tmpvec2 = new Vector2();
var center = new Vector2();
var glyphCenter = new Vector2();

//for example purposes we will only support a very limited set of glyphs
//(e.g. basic ASCII)
var MAX_CODE_POINT = 1024;

function TriangleRenderer(font, fontSize) {
	TextRenderer.call(this, font, fontSize);

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
TriangleRenderer.prototype = Object.create(TextRenderer.prototype);
TriangleRenderer.constructor = TriangleRenderer;

//copy statics
TriangleRenderer.Align = TextRenderer.Align;

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
},{"../index.js":3,"fontpath-shape2d":9,"interpolation":23,"shape2d-triangulate":24,"vecmath":44}],2:[function(require,module,exports){
var test = require('canvas-testbed');

var Vector2 = require('vecmath').Vector2;

//the font we want to render
var Font = require('fontpath-test-fonts/lib/Alegreya-Regular.otf');

var TriangleRenderer = require('./TriangleRenderer');

// var text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
var text = "Resize your browser for word wrap.";

//padding we'll render the text from the top left edge
var padding = 20;

var renderer = new TriangleRenderer();

//setup the text renderer
renderer.text = text;
renderer.font = Font;
renderer.fontSize = 100;
renderer.align = 'left';
renderer.layout(window.innerWidth-padding); 

var textHeight = renderer.getBounds().height;

var mouse = new Vector2();
window.addEventListener("mousemove", function(ev) {
	mouse.set(ev.clientX, ev.clientY);
});
window.addEventListener("touchmove", function(ev) {
	ev.preventDefault();
	var t = ev.touches || ev.changedTouches;
	mouse.set(t[0].pageX, t[0].pageY);
})

//Update layout to window width
window.addEventListener("resize", function() {
	renderer.layout(window.innerWidth-padding);
	textHeight = renderer.getBounds().height;
});

var time = 0;
function render(context, width, height) {
	context.clearRect(0, 0, width, height);

	//text is drawn with lower-left origin..
	var x = padding,
		y = padding+textHeight;

	time += 0.1;
	
	renderer.animationDistance = 120;

	//simple linear tween to the new mouse position
	renderer.animationOrigin.lerp(mouse, 0.02);

	//animate the scaling effect
	renderer.explode = Math.sin(time*0.1)/2+0.5;

	//let's stroke the first word, and fill the rest
	var space = text.indexOf(' ');
	context.strokeStyle = '#555';
	renderer.stroke(context, x, y, 0, space);	
	renderer.fill(context, x, y, space);	
}

test(render);
},{"./TriangleRenderer":1,"canvas-testbed":4,"fontpath-test-fonts/lib/Alegreya-Regular.otf":21,"vecmath":44}],3:[function(require,module,exports){
var GlyphIterator = require('fontpath-glyph-iterator');
var WordWrap = require('fontpath-wordwrap');

var tmpBounds = { x: 0, y: 0, width: 0, height: 0, glyphs: 0 };

function TextRenderer(font, fontSize) {
    this.iterator = new GlyphIterator(font, fontSize);
    this.wordwrap = new WordWrap();

    this.align = TextRenderer.Align.LEFT;
    this.underline = false;

    this.underlineThickness = undefined;
    this.underlinePosition = undefined;
    this._text = "";
}

//Externally we use strings for parity with HTML5 canvas, better debugging, etc.
TextRenderer.Align = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
};

//Internally we will use integers to avoid string comparison for each glyph
var LEFT_ALIGN = 0, CENTER_ALIGN = 1, RIGHT_ALIGN = 2;
var ALIGN_ARRAY = [
    TextRenderer.Align.LEFT, 
    TextRenderer.Align.CENTER, 
    TextRenderer.Align.RIGHT
];

/**
 * If the new font differs from the last, the text layout is cleared
 * and placed onto a single line. Users must manually re-layout the text 
 * for word wrapping.
 */
Object.defineProperty(TextRenderer.prototype, "font", {
    get: function() {
        return this.iterator.font;
    },
    set: function(val) {
        var oldFont = this.iterator.font;
        this.iterator.font = val;
        if (oldFont !== this.iterator.font)
            this.clearLayout();
    },
});

/**
 * If the new font size differs from the last, the text layout is cleared
 * and placed onto a single line. Users must manually re-layout the text 
 * for word wrapping.
 */
Object.defineProperty(TextRenderer.prototype, "fontSize", {
    get: function() {
        return this.iterator.fontSize;
    },
    set: function(val) {
        var oldSize = this.iterator.fontSize;

        this.iterator.fontSize = val;

        if (oldSize !== this.iterator.fontSize)
            this.clearLayout();
    },
});

/**
 * If the new text is different from the last, the layout (i.e. word-wrapping)
 * is cleared and the result is a single line of text (similar to HTML5 canvas text
 * rendering).
 * 
 * The text then needs to be re-wordwrapped with a call to `layout()`.
 */
Object.defineProperty(TextRenderer.prototype, "text", {
    get: function() {
        return this._text;
    },

    set: function(text) {
        text = text||"";

        var old = this._text;
        this._text = text;
        this.wordwrap.text = this.text;

        if (this._text !== old) 
            this.clearLayout();
    }
});

/**
 * Clears the text layout and word-wrapping, placing all of it on a single line.
 */
TextRenderer.prototype.clearLayout = function() {
    this.wordwrap.text = this.text;
    this.wordwrap.empty();

    if (this.iterator.font) //font might not have been passed at constructor
        this.wordwrap.clearLayout(this.iterator);
};

/**
 * Calls the word wrapper to layout the current text string,
 * based on the wrap width and any current wordwrapping options.
 *
 * This is called when the text is changed. 
 * 
 * @return {[type]} [description]
 */
TextRenderer.prototype.layout = function(wrapWidth) {
    this.wordwrap.text = this.text;
    this.wordwrap.empty();
    this.wordwrap.layout(this.iterator, wrapWidth);
};

/**
 * "Renders" this glyph at the given location. This may involve filling
 * a VBO with vertex data, or it may be a direct call to draw a bitmap glyph
 * or shape outline.
 * @return {[type]} [description]
 */
TextRenderer.prototype.renderGlyph = function() {

};

TextRenderer.prototype.renderUnderline = function() {

};

/**
 * Returns the bounds of the current text layout. 
 *
 * The height does not extend past the baseline of the
 * last line; unless `includeUnderline` is true, in which
 * case the underline's position and height is included
 * in the calculation. 
 *
 * The bounding y position is offset so that the box has an upper-left
 * origin, for parity with HTML5 canvas rendering.
 * 
 * @param {Boolean} includeUnderline whether to include the underline in the calculation, default false
 * @param {Object} out an optional {width, height} object for re-use
 * @return {Object} a size with { width, height } properties
 */
TextRenderer.prototype.getBounds = function (includeUnderline, out) {
    if (!out)
        out = { x: 0, y: 0, width: 0, height: 0 };

    var wordwrapper = this.wordwrap;
    var itr = this.iterator;

    //tighten the bounding box around the first line..
    var firstLineHeight = 0;
    if (wordwrapper.lines.length > 0) {
        var firstLine = wordwrapper.lines[0];
        itr.getBounds(this.text, firstLine.start, firstLine.end, undefined, tmpBounds);
        firstLineHeight = tmpBounds.height;
    }

    out.width = wordwrapper.getMaxLineWidth();   
    out.height = Math.max(0, wordwrapper.lines.length-1) * itr.getLineGap() + firstLineHeight;

    out.x = 0;
    out.y = -out.height;

    if (includeUnderline) {
        var underlineHeight = this.computeUnderlineHeight();
        var underlinePosition = this.computeUnderlinePosition();
        var underlineOff = underlinePosition+underlineHeight/2;
        out.height += underlineOff;
    }

    return out;
};

/**
 * Computes the scaled underline height as pixels, based on 
 * the explicit `underlineHeight` (in pixels). If `underlineHeight` is
 * undefined or null, it will try to use the font's non-zero underline height, 
 * otherwise default to 1/8 of the font's EM square.
 * 
 * @return {Number} the pixel height of the underline 
 */
TextRenderer.prototype.computeUnderlineHeight = function () {
    var font = this.font;
    var scale = this.iterator.fontScale;
    if (this.underlineHeight===0||this.underlineHeight) {
        return this.underlineHeight; 
    } else if (font.underline_thickness) {
        return font.underline_thickness * scale; 
    } else
        return (font.units_per_EM/8)*scale;
};

/**
 * Computes the scaled underline height as pixels, based on 
 * the explicit `underlinePosition` (in pixels). If `underlinePosition` is
 * undefined or null, it will try to use the font's non-zero underline position, 
 * otherwise default to 1/4 of the font's EM square.
 *
 * This is the Y offset from the text baseline to the center of the underline 
 * bar, in pixels. It is generally a positive value.
 * 
 * @return {Number} the pixel position of the underline 
 */
TextRenderer.prototype.computeUnderlinePosition = function () {
    var font = this.font;
    var scale = this.iterator.fontScale;
        
    if (this.underlinePosition===0||this.underlinePosition) {
        return this.underlinePosition; 
    } else if (font.underline_position) {
        return -font.underline_position * scale; 
    } else 
        return (font.units_per_EM/4)*scale;
};

/**
 * Gets the descent of the current font (assumes its size 
 * is already set). This is an absolute (positive) value.
 * 
 * @return {[type]} [description]
 */
TextRenderer.prototype.getDescender = function () {
    return Math.abs(this.iterator.fontScale * this.iterator.font.descender);
};

/**
 * Gets the descent of the current font (assumes its size 
 * is already set). This is an absolute (positive) value.
 * 
 * @return {[type]} [description]
 */
TextRenderer.prototype.getAscender = function () {
    return Math.abs(this.iterator.fontScale * this.iterator.font.ascender);
};

//Signals for subclasses to optionally implmeent
//This may be useful to stop/start paths with different fills
TextRenderer.prototype.onBegin = function() { }
TextRenderer.prototype.onEnd = function() { }
TextRenderer.prototype.onBeginLine = function(lineIndex) { }
TextRenderer.prototype.onEndLine = function(lineIndex) { }

/**
 * Renders the current text layout, where lower-left is 
 * the origin. Multiple lines will be positioned above the
 * origin.
 */
TextRenderer.prototype.render = function (x, y, start, end) {
    x = x||0;
    y = y||0;

    var text = this.text;
    var wordwrapper = this.wordwrap;

    //if we have nothing to draw
    if (!text || wordwrapper.lines.length === 0)
        return;

    //default start/end params
    start = start||0;
    end = typeof end === "number" ? end : text.length;

    var itr = this.iterator;
    var scale = itr.fontScale;
    var font = itr.font;
    var underline = this.underline;

    //used for alignment...
    var maxLineWidth = wordwrapper.getMaxLineWidth();
    
    y -= Math.max(0, wordwrapper.lines.length-1) * itr.getLineGap();


    //use numbers to avoid str compare for each glyph
    var alignType = ALIGN_ARRAY.indexOf(this.align||"");
    if (alignType===-1)
        alignType = LEFT_ALIGN;

    var underlineX = 0;
    var underlineStartX = 0;
    var underlineY = 0;
    var underlineWidth = 0;

    var underlineStarted = false;

    //Try to use user-specified underline settings, otherwise use the font if possible,
    //otherwise just use a rough default based on EM square.    
    var underlinePos = this.computeUnderlinePosition();
    var underlineHeight = this.computeUnderlineHeight();

    this.onBegin();
    
    //set the origin and pen position
    itr.begin(x, y);
    for (var k=0; k<wordwrapper.lines.length; k++) {
        var line = wordwrapper.lines[k];
        underlineStarted = false;

        var lastAdvance = 0;

        var lineX = itr.pen.x;
        var lineY = itr.pen.y;

        this.onBeginLine(k);

        //TODO: use multiple Nodes inside a single line
        //a node will have attributes like font, size, color, 
        //letter-spacing, underline, etc.
        //This will affect the line height, as it will have to be the max of all nodes.

        for (var i=line.start; i<line.end; i++) {
            var chr = text.charAt(i);

            //Step the iterator, moving forward based on kerning from last char
            var glyph = itr.step(text, i);

            if (!glyph)
                continue;

            //within desired range
            if (i >= start && i < end) {
                var tx = itr.pen.x;
                var ty = itr.pen.y;

                if (alignType === CENTER_ALIGN) {
                    tx += (maxLineWidth-line.width)/2;
                } else if (alignType === RIGHT_ALIGN) {
                    tx += (maxLineWidth-line.width);
                }

                if (!underlineStarted) {
                    underlineX = tx;
                    underlineStartX = tx;
                    underlineY = ty + underlinePos;
                    underlineWidth = 0;
                    underlineStarted = true;
                } else {
                    underlineWidth = tx - underlineStartX;
                }

                this.renderGlyph(i, glyph, scale, tx, ty);
            }

            //Advance the iterator to the next glyph in the string
            var newAdvance = itr.advance(glyph);

            if (i >= start && i < end)
                lastAdvance = newAdvance;
        }

        this.onEndLine(k);

        if (underline) {
            underlineWidth += lastAdvance;
            this.renderUnderline(underlineX, underlineY-underlineHeight/2, underlineWidth, underlineHeight);
        }
        
        //Steps down a line...
        if (k < wordwrapper.lines.length-1) {
            itr.advanceLine();
        }
    }

    //finish the iterator...
    itr.end();
    this.onEnd();
};

module.exports = TextRenderer;
},{"fontpath-glyph-iterator":7,"fontpath-wordwrap":22}],4:[function(require,module,exports){
var domready = require('domready');
require('raf.js');

module.exports = function( render, start, options ) {
	domready(function() {
		options = options||{};
		
		document.body.style.margin = "0";
		document.body.style.overflow = "hidden";

		var canvas = document.createElement("canvas");
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		canvas.setAttribute("id", "canvas");

		document.body.appendChild(canvas);

		var context,
			attribs = options.contextAttributes||{};
		if (options.context === "webgl" || options.context === "experimental-webgl") {
			try {
				context = (canvas.getContext('webgl', attribs) 
							|| canvas.getContext('experimental-webgl', attribs));
			} catch (e) {
				context = null;
			}
			if (!context) {
				throw "WebGL Context Not Supported -- try enabling it or using a different browser";
			}	
		} else {
			context = canvas.getContext(options.context||"2d", attribs);
		}

		var width = canvas.width,
			height = canvas.height;
			
		if (!options.ignoreResize) {
			window.addEventListener("resize", function() {
				width = window.innerWidth;
				height = window.innerHeight;
				canvas.width = width;
				canvas.height = height;

				if (options.once)
					requestAnimationFrame(renderHandler);
			});
		}
		
		var then = Date.now();

		if (typeof start === "function") {
			start(context, width, height);
		}

		if (typeof render === "function") {
			function renderHandler() {
				var now = Date.now();
				var dt = (now-then);

				if (!options.once)
					requestAnimationFrame(renderHandler);
				
				render(context, width, height, dt);
				then = now;
			}
			requestAnimationFrame(renderHandler);
		}			
	});
}
},{"domready":5,"raf.js":6}],5:[function(require,module,exports){
/*!
  * domready (c) Dustin Diaz 2014 - License MIT
  */
!function (name, definition) {

  if (typeof module != 'undefined') module.exports = definition()
  else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
  else this[name] = definition()

}('domready', function () {

  var fns = [], listener
    , doc = document
    , domContentLoaded = 'DOMContentLoaded'
    , loaded = /^loaded|^i|^c/.test(doc.readyState)

  if (!loaded)
  doc.addEventListener(domContentLoaded, listener = function () {
    doc.removeEventListener(domContentLoaded, listener)
    loaded = 1
    while (listener = fns.shift()) listener()
  })

  return function (fn) {
    loaded ? fn() : fns.push(fn)
  }

});

},{}],6:[function(require,module,exports){
/*
 * raf.js
 * https://github.com/ngryman/raf.js
 *
 * original requestAnimationFrame polyfill by Erik Möller
 * inspired from paul_irish gist and post
 *
 * Copyright (c) 2013 ngryman
 * Licensed under the MIT license.
 */

(function(window) {
	var lastTime = 0,
		vendors = ['webkit', 'moz'],
		requestAnimationFrame = window.requestAnimationFrame,
		cancelAnimationFrame = window.cancelAnimationFrame,
		i = vendors.length;

	// try to un-prefix existing raf
	while (--i >= 0 && !requestAnimationFrame) {
		requestAnimationFrame = window[vendors[i] + 'RequestAnimationFrame'];
		cancelAnimationFrame = window[vendors[i] + 'CancelAnimationFrame'];
	}

	// polyfill with setTimeout fallback
	// heavily inspired from @darius gist mod: https://gist.github.com/paulirish/1579671#comment-837945
	if (!requestAnimationFrame || !cancelAnimationFrame) {
		requestAnimationFrame = function(callback) {
			var now = +new Date(), nextTime = Math.max(lastTime + 16, now);
			return setTimeout(function() {
				callback(lastTime = nextTime);
			}, nextTime - now);
		};

		cancelAnimationFrame = clearTimeout;
	}

	// export to window
	window.requestAnimationFrame = requestAnimationFrame;
	window.cancelAnimationFrame = cancelAnimationFrame;
}(window));

},{}],7:[function(require,module,exports){
var util = require('fontpath-util');

var DEFAULT_TAB_WIDTH = 4;

function GlyphIterator(font, fontSize) {
    this._fontSize = undefined;
    this._font = undefined;
    this.fontScale = 1.0;
    this.kerning = true;
    this.lineHeight = undefined;

    this.fontSize = fontSize;
    this.font = font;

    //Number of spaces for a tab character
    this.tabWidth = DEFAULT_TAB_WIDTH;
    this._tabGlyph = null;

    this.origin = { x: 0, y: 0 };
    this.pen = { x: 0, y: 0 };
}

Object.defineProperty(GlyphIterator.prototype, "font", {
    get: function() {
        return this._font;
    },

    set: function(font) {
        this._font = font;

        //Determine the new scaling factor...
        if (font) {
            this.fontScale = util.getPxScale(font, this.fontSize);

            //Updates the tab glyph
            this.tabWidth = this._tabWidth;
        }
    },
});

//There might be a better way of handling tab width using FreeType ? 
Object.defineProperty(GlyphIterator.prototype, "tabWidth", {

    get: function() {
        return this._tabWidth;
    },

    set: function(val) {
        this._tabWidth = val===0 || val ? val : DEFAULT_TAB_WIDTH;
        this._tabGlyph = {};

        var spaceGlyph = this.font ? this.font.glyphs[" "] : null;
        if (spaceGlyph) {
            this._tabGlyph = {};
            for (var k in spaceGlyph) {
                this._tabGlyph[k] = spaceGlyph[k];
            }
            if (this._tabGlyph.xoff)
                this._tabGlyph.xoff *= this._tabWidth;
        }
    },
});

Object.defineProperty(GlyphIterator.prototype, "fontSize", {
    get: function() {
        return this._fontSize;
    },

    set: function(val) {
        this._fontSize = val;

        //If the font is already set, determine the new scaling factor
        if (this._font) {
            this.fontScale = util.getPxScale(this._font, this._fontSize);
        }
    },
});

GlyphIterator.prototype.getKerning = function(left, right) {
    var font = this.font;

    if (!font || !font.kerning)
        return 0;

    var table = this.kerningTable;

    for (var i=0; i<font.kerning.length; i++) {
        var k = font.kerning[i];
        if (k[0] === left && k[1] === right) 
            return k[2];
    }
    return 0;
};

GlyphIterator.prototype.begin = function(x, y) {
    this.origin.x = x||0;
    this.origin.y = y||0;

    this.pen.x = this.origin.x;
    this.pen.y = this.origin.y;
};

GlyphIterator.prototype.end = function() {
    //.. mainly for consistency with begin()
    //Might be useful later on
};

GlyphIterator.prototype.getLineGap = function() {
    //Line height handling is a mess in browsers.
    //Maybe the best solution is to encourage users to 
    //specify pixel line heights if they want to match browser standards,
    //otherwise it's unreasonable to expect the line gaps to line up exactly
    //across all browsers. Example of the disaster:
    //http://lists.w3.org/Archives/Public/www-style/2008Jan/0413.html

    //For reference, some baseline-to-baseline calculations:
    //http://www.microsoft.com/typography/otspec/recom.htm
    //freetype.org/freetype2/docs/reference/ft2-base_interface.html
    //http://www.freetype.org/freetype2/docs/glyphs/glyphs-3.html

    //Unfortunately none of these are producing line-heights that avoid overlapping
    //or resemble browser rendering in any way. 

    // If CSS uses 1em or 1, the browser offsets the line by the 
    // font's pixel size. If an exact pixel line-height is specified,
    // the browser will use that + a computed "linegap." 
    // If 'auto' is specified for line-height, the calculations seem
    // much more complex and browser/platform dependent (not included here).
    
    var font = this.font,
        scale = this.fontScale;
    var gap = (font.height - font.ascender + Math.abs(font.descender)) * scale;    
    var lineHeight = this.lineHeight;
    
    lineHeight = (lineHeight===0||lineHeight) 
            ? (lineHeight + gap)
            : this.fontSize;
    return lineHeight;
};

GlyphIterator.prototype.translate = function(x, y) {
    this.origin.x += x||0;
    this.origin.y += y||0;

    this.pen.x += x||0;
    this.pen.y += y||0;
};

GlyphIterator.prototype.step = function(text, index) {
    var scale = this.fontScale,
        font = this._font;

    var chr = text.charAt(index); 

    if (chr === '\t' && this._tabGlyph) {
        return this._tabGlyph;
    }

    //Skip missing characters...
    if (!(chr in font.glyphs))
        return;
    
    var glyph = font.glyphs[chr];

    //If we have a char to the left, determine its kerning
    if (index > 0 && this.kerning) {
        var kern = this.getKerning(text.charAt(index-1), chr);
        this.pen.x += (kern*scale);
    }

    return glyph;
};

GlyphIterator.prototype.advanceLine = function() {
    this.pen.y += this.getLineGap();
    this.pen.x = this.origin.x;
};

/**
 * Called after step. 
 */
GlyphIterator.prototype.advance = function(glyph) {
    var advance = (glyph.xoff * this.fontScale);
    // Advance to next pen position
    this.pen.x += advance;
    return advance;
};

/**
 * This is a utility function that provides the bounds of the given
 * text (from start and end positions) as if they were laid out horizontally,
 * left to right.
 *
 * For convenience, this will not alter the current pen and origin positions.
 * This way it can be utilized inside a glyph iteration (i.e. for rendering).
 *
 * If `availableWidth` is specified, this will break before reaching the specified
 * pixel width, to ensure that all glyphs will fit inside the bounds. 
 *
 * The return object also includes a `glyphs` property, which is the number of glyphs
 * that are visible within the returned bounds. 
 *
 * If `out` is specified (an object with x, y, width, height, and glyph properties),
 * it will be re-used. Otherwise a new object is created.
 * 
 * @param {String} text the text to check
 * @param {Number} start the start position, defaults to 0
 * @param {Number} end the end position, exclusive, defaults to text length
 * @param {Number} availableWidth the width before stopping the bound check
 * @param {Object} out an object to re-use for the return value
 * @return {Object} the bounds and glyph count {x,y,width,height,glyphs}
 */
GlyphIterator.prototype.getBounds = function(text, start, end, availableWidth, out) {
    if (!out)
        out = { x:0, y:0, width: 0, height: 0, glyphs: 0 };

    var checkWidth = availableWidth===0||availableWidth;

    start = start||0;
    end = end===0||end ? end : text.length;

    var maxHeight = 0;

    out.x = 0;
    out.y = 0;
    out.glyphs = 0;

    var oldPenX = this.pen.x,
        oldPenY = this.pen.y,
        oldOriginX = this.origin.x,
        oldOriginY = this.origin.y;


    var font = this.font;
    this.begin();
    for (var i=start; i<end; i++) {
        var chr = text.charAt(i);

        //step the iterator
        var glyph = this.step(text, i);

        //if the glyph is valid, we can advance past it and calculate new height
        if (glyph) {
            var height = (glyph.height)*this.fontScale;

            out.y = Math.max(out.y, this.fontScale*(glyph.height-glyph.hby));

            maxHeight = Math.max(maxHeight, height);
            var lastAdvance = this.advance(glyph);

            //if we're past the available width
            var newWidth = this.pen.x - this.origin.x;
            if (checkWidth && (newWidth - availableWidth > 0.001)) {
                this.pen.x -= lastAdvance;
                break;
            }

            out.glyphs++;
        }
    }
    this.end();

    out.width = this.pen.x - this.origin.x;
    out.height = maxHeight;

    this.pen.x = oldPenX;
    this.pen.y = oldPenY;
    this.origin.x = oldOriginX;
    this.origin.y = oldOriginY;

    return out;
};

module.exports = GlyphIterator;
},{"fontpath-util":8}],8:[function(require,module,exports){
// module.exports.pointsToPixels = function(pointSize, resolution) {
// 	resolution = typeof resolution === "number" ? resolution : 72;
// 	return pointSize * resolution / 72;
// };

// module.exports.coordToPixel = function(coord, pixelSize, emSize) {
// 	emSize = typeof emSize === "number" ? emSize : 2048;
// 	return coord * pixelSize / emSize;
// };

/**
 * Converts a pt size to px size, namely useful for matching
 * size with CSS styles. If no DPI is specified, 96 is assumed
 * (as it leads to correct rendering in all browsers).
 * 
 * @param  {Number} fontSize the desired font size in points
 * @param  {Number} dpi      the expected DPI, generally 96 for browsers
 * @return {Number}          the rounded pixel font size
 */
module.exports.pointToPixel = function(fontSize, dpi) {
    dpi = dpi||dpi===0 ? dpi : 96;
    fontSize = fontSize * dpi / 72;
    return Math.round(fontSize);
};

/**
 * For the given font and (pixel) font size, this method returns the
 * scale that will need to be applied to EM units (i.e. font paths) 
 * to have the font render at the expected size (i.e. to match the browser).
 *
 * If no font size is specified, we will use the default font size (which is in points)
 * and convert it to pixels. 
 * 
 * @param  {Font} font     a font object from the fontpath tool
 * @param  {Number} fontSize the desired font size, defaults to the font's default size
 * @return {Number} returns the scale for this font size         
 */
module.exports.getPxScale = function(font, fontSize) {
    //If no fontSize is specified, it will just fall back to using the font's own size with 96 DPI.
    fontSize = typeof fontSize === "number" ? fontSize : this.pointToPixel(font.size);

    //Takes in a font size in PIXELS and gives us the expected scaling factor
    var sz = font.units_per_EM/64;
    sz = (sz/font.size * fontSize);

    return ((font.resolution * 1/72 * sz) / font.units_per_EM);
};

/**
 * For the given font and (point) font size, this method returns the
 * scale that will need to be applied to EM units (i.e. font paths) 
 * to have the font render at the expected size (i.e. to match the browser).
 * 
 * If no font size is specified, we will use the default font size.
 * 
 * @param  {Font} font       a font object from the fontpath tool
 * @param  {Number} fontSize the desired font size, defaults to the font's default size
 * @return {Number}          the scale for this font size
 */
module.exports.getPtScale = function(font, fontSize) {
    fontSize = typeof fontSize === "number" ? fontSize : font.size;
    fontSize = this.pointToPixel(fontSize);
    return this.getPxScale(font, fontSize);
};

},{}],9:[function(require,module,exports){
var Shape = require('shape2d');

var funcs = {
    'm': 'moveTo',
    'l': 'lineTo',
    'q': 'quadraticCurveTo',
    'c': 'bezierCurveTo'
};

/**
 * Decomposes a glyph and its outline from fontpath into a list of Shapes from shape2d.
 * This is a discrete set of points that can then be used for triangulation
 * or further effects.
 */
module.exports = function(glyph, options) {
    options = options||{};

    var curves = Boolean(options.approximateCurves);
    var steps = options.steps||10;
    var factor = options.approximationFactor;
    factor = (typeof factor==="number") ? factor : 0.5;

    var shapes = [];
    var shape = new Shape();
    shape.approximateCurves = curves;
    shape.approximationFactor = factor;
    shape.steps = steps;

    if (!glyph.path || glyph.path.length===0)
        return shapes;

    var path = glyph.path;
    for (var i=0; i<path.length; i++) {
        var p = path[i];
        var args = p.slice(1);
        var fkey = funcs[ p[0] ];

        //assume we are on a new shape when we reach a moveto
        //will have to revisit this with a better solution 
        //maybe even-odd rule
        if (i!==0 && fkey==='moveTo') {
            //push the current shape ahead..
            shapes.push(shape);

            shape = new Shape();
            shape.approximateCurves = curves;
            shape.approximationFactor = factor;
            shape.steps = steps;
        }

        shape[fkey].apply(shape, args);
    }

    shapes.push(shape);
    return shapes;
}
},{"shape2d":10}],10:[function(require,module,exports){
var Vector2 = require('vecmath').Vector2;
var Class = require('klasse');
var lerp = require('interpolation').lerp;

function distanceTo(x1, y1, x2, y2) {
    var dx = x2-x1;
    var dy = y2-y1;
    return Math.sqrt(dx*dx+dy*dy);
}

var tmp1 = new Vector2();
var tmp2 = new Vector2();

var Shape = new Class({

    initialize: function() {
        this.steps = 1;
        this.points = [];

        // If step is not provided to a ***CurveTo function, 
        // then it will be approximated with a very simple distance check
        this.approximateCurves = true;
        this.approximationFactor = 0.5;

        this._move = new Vector2();
        this._start = new Vector2();
        this._hasMoved = false;
        this._newPath = true;
    },


    reset: function() {
        this.points.length = 0;
        this._newPath = true;
        this._hasMoved = false;
        this._move.x = this._move.y = 0;
        this._start.x = this._start.y = 0;
    },

    beginPath: function() {
        this.reset();
    },
    
    moveTo: function(x, y) {
        this._newPath = true;
        this._move.x = x;
        this._move.y = y;
        this._start.x = x;
        this._start.y = y;
        this._hasMoved = true;
    },

    __newPoint: function(nx, ny) {
        this.points.push(new Vector2(nx, ny));
        this._newPath = false;
    },
    
    /** Closes the path by performing a lineTo with the first 'starting' point. 
        If the path is empty, this does nothing. */
    closePath: function(steps) {
        if (this.points.length===0)
            return;
        this.lineTo(this._start.x, this._start.y, steps);
    },
    
    lineTo: function(x, y, steps) {
        //if we are calling lineTo before any moveTo.. make this the first point
        if (!this._hasMoved) {
            this.moveTo(x, y);
            return;
        }

        steps = Math.max(1, steps || this.steps);
        for (var i=0; i<=steps; i++) { 
            if (!this._newPath && i==0)
                continue;
                
            var t = i/steps;   
            var nx = lerp(this._move.x, x, t);
            var ny = lerp(this._move.y, y, t);
            
            this.__newPoint(nx, ny);
        }
        this._move.x = x;
        this._move.y = y; 
    },

    /** Creates a bezier (cubic) curve to the specified point, with the given control points.
    If steps is not specified or is a falsy value, this function will use the default value
    set for this Path object. It will be capped to a minimum of 3 steps. 
    */
    bezierCurveTo: function(x2, y2, x3, y3, x4, y4, steps) {
        //if we are calling lineTo before any moveTo.. make this the first point
        if (!this._hasMoved) {
            this.moveTo(x, y);
            return;
        }
        
        var x1 = this._move.x;
        var y1 = this._move.y;
        
        //try to approximate with a simple distance sum.
        //more accurate would be to use this:
        //http://antigrain.com/research/adaptive_bezier/
        if (!steps) {
            if (this.approximateCurves) {
                var d1 = distanceTo(x1, y1, x2, y2);
                var d2 = distanceTo(x2, y2, x3, y3);
                var d3 = distanceTo(x3, y3, x4, y4);
                steps = ~~((d1 + d2 + d3) * this.approximationFactor);
            } else {
                steps = Math.max(1, this.steps);
            }
        } 
        
        for (var i=0; i<steps; i++) {
            var t = i / (steps-1);
            var dt = (1 - t);
            
            var dt2 = dt * dt;
            var dt3 = dt2 * dt;
            var t2 = t * t;
            var t3 = t2 * t;
            
            var x = dt3 * x1 + 3 * dt2 * t * x2 + 3 * dt * t2 * x3 + t3 * x4;
            var y = dt3 * y1 + 3 * dt2 * t * y2 + 3 * dt * t2 * y3 + t3 * y4;
            
            this.__newPoint(x, y);
        }
        
        this._move.x = x4;
        this._move.y = y4;
    },
    
    /** Creates a quadratic curve to the specified point, with the given control points.
    If steps is not specified or is a falsy value, this function will use the default value
    set for this Path object. It will be capped to a minimum of 3 steps. 
    */
    quadraticCurveTo: function(x2, y2, x3, y3, steps) {
        //if we are calling lineTo before any moveTo.. make this the first point
        if (!this._hasMoved) {
            this.moveTo(x, y);
            return;
        } 
        
        var x1 = this._move.x;
        var y1 = this._move.y;
        
        //try to approximate with a simple distance sum.
        //more accurate would be to use this:
        //http://antigrain.com/research/adaptive_bezier/
        if (!steps) {
            if (this.approximateCurves) {
                var d1 = tmp1.set(x1, y1).distance( tmp2.set(x2, y2) );
                var d2 = tmp1.set(x2, y2).distance( tmp2.set(x3, y3) );
                steps = ~~((d1 + d2) * this.approximationFactor);
            } else {
                steps = Math.max(1, this.steps);
            }
        } 
        
        for (var i=0; i<steps; i++) {
            var t = i / (steps-1);
            var dt = (1 - t);
            var dtSq = dt * dt;
            var tSq = t * t;
            
            var x = dtSq * x1 + 2 * dt * t * x2 + tSq * x3;
            var y = dtSq * y1 + 2 * dt * t * y2 + tSq * y3;
            
            this.__newPoint(x, y);
        }
        
        this._move.x = x3;
        this._move.y = y3;
    },

    calculateBoundingBox: function() {
        var points = this.points;

        var minX = Number.MAX_VALUE,
            minY = Number.MAX_VALUE,
            maxX = -Number.MAX_VALUE,
            maxY = -Number.MAX_VALUE;

        for (var i=0; i<points.length; i++) {
            var p = points[i];

            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        return {
            x: minX,
            y: minY,
            width: maxX-minX,
            height: maxY-minY
        };
    },

    contains: function(x, y) {
        var testx = x, testy = y;
        if (typeof x === "object") {
            testx = x.x;
            testy = x.y;
        }

        var points = this.points;
        var nvert = points.length;
        var i, j, c = 0;
        for (i=0, j=nvert-1; i<nvert; j=i++) {
            if ( ((points[i].y>testy) != (points[j].y>testy)) &&
                (testx < (points[j].x-points[i].x) * (testy-points[i].y) / (points[j].y-points[i].y) + points[i].x) ) {
                c = !c;
            }
        }
        return c;
    },


    simplify: function(tolerance, out) {
        var points = this.points,
            len = points.length,
            point = new Vector2(),
            sqTolerance = tolerance*tolerance,
            prevPoint = new Vector2( points[0] );

        if (!out)
            out = new Shape();

        var outPoints = [];
        outPoints.push(prevPoint);

        for (var i=1; i<len; i++) {
            point = points[i];
            if ( point.distanceSq(prevPoint) > sqTolerance ) {
                outPoints.push(new Vector2(point));
                prevPoint = point;
            }
        }
        if (prevPoint.x !== point.x || prevPoint.y !== point.y)
            outPoints.push(new Vector2(point));

        out.points = outPoints;
        return out; 
    }
});

module.exports = Shape;
},{"interpolation":11,"klasse":12,"vecmath":20}],11:[function(require,module,exports){
/** Utility function for linear interpolation. */
module.exports.lerp = function(v0, v1, t) {
    return v0*(1-t)+v1*t;
};

/** Utility function for Hermite interpolation. */
module.exports.smoothstep = function(v0, v1, t) {
    // Scale, bias and saturate x to 0..1 range
    t = Math.max(0.0, Math.min(1.0, (t - v0)/(v1 - v0) ));
    // Evaluate polynomial
    return t*t*(3 - 2*t);
};
},{}],12:[function(require,module,exports){
function hasGetterOrSetter(def) {
	return (!!def.get && typeof def.get === "function") || (!!def.set && typeof def.set === "function");
}

function getProperty(definition, k, isClassDescriptor) {
	//This may be a lightweight object, OR it might be a property
	//that was defined previously.
	
	//For simple class descriptors we can just assume its NOT previously defined.
	var def = isClassDescriptor 
				? definition[k] 
				: Object.getOwnPropertyDescriptor(definition, k);

	if (!isClassDescriptor && def.value && typeof def.value === "object") {
		def = def.value;
	}


	//This might be a regular property, or it may be a getter/setter the user defined in a class.
	if ( def && hasGetterOrSetter(def) ) {
		if (typeof def.enumerable === "undefined")
			def.enumerable = true;
		if (typeof def.configurable === "undefined")
			def.configurable = true;
		return def;
	} else {
		return false;
	}
}

function hasNonConfigurable(obj, k) {
	var prop = Object.getOwnPropertyDescriptor(obj, k);
	if (!prop)
		return false;

	if (prop.value && typeof prop.value === "object")
		prop = prop.value;

	if (prop.configurable === false) 
		return true;

	return false;
}

//TODO: On create, 
//		On mixin, 

function extend(ctor, definition, isClassDescriptor, extend) {
	for (var k in definition) {
		if (!definition.hasOwnProperty(k))
			continue;

		var def = getProperty(definition, k, isClassDescriptor);

		if (def !== false) {
			//If Extends is used, we will check its prototype to see if 
			//the final variable exists.
			
			var parent = extend || ctor;
			if (hasNonConfigurable(parent.prototype, k)) {

				//just skip the final property
				if (Class.ignoreFinals)
					continue;

				//We cannot re-define a property that is configurable=false.
				//So we will consider them final and throw an error. This is by
				//default so it is clear to the developer what is happening.
				//You can set ignoreFinals to true if you need to extend a class
				//which has configurable=false; it will simply not re-define final properties.
				throw new Error("cannot override final property '"+k
							+"', set Class.ignoreFinals = true to skip");
			}

			Object.defineProperty(ctor.prototype, k, def);
		} else {
			ctor.prototype[k] = definition[k];
		}

	}
}

/**
 */
function mixin(myClass, mixins) {
	if (!mixins)
		return;

	if (!Array.isArray(mixins))
		mixins = [mixins];

	for (var i=0; i<mixins.length; i++) {
		extend(myClass, mixins[i].prototype || mixins[i]);
	}
}

/**
 * Creates a new class with the given descriptor.
 * The constructor, defined by the name `initialize`,
 * is an optional function. If unspecified, an anonymous
 * function will be used which calls the parent class (if
 * one exists). 
 *
 * You can also use `Extends` and `Mixins` to provide subclassing
 * and inheritance.
 *
 * @class  Class
 * @constructor
 * @param {Object} definition a dictionary of functions for the class
 * @example
 *
 * 		var MyClass = new Class({
 * 		
 * 			initialize: function() {
 * 				this.foo = 2.0;
 * 			},
 *
 * 			bar: function() {
 * 				return this.foo + 5;
 * 			}
 * 		});
 */
function Class(definition) {
	if (!definition)
		definition = {};

	//The variable name here dictates what we see in Chrome debugger
	var initialize;
	var Extends;

	if (definition.initialize) {
		if (typeof definition.initialize !== "function")
			throw new Error("initialize must be a function");
		initialize = definition.initialize;

		//Usually we should avoid "delete" in V8 at all costs.
		//However, its unlikely to make any performance difference
		//here since we only call this on class creation (i.e. not object creation).
		delete definition.initialize;
	} else {
		if (definition.Extends) {
			var base = definition.Extends;
			initialize = function () {
				base.apply(this, arguments);
			}; 
		} else {
			initialize = function () {}; 
		}
	}

	if (definition.Extends) {
		initialize.prototype = Object.create(definition.Extends.prototype);
		initialize.prototype.constructor = initialize;
		//for getOwnPropertyDescriptor to work, we need to act
		//directly on the Extends (or Mixin)
		Extends = definition.Extends;
		delete definition.Extends;
	} else {
		initialize.prototype.constructor = initialize;
	}

	//Grab the mixins, if they are specified...
	var mixins = null;
	if (definition.Mixins) {
		mixins = definition.Mixins;
		delete definition.Mixins;
	}

	//First, mixin if we can.
	mixin(initialize, mixins);

	//Now we grab the actual definition which defines the overrides.
	extend(initialize, definition, true, Extends);

	return initialize;
};

Class.extend = extend;
Class.mixin = mixin;
Class.ignoreFinals = false;

module.exports = Class;
},{}],13:[function(require,module,exports){
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;

function Matrix3(m) {
    this.val = new ARRAY_TYPE(9);

    if (m) { //assume Matrix3 with val
        this.copy(m);
    } else { //default to identity
        this.idt();
    }
}

var mat3 = Matrix3.prototype;

mat3.clone = function() {
    return new Matrix3(this);
};

mat3.set = function(otherMat) {
    return this.copy(otherMat);
};

mat3.copy = function(otherMat) {
    var out = this.val,
        a = otherMat.val; 
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return this;
};

mat3.fromMat4 = function(m) {
    var a = m.val,
        out = this.val;
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[4];
    out[4] = a[5];
    out[5] = a[6];
    out[6] = a[8];
    out[7] = a[9];
    out[8] = a[10];
    return this;
};

mat3.fromArray = function(a) {
    var out = this.val;
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return this;
};

mat3.identity = function() {
    var out = this.val;
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return this;
};

mat3.transpose = function() {
    var a = this.val,
        a01 = a[1], 
        a02 = a[2], 
        a12 = a[5];
    a[1] = a[3];
    a[2] = a[6];
    a[3] = a01;
    a[5] = a[7];
    a[6] = a02;
    a[7] = a12;
    return this;
};

mat3.invert = function() {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        b01 = a22 * a11 - a12 * a21,
        b11 = -a22 * a10 + a12 * a20,
        b21 = a21 * a10 - a11 * a20,

        // Calculate the determinant
        det = a00 * b01 + a01 * b11 + a02 * b21;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    a[0] = b01 * det;
    a[1] = (-a22 * a01 + a02 * a21) * det;
    a[2] = (a12 * a01 - a02 * a11) * det;
    a[3] = b11 * det;
    a[4] = (a22 * a00 - a02 * a20) * det;
    a[5] = (-a12 * a00 + a02 * a10) * det;
    a[6] = b21 * det;
    a[7] = (-a21 * a00 + a01 * a20) * det;
    a[8] = (a11 * a00 - a01 * a10) * det;
    return this;
};

mat3.adjoint = function() {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];

    a[0] = (a11 * a22 - a12 * a21);
    a[1] = (a02 * a21 - a01 * a22);
    a[2] = (a01 * a12 - a02 * a11);
    a[3] = (a12 * a20 - a10 * a22);
    a[4] = (a00 * a22 - a02 * a20);
    a[5] = (a02 * a10 - a00 * a12);
    a[6] = (a10 * a21 - a11 * a20);
    a[7] = (a01 * a20 - a00 * a21);
    a[8] = (a00 * a11 - a01 * a10);
    return this;
};

mat3.determinant = function() {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];

    return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20);
};

mat3.multiply = function(otherMat) {
    var a = this.val,
        b = otherMat.val,
        a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        b00 = b[0], b01 = b[1], b02 = b[2],
        b10 = b[3], b11 = b[4], b12 = b[5],
        b20 = b[6], b21 = b[7], b22 = b[8];

    a[0] = b00 * a00 + b01 * a10 + b02 * a20;
    a[1] = b00 * a01 + b01 * a11 + b02 * a21;
    a[2] = b00 * a02 + b01 * a12 + b02 * a22;

    a[3] = b10 * a00 + b11 * a10 + b12 * a20;
    a[4] = b10 * a01 + b11 * a11 + b12 * a21;
    a[5] = b10 * a02 + b11 * a12 + b12 * a22;

    a[6] = b20 * a00 + b21 * a10 + b22 * a20;
    a[7] = b20 * a01 + b21 * a11 + b22 * a21;
    a[8] = b20 * a02 + b21 * a12 + b22 * a22;
    return this;
};

mat3.translate = function(v) {
    var a = this.val,
        x = v.x, y = v.y;
    a[6] = x * a[0] + y * a[3] + a[6];
    a[7] = x * a[1] + y * a[4] + a[7];
    a[8] = x * a[2] + y * a[5] + a[8];
    return this;
};

mat3.rotate = function(rad) {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],

        s = Math.sin(rad),
        c = Math.cos(rad);

    a[0] = c * a00 + s * a10;
    a[1] = c * a01 + s * a11;
    a[2] = c * a02 + s * a12;

    a[3] = c * a10 - s * a00;
    a[4] = c * a11 - s * a01;
    a[5] = c * a12 - s * a02;
    return this;
};

mat3.scale = function(v) {
    var a = this.val,
        x = v.x, 
        y = v.y;

    a[0] = x * a[0];
    a[1] = x * a[1];
    a[2] = x * a[2];

    a[3] = y * a[3];
    a[4] = y * a[4];
    a[5] = y * a[5];
    return this;
};

mat3.fromQuat = function(q) {
    var x = q.x, y = q.y, z = q.z, w = q.w,
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2,

        out = this.val;

    out[0] = 1 - (yy + zz);
    out[3] = xy + wz;
    out[6] = xz - wy;

    out[1] = xy - wz;
    out[4] = 1 - (xx + zz);
    out[7] = yz + wx;

    out[2] = xz + wy;
    out[5] = yz - wx;
    out[8] = 1 - (xx + yy);
    return this;
};

mat3.normalFromMat4 = function(m) {
    var a = m.val,
        out = this.val,

        a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;

    out[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;

    out[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    return this;
};

mat3.mul = mat3.multiply;

mat3.idt = mat3.identity;

//This is handy for Pool utilities, to "reset" a
//shared object to its default state
mat3.reset = mat3.idt;

mat3.toString = function() {
    var a = this.val;
    return 'Matrix3(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + 
                    a[3] + ', ' + a[4] + ', ' + a[5] + ', ' + 
                    a[6] + ', ' + a[7] + ', ' + a[8] + ')';
};

mat3.str = mat3.toString;

module.exports = Matrix3;
},{}],14:[function(require,module,exports){
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
var EPSILON = 0.000001;

function Matrix4(m) {
    this.val = new ARRAY_TYPE(16);

    if (m) { //assume Matrix4 with val
        this.copy(m);
    } else { //default to identity
        this.idt();
    }
}

var mat4 = Matrix4.prototype;

mat4.clone = function() {
    return new Matrix4(this);
};

mat4.set = function(otherMat) {
    return this.copy(otherMat);
};

mat4.copy = function(otherMat) {
    var out = this.val,
        a = otherMat.val; 
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return this;
};

mat4.fromArray = function(a) {
    var out = this.val;
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return this;
};

mat4.identity = function() {
    var out = this.val;
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return this;
};

mat4.transpose = function() {
    var a = this.val,
        a01 = a[1], a02 = a[2], a03 = a[3],
        a12 = a[6], a13 = a[7],
        a23 = a[11];

    a[1] = a[4];
    a[2] = a[8];
    a[3] = a[12];
    a[4] = a01;
    a[6] = a[9];
    a[7] = a[13];
    a[8] = a02;
    a[9] = a12;
    a[11] = a[14];
    a[12] = a03;
    a[13] = a13;
    a[14] = a23;
    return this;
};

mat4.invert = function() {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    a[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    a[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    a[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    a[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    a[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    a[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    a[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    a[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    a[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    a[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    a[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    a[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    a[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    a[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    a[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    a[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return this;
};

mat4.adjoint = function() {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    a[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    a[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    a[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    a[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    a[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    a[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    a[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    a[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    a[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    a[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    a[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    a[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    a[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    a[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    a[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    a[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return this;
};

mat4.determinant = function () {
    var a = this.val,
        a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};

mat4.multiply = function(otherMat) {
    var a = this.val,
        b = otherMat.val,
        a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];  
    a[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    a[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    a[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    a[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    a[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    a[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    a[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    a[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    a[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    a[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    a[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    a[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    a[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    a[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    a[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    a[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return this;
};

mat4.translate = function(v) {
    var x = v.x, y = v.y, z = v.z,
        a = this.val;
    a[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    a[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    a[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    a[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return this;
};

mat4.scale = function(v) {
    var x = v.x, y = v.y, z = v.z, a = this.val;

    a[0] = a[0] * x;
    a[1] = a[1] * x;
    a[2] = a[2] * x;
    a[3] = a[3] * x;
    a[4] = a[4] * y;
    a[5] = a[5] * y;
    a[6] = a[6] * y;
    a[7] = a[7] * y;
    a[8] = a[8] * z;
    a[9] = a[9] * z;
    a[10] = a[10] * z;
    a[11] = a[11] * z;
    a[12] = a[12];
    a[13] = a[13];
    a[14] = a[14];
    a[15] = a[15];
    return this;
};

mat4.rotate = function (rad, axis) {
    var a = this.val,
        x = axis.x, y = axis.y, z = axis.z,
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < EPSILON) { return null; }
    
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    a[0] = a00 * b00 + a10 * b01 + a20 * b02;
    a[1] = a01 * b00 + a11 * b01 + a21 * b02;
    a[2] = a02 * b00 + a12 * b01 + a22 * b02;
    a[3] = a03 * b00 + a13 * b01 + a23 * b02;
    a[4] = a00 * b10 + a10 * b11 + a20 * b12;
    a[5] = a01 * b10 + a11 * b11 + a21 * b12;
    a[6] = a02 * b10 + a12 * b11 + a22 * b12;
    a[7] = a03 * b10 + a13 * b11 + a23 * b12;
    a[8] = a00 * b20 + a10 * b21 + a20 * b22;
    a[9] = a01 * b20 + a11 * b21 + a21 * b22;
    a[10] = a02 * b20 + a12 * b21 + a22 * b22;
    a[11] = a03 * b20 + a13 * b21 + a23 * b22;
    return this;
};

mat4.rotateX = function(rad) {
    var a = this.val,
        s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    // Perform axis-specific matrix multiplication
    a[4] = a10 * c + a20 * s;
    a[5] = a11 * c + a21 * s;
    a[6] = a12 * c + a22 * s;
    a[7] = a13 * c + a23 * s;
    a[8] = a20 * c - a10 * s;
    a[9] = a21 * c - a11 * s;
    a[10] = a22 * c - a12 * s;
    a[11] = a23 * c - a13 * s;
    return this;
};

mat4.rotateY = function(rad) {
    var a = this.val,
        s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    // Perform axis-specific matrix multiplication
    a[0] = a00 * c - a20 * s;
    a[1] = a01 * c - a21 * s;
    a[2] = a02 * c - a22 * s;
    a[3] = a03 * c - a23 * s;
    a[8] = a00 * s + a20 * c;
    a[9] = a01 * s + a21 * c;
    a[10] = a02 * s + a22 * c;
    a[11] = a03 * s + a23 * c;
    return this;
};

mat4.rotateZ = function (rad) {
    var a = this.val,
        s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    // Perform axis-specific matrix multiplication
    a[0] = a00 * c + a10 * s;
    a[1] = a01 * c + a11 * s;
    a[2] = a02 * c + a12 * s;
    a[3] = a03 * c + a13 * s;
    a[4] = a10 * c - a00 * s;
    a[5] = a11 * c - a01 * s;
    a[6] = a12 * c - a02 * s;
    a[7] = a13 * c - a03 * s;
    return this;
};

mat4.fromRotationTranslation = function (q, v) {
    // Quaternion math
    var out = this.val,
        x = q.x, y = q.y, z = q.z, w = q.w,
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v.x;
    out[13] = v.y;
    out[14] = v.z;
    out[15] = 1;
    return this;
};

mat4.fromQuat = function (q) {
    var out = this.val,
        x = q.x, y = q.y, z = q.z, w = q.w,
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;

    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;

    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return this;
};


/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {Matrix4} this for chaining
 */
mat4.frustum = function (left, right, bottom, top, near, far) {
    var out = this.val,
        rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return this;
};


/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {Matrix4} this for chaining
 */
mat4.perspective = function (fovy, aspect, near, far) {
    var out = this.val,
        f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return this;
};

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {Matrix4} this for chaining
 */
mat4.ortho = function (left, right, bottom, top, near, far) {
    var out = this.val,
        lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return this;
};

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {Vector3} eye Position of the viewer
 * @param {Vector3} center Point the viewer is looking at
 * @param {Vector3} up vec3 pointing up
 * @returns {Matrix4} this for chaining
 */
mat4.lookAt = function (eye, center, up) {
    var out = this.val,

        x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye.x,
        eyey = eye.y,
        eyez = eye.z,
        upx = up.x,
        upy = up.y,
        upz = up.z,
        centerx = center.x,
        centery = center.y,
        centerz = center.z;

    if (Math.abs(eyex - centerx) < EPSILON &&
        Math.abs(eyey - centery) < EPSILON &&
        Math.abs(eyez - centerz) < EPSILON) {
        return this.identity();
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return this;
};


mat4.mul = mat4.multiply;

mat4.idt = mat4.identity;

//This is handy for Pool utilities, to "reset" a
//shared object to its default state
mat4.reset = mat4.idt;

mat4.toString = function () {
    var a = this.val;
    return 'Matrix4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + 
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};

mat4.str = mat4.toString;

module.exports = Matrix4;

},{}],15:[function(require,module,exports){
var Vector3 = require('./Vector3');
var Matrix3 = require('./Matrix3');
var common = require('./common');

//some shared 'private' arrays
var s_iNext = (typeof Int8Array !== 'undefined' ? new Int8Array([1,2,0]) : [1,2,0]);
var tmp = (typeof Float32Array !== 'undefined' ? new Float32Array([0,0,0]) : [0,0,0]);

var xUnitVec3 = new Vector3(1, 0, 0);
var yUnitVec3 = new Vector3(0, 1, 0);
var tmpvec = new Vector3();

var tmpMat3 = new Matrix3();

function Quaternion(x, y, z, w) {
	if (typeof x === "object") {
        this.x = x.x||0;
        this.y = x.y||0;
        this.z = x.z||0;
        this.w = x.w||0;
    } else {
        this.x = x||0;
        this.y = y||0;
        this.z = z||0;
        this.w = w||0;
    }
}

var quat = Quaternion.prototype;

//mixin common functions
for (var k in common) {
    quat[k] = common[k];
}

quat.rotationTo = function(a, b) {
    var dot = a.x * b.x + a.y * b.y + a.z * b.z; //a.dot(b)
    if (dot < -0.999999) {
        if (tmpvec.copy(xUnitVec3).cross(a).len() < 0.000001)
            tmpvec.copy(yUnitVec3).cross(a);
        
        tmpvec.normalize();
        return this.setAxisAngle(tmpvec, Math.PI);
    } else if (dot > 0.999999) {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.w = 1;
        return this;
    } else {
        tmpvec.copy(a).cross(b);
        this.x = tmpvec.x;
        this.y = tmpvec.y;
        this.z = tmpvec.z;
        this.w = 1 + dot;
        return this.normalize();
    }
};

quat.setAxes = function(view, right, up) {
    var m = tmpMat3.val;
    m[0] = right.x;
    m[3] = right.y;
    m[6] = right.z;

    m[1] = up.x;
    m[4] = up.y;
    m[7] = up.z;

    m[2] = -view.x;
    m[5] = -view.y;
    m[8] = -view.z;

    return this.fromMat3(tmpMat3).normalize();
};

quat.identity = function() {
    this.x = this.y = this.z = 0;
    this.w = 1;
    return this;
};

quat.setAxisAngle = function(axis, rad) {
    rad = rad * 0.5;
    var s = Math.sin(rad);
    this.x = s * axis.x;
    this.y = s * axis.y;
    this.z = s * axis.z;
    this.w = Math.cos(rad);
    return this;
};

quat.multiply = function(b) {
    var ax = this.x, ay = this.y, az = this.z, aw = this.w,
        bx = b.x, by = b.y, bz = b.z, bw = b.w;

    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
};

quat.slerp = function (b, t) {
    // benchmarks:
    //    http://jsperf.com/quaternion-slerp-implementations

    var ax = this.x, ay = this.y, az = this.y, aw = this.y,
        bx = b.x, by = b.y, bz = b.z, bw = b.w;

    var        omega, cosom, sinom, scale0, scale1;

    // calc cosine
    cosom = ax * bx + ay * by + az * bz + aw * bw;
    // adjust signs (if necessary)
    if ( cosom < 0.0 ) {
        cosom = -cosom;
        bx = - bx;
        by = - by;
        bz = - bz;
        bw = - bw;
    }
    // calculate coefficients
    if ( (1.0 - cosom) > 0.000001 ) {
        // standard case (slerp)
        omega  = Math.acos(cosom);
        sinom  = Math.sin(omega);
        scale0 = Math.sin((1.0 - t) * omega) / sinom;
        scale1 = Math.sin(t * omega) / sinom;
    } else {        
        // "from" and "to" quaternions are very close 
        //  ... so we can do a linear interpolation
        scale0 = 1.0 - t;
        scale1 = t;
    }
    // calculate final values
    this.x = scale0 * ax + scale1 * bx;
    this.y = scale0 * ay + scale1 * by;
    this.z = scale0 * az + scale1 * bz;
    this.w = scale0 * aw + scale1 * bw;
    return this;
};

quat.invert = function() {
    var a0 = this.x, a1 = this.y, a2 = this.z, a3 = this.w,
        dot = a0*a0 + a1*a1 + a2*a2 + a3*a3,
        invDot = dot ? 1.0/dot : 0;
    
    // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

    this.x = -a0*invDot;
    this.y = -a1*invDot;
    this.z = -a2*invDot;
    this.w = a3*invDot;
    return this;
};

quat.conjugate = function() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
};

quat.rotateX = function (rad) {
    rad *= 0.5; 

    var ax = this.x, ay = this.y, az = this.z, aw = this.w,
        bx = Math.sin(rad), bw = Math.cos(rad);

    this.x = ax * bw + aw * bx;
    this.y = ay * bw + az * bx;
    this.z = az * bw - ay * bx;
    this.w = aw * bw - ax * bx;
    return this;
};

quat.rotateY = function (rad) {
    rad *= 0.5; 

    var ax = this.x, ay = this.y, az = this.z, aw = this.w,
        by = Math.sin(rad), bw = Math.cos(rad);

    this.x = ax * bw - az * by;
    this.y = ay * bw + aw * by;
    this.z = az * bw + ax * by;
    this.w = aw * bw - ay * by;
    return this;
};

quat.rotateZ = function (rad) {
    rad *= 0.5; 

    var ax = this.x, ay = this.y, az = this.z, aw = this.w,
        bz = Math.sin(rad), bw = Math.cos(rad);

    this.x = ax * bw + ay * bz;
    this.y = ay * bw - ax * bz;
    this.z = az * bw + aw * bz;
    this.w = aw * bw - az * bz;
    return this;
};

quat.calculateW = function () {
    var x = this.x, y = this.y, z = this.z;

    this.x = x;
    this.y = y;
    this.z = z;
    this.w = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
    return this;
};

quat.fromMat3 = function(mat) {
    // benchmarks:
    //    http://jsperf.com/typed-array-access-speed
    //    http://jsperf.com/conversion-of-3x3-matrix-to-quaternion

    // Algorithm in Ken Shoemake's article in 1987 SIGGRAPH course notes
    // article "Quaternion Calculus and Fast Animation".
    var m = mat.val,
        fTrace = m[0] + m[4] + m[8];
    var fRoot;

    if ( fTrace > 0.0 ) {
        // |w| > 1/2, may as well choose w > 1/2
        fRoot = Math.sqrt(fTrace + 1.0);  // 2w
        this.w = 0.5 * fRoot;
        fRoot = 0.5/fRoot;  // 1/(4w)
        this.x = (m[7]-m[5])*fRoot;
        this.y = (m[2]-m[6])*fRoot;
        this.z = (m[3]-m[1])*fRoot;
    } else {
        // |w| <= 1/2
        var i = 0;
        if ( m[4] > m[0] )
          i = 1;
        if ( m[8] > m[i*3+i] )
          i = 2;
        var j = s_iNext[i];
        var k = s_iNext[j];
            
        //This isn't quite as clean without array access...
        fRoot = Math.sqrt(m[i*3+i]-m[j*3+j]-m[k*3+k] + 1.0);
        tmp[i] = 0.5 * fRoot;

        fRoot = 0.5 / fRoot;
        tmp[j] = (m[j*3+i] + m[i*3+j]) * fRoot;
        tmp[k] = (m[k*3+i] + m[i*3+k]) * fRoot;

        this.x = tmp[0];
        this.y = tmp[1];
        this.z = tmp[2];
        this.w = (m[k*3+j] - m[j*3+k]) * fRoot;
    }
    
    return this;
};

quat.idt = quat.identity;

quat.sub = quat.subtract;

quat.mul = quat.multiply;

quat.len = quat.length;

quat.lenSq = quat.lengthSq;

//This is handy for Pool utilities, to "reset" a
//shared object to its default state
quat.reset = quat.idt;


quat.toString = function() {
    return 'Quaternion(' + this.x + ', ' + this.y + ', ' + this.z + ', ' + this.w + ')';
};

quat.str = quat.toString;

module.exports = Quaternion;
},{"./Matrix3":13,"./Vector3":17,"./common":19}],16:[function(require,module,exports){
function Vector2(x, y) {
	if (typeof x === "object") {
        this.x = x.x||0;
        this.y = x.y||0;
    } else {
        this.x = x||0;
        this.y = y||0;
    }
}

//shorthand it for better minification
var vec2 = Vector2.prototype;

/**
 * Returns a new instance of Vector2 with
 * this vector's components. 
 * @return {Vector2} a clone of this vector
 */
vec2.clone = function() {
    return new Vector2(this.x, this.y);
};

/**
 * Copies the x, y components from the specified
 * Vector. Any undefined components from `otherVec`
 * will default to zero.
 * 
 * @param  {otherVec} the other Vector2 to copy
 * @return {Vector2}  this, for chaining
 */
vec2.copy = function(otherVec) {
    this.x = otherVec.x||0;
    this.y = otherVec.y||0;
    return this;
};

/**
 * A convenience function to set the components of
 * this vector as x and y. Falsy or undefined
 * parameters will default to zero.
 *
 * You can also pass a vector object instead of
 * individual components, to copy the object's components.
 * 
 * @param {Number} x the x component
 * @param {Number} y the y component
 * @return {Vector2}  this, for chaining
 */
vec2.set = function(x, y) {
    if (typeof x === "object") {
        this.x = x.x||0;
        this.y = x.y||0;
    } else {
        this.x = x||0;
        this.y = y||0;
    }
    return this;
};

vec2.add = function(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
};

vec2.subtract = function(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
};

vec2.multiply = function(v) {
    this.x *= v.x;
    this.y *= v.y;
    return this;
};

vec2.scale = function(s) {
    this.x *= s;
    this.y *= s;
    return this;
};

vec2.divide = function(v) {
    this.x /= v.x;
    this.y /= v.y;
    return this;
};

vec2.negate = function() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
};

vec2.distance = function(v) {
    var dx = v.x - this.x,
        dy = v.y - this.y;
    return Math.sqrt(dx*dx + dy*dy);
};

vec2.distanceSq = function(v) {
    var dx = v.x - this.x,
        dy = v.y - this.y;
    return dx*dx + dy*dy;
};

vec2.length = function() {
    var x = this.x,
        y = this.y;
    return Math.sqrt(x*x + y*y);
};

vec2.lengthSq = function() {
    var x = this.x,
        y = this.y;
    return x*x + y*y;
};

vec2.normalize = function() {
    var x = this.x,
        y = this.y;
    var len = x*x + y*y;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        this.x = x*len;
        this.y = y*len;
    }
    return this;
};

vec2.dot = function(v) {
    return this.x * v.x + this.y * v.y;
};

//Unlike Vector3, this returns a scalar
//http://allenchou.net/2013/07/cross-product-of-2d-vectors/
vec2.cross = function(v) {
    return this.x * v.y - this.y * v.x;
};

vec2.lerp = function(v, t) {
    var ax = this.x,
        ay = this.y;
    t = t||0;
    this.x = ax + t * (v.x - ax);
    this.y = ay + t * (v.y - ay);
    return this;
};

vec2.transformMat3 = function(mat) {
    var x = this.x, y = this.y, m = mat.val;
    this.x = m[0] * x + m[3] * y + m[6];
    this.y = m[1] * x + m[4] * y + m[7];
    return this;
};

vec2.transformMat4 = function(mat) {
    var x = this.x, 
        y = this.y,
        m = mat.val;
    this.x = m[0] * x + m[4] * y + m[12];
    this.y = m[1] * x + m[5] * y + m[13];
    return this;
};

vec2.reset = function() {
    this.x = 0;
    this.y = 0;
    return this;
};

vec2.sub = vec2.subtract;

vec2.mul = vec2.multiply;

vec2.div = vec2.divide;

vec2.dist = vec2.distance;

vec2.distSq = vec2.distanceSq;

vec2.len = vec2.length;

vec2.lenSq = vec2.lengthSq;

vec2.toString = function() {
    return 'Vector2(' + this.x + ', ' + this.y + ')';
};

vec2.random = function(scale) {
    scale = scale || 1.0;
    var r = Math.random() * 2.0 * Math.PI;
    this.x = Math.cos(r) * scale;
    this.y = Math.sin(r) * scale;
    return this;
};

vec2.str = vec2.toString;

module.exports = Vector2;
},{}],17:[function(require,module,exports){
function Vector3(x, y, z) {
    if (typeof x === "object") {
        this.x = x.x||0;
        this.y = x.y||0;
        this.z = x.z||0;
    } else {
        this.x = x||0;
        this.y = y||0;
        this.z = z||0;
    }
}

//shorthand it for better minification
var vec3 = Vector3.prototype;

vec3.clone = function() {
    return new Vector3(this.x, this.y, this.z);
};

vec3.copy = function(otherVec) {
    this.x = otherVec.x;
    this.y = otherVec.y;
    this.z = otherVec.z;
    return this;
};

vec3.set = function(x, y, z) {
    if (typeof x === "object") {
        this.x = x.x||0;
        this.y = x.y||0;
        this.z = x.z||0;
    } else {
        this.x = x||0;
        this.y = y||0;
        this.z = z||0;
    }
    return this;
};

vec3.add = function(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
};

vec3.subtract = function(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
};

vec3.multiply = function(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
};

vec3.scale = function(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
};

vec3.divide = function(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
};

vec3.negate = function() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
};

vec3.distance = function(v) {
    var dx = v.x - this.x,
        dy = v.y - this.y,
        dz = v.z - this.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
};

vec3.distanceSq = function(v) {
    var dx = v.x - this.x,
        dy = v.y - this.y,
        dz = v.z - this.z;
    return dx*dx + dy*dy + dz*dz;
};

vec3.length = function() {
    var x = this.x,
        y = this.y,
        z = this.z;
    return Math.sqrt(x*x + y*y + z*z);
};

vec3.lengthSq = function() {
    var x = this.x,
        y = this.y,
        z = this.z;
    return x*x + y*y + z*z;
};

vec3.normalize = function() {
    var x = this.x,
        y = this.y,
        z = this.z;
    var len = x*x + y*y + z*z;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        this.x = x*len;
        this.y = y*len;
        this.z = z*len;
    }
    return this;
};

vec3.dot = function(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
};

vec3.cross = function(v) {
    var ax = this.x, ay = this.y, az = this.z,
        bx = v.x, by = v.y, bz = v.z;

    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
};

vec3.lerp = function(v, t) {
    var ax = this.x,
        ay = this.y,
        az = this.z;
    t = t||0;
    this.x = ax + t * (v.x - ax);
    this.y = ay + t * (v.y - ay);
    this.z = az + t * (v.z - az);
    return this;
};

vec3.transformMat4 = function(mat) {
    var x = this.x, y = this.y, z = this.z, m = mat.val;
    this.x = m[0] * x + m[4] * y + m[8] * z + m[12];
    this.y = m[1] * x + m[5] * y + m[9] * z + m[13];
    this.z = m[2] * x + m[6] * y + m[10] * z + m[14];
    return this;
};

vec3.transformMat3 = function(mat) {
    var x = this.x, y = this.y, z = this.z, m = mat.val;
    this.x = x * m[0] + y * m[3] + z * m[6];
    this.y = x * m[1] + y * m[4] + z * m[7];
    this.z = x * m[2] + y * m[5] + z * m[8];
    return this;
};

vec3.transformQuat = function(q) {
    // benchmarks: http://jsperf.com/quaternion-transform-vec3-implementations
    var x = this.x, y = this.y, z = this.z,
        qx = q.x, qy = q.y, qz = q.z, qw = q.w,

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
};

/**
 * Multiplies this Vector3 by the specified matrix, 
 * applying a W divide. This is useful for projection,
 * e.g. unprojecting a 2D point into 3D space.
 *
 * @method  prj
 * @param {Matrix4} the 4x4 matrix to multiply with 
 * @return {Vector3} this object for chaining
 */
vec3.project = function(mat) {
    var x = this.x,
        y = this.y,
        z = this.z,
        m = mat.val,
        a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3],
        a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
        a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11],
        a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    var l_w = 1 / (x * a03 + y * a13 + z * a23 + a33);

    this.x = (x * a00 + y * a10 + z * a20 + a30) * l_w; 
    this.y = (x * a01 + y * a11 + z * a21 + a31) * l_w; 
    this.z = (x * a02 + y * a12 + z * a22 + a32) * l_w;
    return this;
};

/**
 * Unproject this point from 2D space to 3D space.
 * The point should have its x and y properties set to
 * 2D screen space, and the z either at 0 (near plane)
 * or 1 (far plane). The provided matrix is assumed to already
 * be combined, i.e. projection * view * model.
 *
 * After this operation, this vector's (x, y, z) components will
 * represent the unprojected 3D coordinate.
 * 
 * @param  {Vector4} viewport          screen x, y, width and height in pixels
 * @param  {Matrix4} invProjectionView combined projection and view matrix
 * @return {Vector3}                   this object, for chaining
 */
vec3.unproject = function(viewport, invProjectionView) {
    var viewX = viewport.x,
        viewY = viewport.y,
        viewWidth = viewport.z,
        viewHeight = viewport.w;
    
    var x = this.x, 
        y = this.y,
        z = this.z;

    x = x - viewX;
    y = viewHeight - y - 1;
    y = y - viewY;

    this.x = (2 * x) / viewWidth - 1;
    this.y = (2 * y) / viewHeight - 1;
    this.z = 2 * z - 1;

    return this.project(invProjectionView);
};

vec3.random = function(scale) {
    scale = scale || 1.0;

    var r = Math.random() * 2.0 * Math.PI;
    var z = (Math.random() * 2.0) - 1.0;
    var zScale = Math.sqrt(1.0-z*z) * scale;
    
    this.x = Math.cos(r) * zScale;
    this.y = Math.sin(r) * zScale;
    this.z = z * scale;
    return this;
};

vec3.reset = function() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    return this;
};


vec3.sub = vec3.subtract;

vec3.mul = vec3.multiply;

vec3.div = vec3.divide;

vec3.dist = vec3.distance;

vec3.distSq = vec3.distanceSq;

vec3.len = vec3.length;

vec3.lenSq = vec3.lengthSq;

vec3.toString = function() {
    return 'Vector3(' + this.x + ', ' + this.y + ', ' + this.z + ')';
};

vec3.str = vec3.toString;

module.exports = Vector3;
},{}],18:[function(require,module,exports){
var common = require('./common');

function Vector4(x, y, z, w) {
	if (typeof x === "object") {
        this.x = x.x||0;
        this.y = x.y||0;
        this.z = x.z||0;
        this.w = x.w||0;
    } else {
        this.x = x||0;
        this.y = y||0;
        this.z = z||0;
        this.w = w||0;
    }
}

//shorthand it for better minification
var vec4 = Vector4.prototype;

//mixin common functions
for (var k in common) {
    vec4[k] = common[k];
}

vec4.clone = function() {
    return new Vector4(this.x, this.y, this.z, this.w);
};

vec4.multiply = function(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    this.w *= v.w;
    return this;
};

vec4.divide = function(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    this.w /= v.w;
    return this;
};

vec4.distance = function(v) {
    var dx = v.x - this.x,
        dy = v.y - this.y,
        dz = v.z - this.z,
        dw = v.w - this.w;
    return Math.sqrt(dx*dx + dy*dy + dz*dz + dw*dw);
};

vec4.distanceSq = function(v) {
    var dx = v.x - this.x,
        dy = v.y - this.y,
        dz = v.z - this.z,
        dw = v.w - this.w;
    return dx*dx + dy*dy + dz*dz + dw*dw;
};

vec4.negate = function() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;
    return this;
};

vec4.transformMat4 = function(mat) {
    var m = mat.val, x = this.x, y = this.y, z = this.z, w = this.w;
    this.x = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
    this.y = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
    this.z = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
    this.w = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
    return this;
};

//// TODO: is this really the same as Vector3 ??
///  Also, what about this:
///  http://molecularmusings.wordpress.com/2013/05/24/a-faster-quaternion-vector-multiplication/
vec4.transformQuat = function(q) {
    // benchmarks: http://jsperf.com/quaternion-transform-vec3-implementations
    var x = this.x, y = this.y, z = this.z,
        qx = q.x, qy = q.y, qz = q.z, qw = q.w,

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
};

vec4.random = function(scale) {
    scale = scale || 1.0;

    //Not spherical; should fix this for more uniform distribution
    this.x = (Math.random() * 2 - 1) * scale;
    this.y = (Math.random() * 2 - 1) * scale;
    this.z = (Math.random() * 2 - 1) * scale;
    this.w = (Math.random() * 2 - 1) * scale;
    return this;
};

vec4.reset = function() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 0;
    return this;
};

vec4.sub = vec4.subtract;

vec4.mul = vec4.multiply;

vec4.div = vec4.divide;

vec4.dist = vec4.distance;

vec4.distSq = vec4.distanceSq;

vec4.len = vec4.length;

vec4.lenSq = vec4.lengthSq;

vec4.toString = function() {
    return 'Vector4(' + this.x + ', ' + this.y + ', ' + this.z + ', ' + this.w + ')';
};

vec4.str = vec4.toString;

module.exports = Vector4;
},{"./common":19}],19:[function(require,module,exports){
//common vec4 functions
module.exports = {
    
/**
 * Copies the x, y, z, w components from the specified
 * Vector. Unlike most other operations, this function
 * will default undefined components on `otherVec` to zero.
 * 
 * @method  copy
 * @param  {otherVec} the other Vector4 to copy
 * @return {Vector}  this, for chaining
 */


/**
 * A convenience function to set the components of
 * this vector as x, y, z, w. Falsy or undefined
 * parameters will default to zero.
 *
 * You can also pass a vector object instead of
 * individual components, to copy the object's components.
 * 
 * @method  set
 * @param {Number} x the x component
 * @param {Number} y the y component
 * @param {Number} z the z component
 * @param {Number} w the w component
 * @return {Vector2}  this, for chaining
 */

/**
 * Adds the components of the other Vector4 to
 * this vector.
 * 
 * @method add
 * @param  {Vector4} otherVec other vector, right operand
 * @return {Vector2}  this, for chaining
 */

/**
 * Subtracts the components of the other Vector4
 * from this vector. Aliased as `sub()`
 * 
 * @method  subtract
 * @param  {Vector4} otherVec other vector, right operand
 * @return {Vector2}  this, for chaining
 */

/**
 * Multiplies the components of this Vector4
 * by a scalar amount.
 *
 * @method  scale
 * @param {Number} s the scale to multiply by
 * @return {Vector4} this, for chaining
 */

/**
 * Returns the magnitude (length) of this vector.
 *
 * Aliased as `len()`
 * 
 * @method  length
 * @return {Number} the length of this vector
 */

/**
 * Returns the squared magnitude (length) of this vector.
 *
 * Aliased as `lenSq()`
 * 
 * @method  lengthSq
 * @return {Number} the squared length of this vector
 */

/**
 * Normalizes this vector to a unit vector.
 * @method normalize
 * @return {Vector4}  this, for chaining
 */

/**
 * Returns the dot product of this vector
 * and the specified Vector4.
 * 
 * @method dot
 * @return {Number} the dot product
 */
    copy: function(otherVec) {
        this.x = otherVec.x||0;
        this.y = otherVec.y||0;
        this.z = otherVec.z||0;
        this.w = otherVec.w||0;
        return this;
    },

    set: function(x, y, z, w) {
        if (typeof x === "object") {
            this.x = x.x||0;
            this.y = x.y||0;
            this.z = x.z||0;
            this.w = x.w||0;
        } else {
            this.x = x||0;
            this.y = y||0;
            this.z = z||0;
            this.w = w||0;

        }
        return this;
    },

    add: function(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        this.w += v.w;
        return this;
    },

    subtract: function(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        this.w -= v.w;
        return this;
    },

    scale: function(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        this.w *= s;
        return this;
    },


    length: function() {
        var x = this.x,
            y = this.y,
            z = this.z,
            w = this.w;
        return Math.sqrt(x*x + y*y + z*z + w*w);
    },

    lengthSq: function() {
        var x = this.x,
            y = this.y,
            z = this.z,
            w = this.w;
        return x*x + y*y + z*z + w*w;
    },

    normalize: function() {
        var x = this.x,
            y = this.y,
            z = this.z,
            w = this.w;
        var len = x*x + y*y + z*z + w*w;
        if (len > 0) {
            len = 1 / Math.sqrt(len);
            this.x = x*len;
            this.y = y*len;
            this.z = z*len;
            this.w = w*len;
        }
        return this;
    },

    dot: function(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    },

    lerp: function(v, t) {
        var ax = this.x,
            ay = this.y,
            az = this.z,
            aw = this.w;
        t = t||0;
        this.x = ax + t * (v.x - ax);
        this.y = ay + t * (v.y - ay);
        this.z = az + t * (v.z - az);
        this.w = aw + t * (v.w - aw);
        return this;
    }
};
},{}],20:[function(require,module,exports){
module.exports = {
    Vector2: require('./Vector2'),
    Vector3: require('./Vector3'),
    Vector4: require('./Vector4'),
    Matrix3: require('./Matrix3'),
    Matrix4: require('./Matrix4'),
    Quaternion: require('./Quaternion')
};
},{"./Matrix3":13,"./Matrix4":14,"./Quaternion":15,"./Vector2":16,"./Vector3":17,"./Vector4":18}],21:[function(require,module,exports){
module.exports = {"size":32,"resolution":72,"underline_thickness":56,"underline_position":-115,"max_advance_width":1004,"height":1361,"descender":-345,"ascender":1016,"units_per_EM":1000,"style_name":"Regular","family_name":"Alegreya","kerning":[],"glyphs":{"0":{"xoff":1088,"width":960,"height":1024,"hbx":64,"hby":1024,"path":[["m",518,0],["c",804,0,1013,233,1013,543],["c",1013,822,833,1024,575,1024],["c",288,1024,77,793,77,489],["c",77,200,253,0,518,0],["m",554,155],["c",339,155,192,303,192,518],["c",192,723,327,858,532,858],["c",747,858,899,705,899,489],["c",899,290,759,155,554,155]]},"1":{"xoff":704,"width":640,"height":1088,"hbx":64,"hby":1024,"path":[["m",448,823],["c",454,914,471,946,524,990],["l",511,1024],["c",507,1024,507,1019,305,988],["c",200,972,79,958,79,958],["l",71,875],["l",77,869],["c",77,869,143,881,186,881],["c",255,881,296,869,296,768],["l",296,316],["c",296,142,264,102,112,91],["l",100,0],["c",100,-25,253,0,358,0],["c",458,0,630,-7,630,-7],["l",649,88],["l",645,96],["c",645,96,585,90,536,90],["c",456,90,436,120,436,227],["c",436,331,440,604,448,819],["l",448,823]]},"2":{"xoff":960,"width":960,"height":1088,"hbx":0,"hby":1024,"path":[["m",75,0],["l",186,0],["c",362,0,843,-15,843,-15],["l",868,0],["c",884,149,927,318,927,318],["l",845,308],["c",804,155,765,124,616,124],["l",303,124],["l",294,139],["c",628,510,731,658,731,779],["c",731,925,620,1024,450,1024],["c",319,1024,172,927,104,797],["l",126,706],["l",145,706],["c",206,815,305,886,397,886],["c",493,886,550,830,550,733],["c",550,619,446,448,217,191],["l",55,12],["l",75,0]]},"3":{"xoff":832,"width":768,"height":1216,"hbx":0,"hby":1024,"path":[["m",40,-43],["c",43,-149,79,-192,172,-192],["c",434,-192,731,52,731,261],["c",731,382,638,465,454,507],["l",454,517],["c",591,584,679,693,679,798],["c",679,933,573,1024,413,1024],["c",262,1024,75,877,75,877],["l",96,794],["l",116,794],["c",178,853,272,894,350,894],["c",440,894,509,839,509,756],["c",509,669,432,574,323,525],["l",190,493],["l",200,424],["l",210,414],["c",460,412,577,349,577,214],["c",577,64,419,-49,215,-49],["c",163,-49,108,-43,51,-31],["l",40,-43]]},"4":{"xoff":896,"width":896,"height":1280,"hbx":0,"hby":1088,"path":[["m",8,192],["c",167,192,356,188,514,184],["c",511,29,501,-175,501,-175],["l",514,-192],["l",659,-169],["l",669,-155],["c",669,-155,657,19,655,180],["c",765,176,841,174,841,174],["l",858,286],["l",845,302],["l",655,302],["l",655,1004],["l",589,1024],["c",587,1026,583,1024,581,1024],["l",16,267],["l",8,192],["m",495,750],["l",514,750],["l",514,302],["l",165,302],["l",495,750]]},"5":{"xoff":896,"width":832,"height":1280,"hbx":0,"hby":1088,"path":[["m",745,283],["c",745,477,528,562,253,625],["l",268,882],["c",505,882,716,866,716,866],["l",729,878],["l",778,1088],["l",710,1082],["c",688,1041,661,1032,581,1029],["l",194,1015],["l",178,999],["c",178,999,163,742,143,501],["l",161,479],["c",485,424,589,354,589,222],["c",589,61,423,-49,208,-49],["c",155,-49,100,-43,43,-31],["l",32,-43],["c",38,-164,83,-192,161,-192],["c",407,-192,745,34,745,283]]},"6":{"xoff":960,"width":832,"height":1216,"hbx":64,"hby":1216,"path":[["m",798,1145],["l",776,1205],["l",761,1216],["c",761,1216,81,1014,81,411],["c",81,182,223,0,450,0],["c",692,0,858,174,858,378],["c",858,526,739,704,503,704],["c",442,704,276,597,276,597],["l",268,601],["c",374,996,798,1145,798,1145],["m",458,583],["c",604,583,706,462,706,331],["c",706,185,622,98,491,98],["c",337,98,245,226,245,423],["c",245,452,247,481,251,511],["c",282,532,368,583,458,583]]},"7":{"xoff":832,"width":832,"height":1216,"hbx":64,"hby":1024,"path":[["m",346,-192],["l",397,-18],["c",477,163,620,494,856,966],["l",810,1024],["l",378,1024],["c",251,1015,129,1024,129,1024],["l",116,1013],["c",106,860,77,664,77,664],["l",157,676],["c",184,819,206,858,346,864],["l",700,878],["l",188,-112],["l",208,-156],["l",331,-192],["l",346,-192]]},"8":{"xoff":1024,"width":832,"height":1216,"hbx":64,"hby":1216,"path":[["m",114,272],["c",114,97,280,0,464,0],["c",702,0,882,161,882,355],["c",882,508,765,592,636,659],["c",720,703,839,794,839,947],["c",839,1125,677,1216,520,1216],["c",303,1216,151,1056,151,889],["c",151,742,258,663,378,600],["c",286,558,114,459,114,272],["m",514,88],["c",368,88,264,199,264,320],["c",264,469,382,536,450,564],["c",595,494,741,433,741,298],["c",741,177,634,88,514,88],["m",294,949],["c",294,1038,368,1121,485,1121],["c",597,1121,686,1046,686,905],["c",686,788,618,727,563,695],["c",425,764,294,826,294,949]]},"9":{"xoff":960,"width":832,"height":1216,"hbx":64,"hby":1024,"path":[["m",133,-122],["l",155,-182],["l",169,-192],["c",169,-192,849,9,849,612],["c",849,841,708,1024,481,1024],["c",239,1024,73,849,73,645],["c",73,497,192,320,428,320],["c",489,320,655,426,655,426],["l",661,420],["c",557,25,133,-122,133,-122],["m",473,440],["c",323,440,225,557,225,692],["c",225,838,309,925,440,925],["c",591,925,686,795,686,600],["c",686,569,683,540,679,512],["c",647,491,563,440,473,440]]}," ":{"xoff":384,"width":0,"height":0,"hbx":0,"hby":0,"path":[]},"!":{"xoff":576,"width":384,"height":1472,"hbx":64,"hby":1472,"path":[["m",239,0],["c",319,0,368,57,368,126],["c",368,190,327,243,251,243],["c",174,243,124,186,124,116],["c",124,57,161,0,239,0],["m",217,459],["l",239,442],["l",296,457],["l",403,1449],["l",384,1472],["l",215,1434],["l",200,1413],["l",217,459]]},"\"":{"xoff":640,"width":512,"height":448,"hbx":64,"hby":1280,"path":[["m",264,1280],["l",120,1253],["c",120,1253,141,1046,133,835],["l",155,832],["l",206,858],["c",249,1054,278,1264,278,1264],["l",264,1280],["m",514,1280],["l",370,1253],["c",370,1253,391,1046,382,835],["l",405,832],["l",456,858],["c",499,1054,528,1264,528,1264],["l",514,1280]]},"#":{"xoff":1024,"width":1024,"height":1088,"hbx":0,"hby":1152,"path":[["m",104,741],["l",327,743],["l",303,633],["l",276,512],["l",53,514],["l",22,438],["l",28,417],["l",255,419],["l",180,76],["l",194,64],["l",274,80],["l",350,419],["l",423,421],["l",567,419],["l",491,76],["l",505,64],["l",585,80],["l",659,417],["l",868,415],["l",907,489],["l",899,507],["l",679,507],["l",712,658],["l",731,741],["l",944,739],["l",982,813],["l",974,832],["l",753,832],["l",833,1140],["l",817,1152],["l",735,1142],["l",659,832],["l",550,833],["l",442,833],["l",522,1140],["l",505,1152],["l",423,1142],["l",348,835],["l",129,837],["l",98,762],["l",104,741],["m",401,658],["l",421,743],["l",499,745],["l",638,743],["l",614,633],["l",587,507],["l",475,509],["l",368,509],["l",401,658]]},"$":{"xoff":960,"width":768,"height":1664,"hbx":64,"hby":1344,"path":[["m",577,1325],["l",565,1344],["l",511,1335],["l",483,1024],["c",276,1007,126,886,126,730],["c",126,591,264,520,399,457],["c",407,451,417,447,428,443],["l",393,98],["c",255,106,223,159,223,349],["l",131,341],["c",131,199,108,73,108,73],["l",118,55],["c",118,55,225,2,384,0],["l",358,-305],["l",368,-320],["l",421,-314],["l",448,2],["c",669,20,819,141,819,305],["c",819,451,655,522,511,588],["c",509,588,507,588,505,589],["l",538,917],["c",638,907,673,868,673,781],["c",673,740,669,710,669,710],["l",681,702],["l",761,710],["c",772,850,800,972,800,972],["l",792,987],["c",792,987,692,1021,548,1026],["l",577,1325],["m",651,250],["c",651,163,573,106,458,98],["l",489,414],["c",579,370,651,323,651,250],["m",284,783],["c",284,860,364,915,473,919],["l",444,619],["c",354,665,284,712,284,783]]},"%":{"xoff":1344,"width":1344,"height":1536,"hbx":64,"hby":1344,"path":[["m",376,771],["c",278,771,167,829,167,976],["c",167,1075,235,1144,346,1144],["c",481,1144,559,1053,559,939],["c",559,800,450,771,376,771],["m",348,640],["c",544,640,655,807,655,984],["c",655,1125,571,1280,380,1280],["c",198,1280,71,1133,71,949],["c",71,774,174,640,348,640],["m",1071,131],["c",972,131,862,180,862,305],["c",862,388,929,448,1040,448],["c",1175,448,1253,370,1253,273],["c",1253,155,1144,131,1071,131],["m",1042,0],["c",1238,0,1349,162,1349,311],["c",1349,431,1265,583,1075,583],["c",892,583,765,438,765,282],["c",765,134,868,0,1042,0],["m",1202,1302],["l",1122,1344],["l",597,509],["c",415,267,147,-121,147,-121],["l",157,-149],["l",235,-192],["c",235,-192,491,209,675,448],["c",856,762,1212,1271,1212,1271],["l",1202,1302]]},"&":{"xoff":1408,"width":1408,"height":1344,"hbx":64,"hby":1280,"path":[["m",667,591],["c",425,784,358,877,358,1008],["c",358,1099,428,1159,538,1159],["c",616,1159,659,1137,755,1052],["l",776,1054],["l",874,1202],["l",870,1232],["c",870,1232,772,1280,622,1280],["c",391,1280,215,1141,215,960],["c",215,865,268,764,382,650],["l",382,637],["c",382,637,112,543,112,330],["c",112,134,282,0,550,0],["c",690,0,843,69,958,178],["c",1118,6,1206,-64,1218,-64],["c",1249,-64,1345,-3,1345,-3],["l",1345,28],["l",1058,260],["c",1111,339,1140,425,1140,508],["c",1140,585,1107,656,1054,701],["l",1060,713],["l",1265,713],["c",1372,713,1390,719,1408,754],["l",1435,817],["l",1415,865],["c",1410,857,1396,855,1257,843],["l",835,819],["c",769,815,726,782,726,782],["l",755,695],["c",755,695,817,713,872,713],["c",980,713,1032,638,1032,481],["c",1032,416,1019,359,995,311],["l",667,591],["m",903,191],["c",825,162,720,129,608,129],["c",401,129,266,223,266,367],["c",266,461,335,550,442,594],["l",903,191]]},"'":{"xoff":384,"width":256,"height":448,"hbx":64,"hby":1280,"path":[["m",264,1280],["l",120,1253],["c",120,1253,141,1046,133,835],["l",155,832],["l",206,858],["c",249,1054,278,1264,278,1264],["l",264,1280]]},"(":{"xoff":640,"width":512,"height":1600,"hbx":128,"hby":1280,"path":[["m",172,301],["c",172,-186,550,-320,550,-320],["l",559,-320],["l",602,-268],["l",602,-258],["c",602,-258,309,-117,309,332],["l",309,680],["c",309,1096,589,1213,589,1213],["l",591,1221],["l",565,1280],["l",557,1280],["c",557,1280,172,1143,172,650],["l",172,301]]},")":{"xoff":640,"width":512,"height":1600,"hbx":0,"hby":1280,"path":[["m",460,658],["c",460,1145,81,1280,81,1280],["l",73,1280],["l",30,1227],["l",30,1217],["c",30,1217,323,1076,323,627],["l",323,279],["c",323,-137,43,-254,43,-254],["l",40,-262],["l",67,-320],["l",75,-320],["c",75,-320,460,-184,460,309],["l",460,658]]},"*":{"xoff":960,"width":704,"height":640,"hbx":128,"hby":1472,"path":[["m",176,1330],["l",157,1322],["c",139,1262,139,1186,139,1186],["c",139,1186,251,1162,356,1128],["l",368,1138],["l",380,1204],["c",288,1272,176,1330,176,1330],["m",186,944],["l",188,926],["c",241,890,315,866,315,866],["c",315,866,372,964,438,1050],["l",432,1064],["l",372,1096],["c",276,1032,186,944,186,944],["m",565,834],["l",583,832],["c",634,870,679,930,679,930],["c",679,930,604,1014,540,1102],["l",524,1100],["l",475,1054],["c",507,946,565,834,565,834],["m",788,1152],["l",796,1170],["c",776,1228,731,1290,731,1290],["c",731,1290,626,1244,520,1212],["l",518,1196],["l",546,1138],["c",661,1134,788,1152,788,1152],["m",548,1458],["l",534,1472],["c",471,1472,397,1448,397,1448],["c",397,1448,407,1336,407,1228],["l",419,1220],["l",489,1230],["c",526,1336,548,1458,548,1458]]},"+":{"xoff":1024,"width":1024,"height":960,"hbx":0,"hby":1024,"path":[["m",561,1024],["l",456,1006],["l",454,576],["c",276,576,59,578,59,578],["l",36,477],["l",49,459],["c",49,459,274,461,454,461],["c",454,290,452,75,452,75],["l",471,64],["l",571,85],["c",571,85,569,290,569,461],["l",982,463],["l",999,567],["l",987,588],["c",987,588,733,576,569,576],["c",569,747,581,1011,581,1011],["l",561,1024]]},",":{"xoff":512,"width":384,"height":512,"hbx":0,"hby":192,"path":[["m",126,112],["c",161,80,192,28,192,-28],["c",192,-114,122,-208,30,-270],["l",30,-290],["l",67,-320],["c",190,-250,354,-118,354,36],["c",354,138,307,192,249,192],["c",204,192,157,160,131,140],["l",126,112]]},"-":{"xoff":640,"width":576,"height":192,"hbx":64,"hby":640,"path":[["m",575,640],["c",575,640,536,631,442,620],["l",86,577],["l",73,465],["l",88,448],["l",579,504],["l",589,620],["l",575,640]]},".":{"xoff":512,"width":320,"height":256,"hbx":64,"hby":256,"path":[["m",237,0],["c",317,0,366,57,366,126],["c",366,190,325,243,249,243],["c",172,243,122,186,122,116],["c",122,57,159,0,237,0]]},"/":{"xoff":704,"width":576,"height":1664,"hbx":64,"hby":1408,"path":[["m",587,1408],["l",493,1408],["l",258,456],["c",178,134,69,-240,69,-240],["l",83,-256],["l",182,-256],["c",182,-256,268,83,354,433],["c",442,776,604,1387,604,1387],["l",587,1408]]},":":{"xoff":512,"width":320,"height":832,"hbx":64,"hby":832,"path":[["m",229,0],["c",309,0,358,57,358,126],["c",358,190,317,243,241,243],["c",163,243,114,186,114,116],["c",114,57,151,0,229,0],["m",229,576],["c",309,576,358,633,358,702],["c",358,766,317,819,241,819],["c",163,819,114,762,114,692],["c",114,633,151,576,229,576]]},";":{"xoff":512,"width":384,"height":1088,"hbx":0,"hby":768,"path":[["m",126,112],["c",161,80,192,28,192,-28],["c",192,-114,122,-208,30,-270],["l",30,-290],["l",67,-320],["c",190,-250,354,-118,354,36],["c",354,138,307,192,249,192],["c",204,192,157,160,131,140],["l",126,112],["m",229,538],["c",309,538,358,595,358,665],["c",358,714,317,768,241,768],["c",163,768,114,710,114,641],["c",114,581,151,524,229,524],["l",229,538]]},"<":{"xoff":1024,"width":960,"height":768,"hbx":0,"hby":896,"path":[["m",79,457],["c",79,457,335,356,485,293],["c",653,225,870,128,870,128],["l",931,205],["l",929,227],["c",929,227,726,311,559,381],["l",215,517],["l",215,529],["l",530,646],["c",698,712,927,788,927,788],["l",913,886],["l",894,896],["c",894,896,669,814,483,738],["l",67,570],["l",63,478],["l",79,457]]},"=":{"xoff":1024,"width":1024,"height":512,"hbx":0,"hby":768,"path":[["m",987,446],["c",987,446,712,434,548,434],["c",366,434,59,436,59,436],["l",36,336],["l",49,320],["c",49,317,333,320,518,320],["l",982,322],["l",999,426],["l",987,446],["m",987,768],["c",987,766,712,754,548,754],["c",366,754,59,756,59,756],["l",36,656],["l",49,638],["c",49,638,333,640,518,640],["l",982,642],["l",999,746],["l",987,768]]},">":{"xoff":1024,"width":960,"height":768,"hbx":64,"hby":896,"path":[["m",956,566],["c",956,566,700,667,550,730],["c",382,798,165,896,165,896],["l",104,818],["l",106,796],["c",106,796,309,712,477,642],["l",821,506],["l",821,494],["l",505,377],["c",337,311,108,235,108,235],["l",122,137],["l",141,128],["c",141,128,366,209,552,285],["l",968,453],["l",972,545],["l",956,566]]},"?":{"xoff":768,"width":640,"height":1472,"hbx":64,"hby":1472,"path":[["m",221,445],["l",239,436],["l",364,472],["l",370,489],["l",327,688],["l",333,707],["c",487,820,673,894,673,1129],["c",673,1320,466,1463,215,1472],["l",186,1463],["l",118,1355],["l",122,1332],["c",370,1318,538,1236,538,1066],["c",538,988,485,929,421,885],["l",178,726],["l",172,696],["l",221,445],["m",292,0],["c",372,0,421,57,421,126],["c",421,190,380,243,305,243],["c",227,243,178,186,178,116],["c",178,57,215,0,292,0]]},"@":{"xoff":1728,"width":1600,"height":1664,"hbx":64,"hby":1216,"path":[["m",976,0],["c",1410,0,1636,297,1636,597],["c",1636,929,1353,1202,942,1202],["c",407,1202,67,785,67,382],["c",67,-17,348,-384,882,-409],["l",935,-335],["l",935,-320],["c",430,-291,212,51,212,416],["c",212,763,475,1088,890,1088],["c",1253,1088,1494,887,1494,552],["c",1494,305,1349,135,1050,135],["l",1042,142],["c",1095,486,1214,861,1214,861],["l",1197,885],["l",1134,915],["l",1124,913],["l",1105,863],["l",901,896],["c",681,896,432,578,432,264],["c",432,114,485,0,595,0],["c",720,88,843,223,978,454],["l",991,451],["c",991,451,903,98,903,59],["c",903,20,927,0,976,0],["m",634,162],["c",600,162,575,253,575,355],["c",575,582,708,785,837,785],["c",921,785,1017,739,1044,724],["c",886,395,706,162,634,162]]},"A":{"xoff":1216,"width":1280,"height":1344,"hbx":-64,"hby":1280,"path":[["m",1009,218],["c",856,661,683,1280,683,1280],["l",667,1280],["l",538,1246],["l",139,233],["c",94,125,55,92,-21,84],["l",-37,-7],["c",-37,-7,90,0,188,0],["c",323,0,473,-15,473,-15],["l",485,69],["l",481,77],["l",364,77],["c",278,77,241,100,241,156],["c",241,173,247,196,260,231],["l",335,432],["c",382,438,479,448,559,448],["c",616,448,722,448,772,445],["l",839,235],["c",851,198,858,167,858,142],["c",858,96,817,79,675,69],["l",667,-7],["l",673,0],["c",673,-21,821,0,978,0],["c",1048,0,1195,-7,1195,-7],["l",1210,73],["l",1206,81],["c",1087,90,1042,121,1009,218],["m",567,1063],["l",581,1063],["l",743,541],["c",696,537,608,531,552,531],["l",372,531],["l",567,1063]]},"B":{"xoff":1216,"width":1088,"height":1408,"hbx":64,"hby":1344,"path":[["m",352,0],["c",456,20,538,0,628,0],["c",886,0,1109,180,1109,389],["c",1109,538,991,653,792,695],["c",944,759,1030,872,1030,1004],["c",1030,1201,886,1312,626,1312],["c",626,1288,460,1280,384,1280],["c",307,1280,157,1286,157,1286],["l",143,1218],["l",147,1212],["c",147,1212,192,1216,217,1216],["c",278,1216,292,1194,292,1107],["l",290,264],["c",290,152,258,116,131,92],["l",118,0],["c",118,-25,249,0,352,0],["m",657,614],["c",839,581,933,485,933,337],["c",933,200,833,104,669,104],["c",499,104,436,142,436,245],["l",444,620],["l",657,614],["m",448,727],["c",452,894,458,1047,466,1177],["c",468,1213,475,1224,503,1224],["c",749,1224,864,1143,864,970],["c",864,755,671,711,671,711],["c",640,711,448,727,448,727]]},"C":{"xoff":1280,"width":1152,"height":1280,"hbx":64,"hby":1280,"path":[["m",694,0],["c",937,0,1114,81,1114,81],["l",1126,100],["c",1140,238,1181,412,1181,412],["l",1083,404],["c",1032,198,921,102,735,102],["c",452,102,266,324,266,661],["c",266,965,442,1159,716,1159],["c",917,1159,1017,1099,1017,980],["c",1017,938,1011,887,1011,887],["l",1109,894],["c",1122,1070,1161,1218,1161,1218],["l",1152,1230],["c",1152,1230,966,1280,796,1280],["c",382,1280,81,986,81,598],["c",81,236,321,0,694,0]]},"D":{"xoff":1472,"width":1344,"height":1408,"hbx":64,"hby":1344,"path":[["m",649,0],["c",1046,0,1357,306,1357,693],["c",1357,1039,1083,1280,683,1280],["c",683,1288,466,1280,372,1280],["c",294,1280,157,1286,157,1286],["l",143,1218],["l",147,1179],["c",147,1212,192,1216,217,1216],["c",278,1216,292,1194,292,1107],["l",290,266],["c",290,154,258,118,131,94],["l",118,0],["c",118,-25,251,0,354,0],["c",458,24,649,0,649,0],["m",542,1179],["c",946,1179,1171,989,1171,646],["c",1171,310,991,104,696,104],["c",489,104,438,141,438,283],["c",438,370,450,687,468,1136],["c",471,1171,485,1179,542,1179]]},"E":{"xoff":1216,"width":1088,"height":1408,"hbx":64,"hby":1344,"path":[["m",436,210],["c",436,275,438,374,444,587],["c",479,593,540,601,602,601],["c",712,601,888,595,888,595],["l",917,716],["l",909,726],["c",909,726,733,704,659,704],["c",597,704,493,706,448,706],["l",464,1098],["c",466,1173,475,1177,608,1177],["c",896,1177,921,1165,921,1033],["c",921,1005,917,946,917,946],["l",1015,955],["c",1028,1141,1062,1292,1062,1292],["l",1056,1280],["c",921,1286,767,1280,442,1280],["c",319,1280,157,1286,157,1286],["l",143,1196],["l",147,1187],["c",147,1211,192,1216,217,1216],["c",278,1216,292,1192,292,1101],["l",290,249],["c",290,140,253,103,131,88],["l",118,0],["c",118,-21,247,0,403,0],["c",597,0,1023,-15,1023,-15],["l",1034,-3],["c",1052,169,1089,333,1089,333],["l",1083,342],["l",993,333],["c",960,115,921,92,597,92],["c",450,92,436,104,436,210]]},"F":{"xoff":1024,"width":960,"height":1408,"hbx":64,"hby":1344,"path":[["m",436,227],["l",444,561],["c",479,568,540,576,602,576],["c",698,576,853,570,853,570],["l",882,692],["l",874,702],["c",874,702,722,680,659,680],["l",448,682],["l",464,1100],["c",466,1173,475,1177,608,1177],["c",858,1177,882,1165,882,1036],["c",882,1009,878,945,878,945],["l",976,953],["c",989,1135,1023,1292,1023,1292],["l",1017,1280],["c",888,1286,722,1280,442,1280],["c",319,1280,157,1286,157,1286],["l",143,1196],["l",147,1187],["c",147,1211,192,1216,217,1216],["c",278,1216,292,1193,292,1103],["l",290,256],["c",290,147,258,112,131,89],["l",118,0],["c",118,-25,249,0,352,0],["c",462,0,657,-9,657,-9],["l",675,88],["l",671,96],["c",671,96,567,90,526,90],["c",454,90,436,118,436,227]]},"G":{"xoff":1344,"width":1152,"height":1280,"hbx":64,"hby":1280,"path":[["m",1204,623],["c",1204,623,1116,614,1028,614],["c",907,614,767,621,767,621],["l",749,520],["l",753,512],["l",894,512],["c",987,512,1007,494,1007,408],["l",1007,175],["c",1007,175,890,102,726,102],["c",444,102,260,322,260,665],["c",260,979,442,1159,753,1159],["c",970,1159,1062,1109,1062,992],["c",1062,941,1056,890,1056,890],["l",1152,898],["c",1165,1072,1206,1218,1206,1218],["l",1197,1230],["c",1197,1230,970,1280,800,1280],["c",372,1280,81,1000,81,604],["c",81,236,315,0,679,0],["c",939,0,1150,94,1150,94],["l",1163,111],["c",1154,144,1148,213,1148,280],["c",1148,469,1163,538,1212,579],["l",1204,623]]},"H":{"xoff":1536,"width":1408,"height":1408,"hbx":64,"hby":1344,"path":[["m",1269,1082],["c",1273,1156,1298,1179,1400,1192],["l",1408,1280],["c",1408,1298,1261,1280,1163,1280],["c",1097,1280,962,1284,962,1286],["l",948,1196],["l",952,1187],["c",952,1187,997,1191,1021,1191],["c",1083,1191,1097,1170,1097,1084],["l",1095,723],["c",974,709,894,704,792,704],["l",448,705],["l",460,1027],["c",466,1166,477,1187,595,1206],["l",604,1280],["c",604,1298,473,1280,384,1280],["c",307,1280,157,1286,157,1286],["l",143,1196],["l",147,1187],["c",147,1187,192,1191,217,1191],["c",278,1191,292,1170,292,1084],["l",290,256],["c",290,147,258,112,131,89],["l",118,0],["c",122,-15,311,0,430,0],["c",501,0,604,-5,604,-7],["l",622,88],["l",618,96],["c",618,96,567,90,526,90],["c",454,90,436,118,436,227],["l",444,587],["c",444,587,718,609,784,609],["c",878,609,1095,607,1095,607],["l",1095,303],["c",1095,126,1068,90,939,88],["l",921,-5],["c",921,-5,1085,0,1157,0],["c",1247,0,1408,-7,1408,-7],["l",1427,88],["l",1423,96],["c",1423,96,1372,90,1331,90],["c",1259,90,1240,118,1240,227],["c",1240,394,1255,803,1269,1092],["l",1269,1082]]},"I":{"xoff":768,"width":576,"height":1408,"hbx":64,"hby":1344,"path":[["m",464,1078],["c",468,1153,497,1177,612,1191],["l",620,1280],["c",620,1298,479,1280,384,1280],["c",301,1280,141,1286,141,1286],["l",126,1196],["l",131,1187],["c",131,1187,186,1191,217,1191],["c",278,1191,292,1168,292,1085],["l",290,259],["c",290,149,255,114,126,90],["l",114,0],["c",114,-25,247,0,352,0],["c",448,0,620,-7,620,-7],["l",638,88],["l",634,96],["c",634,96,575,90,526,90],["c",454,90,436,118,436,226],["c",436,392,450,801,464,1091],["l",464,1078]]},"J":{"xoff":640,"width":576,"height":1664,"hbx":0,"hby":1344,"path":[["m",268,204],["c",268,-39,219,-138,53,-237],["l",47,-254],["l",81,-320],["c",313,-227,413,-69,415,206],["c",417,372,434,893,442,1073],["c",446,1158,462,1174,559,1188],["l",567,1280],["c",567,1298,417,1280,329,1280],["l",108,1280],["l",94,1189],["l",98,1181],["c",98,1181,169,1189,194,1189],["c",255,1189,270,1169,270,1081],["l",268,204]]},"K":{"xoff":1280,"width":1216,"height":1408,"hbx":64,"hby":1344,"path":[["m",290,240],["c",290,127,264,101,137,90],["l",116,-3],["c",116,-3,249,0,352,0],["c",442,0,604,-7,604,-7],["l",622,88],["l",618,96],["c",618,96,567,90,526,90],["c",454,90,432,117,436,224],["l",460,1072],["c",462,1147,493,1175,595,1191],["l",604,1280],["c",604,1298,473,1280,384,1280],["c",307,1280,157,1286,157,1286],["l",143,1196],["l",147,1187],["c",147,1187,192,1191,217,1191],["c",278,1191,292,1170,292,1085],["l",290,240],["m",495,644],["l",853,168],["c",933,62,1015,0,1083,0],["c",1105,0,1253,23,1253,23],["l",1265,90],["l",1257,97],["c",1161,97,1093,143,995,264],["l",651,693],["l",980,1025],["c",1103,1146,1144,1175,1216,1189],["l",1230,1273],["l",1222,1288],["c",1222,1288,1114,1280,1034,1280],["c",958,1280,808,1294,808,1294],["l",794,1206],["l",798,1198],["c",886,1191,927,1172,927,1138],["c",927,1111,907,1077,864,1036],["l",497,672],["l",495,644]]},"L":{"xoff":1024,"width":960,"height":1408,"hbx":128,"hby":1344,"path":[["m",413,0],["c",608,0,964,-19,964,-19],["l",974,-7],["c",997,194,1034,376,1034,376],["l",1028,386],["l",937,376],["c",892,130,849,92,612,92],["c",458,92,438,110,438,246],["c",438,424,444,760,462,1007],["c",473,1139,460,1173,597,1191],["l",606,1280],["c",606,1298,475,1280,387,1280],["c",309,1280,157,1286,157,1286],["l",143,1196],["l",147,1188],["c",147,1188,192,1191,217,1191],["c",278,1191,292,1170,292,1085],["l",290,256],["c",290,144,258,106,151,90],["l",139,0],["c",139,-21,260,0,413,0]]},"M":{"xoff":1728,"width":1600,"height":1408,"hbx":64,"hby":1344,"path":[["m",862,-25],["l",1257,1035],["l",1267,1035],["c",1267,1035,1337,245,1337,177],["c",1337,117,1300,88,1216,77],["l",1208,-17],["c",1208,-17,1333,0,1421,0],["c",1494,0,1615,-7,1615,-7],["l",1634,86],["l",1630,94],["c",1630,94,1597,90,1572,90],["c",1507,90,1490,123,1472,278],["c",1449,556,1419,1031,1419,1089],["c",1419,1154,1462,1184,1580,1198],["l",1591,1271],["l",1587,1280],["c",1587,1292,1427,1280,1365,1280],["c",1324,1280,1230,1286,1230,1284],["c",1036,708,876,292,876,292],["l",866,292],["c",866,292,704,704,520,1288],["c",520,1288,440,1280,380,1280],["c",315,1280,157,1290,157,1290],["l",141,1219],["l",147,1209],["c",272,1201,325,1169,325,1099],["c",325,1039,251,379,235,232],["c",223,124,190,88,104,77],["l",94,-17],["c",94,-17,188,0,270,0],["c",337,0,468,-9,468,-9],["l",487,83],["l",483,92],["c",483,92,419,90,399,90],["c",356,90,335,110,335,152],["c",335,204,405,1045,405,1045],["l",415,1045],["l",812,-64],["l",862,-25]]},"N":{"xoff":1472,"width":1344,"height":1408,"hbx":64,"hby":1344,"path":[["m",1128,292],["c",1128,292,780,769,440,1288],["c",440,1288,370,1280,303,1280],["c",245,1280,126,1290,126,1290],["l",110,1214],["l",116,1204],["c",253,1189,294,1161,294,1079],["l",268,204],["c",266,122,225,88,141,77],["l",131,-13],["c",131,-13,239,0,321,0],["c",409,0,538,-7,538,-7],["l",557,83],["l",552,92],["c",552,92,468,90,448,90],["c",401,90,384,110,384,170],["l",395,1025],["l",405,1025],["c",405,1025,767,530,1167,-64],["l",1226,-42],["l",1255,1075],["c",1257,1153,1300,1189,1394,1202],["l",1404,1280],["c",1404,1296,1288,1280,1202,1280],["c",1132,1280,1007,1288,1007,1288],["l",989,1196],["l",993,1187],["c",993,1187,1034,1189,1071,1189],["c",1116,1189,1138,1161,1138,1103],["l",1138,292],["l",1128,292]]},"O":{"xoff":1408,"width":1280,"height":1280,"hbx":64,"hby":1280,"path":[["m",712,104],["c",444,104,258,332,258,659],["c",258,954,432,1157,686,1157],["c",962,1157,1152,929,1152,602],["c",1152,307,972,104,712,104],["m",649,0],["c",1036,0,1335,301,1335,682],["c",1335,1030,1097,1280,755,1280],["c",376,1280,81,977,81,598],["c",81,247,313,0,649,0]]},"P":{"xoff":1152,"width":960,"height":1408,"hbx":128,"hby":1344,"path":[["m",143,1187],["l",147,1179],["c",147,1211,192,1216,217,1216],["c",276,1216,292,1193,292,1106],["l",290,258],["c",290,143,262,113,143,92],["l",129,0],["c",133,-11,323,0,434,0],["c",503,0,622,-5,622,-7],["l",640,88],["l",636,96],["c",636,96,567,90,526,90],["c",446,90,436,111,436,292],["l",440,487],["l",612,487],["c",856,487,1081,696,1081,923],["c",1081,1151,925,1280,643,1280],["c",643,1288,440,1280,384,1280],["c",307,1280,157,1286,157,1286],["l",143,1187],["m",444,620],["c",448,796,456,1000,468,1183],["c",471,1179,475,1179,524,1179],["c",790,1179,909,1088,909,885],["c",909,706,825,601,661,575],["l",444,620]]},"Q":{"xoff":1408,"width":1600,"height":1728,"hbx":64,"hby":1280,"path":[["m",649,0],["c",1134,-355,1257,-418,1451,-418],["c",1492,-418,1646,-279,1646,-279],["l",1634,-242],["l",1625,-236],["c",1625,-236,1558,-256,1462,-256],["c",1298,-256,1124,-183,833,14],["l",833,24],["c",1126,106,1335,364,1335,682],["c",1335,1030,1097,1280,755,1280],["c",376,1280,81,977,81,598],["c",81,247,313,0,649,0],["m",712,104],["c",444,104,258,332,258,659],["c",258,954,432,1157,686,1157],["c",962,1157,1152,929,1152,602],["c",1152,307,972,104,712,104]]},"R":{"xoff":1280,"width":1216,"height":1408,"hbx":64,"hby":1344,"path":[["m",612,576],["l",831,189],["c",896,73,980,0,1048,0],["l",1222,21],["l",1234,89],["l",1226,97],["c",1116,97,1052,141,972,267],["l",747,613],["c",937,697,1048,837,1048,996],["c",1048,1189,890,1312,636,1312],["c",636,1288,454,1280,384,1280],["c",307,1280,157,1286,157,1286],["l",143,1218],["l",147,1211],["c",147,1211,192,1216,217,1216],["c",276,1216,292,1193,292,1105],["l",290,247],["c",290,128,262,100,135,86],["l",116,-7],["c",116,-7,249,2,352,0],["c",448,-3,569,-5,569,-7],["l",587,79],["l",583,88],["c",452,88,436,108,436,255],["l",442,559],["l",612,576],["m",446,674],["c",448,817,454,960,466,1176],["c",468,1213,475,1224,503,1224],["c",753,1224,878,1134,878,954],["c",878,713,657,653,657,653],["l",446,674]]},"S":{"xoff":1088,"width":896,"height":1280,"hbx":64,"hby":1280,"path":[["m",448,0],["c",745,0,954,161,954,380],["c",954,554,753,642,575,728],["c",430,799,296,870,296,985],["c",296,1090,405,1169,554,1169],["c",739,1169,798,1125,798,991],["c",798,931,792,891,792,891],["l",804,882],["l",884,889],["c",896,1066,929,1216,929,1216],["l",923,1228],["c",923,1228,792,1280,610,1280],["c",344,1280,139,1117,139,916],["c",139,749,309,661,473,581],["c",630,504,784,435,784,311],["c",784,180,669,100,499,100],["c",278,100,233,157,233,433],["l",141,424],["c",141,238,116,90,116,90],["l",126,69],["c",126,69,255,0,448,0]]},"T":{"xoff":1088,"width":1152,"height":1408,"hbx":0,"hby":1344,"path":[["m",477,330],["c",477,119,462,101,272,85],["l",255,0],["c",255,-9,436,0,536,0],["c",632,0,837,-7,837,-7],["l",856,88],["l",849,96],["c",849,96,808,90,737,90],["c",653,90,620,128,620,226],["c",620,550,636,1038,653,1198],["c",950,1184,958,1178,999,938],["l",1095,946],["c",1095,946,1071,1114,1064,1286],["l",1046,1280],["l",872,1280],["l",237,1280],["l",67,1280],["l",49,1264],["c",43,1097,18,924,18,924],["l",114,931],["c",149,1180,155,1184,477,1198],["l",477,330]]},"U":{"xoff":1408,"width":1280,"height":1344,"hbx":64,"hby":1344,"path":[["m",376,513],["l",393,1082],["c",397,1156,421,1179,524,1192],["l",532,1280],["c",532,1298,405,1280,317,1280],["c",239,1280,86,1286,86,1286],["l",71,1196],["l",75,1188],["c",75,1188,120,1191,145,1191],["c",206,1191,221,1170,221,1086],["l",221,438],["c",221,161,382,0,669,0],["c",991,0,1177,161,1177,436],["l",1177,1094],["c",1177,1174,1200,1190,1318,1206],["l",1327,1280],["c",1327,1298,1216,1280,1128,1280],["c",1050,1280,896,1286,896,1286],["l",882,1196],["l",886,1188],["c",886,1188,950,1191,974,1191],["c",1034,1191,1044,1176,1050,1086],["c",1050,1086,1062,584,1062,447],["c",1062,232,942,116,718,116],["c",497,116,376,259,376,518],["l",376,513]]},"V":{"xoff":1280,"width":1344,"height":1408,"hbx":-64,"hby":1344,"path":[["m",174,1072],["c",346,536,528,-64,528,-64],["l",659,-19],["l",1099,1091],["c",1128,1169,1150,1185,1234,1189],["l",1251,1286],["c",1251,1286,1124,1280,1025,1280],["c",890,1280,733,1294,733,1294],["l",720,1206],["l",724,1216],["l",831,1216],["c",931,1216,972,1191,972,1132],["c",972,1070,739,453,632,173],["l",614,173],["c",614,173,356,1072,356,1139],["c",356,1199,393,1216,538,1222],["l",546,1271],["l",540,1280],["c",540,1302,341,1280,233,1280],["c",163,1280,-5,1286,-5,1286],["l",-19,1216],["l",-15,1189],["c",92,1187,149,1150,174,1072]]},"W":{"xoff":1920,"width":1984,"height":1408,"hbx":-64,"hby":1344,"path":[["m",1331,-19],["l",1761,1091],["c",1789,1171,1812,1185,1892,1189],["l",1906,1286],["c",1906,1286,1783,1280,1689,1280],["c",1558,1280,1404,1294,1404,1294],["l",1390,1206],["l",1394,1216],["l",1496,1216],["c",1595,1216,1636,1195,1636,1143],["c",1636,1080,1406,455,1304,173],["l",1292,173],["c",1292,173,1038,1070,1038,1139],["c",1038,1199,1075,1216,1216,1222],["l",1224,1271],["l",1218,1280],["c",1218,1302,1044,1280,921,1280],["c",853,1280,690,1286,690,1286],["l",675,1216],["l",679,1189],["c",780,1185,837,1155,864,1072],["l",901,959],["l",612,170],["l",600,170],["c",600,170,348,1044,348,1124],["c",348,1181,384,1198,524,1208],["l",532,1288],["l",526,1280],["c",526,1302,374,1280,229,1280],["c",161,1280,-3,1286,-3,1286],["l",-15,1216],["c",-15,1196,-13,1191,-13,1189],["c",90,1187,147,1150,172,1072],["c",344,538,514,-64,514,-64],["l",645,-19],["l",935,807],["l",948,807],["c",1087,357,1204,-64,1204,-64],["l",1331,-19]]},"X":{"xoff":1344,"width":1344,"height":1408,"hbx":0,"hby":1344,"path":[["m",370,365],["c",247,217,159,122,38,88],["l",24,6],["l",32,-9],["c",32,-9,155,0,235,0],["c",311,0,460,-15,460,-15],["l",475,72],["l",471,80],["c",389,86,352,104,352,140],["c",352,178,376,215,456,319],["l",645,564],["l",868,235],["c",894,196,909,170,909,146],["c",909,100,858,82,749,76],["l",741,-3],["l",747,0],["c",747,-17,950,0,1064,0],["c",1159,0,1318,-7,1318,-7],["l",1333,80],["l",1329,88],["c",1200,100,1122,150,1048,255],["l",749,683],["l",997,990],["c",1109,1129,1152,1175,1275,1199],["l",1288,1274],["l",1279,1288],["c",1279,1288,1161,1280,1081,1280],["c",1005,1280,856,1294,856,1294],["l",843,1215],["l",847,1207],["c",931,1199,966,1183,966,1147],["c",966,1091,790,882,698,757],["c",561,962,466,1107,466,1139],["c",466,1183,514,1203,626,1211],["l",632,1282],["l",626,1280],["c",626,1296,511,1280,350,1280],["c",255,1280,55,1286,55,1286],["l",43,1207],["l",47,1199],["c",172,1183,260,1131,327,1033],["l",595,639],["l",370,365]]},"Y":{"xoff":1088,"width":1216,"height":1408,"hbx":-64,"hby":1344,"path":[["m",333,1125],["c",333,1170,366,1186,489,1196],["l",495,1265],["l",489,1280],["c",489,1296,313,1280,198,1280],["c",104,1280,-27,1286,-27,1286],["l",-39,1209],["l",-35,1201],["c",124,1187,141,1136,223,974],["l",407,613],["c",456,518,466,467,466,390],["l",466,303],["c",466,157,454,118,307,90],["l",294,0],["c",294,-25,425,0,528,0],["c",618,0,788,-7,788,-7],["l",806,88],["l",802,96],["c",802,96,743,90,702,90],["c",630,90,610,124,612,226],["c",616,445,614,513,657,585],["l",862,938],["c",972,1129,989,1173,1130,1199],["l",1142,1274],["l",1134,1288],["c",1134,1288,1025,1280,946,1280],["c",870,1280,718,1294,718,1294],["l",706,1215],["l",710,1207],["c",798,1201,839,1181,839,1147],["c",839,1119,827,1083,806,1047],["l",573,621],["l",563,621],["c",561,621,333,1081,333,1139],["l",333,1125]]},"Z":{"xoff":1152,"width":1024,"height":1280,"hbx":64,"hby":1280,"path":[["m",1013,26],["c",1023,216,1064,428,1064,428],["l",968,418],["c",923,196,839,97,698,95],["l",282,81],["c",370,214,686,687,1073,1176],["l",1050,1235],["l",522,1250],["l",163,1280],["l",143,1262],["c",139,1081,106,878,106,878],["l",202,886],["c",225,1085,290,1150,479,1157],["l",833,1169],["l",69,59],["l",98,0],["l",241,11],["l",982,0],["l",1013,26]]},"[":{"xoff":640,"width":448,"height":1536,"hbx":192,"hby":1280,"path":[["m",569,-256],["l",581,-197],["l",573,-183],["l",335,-136],["l",335,1159],["l",569,1206],["l",581,1267],["l",573,1280],["l",196,1258],["c",196,1258,219,706,219,508],["c",219,311,196,-235,196,-235],["l",569,-256]]},"\\":{"xoff":704,"width":576,"height":1664,"hbx":64,"hby":1408,"path":[["m",75,1387],["c",75,1387,237,776,325,433],["c",411,83,497,-256,497,-256],["l",595,-256],["l",610,-240],["c",610,-240,501,134,421,456],["l",186,1408],["l",92,1408],["l",75,1387]]},"]":{"xoff":640,"width":448,"height":1536,"hbx":0,"hby":1280,"path":[["m",63,1280],["l",51,1220],["l",59,1206],["l",296,1159],["l",296,-136],["l",63,-183],["l",51,-245],["l",59,-256],["l",436,-235],["c",436,-235,413,317,413,514],["c",413,712,436,1258,436,1258],["l",63,1280]]},"^":{"xoff":1024,"width":896,"height":832,"hbx":64,"hby":960,"path":[["m",552,960],["l",456,955],["l",280,557],["c",200,379,114,163,114,163],["l",124,145],["l",227,131],["c",227,131,307,351,376,512],["l",499,814],["l",511,814],["l",655,485],["c",729,324,817,129,817,129],["l",839,128],["l",921,186],["c",921,186,819,394,747,555],["c",681,698,575,944,575,944],["l",552,960]]},"_":{"xoff":960,"width":1024,"height":192,"hbx":-64,"hby":-128,"path":[["m",937,-192],["c",937,-188,868,-190,780,-192],["c",690,-197,581,-199,499,-199],["c",317,-199,10,-197,10,-197],["l",-13,-297],["l",0,-320],["c",81,-315,606,-311,933,-311],["l",950,-207],["l",937,-192]]},"`":{"xoff":832,"width":448,"height":384,"hbx":128,"hby":1472,"path":[["m",147,1364],["c",147,1364,319,1239,491,1088],["l",509,1091],["l",550,1129],["c",403,1284,243,1472,243,1472],["l",223,1467],["l",145,1386],["l",147,1364]]},"a":{"xoff":960,"width":896,"height":896,"hbx":64,"hby":896,"path":[["m",579,484],["l",192,389],["c",126,372,83,313,83,242],["c",83,106,194,0,346,0],["c",387,0,473,61,571,157],["l",579,155],["c",589,50,651,0,761,0],["c",864,31,939,148,939,148],["l",911,178],["c",911,183,853,137,788,137],["c",735,137,704,168,704,221],["c",704,330,741,578,741,645],["c",741,797,634,896,456,896],["c",368,896,122,753,122,753],["l",147,674],["l",157,668],["c",157,668,270,760,403,760],["c",518,760,583,689,583,565],["l",579,484],["m",567,227],["c",509,175,432,139,380,139],["c",298,139,239,192,239,262],["c",239,300,260,328,298,339],["l",575,415],["l",567,227]]},"b":{"xoff":1024,"width":1024,"height":1472,"hbx":0,"hby":1472,"path":[["m",174,1231],["l",174,40],["l",192,24],["c",192,24,319,0,456,0],["c",739,0,966,223,966,490],["c",966,721,804,896,571,896],["c",542,896,448,842,323,752],["c",333,1140,352,1416,370,1445],["l",358,1472],["c",358,1472,196,1430,55,1411],["l",47,1343],["l",53,1337],["c",53,1337,75,1343,98,1343],["c",149,1343,174,1308,174,1231],["m",313,150],["l",319,658],["c",389,714,483,756,538,756],["c",690,756,808,608,808,422],["c",808,231,696,112,514,112],["c",448,112,362,129,313,150]]},"c":{"xoff":896,"width":768,"height":896,"hbx":64,"hby":896,"path":[["m",747,197],["c",747,197,630,137,516,137],["c",344,137,237,268,237,480],["c",237,675,329,785,497,785],["c",597,785,665,725,665,635],["l",665,579],["l",749,584],["c",755,727,792,842,792,842],["l",786,857],["c",786,857,677,896,546,896],["c",278,896,73,681,73,418],["c",73,173,241,0,501,0],["c",602,0,782,137,782,137],["l",759,193],["l",747,197]]},"d":{"xoff":1088,"width":1088,"height":1472,"hbx":64,"hby":1472,"path":[["m",724,144],["l",739,139],["c",753,44,812,0,921,0],["c",1017,26,1099,148,1099,148],["l",1071,178],["c",1071,185,1013,139,948,139],["c",894,139,864,171,864,225],["c",864,772,892,1394,921,1443],["l",909,1472],["c",909,1472,747,1428,606,1409],["l",597,1330],["c",597,1330,626,1338,649,1338],["c",700,1338,724,1303,724,1227],["l",724,888],["c",667,893,620,896,583,896],["c",303,896,73,675,73,406],["c",73,171,233,0,468,0],["c",497,0,583,49,724,144],["l",724,144],["m",724,232],["c",724,232,600,133,501,133],["c",350,133,231,281,231,469],["c",231,657,344,777,526,777],["c",649,777,724,735,724,735],["l",724,232]]},"e":{"xoff":896,"width":768,"height":896,"hbx":64,"hby":896,"path":[["m",235,587],["c",260,714,360,791,487,791],["c",595,791,657,741,657,650],["c",657,616,647,607,606,604],["l",235,587],["m",792,512],["l",819,536],["c",819,536,831,585,831,630],["c",831,793,726,896,526,896],["c",282,896,73,676,73,421],["c",73,178,245,0,503,0],["c",626,0,817,139,817,139],["l",794,192],["l",782,196],["c",782,196,657,139,530,139],["c",348,139,227,275,227,482],["l",227,512],["l",792,512]]},"f":{"xoff":704,"width":896,"height":1536,"hbx":64,"hby":1472,"path":[["m",92,805],["c",192,801,217,787,221,724],["l",221,193],["c",221,126,182,86,104,76],["l",94,0],["c",94,-9,208,0,323,0],["c",403,0,577,-5,577,-5],["l",591,83],["l",587,92],["c",587,92,534,88,464,88],["c",393,88,360,121,360,197],["l",368,793],["c",511,793,638,787,638,787],["l",659,896],["l",653,901],["c",653,901,516,896,370,896],["l",372,991],["c",376,1234,452,1351,608,1351],["c",741,1351,843,1279,843,1279],["l",866,1285],["c",896,1357,929,1414,929,1414],["l",925,1433],["c",925,1433,831,1472,692,1472],["c",405,1472,223,1255,221,917],["l",221,909],["l",98,887],["l",83,818],["l",92,805]]},"g":{"xoff":1024,"width":960,"height":1408,"hbx":64,"hby":960,"path":[["m",466,256],["c",694,256,872,413,872,610],["c",872,683,843,752,790,809],["l",798,819],["c",884,824,974,836,974,836],["l",997,951],["l",991,960],["c",991,960,812,908,708,896],["c",655,873,585,896,507,896],["c",305,896,126,732,126,554],["c",126,444,182,353,278,303],["l",278,294],["c",278,294,169,231,106,171],["c",106,82,202,3,329,-12],["l",329,-23],["c",329,-23,194,-109,126,-191],["c",126,-348,241,-448,436,-448],["c",696,-448,944,-275,944,-103],["c",944,28,825,82,507,97],["c",339,102,262,130,262,188],["c",262,213,292,242,348,272],["c",391,262,428,256,466,256],["m",516,346],["c",374,346,280,443,280,586],["c",280,711,358,791,483,791],["c",622,791,718,692,718,549],["c",718,422,640,346,516,346],["m",511,-348],["c",370,-348,286,-290,286,-195],["c",286,-111,413,-25,413,-25],["c",741,-64,812,-90,812,-163],["c",812,-260,671,-348,511,-348]]},"h":{"xoff":1088,"width":1088,"height":1536,"hbx":0,"hby":1472,"path":[["m",59,-5],["c",59,-5,176,0,262,0],["c",337,0,448,-7,448,-7],["l",466,81],["l",462,89],["c",462,89,415,86,391,86],["c",337,86,317,114,317,192],["c",317,347,319,506,323,652],["c",354,675,475,756,583,756],["c",692,756,753,684,753,559],["l",741,184],["c",741,118,708,81,626,59],["l",618,0],["c",618,-25,743,0,829,0],["c",905,0,1011,-7,1011,-7],["l",1028,81],["l",1023,89],["c",1023,89,976,86,952,86],["c",901,86,880,118,880,192],["c",880,301,913,574,913,641],["c",913,799,810,896,632,896],["c",554,896,364,762,325,737],["c",335,1115,354,1414,374,1445],["l",362,1472],["c",362,1472,200,1430,59,1411],["l",51,1345],["l",59,1339],["l",102,1339],["c",155,1339,178,1306,178,1231],["l",178,184],["c",178,114,149,87,71,79],["l",59,-5]]},"i":{"xoff":576,"width":448,"height":1536,"hbx":64,"hby":1472,"path":[["m",272,1246],["c",339,1246,393,1299,393,1367],["c",393,1428,350,1472,292,1472],["c",225,1472,172,1418,172,1351],["c",172,1289,212,1246,272,1246],["m",90,0],["c",90,-25,215,0,301,0],["c",376,0,483,-7,483,-7],["l",499,81],["l",495,90],["c",495,90,448,86,423,86],["c",372,86,352,121,352,202],["c",352,527,374,877,399,935],["l",389,960],["c",389,960,231,921,94,900],["l",86,823],["c",86,823,114,832,137,832],["c",188,832,212,796,212,720],["l",212,193],["c",212,121,180,81,98,59],["l",90,0]]},"j":{"xoff":512,"width":384,"height":1920,"hbx":0,"hby":1472,"path":[["m",67,-448],["c",235,-348,327,-185,327,8],["c",327,577,339,907,362,945],["l",352,969],["c",352,969,182,929,57,913],["l",49,838],["c",49,838,81,844,104,844],["c",165,844,186,818,186,736],["l",186,112],["c",186,-163,151,-280,34,-394],["l",30,-410],["l",67,-448],["m",247,1246],["c",315,1246,368,1299,368,1367],["c",368,1428,325,1472,268,1472],["c",200,1472,147,1418,147,1351],["c",147,1289,188,1246,247,1246]]},"k":{"xoff":1024,"width":1024,"height":1536,"hbx":0,"hby":1472,"path":[["m",59,-13],["c",59,-13,176,0,262,0],["c",337,0,448,-7,448,-7],["l",466,81],["l",462,89],["c",462,89,415,86,391,86],["c",337,86,317,115,317,196],["c",317,789,346,1402,374,1446],["l",362,1472],["c",362,1472,200,1432,59,1414],["l",55,1376],["c",53,1364,51,1352,51,1340],["c",51,1340,79,1348,102,1348],["c",153,1348,178,1315,178,1241],["l",178,269],["c",178,137,180,87,69,71],["l",59,-13],["m",610,143],["c",671,57,710,14,753,-9],["c",774,-41,798,-51,825,-51],["c",856,-51,976,-18,976,-18],["l",989,41],["l",982,51],["c",899,51,829,98,735,218],["l",520,492],["c",655,622,808,792,956,835],["l",972,897],["l",966,907],["c",966,907,849,896,772,896],["c",698,896,571,899,571,899],["l",552,841],["l",559,831],["c",638,831,671,818,671,788],["c",671,768,659,751,622,717],["l",372,490],["l",368,461],["l",610,143]]},"l":{"xoff":512,"width":512,"height":1536,"hbx":0,"hby":1472,"path":[["m",55,0],["c",55,-25,180,0,266,0],["c",341,0,448,-7,448,-7],["l",464,81],["l",460,89],["c",460,89,413,86,389,86],["c",337,86,317,117,317,196],["c",317,785,346,1403,374,1446],["l",362,1472],["c",362,1472,200,1432,59,1414],["l",55,1377],["c",53,1365,51,1353,51,1341],["c",51,1341,79,1349,102,1349],["c",153,1349,178,1315,178,1242],["l",178,270],["c",178,145,182,91,63,59],["l",55,0]]},"m":{"xoff":1728,"width":1600,"height":960,"hbx":64,"hby":896,"path":[["m",657,0],["c",657,-25,782,0,868,0],["c",944,0,1050,-7,1050,-7],["l",1066,81],["l",1062,89],["c",1062,89,1015,86,991,86],["c",939,86,919,118,919,192],["l",942,661],["c",987,692,1091,756,1189,756],["c",1298,756,1359,684,1359,559],["l",1351,184],["c",1351,114,1320,83,1243,71],["l",1232,-13],["c",1232,-13,1349,0,1435,0],["c",1511,0,1621,-7,1621,-7],["l",1640,81],["l",1636,89],["c",1636,89,1589,86,1564,86],["c",1511,86,1490,114,1490,192],["c",1490,301,1519,574,1519,641],["c",1519,793,1410,896,1238,896],["c",1159,896,964,758,929,735],["c",892,836,798,896,667,896],["c",593,896,417,775,366,741],["l",362,747],["c",366,816,384,881,384,881],["l",372,896],["c",372,896,227,861,86,840],["l",79,777],["l",86,769],["l",108,769],["c",182,769,208,739,208,652],["l",208,185],["c",208,114,180,87,102,79],["l",90,-5],["c",90,-5,206,0,292,0],["c",368,0,479,-7,479,-7],["l",497,81],["l",493,89],["c",493,89,446,86,421,86],["c",368,86,348,114,348,193],["c",348,267,360,532,366,664],["c",407,688,518,756,618,756],["c",726,756,788,686,788,563],["l",780,196],["c",780,131,747,96,665,76],["l",657,0]]},"n":{"xoff":1152,"width":1024,"height":960,"hbx":64,"hby":896,"path":[["m",657,0],["c",657,-25,782,0,868,0],["c",944,0,1050,-7,1050,-7],["l",1066,81],["l",1062,89],["c",1062,89,1015,86,991,86],["c",939,86,919,118,919,192],["c",919,301,948,574,948,641],["c",948,793,839,896,667,896],["c",602,896,415,773,366,741],["l",362,747],["c",366,816,384,881,384,881],["l",372,896],["c",372,896,227,861,86,840],["l",79,777],["l",86,769],["l",108,769],["c",182,769,208,739,208,652],["l",208,185],["c",208,114,178,83,100,71],["l",90,-13],["c",90,-13,206,0,292,0],["c",368,0,479,-7,479,-7],["l",497,81],["l",493,89],["c",493,89,446,86,421,86],["c",368,86,348,114,348,193],["c",348,267,360,532,366,664],["c",407,688,518,756,618,756],["c",726,756,788,686,788,563],["l",780,196],["c",780,131,747,96,665,76],["l",657,0]]},"o":{"xoff":1024,"width":896,"height":896,"hbx":64,"hby":896,"path":[["m",471,0],["c",739,0,946,214,946,476],["c",946,717,782,896,548,896],["c",280,896,73,680,73,418],["c",73,177,235,0,471,0],["m",528,100],["c",356,100,237,250,237,471],["c",237,664,333,785,487,785],["c",659,785,778,631,778,410],["c",778,219,681,100,528,100]]},"p":{"xoff":1088,"width":960,"height":1408,"hbx":64,"hby":896,"path":[["m",102,-397],["l",92,-448],["c",92,-463,192,-448,309,-448],["l",503,-448],["l",520,-371],["l",516,-384],["c",493,-365,468,-367,446,-367],["c",368,-367,350,-330,350,-204],["c",350,-134,348,-62,348,8],["c",348,8,448,0,497,0],["c",776,0,1007,228,1007,493],["c",1007,725,847,896,612,896],["c",581,896,495,846,374,762],["l",366,777],["c",372,830,387,887,387,887],["l",374,896],["c",374,896,229,862,88,842],["l",81,780],["l",88,773],["l",110,773],["c",184,773,210,743,210,660],["l",210,106],["c",210,18,206,-169,206,-235],["c",206,-348,190,-373,102,-383],["l",102,-397],["m",350,147],["c",350,307,356,519,366,671],["c",438,719,524,756,579,756],["c",731,756,849,611,849,425],["c",849,232,737,112,554,112],["c",487,112,403,127,350,147],["l",350,147]]},"q":{"xoff":1088,"width":960,"height":1408,"hbx":64,"hby":896,"path":[["m",571,-448],["c",571,-457,696,-448,790,-448],["l",978,-448],["l",993,-369],["l",989,-365],["c",989,-365,964,-367,935,-367],["c",872,-367,862,-342,862,-194],["c",862,436,876,825,901,879],["l",884,896],["c",884,896,833,874,772,854],["c",710,889,640,896,583,896],["c",303,896,73,667,73,404],["c",73,173,235,0,468,0],["c",497,0,591,55,724,145],["l",716,-249],["c",712,-348,694,-366,581,-372],["l",571,-448],["m",724,235],["c",724,235,600,133,501,133],["c",350,133,231,280,231,466],["c",231,658,344,777,526,777],["c",649,777,724,735,724,735],["l",724,235]]},"r":{"xoff":768,"width":704,"height":960,"hbx":64,"hby":896,"path":[["m",120,76],["l",110,0],["c",110,-9,204,0,325,0],["c",405,0,534,-5,534,-5],["l",552,86],["l",550,93],["c",550,93,489,90,460,90],["c",382,90,362,114,362,200],["c",362,242,378,590,378,590],["c",436,670,509,719,569,719],["c",614,719,624,695,624,590],["l",704,595],["c",708,712,737,879,737,879],["l",731,887],["c",731,887,712,896,667,896],["c",585,896,462,805,378,679],["l",370,685],["c",368,779,389,893,389,893],["l",374,896],["c",374,896,223,859,98,838],["l",92,779],["l",102,765],["c",102,765,122,771,145,771],["c",200,771,223,738,223,654],["l",223,233],["c",223,113,202,81,120,73],["l",120,76]]},"s":{"xoff":832,"width":704,"height":896,"hbx":64,"hby":896,"path":[["m",350,0],["c",550,0,724,133,724,274],["c",724,366,659,425,438,530],["c",311,589,260,637,260,696],["c",260,751,333,797,425,797],["c",542,797,593,758,593,670],["c",593,654,589,617,589,617],["l",665,622],["c",675,744,704,852,704,852],["l",700,863],["c",700,863,606,896,495,896],["c",280,896,118,773,118,622],["c",118,534,186,466,341,394],["c",530,304,579,265,579,204],["c",579,144,497,96,395,96],["c",249,96,196,155,196,317],["l",124,307],["c",122,247,108,99,100,57],["l",106,43],["c",106,43,200,0,350,0]]},"t":{"xoff":704,"width":640,"height":1088,"hbx":0,"hby":1088,"path":[["m",167,246],["c",167,67,235,0,421,0],["c",471,0,628,122,628,122],["l",608,175],["c",608,175,536,139,468,139],["c",352,139,309,190,309,328],["c",309,537,315,708,323,836],["l",620,829],["l",638,938],["l",632,944],["l",331,938],["c",339,1026,348,1073,348,1073],["l",307,1088],["c",307,1088,186,981,53,922],["l",43,860],["l",51,848],["c",141,844,167,819,167,746],["l",167,246]]},"u":{"xoff":1088,"width":1152,"height":896,"hbx":0,"hby":896,"path":[["m",176,228],["c",176,83,272,0,448,0],["c",485,0,602,69,733,167],["l",743,163],["c",753,55,815,0,925,0],["c",995,0,1103,162,1103,162],["l",1075,191],["c",1075,191,1017,145,952,145],["c",899,145,868,176,868,230],["c",868,527,888,818,913,873],["l",901,896],["c",901,896,731,860,585,842],["l",577,775],["c",577,775,614,777,626,777],["c",702,777,729,751,729,677],["l",729,247],["c",661,202,575,141,481,141],["c",370,141,317,201,317,323],["c",317,540,344,808,370,873],["l",358,896],["c",358,896,192,859,65,840],["l",57,771],["c",57,771,86,779,108,779],["c",159,779,184,744,184,679],["l",176,228]]},"v":{"xoff":896,"width":1024,"height":1024,"hbx":-64,"hby":960,"path":[["m",708,760],["c",708,712,612,504,460,133],["l",452,133],["c",452,133,278,712,278,770],["c",278,807,305,819,399,823],["l",411,885],["l",407,896],["c",407,910,286,896,161,896],["c",114,896,-9,898,-9,898],["l",-21,830],["l",-17,822],["c",53,820,100,785,122,719],["c",182,543,372,-64,372,-64],["l",483,-30],["l",780,668],["c",831,787,853,814,911,822],["l",925,898],["c",925,898,829,896,757,896],["c",657,896,544,898,544,898],["l",534,834],["l",542,822],["l",620,822],["c",686,822,708,810,708,773],["l",708,760]]},"w":{"xoff":1472,"width":1536,"height":1024,"hbx":-64,"hby":960,"path":[["m",1232,773],["c",1232,724,1140,513,993,136],["l",985,136],["c",985,136,817,724,817,783],["c",817,818,839,828,933,832],["l",946,896],["l",942,906],["c",942,906,823,896,702,896],["c",657,896,538,898,538,898],["l",526,830],["l",530,822],["c",614,822,647,773,675,687],["c",638,584,563,402,458,136],["l",450,136],["c",450,136,282,719,282,783],["c",282,820,309,832,399,836],["l",411,900],["l",407,896],["c",407,910,290,896,167,896],["c",122,896,4,898,4,898],["l",-9,830],["l",-5,822],["c",65,820,108,785,131,719],["c",188,543,372,-64,372,-64],["l",483,-30],["l",710,539],["l",722,539],["c",798,294,907,-64,907,-64],["l",1015,-30],["l",1304,668],["c",1353,787,1376,816,1431,822],["l",1445,898],["c",1445,898,1345,896,1277,896],["c",1179,896,1075,900,1075,900],["l",1064,836],["l",1073,824],["l",1148,824],["c",1210,824,1232,810,1232,773]]},"x":{"xoff":960,"width":960,"height":1024,"hbx":0,"hby":960,"path":[["m",753,0],["c",819,0,939,-5,939,-5],["l",952,63],["l",948,71],["c",866,79,810,122,741,220],["l",552,479],["l",729,679],["c",796,755,858,814,901,828],["l",913,892],["l",907,902],["c",907,902,817,896,761,896],["l",612,896],["l",602,830],["l",606,822],["c",675,822,694,816,694,796],["c",694,769,667,739,630,695],["l",505,543],["l",393,701],["c",366,739,344,769,344,794],["c",344,822,370,832,436,832],["l",448,894],["l",444,896],["c",444,904,352,896,235,896],["c",169,896,28,900,28,900],["l",16,832],["l",20,824],["c",118,808,151,777,241,652],["l",397,438],["l",221,239],["c",133,140,104,103,30,65],["l",18,3],["l",24,-7],["c",24,-7,92,0,147,0],["c",194,0,317,-9,317,-9],["l",329,57],["l",325,65],["c",253,69,235,75,235,101],["c",235,136,366,287,442,376],["l",591,174],["c",616,140,626,116,626,101],["c",626,73,600,61,532,59],["l",520,-3],["l",524,0],["c",524,-13,671,0,753,0]]},"y":{"xoff":896,"width":1024,"height":1472,"hbx":-64,"hby":960,"path":[["m",462,194],["c",462,194,280,711,280,777],["c",280,812,307,823,401,827],["l",413,886],["l",409,896],["c",409,910,284,896,163,896],["c",116,896,-7,898,-7,898],["l",-19,834],["l",-15,826],["c",53,824,92,797,124,734],["c",202,550,329,211,393,22],["c",301,-190,151,-317,-7,-317],["l",-17,-332],["c",-17,-358,53,-448,73,-448],["c",253,-453,323,-326,534,130],["l",798,716],["c",827,792,851,817,913,826],["l",927,898],["c",927,898,825,896,753,896],["c",653,896,546,904,546,904],["l",534,840],["l",538,832],["l",632,832],["c",686,832,710,817,710,782],["c",710,743,565,412,471,199],["l",462,194]]},"z":{"xoff":960,"width":832,"height":1024,"hbx":64,"hby":960,"path":[["m",94,-3],["l",200,8],["l",776,0],["l",808,31],["c",808,171,843,345,843,345],["l",761,335],["c",733,173,677,105,569,97],["l",266,80],["c",325,163,561,489,851,848],["l",835,891],["l",405,902],["l",143,896],["l",131,886],["c",129,763,108,607,108,607],["l",188,618],["c",202,747,241,784,374,792],["l",630,803],["l",73,49],["l",94,-3]]},"{":{"xoff":640,"width":576,"height":1536,"hbx":64,"hby":1280,"path":[["m",94,490],["c",204,466,292,415,292,317],["c",292,236,208,87,208,-29],["c",208,-150,301,-256,462,-256],["c",524,-256,573,-241,573,-241],["l",589,-186],["l",583,-174],["c",583,-174,522,-186,481,-186],["c",389,-186,354,-123,354,-52],["c",354,38,409,203,409,307],["c",409,427,337,486,260,513],["l",260,525],["c",329,547,409,602,409,722],["c",409,820,354,985,354,1073],["c",354,1144,389,1209,479,1209],["c",514,1209,573,1199,573,1199],["l",589,1258],["l",583,1267],["c",583,1267,520,1280,466,1280],["c",298,1280,208,1173,208,1051],["c",208,936,292,784,292,694],["c",292,610,200,557,102,531],["l",94,490]]},"|":{"xoff":768,"width":256,"height":2240,"hbx":256,"hby":1664,"path":[["m",438,1664],["l",315,1641],["l",313,558],["c",311,186,311,-564,311,-564],["l",329,-576],["l",450,-554],["c",450,-554,448,231,448,589],["c",448,935,460,1651,460,1651],["l",438,1664]]},"}":{"xoff":640,"width":576,"height":1536,"hbx":0,"hby":1280,"path":[["m",538,533],["c",428,557,339,608,339,706],["c",339,786,423,936,423,1051],["c",423,1173,331,1280,169,1280],["c",108,1280,59,1264,59,1264],["l",43,1209],["l",49,1197],["c",49,1197,110,1209,151,1209],["c",243,1209,278,1146,278,1075],["c",278,985,223,820,223,716],["c",223,596,294,537,372,509],["l",372,498],["c",303,476,223,421,223,301],["c",223,203,278,38,278,-50],["c",278,-121,243,-186,153,-186],["c",118,-186,59,-176,59,-176],["l",43,-235],["l",49,-245],["c",49,-245,112,-256,165,-256],["c",333,-256,423,-150,423,-29],["c",423,87,339,238,339,329],["c",339,413,432,466,530,492],["l",538,533]]},"~":{"xoff":1024,"width":896,"height":320,"hbx":64,"hby":704,"path":[["m",145,384],["c",145,384,225,512,274,512],["c",368,532,655,444,765,444],["l",798,453],["l",954,643],["l",954,655],["l",909,704],["l",896,704],["c",896,704,817,576,767,576],["c",673,555,387,643,276,643],["l",243,634],["l",88,444],["l",88,432],["l",133,384],["l",145,384]]}},"exporter":"SimpleJson","version":"0.0.3"};

},{}],22:[function(require,module,exports){
var tmpBounds = { x: 0, y: 0, width: 0, height: 0, glyphs: 0 };

function isWhitespace(chr) {
	return chr===' '
		|| chr==='\n'
		|| chr==='\r'
		|| chr==='\t';
}

function idxOf(text, chr, start, end) {
	var idx = text.indexOf(chr, start);
	if (idx === -1 || idx > end)
		return end;
	return idx;
}

function WordWrap(text) {
	/**
	 * The text being operated on.
	 * @param {String} text
	 */
	this.text = text||"";

	/**
	 * An array of lines representing the state of this word wrapper.
	 * @param {Array} lines
	 */
	this.lines = [];

	/** 
	 * The newline character to break on, default '\n'
	 * @param {String} newline
	 */
	this.newline = '\n';

	/**
	 * Whether to clip non-breaking text (nowrap and pre)
	 * if the wrapWidth is too small. 
	 *  
	 * @param {Boolean} clip
	 */
	this.clip = false;

	/**
	 * The mode for wordwrapping: 'pre', 'normal', or 'nowrap'.
	 *
	 * You can also use the `PRE`, `NORMAL`, and `NOWRAP` constants
	 * in `WordWrap.Mode`.
	 * 
	 * @param {String} mode
	 */
	this.mode = WordWrap.Mode.NORMAL;
}

WordWrap.Mode = {
	PRE: 'pre',       //whitespace isn't collapsed
	NORMAL: 'normal', //whitespace is collapsed
	NOWRAP: 'nowrap'  //only break on '\n'
};

/**
 * Clears any multi-line layout by placing all the text in a single Line object.
 * 
 * @param {GlyphIterator} iterator the iterator to use 
 * @method  clearLayout
 */
WordWrap.prototype.clearLayout = function(iterator) {
	this.lines.length = 0;
	
	if (this.text.length > 0) {
		iterator.getBounds(this.text, 0, this.text.length, undefined, tmpBounds);
		
		var line = new WordWrap.Line(0, this.text.length, tmpBounds.width);
		this.lines.push(line);
	}
};

/**
 * Resets the word wrapper by emptying all current lines.
 * @method  empty
 */
WordWrap.prototype.empty = function() {
	this.lines.length = 0;
};

/**
 * Word-wraps the given text into multiple lines.
 * @param  {[type]} iterator [description]
 * @param  {[type]} width    [description]
 * @param  {[type]} start    [description]
 * @param  {[type]} end      [description]
 * @return {[type]}          [description]
 */
WordWrap.prototype.layout = function(iterator, wrapWidth, start, end) {
	var text = this.text;

	var lines = this.lines;

	start = Math.max(0, start||0);
	end = (end===0||end) ? end : text.length;

	iterator.begin();

	//default wrap width...
	wrapWidth = (wrapWidth===0 || wrapWidth) ? wrapWidth : Number.MAX_VALUE;

	//<pre> mode just uses a simple algorithm...
	if (this.mode === WordWrap.Mode.PRE) {
		var lineStart = start;
		for (var i=start; i<end; i++) {
			var chr = text.charAt(i);

			//If we've reached a newline, then step down a line
			//Or if we've reached the EOF
			if ( chr === this.newline || i===end-1) {
				var availableWidth = this.clip ? wrapWidth : undefined;
				iterator.getBounds(text, lineStart, i+1, availableWidth, tmpBounds);
				lines.push( new WordWrap.Line(lineStart, lineStart+tmpBounds.glyphs, tmpBounds.width) );
				lineStart = i+1;
			}
		}
	} 
	//'normal' mode uses LibGDX's word wrapping algorithm:
	//https://github.com/libgdx/libgdx/blob/master/gdx/src/com/badlogic/gdx/graphics/g2d/BitmapFontCache.java
	else {
		//if 'nowrap' is specified, we only wrap on newline chars
		
		var testWidth = wrapWidth;
		if (this.mode === WordWrap.Mode.NOWRAP) {
			testWidth = Number.MAX_VALUE;
		}

		while (start < end) {
			//get next newline position
			var newLine = idxOf(text, this.newline, start, end);

			//eat whitespace at start of line
			while (start < newLine) {
				if (!isWhitespace( text.charAt(start) ))
					break;
				start++;
			}

			//determine visible # of glyphs for the available width
			iterator.getBounds(text, start, newLine, testWidth, tmpBounds)

			var lineEnd = start + tmpBounds.glyphs;
			var nextStart = lineEnd + this.newline.length;

			//if we had to cut the line before the next newline...
			if (lineEnd < newLine) {
				//find char to break on
				while (lineEnd > start) {
					if (isWhitespace(text.charAt(lineEnd)))
						break;
					lineEnd--;
				}
				if (lineEnd === start) {
					if (nextStart > start + this.newline.length) nextStart--;
					lineEnd = nextStart; // If no characters to break, show all.
				} else {
					nextStart = lineEnd;
					//eat whitespace at end of line
					while (lineEnd > start) {
						if (!isWhitespace(text.charAt(lineEnd - this.newline.length)))
							break;
						lineEnd--;
					}
				}
			}

			if (lineEnd > start) {
				//to clip, use the original wrap width (unaltered by mode)
				var availableWidth = this.clip ? wrapWidth : undefined;
				iterator.getBounds(text, start, lineEnd, availableWidth, tmpBounds);
				var lineWidth = tmpBounds.width;

				var rLineEnd = this.clip ? start+tmpBounds.glyphs : lineEnd;
				lines.push( new WordWrap.Line(start, rLineEnd, lineWidth) );
			}
			start = nextStart;

		}
	}

	iterator.end();
};

/**
 * A convenience method to return the maximum width of all current lines.
 * This is useful for aligning blocks of text.
 *
 * @method  getMaxLineWidth
 * @return {Number} the maximum width of all lines
 */
WordWrap.prototype.getMaxLineWidth = function() {
	var maxWidth = 0;
	for (var i=0; i<this.lines.length; i++) {
		var line = this.lines[i];
		maxWidth = Math.max(line.width, maxWidth);
	}
	return maxWidth;
};

/**
 * The Line object holds the start and end indices into the string,
 * and the width as computed by GlyphIterator.
 * 
 * @class  WordWrap.Line
 * @param {Number} start the start index, inclusive
 * @param {Number} end   the end index, exclusive
 * @param {Number} width the computed width of this line
 */
WordWrap.Line = function(start, end, width) {
	this.start = start;
	this.end = end;
	this.width = width;
};

module.exports = WordWrap;
},{}],23:[function(require,module,exports){
module.exports=require(11)
},{}],24:[function(require,module,exports){
var poly2tri = require('poly2tri');
var util = require('point-util');

function asPointSet(points) {
    var contour = [];

    for (var n=0; n<points.length; n++) {
        var x = points[n].x;
        var y = points[n].y;
                
        var np = new poly2tri.Point(x, y);
        
        if (util.indexOfPointInList(np, contour) === -1) {
            if ( (n===0 || n===points.length-1) || !util.isCollinear(points[n-1], points[n], points[n+1]))
                contour.push(np);
        }
    }
    return contour;
}

function insideHole(poly, point) {
    for (var i=0; i<poly.holes.length; i++) {
        var hole = poly.holes[i];
        if (util.pointInPoly(hole, point))
            return true;
    }
    return false;
}

function addSteinerPoints(poly, points, sweep) {
    var bounds = util.getBounds(poly.contour);

    //ensure points are unique and not collinear 
    points = asPointSet(points);

    for (var i=0; i<points.length; i++) {
        var p = points[i];

        //fugly collinear fix ... gotta revisit this
        p.x += 0.5;
        p.y += 0.5;

        if (p.x <= bounds.minX || p.y <= bounds.minY || p.x >= bounds.maxX || p.y >= bounds.maxY)
            continue;

        if (util.pointInPoly(poly.contour, p) && !insideHole(poly, p)) {
            //We are in the polygon! Now make sure we're not in a hole..
            sweep.addPoint(new poly2tri.Point(p.x, p.y));
        }
    }
}

/**
 * Triangulates a list of Shape objects. 
 */
module.exports = function (shapes, steinerPoints) {
    var windingClockwise = false;
    var sweep = null;

    var poly = {holes:[], contour:[]};
    var allTris = [];

    shapes = Array.isArray(shapes) ? shapes : [ shapes ];

    steinerPoints = (steinerPoints && steinerPoints.length !== 0) ? steinerPoints : null;

    for (var j=0; j<shapes.length; j++) {
        var points = shapes[j].points;
        
        var set = asPointSet(points);

        //OpenBaskerville-0.0.75 does some strange things
        //with the moveTo command, causing the decomposition
        //to give us an extra shape with only 1 point. This
        //simply skips a path if it can't make up a triangle..
        if (set.length < 3)
            continue;

        //check the winding order
        if (j==0) {
            windingClockwise = util.isClockwise(set);
        }
        
        //if the sweep has already been created, maybe we're on a hole?
        if (sweep !== null) {
            var clock = util.isClockwise(set);

            //we have a hole...
            if (windingClockwise !== clock) {
                sweep.addHole( set );
                poly.holes.push(set);
            } else {
                //no hole, so it must be a new shape.
                //add our last shape
                if (steinerPoints!==null) {
                    addSteinerPoints(poly, steinerPoints, sweep);
                }

                sweep.triangulate();
                allTris = allTris.concat(sweep.getTriangles());

                //reset the sweep for next shape
                sweep = new poly2tri.SweepContext(set);
                poly = {holes:[], contour:points};
            }
        } else {
            sweep = new poly2tri.SweepContext(set);   
            poly = {holes:[], contour:points};
        }
    }

    //if the sweep is still setup, then triangulate it
    if (sweep !== null) {
        if (steinerPoints!==null) {
            addSteinerPoints(poly, steinerPoints, sweep);
        }

        sweep.triangulate();
        allTris = allTris.concat(sweep.getTriangles());
    }
    return allTris;
};
},{"point-util":25,"poly2tri":31}],25:[function(require,module,exports){
module.exports.isClockwise = function(points) {
    var sum = 0;
    for (var i=0; i<points.length; i++) {
        var o = i===points.length-1 ? points[0] : points[i+1];
        sum += (o.x - points[i].x) * (o.y + points[i].y);
    }
    return sum > 0;
}

module.exports.pointInPoly = function(points, test) {
    //http://stackoverflow.com/a/2922778
    var c = 0,
        nvert = points.length, 
        i=0, j=nvert-1, 
        testx = test.x,
        testy = test.y;

    for ( ; i < nvert; j = i++) {
        if ( ((points[i].y>testy) != (points[j].y>testy)) 
                && (testx < (points[j].x-points[i].x) 
                    * (testy-points[i].y) / (points[j].y-points[i].x) + points[i].x) )
            c = !c;
    }
    return c;
}

module.exports.indexOfPointInList = function(other, list) {
    for (var i=0; i<list.length; i++) {
        var p = list[i];
        if (p.x == other.x && p.y == other.y)
            return i;
    }
    return -1;
}

module.exports.isCollinear = function(a, b, c) {
    var r = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) ;
    var eps = 0.0000001;

    if (Math.abs(r) < eps)
        return true;

    //poly2tri also complains about this:
    if ((a.x===b.x && b.x===c.x) || (a.y===b.y && b.y===c.y))
        return true;

    return false;
}

module.exports.getBounds = function(contour) {
    var minX = Number.MAX_VALUE,
        minY = Number.MAX_VALUE,
        maxX = -Number.MAX_VALUE,
        maxY = -Number.MAX_VALUE;
    for (var i=0; i<contour.length; i++) {
        var v = contour[i];
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
    }
    return {
        minX: minX,
        maxX: maxX,
        minY: minY,
        maxY: maxY
    };
}
},{}],26:[function(require,module,exports){
module.exports={"version": "1.3.5"}
},{}],27:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

/* jshint maxcomplexity:11 */

"use strict";


/*
 * Note
 * ====
 * the structure of this JavaScript version of poly2tri intentionally follows
 * as closely as possible the structure of the reference C++ version, to make it 
 * easier to keep the 2 versions in sync.
 */


// -------------------------------------------------------------------------Node

/**
 * Advancing front node
 * @constructor
 * @private
 * @struct
 * @param {!XY} p - Point
 * @param {Triangle=} t triangle (optional)
 */
var Node = function(p, t) {
    /** @type {XY} */
    this.point = p;

    /** @type {Triangle|null} */
    this.triangle = t || null;

    /** @type {Node|null} */
    this.next = null;
    /** @type {Node|null} */
    this.prev = null;

    /** @type {number} */
    this.value = p.x;
};

// ---------------------------------------------------------------AdvancingFront
/**
 * @constructor
 * @private
 * @struct
 * @param {Node} head
 * @param {Node} tail
 */
var AdvancingFront = function(head, tail) {
    /** @type {Node} */
    this.head_ = head;
    /** @type {Node} */
    this.tail_ = tail;
    /** @type {Node} */
    this.search_node_ = head;
};

/** @return {Node} */
AdvancingFront.prototype.head = function() {
    return this.head_;
};

/** @param {Node} node */
AdvancingFront.prototype.setHead = function(node) {
    this.head_ = node;
};

/** @return {Node} */
AdvancingFront.prototype.tail = function() {
    return this.tail_;
};

/** @param {Node} node */
AdvancingFront.prototype.setTail = function(node) {
    this.tail_ = node;
};

/** @return {Node} */
AdvancingFront.prototype.search = function() {
    return this.search_node_;
};

/** @param {Node} node */
AdvancingFront.prototype.setSearch = function(node) {
    this.search_node_ = node;
};

/** @return {Node} */
AdvancingFront.prototype.findSearchNode = function(/*x*/) {
    // TODO: implement BST index
    return this.search_node_;
};

/**
 * @param {number} x value
 * @return {Node}
 */
AdvancingFront.prototype.locateNode = function(x) {
    var node = this.search_node_;

    /* jshint boss:true */
    if (x < node.value) {
        while (node = node.prev) {
            if (x >= node.value) {
                this.search_node_ = node;
                return node;
            }
        }
    } else {
        while (node = node.next) {
            if (x < node.value) {
                this.search_node_ = node.prev;
                return node.prev;
            }
        }
    }
    return null;
};

/**
 * @param {!XY} point - Point
 * @return {Node}
 */
AdvancingFront.prototype.locatePoint = function(point) {
    var px = point.x;
    var node = this.findSearchNode(px);
    var nx = node.point.x;

    if (px === nx) {
        // Here we are comparing point references, not values
        if (point !== node.point) {
            // We might have two nodes with same x value for a short time
            if (point === node.prev.point) {
                node = node.prev;
            } else if (point === node.next.point) {
                node = node.next;
            } else {
                throw new Error('poly2tri Invalid AdvancingFront.locatePoint() call');
            }
        }
    } else if (px < nx) {
        /* jshint boss:true */
        while (node = node.prev) {
            if (point === node.point) {
                break;
            }
        }
    } else {
        while (node = node.next) {
            if (point === node.point) {
                break;
            }
        }
    }

    if (node) {
        this.search_node_ = node;
    }
    return node;
};


// ----------------------------------------------------------------------Exports

module.exports = AdvancingFront;
module.exports.Node = Node;


},{}],28:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 *
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 *
 * All rights reserved.
 *
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

"use strict";

/*
 * Function added in the JavaScript version (was not present in the c++ version)
 */

/**
 * assert and throw an exception.
 *
 * @private
 * @param {boolean} condition   the condition which is asserted
 * @param {string} message      the message which is display is condition is falsy
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assert Failed");
    }
}
module.exports = assert;



},{}],29:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

"use strict";


/*
 * Note
 * ====
 * the structure of this JavaScript version of poly2tri intentionally follows
 * as closely as possible the structure of the reference C++ version, to make it 
 * easier to keep the 2 versions in sync.
 */

var xy = require('./xy');

// ------------------------------------------------------------------------Point
/**
 * Construct a point
 * @example
 *      var point = new poly2tri.Point(150, 150);
 * @public
 * @constructor
 * @struct
 * @param {number=} x    coordinate (0 if undefined)
 * @param {number=} y    coordinate (0 if undefined)
 */
var Point = function(x, y) {
    /**
     * @type {number}
     * @expose
     */
    this.x = +x || 0;
    /**
     * @type {number}
     * @expose
     */
    this.y = +y || 0;

    // All extra fields added to Point are prefixed with _p2t_
    // to avoid collisions if custom Point class is used.

    /**
     * The edges this point constitutes an upper ending point
     * @private
     * @type {Array.<Edge>}
     */
    this._p2t_edge_list = null;
};

/**
 * For pretty printing
 * @example
 *      "p=" + new poly2tri.Point(5,42)
 *      // → "p=(5;42)"
 * @returns {string} <code>"(x;y)"</code>
 */
Point.prototype.toString = function() {
    return xy.toStringBase(this);
};

/**
 * JSON output, only coordinates
 * @example
 *      JSON.stringify(new poly2tri.Point(1,2))
 *      // → '{"x":1,"y":2}'
 */
Point.prototype.toJSON = function() {
    return { x: this.x, y: this.y };
};

/**
 * Creates a copy of this Point object.
 * @return {Point} new cloned point
 */
Point.prototype.clone = function() {
    return new Point(this.x, this.y);
};

/**
 * Set this Point instance to the origo. <code>(0; 0)</code>
 * @return {Point} this (for chaining)
 */
Point.prototype.set_zero = function() {
    this.x = 0.0;
    this.y = 0.0;
    return this; // for chaining
};

/**
 * Set the coordinates of this instance.
 * @param {number} x   coordinate
 * @param {number} y   coordinate
 * @return {Point} this (for chaining)
 */
Point.prototype.set = function(x, y) {
    this.x = +x || 0;
    this.y = +y || 0;
    return this; // for chaining
};

/**
 * Negate this Point instance. (component-wise)
 * @return {Point} this (for chaining)
 */
Point.prototype.negate = function() {
    this.x = -this.x;
    this.y = -this.y;
    return this; // for chaining
};

/**
 * Add another Point object to this instance. (component-wise)
 * @param {!Point} n - Point object.
 * @return {Point} this (for chaining)
 */
Point.prototype.add = function(n) {
    this.x += n.x;
    this.y += n.y;
    return this; // for chaining
};

/**
 * Subtract this Point instance with another point given. (component-wise)
 * @param {!Point} n - Point object.
 * @return {Point} this (for chaining)
 */
Point.prototype.sub = function(n) {
    this.x -= n.x;
    this.y -= n.y;
    return this; // for chaining
};

/**
 * Multiply this Point instance by a scalar. (component-wise)
 * @param {number} s   scalar.
 * @return {Point} this (for chaining)
 */
Point.prototype.mul = function(s) {
    this.x *= s;
    this.y *= s;
    return this; // for chaining
};

/**
 * Return the distance of this Point instance from the origo.
 * @return {number} distance
 */
Point.prototype.length = function() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
};

/**
 * Normalize this Point instance (as a vector).
 * @return {number} The original distance of this instance from the origo.
 */
Point.prototype.normalize = function() {
    var len = this.length();
    this.x /= len;
    this.y /= len;
    return len;
};

/**
 * Test this Point object with another for equality.
 * @param {!XY} p - any "Point like" object with {x,y}
 * @return {boolean} <code>true</code> if same x and y coordinates, <code>false</code> otherwise.
 */
Point.prototype.equals = function(p) {
    return this.x === p.x && this.y === p.y;
};


// -----------------------------------------------------Point ("static" methods)

/**
 * Negate a point component-wise and return the result as a new Point object.
 * @param {!XY} p - any "Point like" object with {x,y}
 * @return {Point} the resulting Point object.
 */
Point.negate = function(p) {
    return new Point(-p.x, -p.y);
};

/**
 * Add two points component-wise and return the result as a new Point object.
 * @param {!XY} a - any "Point like" object with {x,y}
 * @param {!XY} b - any "Point like" object with {x,y}
 * @return {Point} the resulting Point object.
 */
Point.add = function(a, b) {
    return new Point(a.x + b.x, a.y + b.y);
};

/**
 * Subtract two points component-wise and return the result as a new Point object.
 * @param {!XY} a - any "Point like" object with {x,y}
 * @param {!XY} b - any "Point like" object with {x,y}
 * @return {Point} the resulting Point object.
 */
Point.sub = function(a, b) {
    return new Point(a.x - b.x, a.y - b.y);
};

/**
 * Multiply a point by a scalar and return the result as a new Point object.
 * @param {number} s - the scalar
 * @param {!XY} p - any "Point like" object with {x,y}
 * @return {Point} the resulting Point object.
 */
Point.mul = function(s, p) {
    return new Point(s * p.x, s * p.y);
};

/**
 * Perform the cross product on either two points (this produces a scalar)
 * or a point and a scalar (this produces a point).
 * This function requires two parameters, either may be a Point object or a
 * number.
 * @param  {XY|number} a - Point object or scalar.
 * @param  {XY|number} b - Point object or scalar.
 * @return {Point|number} a Point object or a number, depending on the parameters.
 */
Point.cross = function(a, b) {
    if (typeof(a) === 'number') {
        if (typeof(b) === 'number') {
            return a * b;
        } else {
            return new Point(-a * b.y, a * b.x);
        }
    } else {
        if (typeof(b) === 'number') {
            return new Point(b * a.y, -b * a.x);
        } else {
            return a.x * b.y - a.y * b.x;
        }
    }
};


// -----------------------------------------------------------------"Point-Like"
/*
 * The following functions operate on "Point" or any "Point like" object 
 * with {x,y} (duck typing).
 */

Point.toString = xy.toString;
Point.compare = xy.compare;
Point.cmp = xy.compare; // backward compatibility
Point.equals = xy.equals;

/**
 * Peform the dot product on two vectors.
 * @public
 * @param {!XY} a - any "Point like" object with {x,y}
 * @param {!XY} b - any "Point like" object with {x,y}
 * @return {number} The dot product
 */
Point.dot = function(a, b) {
    return a.x * b.x + a.y * b.y;
};


// ---------------------------------------------------------Exports (public API)

module.exports = Point;

},{"./xy":36}],30:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

"use strict";

/*
 * Class added in the JavaScript version (was not present in the c++ version)
 */

var xy = require('./xy');

/**
 * Custom exception class to indicate invalid Point values
 * @constructor
 * @public
 * @extends Error
 * @struct
 * @param {string=} message - error message
 * @param {Array.<XY>=} points - invalid points
 */
var PointError = function(message, points) {
    this.name = "PointError";
    /**
     * Invalid points
     * @public
     * @type {Array.<XY>}
     */
    this.points = points = points || [];
    /**
     * Error message
     * @public
     * @type {string}
     */
    this.message = message || "Invalid Points!";
    for (var i = 0; i < points.length; i++) {
        this.message += " " + xy.toString(points[i]);
    }
};
PointError.prototype = new Error();
PointError.prototype.constructor = PointError;


module.exports = PointError;

},{"./xy":36}],31:[function(require,module,exports){
(function (global){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * * Neither the name of Poly2Tri nor the names of its contributors may be
 *   used to endorse or promote products derived from this software without specific
 *   prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

/**
 * Public API for poly2tri.js
 * @module poly2tri
 */


/**
 * If you are not using a module system (e.g. CommonJS, RequireJS), you can access this library
 * as a global variable <code>poly2tri</code> i.e. <code>window.poly2tri</code> in a browser.
 * @name poly2tri
 * @global
 * @public
 * @type {module:poly2tri}
 */
var previousPoly2tri = global.poly2tri;
/**
 * For Browser + &lt;script&gt; :
 * reverts the {@linkcode poly2tri} global object to its previous value,
 * and returns a reference to the instance called.
 *
 * @example
 *              var p = poly2tri.noConflict();
 * @public
 * @return {module:poly2tri} instance called
 */
// (this feature is not automatically provided by browserify).
exports.noConflict = function() {
    global.poly2tri = previousPoly2tri;
    return exports;
};

/**
 * poly2tri library version
 * @public
 * @const {string}
 */
exports.VERSION = require('../dist/version.json').version;

/**
 * Exports the {@linkcode PointError} class.
 * @public
 * @typedef {PointError} module:poly2tri.PointError
 * @function
 */
exports.PointError = require('./pointerror');
/**
 * Exports the {@linkcode Point} class.
 * @public
 * @typedef {Point} module:poly2tri.Point
 * @function
 */
exports.Point = require('./point');
/**
 * Exports the {@linkcode Triangle} class.
 * @public
 * @typedef {Triangle} module:poly2tri.Triangle
 * @function
 */
exports.Triangle = require('./triangle');
/**
 * Exports the {@linkcode SweepContext} class.
 * @public
 * @typedef {SweepContext} module:poly2tri.SweepContext
 * @function
 */
exports.SweepContext = require('./sweepcontext');


// Backward compatibility
var sweep = require('./sweep');
/**
 * @function
 * @deprecated use {@linkcode SweepContext#triangulate} instead
 */
exports.triangulate = sweep.triangulate;
/**
 * @deprecated use {@linkcode SweepContext#triangulate} instead
 * @property {function} Triangulate - use {@linkcode SweepContext#triangulate} instead
 */
exports.sweep = {Triangulate: sweep.triangulate};

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../dist/version.json":26,"./point":29,"./pointerror":30,"./sweep":32,"./sweepcontext":33,"./triangle":34}],32:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

/* jshint latedef:nofunc, maxcomplexity:9 */

"use strict";

/**
 * This 'Sweep' module is present in order to keep this JavaScript version
 * as close as possible to the reference C++ version, even though almost all
 * functions could be declared as methods on the {@linkcode module:sweepcontext~SweepContext} object.
 * @module
 * @private
 */

/*
 * Note
 * ====
 * the structure of this JavaScript version of poly2tri intentionally follows
 * as closely as possible the structure of the reference C++ version, to make it 
 * easier to keep the 2 versions in sync.
 */

var assert = require('./assert');
var PointError = require('./pointerror');
var Triangle = require('./triangle');
var Node = require('./advancingfront').Node;


// ------------------------------------------------------------------------utils

var utils = require('./utils');

/** @const */
var EPSILON = utils.EPSILON;

/** @const */
var Orientation = utils.Orientation;
/** @const */
var orient2d = utils.orient2d;
/** @const */
var inScanArea = utils.inScanArea;
/** @const */
var isAngleObtuse = utils.isAngleObtuse;


// ------------------------------------------------------------------------Sweep

/**
 * Triangulate the polygon with holes and Steiner points.
 * Do this AFTER you've added the polyline, holes, and Steiner points
 * @private
 * @param {!SweepContext} tcx - SweepContext object
 */
function triangulate(tcx) {
    tcx.initTriangulation();
    tcx.createAdvancingFront();
    // Sweep points; build mesh
    sweepPoints(tcx);
    // Clean up
    finalizationPolygon(tcx);
}

/**
 * Start sweeping the Y-sorted point set from bottom to top
 * @param {!SweepContext} tcx - SweepContext object
 */
function sweepPoints(tcx) {
    var i, len = tcx.pointCount();
    for (i = 1; i < len; ++i) {
        var point = tcx.getPoint(i);
        var node = pointEvent(tcx, point);
        var edges = point._p2t_edge_list;
        for (var j = 0; edges && j < edges.length; ++j) {
            edgeEventByEdge(tcx, edges[j], node);
        }
    }
}

/**
 * @param {!SweepContext} tcx - SweepContext object
 */
function finalizationPolygon(tcx) {
    // Get an Internal triangle to start with
    var t = tcx.front().head().next.triangle;
    var p = tcx.front().head().next.point;
    while (!t.getConstrainedEdgeCW(p)) {
        t = t.neighborCCW(p);
    }

    // Collect interior triangles constrained by edges
    tcx.meshClean(t);
}

/**
 * Find closes node to the left of the new point and
 * create a new triangle. If needed new holes and basins
 * will be filled to.
 * @param {!SweepContext} tcx - SweepContext object
 * @param {!XY} point   Point
 */
function pointEvent(tcx, point) {
    var node = tcx.locateNode(point);
    var new_node = newFrontTriangle(tcx, point, node);

    // Only need to check +epsilon since point never have smaller
    // x value than node due to how we fetch nodes from the front
    if (point.x <= node.point.x + (EPSILON)) {
        fill(tcx, node);
    }

    //tcx.AddNode(new_node);

    fillAdvancingFront(tcx, new_node);
    return new_node;
}

function edgeEventByEdge(tcx, edge, node) {
    tcx.edge_event.constrained_edge = edge;
    tcx.edge_event.right = (edge.p.x > edge.q.x);

    if (isEdgeSideOfTriangle(node.triangle, edge.p, edge.q)) {
        return;
    }

    // For now we will do all needed filling
    // TODO: integrate with flip process might give some better performance
    //       but for now this avoid the issue with cases that needs both flips and fills
    fillEdgeEvent(tcx, edge, node);
    edgeEventByPoints(tcx, edge.p, edge.q, node.triangle, edge.q);
}

function edgeEventByPoints(tcx, ep, eq, triangle, point) {
    if (isEdgeSideOfTriangle(triangle, ep, eq)) {
        return;
    }

    var p1 = triangle.pointCCW(point);
    var o1 = orient2d(eq, p1, ep);
    if (o1 === Orientation.COLLINEAR) {
        // TODO integrate here changes from C++ version
        // (C++ repo revision 09880a869095 dated March 8, 2011)
        throw new PointError('poly2tri EdgeEvent: Collinear not supported!', [eq, p1, ep]);
    }

    var p2 = triangle.pointCW(point);
    var o2 = orient2d(eq, p2, ep);
    if (o2 === Orientation.COLLINEAR) {
        // TODO integrate here changes from C++ version
        // (C++ repo revision 09880a869095 dated March 8, 2011)
        throw new PointError('poly2tri EdgeEvent: Collinear not supported!', [eq, p2, ep]);
    }

    if (o1 === o2) {
        // Need to decide if we are rotating CW or CCW to get to a triangle
        // that will cross edge
        if (o1 === Orientation.CW) {
            triangle = triangle.neighborCCW(point);
        } else {
            triangle = triangle.neighborCW(point);
        }
        edgeEventByPoints(tcx, ep, eq, triangle, point);
    } else {
        // This triangle crosses constraint so lets flippin start!
        flipEdgeEvent(tcx, ep, eq, triangle, point);
    }
}

function isEdgeSideOfTriangle(triangle, ep, eq) {
    var index = triangle.edgeIndex(ep, eq);
    if (index !== -1) {
        triangle.markConstrainedEdgeByIndex(index);
        var t = triangle.getNeighbor(index);
        if (t) {
            t.markConstrainedEdgeByPoints(ep, eq);
        }
        return true;
    }
    return false;
}

/**
 * Creates a new front triangle and legalize it
 * @param {!SweepContext} tcx - SweepContext object
 */
function newFrontTriangle(tcx, point, node) {
    var triangle = new Triangle(point, node.point, node.next.point);

    triangle.markNeighbor(node.triangle);
    tcx.addToMap(triangle);

    var new_node = new Node(point);
    new_node.next = node.next;
    new_node.prev = node;
    node.next.prev = new_node;
    node.next = new_node;

    if (!legalize(tcx, triangle)) {
        tcx.mapTriangleToNodes(triangle);
    }

    return new_node;
}

/**
 * Adds a triangle to the advancing front to fill a hole.
 * @param {!SweepContext} tcx - SweepContext object
 * @param node - middle node, that is the bottom of the hole
 */
function fill(tcx, node) {
    var triangle = new Triangle(node.prev.point, node.point, node.next.point);

    // TODO: should copy the constrained_edge value from neighbor triangles
    //       for now constrained_edge values are copied during the legalize
    triangle.markNeighbor(node.prev.triangle);
    triangle.markNeighbor(node.triangle);

    tcx.addToMap(triangle);

    // Update the advancing front
    node.prev.next = node.next;
    node.next.prev = node.prev;


    // If it was legalized the triangle has already been mapped
    if (!legalize(tcx, triangle)) {
        tcx.mapTriangleToNodes(triangle);
    }

    //tcx.removeNode(node);
}

/**
 * Fills holes in the Advancing Front
 * @param {!SweepContext} tcx - SweepContext object
 */
function fillAdvancingFront(tcx, n) {
    // Fill right holes
    var node = n.next;
    while (node.next) {
        // TODO integrate here changes from C++ version
        // (C++ repo revision acf81f1f1764 dated April 7, 2012)
        if (isAngleObtuse(node.point, node.next.point, node.prev.point)) {
            break;
        }
        fill(tcx, node);
        node = node.next;
    }

    // Fill left holes
    node = n.prev;
    while (node.prev) {
        // TODO integrate here changes from C++ version
        // (C++ repo revision acf81f1f1764 dated April 7, 2012)
        if (isAngleObtuse(node.point, node.next.point, node.prev.point)) {
            break;
        }
        fill(tcx, node);
        node = node.prev;
    }

    // Fill right basins
    if (n.next && n.next.next) {
        if (isBasinAngleRight(n)) {
            fillBasin(tcx, n);
        }
    }
}

/**
 * The basin angle is decided against the horizontal line [1,0].
 * @param {Node} node
 * @return {boolean} true if angle < 3*π/4
 */
function isBasinAngleRight(node) {
    var ax = node.point.x - node.next.next.point.x;
    var ay = node.point.y - node.next.next.point.y;
    assert(ay >= 0, "unordered y");
    return (ax >= 0 || Math.abs(ax) < ay);
}

/**
 * Returns true if triangle was legalized
 * @param {!SweepContext} tcx - SweepContext object
 * @return {boolean}
 */
function legalize(tcx, t) {
    // To legalize a triangle we start by finding if any of the three edges
    // violate the Delaunay condition
    for (var i = 0; i < 3; ++i) {
        if (t.delaunay_edge[i]) {
            continue;
        }
        var ot = t.getNeighbor(i);
        if (ot) {
            var p = t.getPoint(i);
            var op = ot.oppositePoint(t, p);
            var oi = ot.index(op);

            // If this is a Constrained Edge or a Delaunay Edge(only during recursive legalization)
            // then we should not try to legalize
            if (ot.constrained_edge[oi] || ot.delaunay_edge[oi]) {
                t.constrained_edge[i] = ot.constrained_edge[oi];
                continue;
            }

            var inside = inCircle(p, t.pointCCW(p), t.pointCW(p), op);
            if (inside) {
                // Lets mark this shared edge as Delaunay
                t.delaunay_edge[i] = true;
                ot.delaunay_edge[oi] = true;

                // Lets rotate shared edge one vertex CW to legalize it
                rotateTrianglePair(t, p, ot, op);

                // We now got one valid Delaunay Edge shared by two triangles
                // This gives us 4 new edges to check for Delaunay

                // Make sure that triangle to node mapping is done only one time for a specific triangle
                var not_legalized = !legalize(tcx, t);
                if (not_legalized) {
                    tcx.mapTriangleToNodes(t);
                }

                not_legalized = !legalize(tcx, ot);
                if (not_legalized) {
                    tcx.mapTriangleToNodes(ot);
                }
                // Reset the Delaunay edges, since they only are valid Delaunay edges
                // until we add a new triangle or point.
                // XXX: need to think about this. Can these edges be tried after we
                //      return to previous recursive level?
                t.delaunay_edge[i] = false;
                ot.delaunay_edge[oi] = false;

                // If triangle have been legalized no need to check the other edges since
                // the recursive legalization will handles those so we can end here.
                return true;
            }
        }
    }
    return false;
}

/**
 * <b>Requirement</b>:<br>
 * 1. a,b and c form a triangle.<br>
 * 2. a and d is know to be on opposite side of bc<br>
 * <pre>
 *                a
 *                +
 *               / \
 *              /   \
 *            b/     \c
 *            +-------+
 *           /    d    \
 *          /           \
 * </pre>
 * <b>Fact</b>: d has to be in area B to have a chance to be inside the circle formed by
 *  a,b and c<br>
 *  d is outside B if orient2d(a,b,d) or orient2d(c,a,d) is CW<br>
 *  This preknowledge gives us a way to optimize the incircle test
 * @param pa - triangle point, opposite d
 * @param pb - triangle point
 * @param pc - triangle point
 * @param pd - point opposite a
 * @return {boolean} true if d is inside circle, false if on circle edge
 */
function inCircle(pa, pb, pc, pd) {
    var adx = pa.x - pd.x;
    var ady = pa.y - pd.y;
    var bdx = pb.x - pd.x;
    var bdy = pb.y - pd.y;

    var adxbdy = adx * bdy;
    var bdxady = bdx * ady;
    var oabd = adxbdy - bdxady;
    if (oabd <= 0) {
        return false;
    }

    var cdx = pc.x - pd.x;
    var cdy = pc.y - pd.y;

    var cdxady = cdx * ady;
    var adxcdy = adx * cdy;
    var ocad = cdxady - adxcdy;
    if (ocad <= 0) {
        return false;
    }

    var bdxcdy = bdx * cdy;
    var cdxbdy = cdx * bdy;

    var alift = adx * adx + ady * ady;
    var blift = bdx * bdx + bdy * bdy;
    var clift = cdx * cdx + cdy * cdy;

    var det = alift * (bdxcdy - cdxbdy) + blift * ocad + clift * oabd;
    return det > 0;
}

/**
 * Rotates a triangle pair one vertex CW
 *<pre>
 *       n2                    n2
 *  P +-----+             P +-----+
 *    | t  /|               |\  t |
 *    |   / |               | \   |
 *  n1|  /  |n3           n1|  \  |n3
 *    | /   |    after CW   |   \ |
 *    |/ oT |               | oT \|
 *    +-----+ oP            +-----+
 *       n4                    n4
 * </pre>
 */
function rotateTrianglePair(t, p, ot, op) {
    var n1, n2, n3, n4;
    n1 = t.neighborCCW(p);
    n2 = t.neighborCW(p);
    n3 = ot.neighborCCW(op);
    n4 = ot.neighborCW(op);

    var ce1, ce2, ce3, ce4;
    ce1 = t.getConstrainedEdgeCCW(p);
    ce2 = t.getConstrainedEdgeCW(p);
    ce3 = ot.getConstrainedEdgeCCW(op);
    ce4 = ot.getConstrainedEdgeCW(op);

    var de1, de2, de3, de4;
    de1 = t.getDelaunayEdgeCCW(p);
    de2 = t.getDelaunayEdgeCW(p);
    de3 = ot.getDelaunayEdgeCCW(op);
    de4 = ot.getDelaunayEdgeCW(op);

    t.legalize(p, op);
    ot.legalize(op, p);

    // Remap delaunay_edge
    ot.setDelaunayEdgeCCW(p, de1);
    t.setDelaunayEdgeCW(p, de2);
    t.setDelaunayEdgeCCW(op, de3);
    ot.setDelaunayEdgeCW(op, de4);

    // Remap constrained_edge
    ot.setConstrainedEdgeCCW(p, ce1);
    t.setConstrainedEdgeCW(p, ce2);
    t.setConstrainedEdgeCCW(op, ce3);
    ot.setConstrainedEdgeCW(op, ce4);

    // Remap neighbors
    // XXX: might optimize the markNeighbor by keeping track of
    //      what side should be assigned to what neighbor after the
    //      rotation. Now mark neighbor does lots of testing to find
    //      the right side.
    t.clearNeighbors();
    ot.clearNeighbors();
    if (n1) {
        ot.markNeighbor(n1);
    }
    if (n2) {
        t.markNeighbor(n2);
    }
    if (n3) {
        t.markNeighbor(n3);
    }
    if (n4) {
        ot.markNeighbor(n4);
    }
    t.markNeighbor(ot);
}

/**
 * Fills a basin that has formed on the Advancing Front to the right
 * of given node.<br>
 * First we decide a left,bottom and right node that forms the
 * boundaries of the basin. Then we do a reqursive fill.
 *
 * @param {!SweepContext} tcx - SweepContext object
 * @param node - starting node, this or next node will be left node
 */
function fillBasin(tcx, node) {
    if (orient2d(node.point, node.next.point, node.next.next.point) === Orientation.CCW) {
        tcx.basin.left_node = node.next.next;
    } else {
        tcx.basin.left_node = node.next;
    }

    // Find the bottom and right node
    tcx.basin.bottom_node = tcx.basin.left_node;
    while (tcx.basin.bottom_node.next && tcx.basin.bottom_node.point.y >= tcx.basin.bottom_node.next.point.y) {
        tcx.basin.bottom_node = tcx.basin.bottom_node.next;
    }
    if (tcx.basin.bottom_node === tcx.basin.left_node) {
        // No valid basin
        return;
    }

    tcx.basin.right_node = tcx.basin.bottom_node;
    while (tcx.basin.right_node.next && tcx.basin.right_node.point.y < tcx.basin.right_node.next.point.y) {
        tcx.basin.right_node = tcx.basin.right_node.next;
    }
    if (tcx.basin.right_node === tcx.basin.bottom_node) {
        // No valid basins
        return;
    }

    tcx.basin.width = tcx.basin.right_node.point.x - tcx.basin.left_node.point.x;
    tcx.basin.left_highest = tcx.basin.left_node.point.y > tcx.basin.right_node.point.y;

    fillBasinReq(tcx, tcx.basin.bottom_node);
}

/**
 * Recursive algorithm to fill a Basin with triangles
 *
 * @param {!SweepContext} tcx - SweepContext object
 * @param node - bottom_node
 */
function fillBasinReq(tcx, node) {
    // if shallow stop filling
    if (isShallow(tcx, node)) {
        return;
    }

    fill(tcx, node);

    var o;
    if (node.prev === tcx.basin.left_node && node.next === tcx.basin.right_node) {
        return;
    } else if (node.prev === tcx.basin.left_node) {
        o = orient2d(node.point, node.next.point, node.next.next.point);
        if (o === Orientation.CW) {
            return;
        }
        node = node.next;
    } else if (node.next === tcx.basin.right_node) {
        o = orient2d(node.point, node.prev.point, node.prev.prev.point);
        if (o === Orientation.CCW) {
            return;
        }
        node = node.prev;
    } else {
        // Continue with the neighbor node with lowest Y value
        if (node.prev.point.y < node.next.point.y) {
            node = node.prev;
        } else {
            node = node.next;
        }
    }

    fillBasinReq(tcx, node);
}

function isShallow(tcx, node) {
    var height;
    if (tcx.basin.left_highest) {
        height = tcx.basin.left_node.point.y - node.point.y;
    } else {
        height = tcx.basin.right_node.point.y - node.point.y;
    }

    // if shallow stop filling
    if (tcx.basin.width > height) {
        return true;
    }
    return false;
}

function fillEdgeEvent(tcx, edge, node) {
    if (tcx.edge_event.right) {
        fillRightAboveEdgeEvent(tcx, edge, node);
    } else {
        fillLeftAboveEdgeEvent(tcx, edge, node);
    }
}

function fillRightAboveEdgeEvent(tcx, edge, node) {
    while (node.next.point.x < edge.p.x) {
        // Check if next node is below the edge
        if (orient2d(edge.q, node.next.point, edge.p) === Orientation.CCW) {
            fillRightBelowEdgeEvent(tcx, edge, node);
        } else {
            node = node.next;
        }
    }
}

function fillRightBelowEdgeEvent(tcx, edge, node) {
    if (node.point.x < edge.p.x) {
        if (orient2d(node.point, node.next.point, node.next.next.point) === Orientation.CCW) {
            // Concave
            fillRightConcaveEdgeEvent(tcx, edge, node);
        } else {
            // Convex
            fillRightConvexEdgeEvent(tcx, edge, node);
            // Retry this one
            fillRightBelowEdgeEvent(tcx, edge, node);
        }
    }
}

function fillRightConcaveEdgeEvent(tcx, edge, node) {
    fill(tcx, node.next);
    if (node.next.point !== edge.p) {
        // Next above or below edge?
        if (orient2d(edge.q, node.next.point, edge.p) === Orientation.CCW) {
            // Below
            if (orient2d(node.point, node.next.point, node.next.next.point) === Orientation.CCW) {
                // Next is concave
                fillRightConcaveEdgeEvent(tcx, edge, node);
            } else {
                // Next is convex
                /* jshint noempty:false */
            }
        }
    }
}

function fillRightConvexEdgeEvent(tcx, edge, node) {
    // Next concave or convex?
    if (orient2d(node.next.point, node.next.next.point, node.next.next.next.point) === Orientation.CCW) {
        // Concave
        fillRightConcaveEdgeEvent(tcx, edge, node.next);
    } else {
        // Convex
        // Next above or below edge?
        if (orient2d(edge.q, node.next.next.point, edge.p) === Orientation.CCW) {
            // Below
            fillRightConvexEdgeEvent(tcx, edge, node.next);
        } else {
            // Above
            /* jshint noempty:false */
        }
    }
}

function fillLeftAboveEdgeEvent(tcx, edge, node) {
    while (node.prev.point.x > edge.p.x) {
        // Check if next node is below the edge
        if (orient2d(edge.q, node.prev.point, edge.p) === Orientation.CW) {
            fillLeftBelowEdgeEvent(tcx, edge, node);
        } else {
            node = node.prev;
        }
    }
}

function fillLeftBelowEdgeEvent(tcx, edge, node) {
    if (node.point.x > edge.p.x) {
        if (orient2d(node.point, node.prev.point, node.prev.prev.point) === Orientation.CW) {
            // Concave
            fillLeftConcaveEdgeEvent(tcx, edge, node);
        } else {
            // Convex
            fillLeftConvexEdgeEvent(tcx, edge, node);
            // Retry this one
            fillLeftBelowEdgeEvent(tcx, edge, node);
        }
    }
}

function fillLeftConvexEdgeEvent(tcx, edge, node) {
    // Next concave or convex?
    if (orient2d(node.prev.point, node.prev.prev.point, node.prev.prev.prev.point) === Orientation.CW) {
        // Concave
        fillLeftConcaveEdgeEvent(tcx, edge, node.prev);
    } else {
        // Convex
        // Next above or below edge?
        if (orient2d(edge.q, node.prev.prev.point, edge.p) === Orientation.CW) {
            // Below
            fillLeftConvexEdgeEvent(tcx, edge, node.prev);
        } else {
            // Above
            /* jshint noempty:false */
        }
    }
}

function fillLeftConcaveEdgeEvent(tcx, edge, node) {
    fill(tcx, node.prev);
    if (node.prev.point !== edge.p) {
        // Next above or below edge?
        if (orient2d(edge.q, node.prev.point, edge.p) === Orientation.CW) {
            // Below
            if (orient2d(node.point, node.prev.point, node.prev.prev.point) === Orientation.CW) {
                // Next is concave
                fillLeftConcaveEdgeEvent(tcx, edge, node);
            } else {
                // Next is convex
                /* jshint noempty:false */
            }
        }
    }
}

function flipEdgeEvent(tcx, ep, eq, t, p) {
    var ot = t.neighborAcross(p);
    assert(ot, "FLIP failed due to missing triangle!");

    var op = ot.oppositePoint(t, p);

    // Additional check from Java version (see issue #88)
    if (t.getConstrainedEdgeAcross(p)) {
        var index = t.index(p);
        throw new PointError("poly2tri Intersecting Constraints",
                [p, op, t.getPoint((index + 1) % 3), t.getPoint((index + 2) % 3)]);
    }

    if (inScanArea(p, t.pointCCW(p), t.pointCW(p), op)) {
        // Lets rotate shared edge one vertex CW
        rotateTrianglePair(t, p, ot, op);
        tcx.mapTriangleToNodes(t);
        tcx.mapTriangleToNodes(ot);

        // XXX: in the original C++ code for the next 2 lines, we are
        // comparing point values (and not pointers). In this JavaScript
        // code, we are comparing point references (pointers). This works
        // because we can't have 2 different points with the same values.
        // But to be really equivalent, we should use "Point.equals" here.
        if (p === eq && op === ep) {
            if (eq === tcx.edge_event.constrained_edge.q && ep === tcx.edge_event.constrained_edge.p) {
                t.markConstrainedEdgeByPoints(ep, eq);
                ot.markConstrainedEdgeByPoints(ep, eq);
                legalize(tcx, t);
                legalize(tcx, ot);
            } else {
                // XXX: I think one of the triangles should be legalized here?
                /* jshint noempty:false */
            }
        } else {
            var o = orient2d(eq, op, ep);
            t = nextFlipTriangle(tcx, o, t, ot, p, op);
            flipEdgeEvent(tcx, ep, eq, t, p);
        }
    } else {
        var newP = nextFlipPoint(ep, eq, ot, op);
        flipScanEdgeEvent(tcx, ep, eq, t, ot, newP);
        edgeEventByPoints(tcx, ep, eq, t, p);
    }
}

/**
 * After a flip we have two triangles and know that only one will still be
 * intersecting the edge. So decide which to contiune with and legalize the other
 *
 * @param {!SweepContext} tcx - SweepContext object
 * @param o - should be the result of an orient2d( eq, op, ep )
 * @param t - triangle 1
 * @param ot - triangle 2
 * @param p - a point shared by both triangles
 * @param op - another point shared by both triangles
 * @return returns the triangle still intersecting the edge
 */
function nextFlipTriangle(tcx, o, t, ot, p, op) {
    var edge_index;
    if (o === Orientation.CCW) {
        // ot is not crossing edge after flip
        edge_index = ot.edgeIndex(p, op);
        ot.delaunay_edge[edge_index] = true;
        legalize(tcx, ot);
        ot.clearDelaunayEdges();
        return t;
    }

    // t is not crossing edge after flip
    edge_index = t.edgeIndex(p, op);

    t.delaunay_edge[edge_index] = true;
    legalize(tcx, t);
    t.clearDelaunayEdges();
    return ot;
}

/**
 * When we need to traverse from one triangle to the next we need
 * the point in current triangle that is the opposite point to the next
 * triangle.
 */
function nextFlipPoint(ep, eq, ot, op) {
    var o2d = orient2d(eq, op, ep);
    if (o2d === Orientation.CW) {
        // Right
        return ot.pointCCW(op);
    } else if (o2d === Orientation.CCW) {
        // Left
        return ot.pointCW(op);
    } else {
        throw new PointError("poly2tri [Unsupported] nextFlipPoint: opposing point on constrained edge!", [eq, op, ep]);
    }
}

/**
 * Scan part of the FlipScan algorithm<br>
 * When a triangle pair isn't flippable we will scan for the next
 * point that is inside the flip triangle scan area. When found
 * we generate a new flipEdgeEvent
 *
 * @param {!SweepContext} tcx - SweepContext object
 * @param ep - last point on the edge we are traversing
 * @param eq - first point on the edge we are traversing
 * @param {!Triangle} flip_triangle - the current triangle sharing the point eq with edge
 * @param t
 * @param p
 */
function flipScanEdgeEvent(tcx, ep, eq, flip_triangle, t, p) {
    var ot = t.neighborAcross(p);
    assert(ot, "FLIP failed due to missing triangle");

    var op = ot.oppositePoint(t, p);

    if (inScanArea(eq, flip_triangle.pointCCW(eq), flip_triangle.pointCW(eq), op)) {
        // flip with new edge op.eq
        flipEdgeEvent(tcx, eq, op, ot, op);
    } else {
        var newP = nextFlipPoint(ep, eq, ot, op);
        flipScanEdgeEvent(tcx, ep, eq, flip_triangle, ot, newP);
    }
}


// ----------------------------------------------------------------------Exports

exports.triangulate = triangulate;

},{"./advancingfront":27,"./assert":28,"./pointerror":30,"./triangle":34,"./utils":35}],33:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

/* jshint maxcomplexity:6 */

"use strict";


/*
 * Note
 * ====
 * the structure of this JavaScript version of poly2tri intentionally follows
 * as closely as possible the structure of the reference C++ version, to make it 
 * easier to keep the 2 versions in sync.
 */

var PointError = require('./pointerror');
var Point = require('./point');
var Triangle = require('./triangle');
var sweep = require('./sweep');
var AdvancingFront = require('./advancingfront');
var Node = AdvancingFront.Node;


// ------------------------------------------------------------------------utils

/**
 * Initial triangle factor, seed triangle will extend 30% of
 * PointSet width to both left and right.
 * @private
 * @const
 */
var kAlpha = 0.3;


// -------------------------------------------------------------------------Edge
/**
 * Represents a simple polygon's edge
 * @constructor
 * @struct
 * @private
 * @param {Point} p1
 * @param {Point} p2
 * @throw {PointError} if p1 is same as p2
 */
var Edge = function(p1, p2) {
    this.p = p1;
    this.q = p2;

    if (p1.y > p2.y) {
        this.q = p1;
        this.p = p2;
    } else if (p1.y === p2.y) {
        if (p1.x > p2.x) {
            this.q = p1;
            this.p = p2;
        } else if (p1.x === p2.x) {
            throw new PointError('poly2tri Invalid Edge constructor: repeated points!', [p1]);
        }
    }

    if (!this.q._p2t_edge_list) {
        this.q._p2t_edge_list = [];
    }
    this.q._p2t_edge_list.push(this);
};


// ------------------------------------------------------------------------Basin
/**
 * @constructor
 * @struct
 * @private
 */
var Basin = function() {
    /** @type {Node} */
    this.left_node = null;
    /** @type {Node} */
    this.bottom_node = null;
    /** @type {Node} */
    this.right_node = null;
    /** @type {number} */
    this.width = 0.0;
    /** @type {boolean} */
    this.left_highest = false;
};

Basin.prototype.clear = function() {
    this.left_node = null;
    this.bottom_node = null;
    this.right_node = null;
    this.width = 0.0;
    this.left_highest = false;
};

// --------------------------------------------------------------------EdgeEvent
/**
 * @constructor
 * @struct
 * @private
 */
var EdgeEvent = function() {
    /** @type {Edge} */
    this.constrained_edge = null;
    /** @type {boolean} */
    this.right = false;
};

// ----------------------------------------------------SweepContext (public API)
/**
 * SweepContext constructor option
 * @typedef {Object} SweepContextOptions
 * @property {boolean=} cloneArrays - if <code>true</code>, do a shallow copy of the Array parameters
 *                  (contour, holes). Points inside arrays are never copied.
 *                  Default is <code>false</code> : keep a reference to the array arguments,
 *                  who will be modified in place.
 */
/**
 * Constructor for the triangulation context.
 * It accepts a simple polyline (with non repeating points), 
 * which defines the constrained edges.
 *
 * @example
 *          var contour = [
 *              new poly2tri.Point(100, 100),
 *              new poly2tri.Point(100, 300),
 *              new poly2tri.Point(300, 300),
 *              new poly2tri.Point(300, 100)
 *          ];
 *          var swctx = new poly2tri.SweepContext(contour, {cloneArrays: true});
 * @example
 *          var contour = [{x:100, y:100}, {x:100, y:300}, {x:300, y:300}, {x:300, y:100}];
 *          var swctx = new poly2tri.SweepContext(contour, {cloneArrays: true});
 * @constructor
 * @public
 * @struct
 * @param {Array.<XY>} contour - array of point objects. The points can be either {@linkcode Point} instances,
 *          or any "Point like" custom class with <code>{x, y}</code> attributes.
 * @param {SweepContextOptions=} options - constructor options
 */
var SweepContext = function(contour, options) {
    options = options || {};
    this.triangles_ = [];
    this.map_ = [];
    this.points_ = (options.cloneArrays ? contour.slice(0) : contour);
    this.edge_list = [];

    // Bounding box of all points. Computed at the start of the triangulation, 
    // it is stored in case it is needed by the caller.
    this.pmin_ = this.pmax_ = null;

    /**
     * Advancing front
     * @private
     * @type {AdvancingFront}
     */
    this.front_ = null;

    /**
     * head point used with advancing front
     * @private
     * @type {Point}
     */
    this.head_ = null;

    /**
     * tail point used with advancing front
     * @private
     * @type {Point}
     */
    this.tail_ = null;

    /**
     * @private
     * @type {Node}
     */
    this.af_head_ = null;
    /**
     * @private
     * @type {Node}
     */
    this.af_middle_ = null;
    /**
     * @private
     * @type {Node}
     */
    this.af_tail_ = null;

    this.basin = new Basin();
    this.edge_event = new EdgeEvent();

    this.initEdges(this.points_);
};


/**
 * Add a hole to the constraints
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      var hole = [
 *          new poly2tri.Point(200, 200),
 *          new poly2tri.Point(200, 250),
 *          new poly2tri.Point(250, 250)
 *      ];
 *      swctx.addHole(hole);
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.addHole([{x:200, y:200}, {x:200, y:250}, {x:250, y:250}]);
 * @public
 * @param {Array.<XY>} polyline - array of "Point like" objects with {x,y}
 */
SweepContext.prototype.addHole = function(polyline) {
    this.initEdges(polyline);
    var i, len = polyline.length;
    for (i = 0; i < len; i++) {
        this.points_.push(polyline[i]);
    }
    return this; // for chaining
};

/**
 * For backward compatibility
 * @function
 * @deprecated use {@linkcode SweepContext#addHole} instead
 */
SweepContext.prototype.AddHole = SweepContext.prototype.addHole;


/**
 * Add several holes to the constraints
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      var holes = [
 *          [ new poly2tri.Point(200, 200), new poly2tri.Point(200, 250), new poly2tri.Point(250, 250) ],
 *          [ new poly2tri.Point(300, 300), new poly2tri.Point(300, 350), new poly2tri.Point(350, 350) ]
 *      ];
 *      swctx.addHoles(holes);
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      var holes = [
 *          [{x:200, y:200}, {x:200, y:250}, {x:250, y:250}],
 *          [{x:300, y:300}, {x:300, y:350}, {x:350, y:350}]
 *      ];
 *      swctx.addHoles(holes);
 * @public
 * @param {Array.<Array.<XY>>} holes - array of array of "Point like" objects with {x,y}
 */
// Method added in the JavaScript version (was not present in the c++ version)
SweepContext.prototype.addHoles = function(holes) {
    var i, len = holes.length;
    for (i = 0; i < len; i++) {
        this.initEdges(holes[i]);
    }
    this.points_ = this.points_.concat.apply(this.points_, holes);
    return this; // for chaining
};


/**
 * Add a Steiner point to the constraints
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      var point = new poly2tri.Point(150, 150);
 *      swctx.addPoint(point);
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.addPoint({x:150, y:150});
 * @public
 * @param {XY} point - any "Point like" object with {x,y}
 */
SweepContext.prototype.addPoint = function(point) {
    this.points_.push(point);
    return this; // for chaining
};

/**
 * For backward compatibility
 * @function
 * @deprecated use {@linkcode SweepContext#addPoint} instead
 */
SweepContext.prototype.AddPoint = SweepContext.prototype.addPoint;


/**
 * Add several Steiner points to the constraints
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      var points = [
 *          new poly2tri.Point(150, 150),
 *          new poly2tri.Point(200, 250),
 *          new poly2tri.Point(250, 250)
 *      ];
 *      swctx.addPoints(points);
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.addPoints([{x:150, y:150}, {x:200, y:250}, {x:250, y:250}]);
 * @public
 * @param {Array.<XY>} points - array of "Point like" object with {x,y}
 */
// Method added in the JavaScript version (was not present in the c++ version)
SweepContext.prototype.addPoints = function(points) {
    this.points_ = this.points_.concat(points);
    return this; // for chaining
};


/**
 * Triangulate the polygon with holes and Steiner points.
 * Do this AFTER you've added the polyline, holes, and Steiner points
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.triangulate();
 *      var triangles = swctx.getTriangles();
 * @public
 */
// Shortcut method for sweep.triangulate(SweepContext).
// Method added in the JavaScript version (was not present in the c++ version)
SweepContext.prototype.triangulate = function() {
    sweep.triangulate(this);
    return this; // for chaining
};


/**
 * Get the bounding box of the provided constraints (contour, holes and 
 * Steinter points). Warning : these values are not available if the triangulation 
 * has not been done yet.
 * @public
 * @returns {{min:Point,max:Point}} object with 'min' and 'max' Point
 */
// Method added in the JavaScript version (was not present in the c++ version)
SweepContext.prototype.getBoundingBox = function() {
    return {min: this.pmin_, max: this.pmax_};
};

/**
 * Get result of triangulation.
 * The output triangles have vertices which are references
 * to the initial input points (not copies): any custom fields in the
 * initial points can be retrieved in the output triangles.
 * @example
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.triangulate();
 *      var triangles = swctx.getTriangles();
 * @example
 *      var contour = [{x:100, y:100, id:1}, {x:100, y:300, id:2}, {x:300, y:300, id:3}];
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.triangulate();
 *      var triangles = swctx.getTriangles();
 *      typeof triangles[0].getPoint(0).id
 *      // → "number"
 * @public
 * @returns {array<Triangle>}   array of triangles
 */
SweepContext.prototype.getTriangles = function() {
    return this.triangles_;
};

/**
 * For backward compatibility
 * @function
 * @deprecated use {@linkcode SweepContext#getTriangles} instead
 */
SweepContext.prototype.GetTriangles = SweepContext.prototype.getTriangles;


// ---------------------------------------------------SweepContext (private API)

/** @private */
SweepContext.prototype.front = function() {
    return this.front_;
};

/** @private */
SweepContext.prototype.pointCount = function() {
    return this.points_.length;
};

/** @private */
SweepContext.prototype.head = function() {
    return this.head_;
};

/** @private */
SweepContext.prototype.setHead = function(p1) {
    this.head_ = p1;
};

/** @private */
SweepContext.prototype.tail = function() {
    return this.tail_;
};

/** @private */
SweepContext.prototype.setTail = function(p1) {
    this.tail_ = p1;
};

/** @private */
SweepContext.prototype.getMap = function() {
    return this.map_;
};

/** @private */
SweepContext.prototype.initTriangulation = function() {
    var xmax = this.points_[0].x;
    var xmin = this.points_[0].x;
    var ymax = this.points_[0].y;
    var ymin = this.points_[0].y;

    // Calculate bounds
    var i, len = this.points_.length;
    for (i = 1; i < len; i++) {
        var p = this.points_[i];
        /* jshint expr:true */
        (p.x > xmax) && (xmax = p.x);
        (p.x < xmin) && (xmin = p.x);
        (p.y > ymax) && (ymax = p.y);
        (p.y < ymin) && (ymin = p.y);
    }
    this.pmin_ = new Point(xmin, ymin);
    this.pmax_ = new Point(xmax, ymax);

    var dx = kAlpha * (xmax - xmin);
    var dy = kAlpha * (ymax - ymin);
    this.head_ = new Point(xmax + dx, ymin - dy);
    this.tail_ = new Point(xmin - dx, ymin - dy);

    // Sort points along y-axis
    this.points_.sort(Point.compare);
};

/** @private */
SweepContext.prototype.initEdges = function(polyline) {
    var i, len = polyline.length;
    for (i = 0; i < len; ++i) {
        this.edge_list.push(new Edge(polyline[i], polyline[(i + 1) % len]));
    }
};

/** @private */
SweepContext.prototype.getPoint = function(index) {
    return this.points_[index];
};

/** @private */
SweepContext.prototype.addToMap = function(triangle) {
    this.map_.push(triangle);
};

/** @private */
SweepContext.prototype.locateNode = function(point) {
    return this.front_.locateNode(point.x);
};

/** @private */
SweepContext.prototype.createAdvancingFront = function() {
    var head;
    var middle;
    var tail;
    // Initial triangle
    var triangle = new Triangle(this.points_[0], this.tail_, this.head_);

    this.map_.push(triangle);

    head = new Node(triangle.getPoint(1), triangle);
    middle = new Node(triangle.getPoint(0), triangle);
    tail = new Node(triangle.getPoint(2));

    this.front_ = new AdvancingFront(head, tail);

    head.next = middle;
    middle.next = tail;
    middle.prev = head;
    tail.prev = middle;
};

/** @private */
SweepContext.prototype.removeNode = function(node) {
    // do nothing
    /* jshint unused:false */
};

/** @private */
SweepContext.prototype.mapTriangleToNodes = function(t) {
    for (var i = 0; i < 3; ++i) {
        if (!t.getNeighbor(i)) {
            var n = this.front_.locatePoint(t.pointCW(t.getPoint(i)));
            if (n) {
                n.triangle = t;
            }
        }
    }
};

/** @private */
SweepContext.prototype.removeFromMap = function(triangle) {
    var i, map = this.map_, len = map.length;
    for (i = 0; i < len; i++) {
        if (map[i] === triangle) {
            map.splice(i, 1);
            break;
        }
    }
};

/**
 * Do a depth first traversal to collect triangles
 * @private
 * @param {Triangle} triangle start
 */
SweepContext.prototype.meshClean = function(triangle) {
    // New implementation avoids recursive calls and use a loop instead.
    // Cf. issues # 57, 65 and 69.
    var triangles = [triangle], t, i;
    /* jshint boss:true */
    while (t = triangles.pop()) {
        if (!t.isInterior()) {
            t.setInterior(true);
            this.triangles_.push(t);
            for (i = 0; i < 3; i++) {
                if (!t.constrained_edge[i]) {
                    triangles.push(t.getNeighbor(i));
                }
            }
        }
    }
};

// ----------------------------------------------------------------------Exports

module.exports = SweepContext;

},{"./advancingfront":27,"./point":29,"./pointerror":30,"./sweep":32,"./triangle":34}],34:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 *
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

/* jshint maxcomplexity:10 */

"use strict";


/*
 * Note
 * ====
 * the structure of this JavaScript version of poly2tri intentionally follows
 * as closely as possible the structure of the reference C++ version, to make it 
 * easier to keep the 2 versions in sync.
 */

var xy = require("./xy");


// ---------------------------------------------------------------------Triangle
/**
 * Triangle class.<br>
 * Triangle-based data structures are known to have better performance than
 * quad-edge structures.
 * See: J. Shewchuk, "Triangle: Engineering a 2D Quality Mesh Generator and
 * Delaunay Triangulator", "Triangulations in CGAL"
 *
 * @constructor
 * @struct
 * @param {!XY} pa  point object with {x,y}
 * @param {!XY} pb  point object with {x,y}
 * @param {!XY} pc  point object with {x,y}
 */
var Triangle = function(a, b, c) {
    /**
     * Triangle points
     * @private
     * @type {Array.<XY>}
     */
    this.points_ = [a, b, c];

    /**
     * Neighbor list
     * @private
     * @type {Array.<Triangle>}
     */
    this.neighbors_ = [null, null, null];

    /**
     * Has this triangle been marked as an interior triangle?
     * @private
     * @type {boolean}
     */
    this.interior_ = false;

    /**
     * Flags to determine if an edge is a Constrained edge
     * @private
     * @type {Array.<boolean>}
     */
    this.constrained_edge = [false, false, false];

    /**
     * Flags to determine if an edge is a Delauney edge
     * @private
     * @type {Array.<boolean>}
     */
    this.delaunay_edge = [false, false, false];
};

var p2s = xy.toString;
/**
 * For pretty printing ex. <code>"[(5;42)(10;20)(21;30)]"</code>.
 * @public
 * @return {string}
 */
Triangle.prototype.toString = function() {
    return ("[" + p2s(this.points_[0]) + p2s(this.points_[1]) + p2s(this.points_[2]) + "]");
};

/**
 * Get one vertice of the triangle.
 * The output triangles of a triangulation have vertices which are references
 * to the initial input points (not copies): any custom fields in the
 * initial points can be retrieved in the output triangles.
 * @example
 *      var contour = [{x:100, y:100, id:1}, {x:100, y:300, id:2}, {x:300, y:300, id:3}];
 *      var swctx = new poly2tri.SweepContext(contour);
 *      swctx.triangulate();
 *      var triangles = swctx.getTriangles();
 *      typeof triangles[0].getPoint(0).id
 *      // → "number"
 * @param {number} index - vertice index: 0, 1 or 2
 * @public
 * @returns {XY}
 */
Triangle.prototype.getPoint = function(index) {
    return this.points_[index];
};

/**
 * For backward compatibility
 * @function
 * @deprecated use {@linkcode Triangle#getPoint} instead
 */
Triangle.prototype.GetPoint = Triangle.prototype.getPoint;

/**
 * Get all 3 vertices of the triangle as an array
 * @public
 * @return {Array.<XY>}
 */
// Method added in the JavaScript version (was not present in the c++ version)
Triangle.prototype.getPoints = function() {
    return this.points_;
};

/**
 * @private
 * @param {number} index
 * @returns {?Triangle}
 */
Triangle.prototype.getNeighbor = function(index) {
    return this.neighbors_[index];
};

/**
 * Test if this Triangle contains the Point object given as parameter as one of its vertices.
 * Only point references are compared, not values.
 * @public
 * @param {XY} point - point object with {x,y}
 * @return {boolean} <code>True</code> if the Point object is of the Triangle's vertices,
 *         <code>false</code> otherwise.
 */
Triangle.prototype.containsPoint = function(point) {
    var points = this.points_;
    // Here we are comparing point references, not values
    return (point === points[0] || point === points[1] || point === points[2]);
};

/**
 * Test if this Triangle contains the Edge object given as parameter as its
 * bounding edges. Only point references are compared, not values.
 * @private
 * @param {Edge} edge
 * @return {boolean} <code>True</code> if the Edge object is of the Triangle's bounding
 *         edges, <code>false</code> otherwise.
 */
Triangle.prototype.containsEdge = function(edge) {
    return this.containsPoint(edge.p) && this.containsPoint(edge.q);
};

/**
 * Test if this Triangle contains the two Point objects given as parameters among its vertices.
 * Only point references are compared, not values.
 * @param {XY} p1 - point object with {x,y}
 * @param {XY} p2 - point object with {x,y}
 * @return {boolean}
 */
Triangle.prototype.containsPoints = function(p1, p2) {
    return this.containsPoint(p1) && this.containsPoint(p2);
};

/**
 * Has this triangle been marked as an interior triangle?
 * @returns {boolean}
 */
Triangle.prototype.isInterior = function() {
    return this.interior_;
};

/**
 * Mark this triangle as an interior triangle
 * @private
 * @param {boolean} interior
 * @returns {Triangle} this
 */
Triangle.prototype.setInterior = function(interior) {
    this.interior_ = interior;
    return this;
};

/**
 * Update neighbor pointers.
 * @private
 * @param {XY} p1 - point object with {x,y}
 * @param {XY} p2 - point object with {x,y}
 * @param {Triangle} t Triangle object.
 * @throws {Error} if can't find objects
 */
Triangle.prototype.markNeighborPointers = function(p1, p2, t) {
    var points = this.points_;
    // Here we are comparing point references, not values
    if ((p1 === points[2] && p2 === points[1]) || (p1 === points[1] && p2 === points[2])) {
        this.neighbors_[0] = t;
    } else if ((p1 === points[0] && p2 === points[2]) || (p1 === points[2] && p2 === points[0])) {
        this.neighbors_[1] = t;
    } else if ((p1 === points[0] && p2 === points[1]) || (p1 === points[1] && p2 === points[0])) {
        this.neighbors_[2] = t;
    } else {
        throw new Error('poly2tri Invalid Triangle.markNeighborPointers() call');
    }
};

/**
 * Exhaustive search to update neighbor pointers
 * @private
 * @param {!Triangle} t
 */
Triangle.prototype.markNeighbor = function(t) {
    var points = this.points_;
    if (t.containsPoints(points[1], points[2])) {
        this.neighbors_[0] = t;
        t.markNeighborPointers(points[1], points[2], this);
    } else if (t.containsPoints(points[0], points[2])) {
        this.neighbors_[1] = t;
        t.markNeighborPointers(points[0], points[2], this);
    } else if (t.containsPoints(points[0], points[1])) {
        this.neighbors_[2] = t;
        t.markNeighborPointers(points[0], points[1], this);
    }
};


Triangle.prototype.clearNeighbors = function() {
    this.neighbors_[0] = null;
    this.neighbors_[1] = null;
    this.neighbors_[2] = null;
};

Triangle.prototype.clearDelaunayEdges = function() {
    this.delaunay_edge[0] = false;
    this.delaunay_edge[1] = false;
    this.delaunay_edge[2] = false;
};

/**
 * Returns the point clockwise to the given point.
 * @private
 * @param {XY} p - point object with {x,y}
 */
Triangle.prototype.pointCW = function(p) {
    var points = this.points_;
    // Here we are comparing point references, not values
    if (p === points[0]) {
        return points[2];
    } else if (p === points[1]) {
        return points[0];
    } else if (p === points[2]) {
        return points[1];
    } else {
        return null;
    }
};

/**
 * Returns the point counter-clockwise to the given point.
 * @private
 * @param {XY} p - point object with {x,y}
 */
Triangle.prototype.pointCCW = function(p) {
    var points = this.points_;
    // Here we are comparing point references, not values
    if (p === points[0]) {
        return points[1];
    } else if (p === points[1]) {
        return points[2];
    } else if (p === points[2]) {
        return points[0];
    } else {
        return null;
    }
};

/**
 * Returns the neighbor clockwise to given point.
 * @private
 * @param {XY} p - point object with {x,y}
 */
Triangle.prototype.neighborCW = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.neighbors_[1];
    } else if (p === this.points_[1]) {
        return this.neighbors_[2];
    } else {
        return this.neighbors_[0];
    }
};

/**
 * Returns the neighbor counter-clockwise to given point.
 * @private
 * @param {XY} p - point object with {x,y}
 */
Triangle.prototype.neighborCCW = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.neighbors_[2];
    } else if (p === this.points_[1]) {
        return this.neighbors_[0];
    } else {
        return this.neighbors_[1];
    }
};

Triangle.prototype.getConstrainedEdgeCW = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.constrained_edge[1];
    } else if (p === this.points_[1]) {
        return this.constrained_edge[2];
    } else {
        return this.constrained_edge[0];
    }
};

Triangle.prototype.getConstrainedEdgeCCW = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.constrained_edge[2];
    } else if (p === this.points_[1]) {
        return this.constrained_edge[0];
    } else {
        return this.constrained_edge[1];
    }
};

// Additional check from Java version (see issue #88)
Triangle.prototype.getConstrainedEdgeAcross = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.constrained_edge[0];
    } else if (p === this.points_[1]) {
        return this.constrained_edge[1];
    } else {
        return this.constrained_edge[2];
    }
};

Triangle.prototype.setConstrainedEdgeCW = function(p, ce) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        this.constrained_edge[1] = ce;
    } else if (p === this.points_[1]) {
        this.constrained_edge[2] = ce;
    } else {
        this.constrained_edge[0] = ce;
    }
};

Triangle.prototype.setConstrainedEdgeCCW = function(p, ce) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        this.constrained_edge[2] = ce;
    } else if (p === this.points_[1]) {
        this.constrained_edge[0] = ce;
    } else {
        this.constrained_edge[1] = ce;
    }
};

Triangle.prototype.getDelaunayEdgeCW = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.delaunay_edge[1];
    } else if (p === this.points_[1]) {
        return this.delaunay_edge[2];
    } else {
        return this.delaunay_edge[0];
    }
};

Triangle.prototype.getDelaunayEdgeCCW = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.delaunay_edge[2];
    } else if (p === this.points_[1]) {
        return this.delaunay_edge[0];
    } else {
        return this.delaunay_edge[1];
    }
};

Triangle.prototype.setDelaunayEdgeCW = function(p, e) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        this.delaunay_edge[1] = e;
    } else if (p === this.points_[1]) {
        this.delaunay_edge[2] = e;
    } else {
        this.delaunay_edge[0] = e;
    }
};

Triangle.prototype.setDelaunayEdgeCCW = function(p, e) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        this.delaunay_edge[2] = e;
    } else if (p === this.points_[1]) {
        this.delaunay_edge[0] = e;
    } else {
        this.delaunay_edge[1] = e;
    }
};

/**
 * The neighbor across to given point.
 * @private
 * @param {XY} p - point object with {x,y}
 * @returns {Triangle}
 */
Triangle.prototype.neighborAcross = function(p) {
    // Here we are comparing point references, not values
    if (p === this.points_[0]) {
        return this.neighbors_[0];
    } else if (p === this.points_[1]) {
        return this.neighbors_[1];
    } else {
        return this.neighbors_[2];
    }
};

/**
 * @private
 * @param {!Triangle} t Triangle object.
 * @param {XY} p - point object with {x,y}
 */
Triangle.prototype.oppositePoint = function(t, p) {
    var cw = t.pointCW(p);
    return this.pointCW(cw);
};

/**
 * Legalize triangle by rotating clockwise around oPoint
 * @private
 * @param {XY} opoint - point object with {x,y}
 * @param {XY} npoint - point object with {x,y}
 * @throws {Error} if oPoint can not be found
 */
Triangle.prototype.legalize = function(opoint, npoint) {
    var points = this.points_;
    // Here we are comparing point references, not values
    if (opoint === points[0]) {
        points[1] = points[0];
        points[0] = points[2];
        points[2] = npoint;
    } else if (opoint === points[1]) {
        points[2] = points[1];
        points[1] = points[0];
        points[0] = npoint;
    } else if (opoint === points[2]) {
        points[0] = points[2];
        points[2] = points[1];
        points[1] = npoint;
    } else {
        throw new Error('poly2tri Invalid Triangle.legalize() call');
    }
};

/**
 * Returns the index of a point in the triangle. 
 * The point *must* be a reference to one of the triangle's vertices.
 * @private
 * @param {XY} p - point object with {x,y}
 * @returns {number} index 0, 1 or 2
 * @throws {Error} if p can not be found
 */
Triangle.prototype.index = function(p) {
    var points = this.points_;
    // Here we are comparing point references, not values
    if (p === points[0]) {
        return 0;
    } else if (p === points[1]) {
        return 1;
    } else if (p === points[2]) {
        return 2;
    } else {
        throw new Error('poly2tri Invalid Triangle.index() call');
    }
};

/**
 * @private
 * @param {XY} p1 - point object with {x,y}
 * @param {XY} p2 - point object with {x,y}
 * @return {number} index 0, 1 or 2, or -1 if errror
 */
Triangle.prototype.edgeIndex = function(p1, p2) {
    var points = this.points_;
    // Here we are comparing point references, not values
    if (p1 === points[0]) {
        if (p2 === points[1]) {
            return 2;
        } else if (p2 === points[2]) {
            return 1;
        }
    } else if (p1 === points[1]) {
        if (p2 === points[2]) {
            return 0;
        } else if (p2 === points[0]) {
            return 2;
        }
    } else if (p1 === points[2]) {
        if (p2 === points[0]) {
            return 1;
        } else if (p2 === points[1]) {
            return 0;
        }
    }
    return -1;
};

/**
 * Mark an edge of this triangle as constrained.
 * @private
 * @param {number} index - edge index
 */
Triangle.prototype.markConstrainedEdgeByIndex = function(index) {
    this.constrained_edge[index] = true;
};
/**
 * Mark an edge of this triangle as constrained.
 * @private
 * @param {Edge} edge instance
 */
Triangle.prototype.markConstrainedEdgeByEdge = function(edge) {
    this.markConstrainedEdgeByPoints(edge.p, edge.q);
};
/**
 * Mark an edge of this triangle as constrained.
 * This method takes two Point instances defining the edge of the triangle.
 * @private
 * @param {XY} p - point object with {x,y}
 * @param {XY} q - point object with {x,y}
 */
Triangle.prototype.markConstrainedEdgeByPoints = function(p, q) {
    var points = this.points_;
    // Here we are comparing point references, not values        
    if ((q === points[0] && p === points[1]) || (q === points[1] && p === points[0])) {
        this.constrained_edge[2] = true;
    } else if ((q === points[0] && p === points[2]) || (q === points[2] && p === points[0])) {
        this.constrained_edge[1] = true;
    } else if ((q === points[1] && p === points[2]) || (q === points[2] && p === points[1])) {
        this.constrained_edge[0] = true;
    }
};


// ---------------------------------------------------------Exports (public API)

module.exports = Triangle;

},{"./xy":36}],35:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

"use strict";

/**
 * Precision to detect repeated or collinear points
 * @private
 * @const {number}
 * @default
 */
var EPSILON = 1e-12;
exports.EPSILON = EPSILON;

/**
 * @private
 * @enum {number}
 * @readonly
 */
var Orientation = {
    "CW": 1,
    "CCW": -1,
    "COLLINEAR": 0
};
exports.Orientation = Orientation;


/**
 * Formula to calculate signed area<br>
 * Positive if CCW<br>
 * Negative if CW<br>
 * 0 if collinear<br>
 * <pre>
 * A[P1,P2,P3]  =  (x1*y2 - y1*x2) + (x2*y3 - y2*x3) + (x3*y1 - y3*x1)
 *              =  (x1-x3)*(y2-y3) - (y1-y3)*(x2-x3)
 * </pre>
 *
 * @private
 * @param {!XY} pa  point object with {x,y}
 * @param {!XY} pb  point object with {x,y}
 * @param {!XY} pc  point object with {x,y}
 * @return {Orientation}
 */
function orient2d(pa, pb, pc) {
    var detleft = (pa.x - pc.x) * (pb.y - pc.y);
    var detright = (pa.y - pc.y) * (pb.x - pc.x);
    var val = detleft - detright;
    if (val > -(EPSILON) && val < (EPSILON)) {
        return Orientation.COLLINEAR;
    } else if (val > 0) {
        return Orientation.CCW;
    } else {
        return Orientation.CW;
    }
}
exports.orient2d = orient2d;


/**
 *
 * @private
 * @param {!XY} pa  point object with {x,y}
 * @param {!XY} pb  point object with {x,y}
 * @param {!XY} pc  point object with {x,y}
 * @param {!XY} pd  point object with {x,y}
 * @return {boolean}
 */
function inScanArea(pa, pb, pc, pd) {
    var oadb = (pa.x - pb.x) * (pd.y - pb.y) - (pd.x - pb.x) * (pa.y - pb.y);
    if (oadb >= -EPSILON) {
        return false;
    }

    var oadc = (pa.x - pc.x) * (pd.y - pc.y) - (pd.x - pc.x) * (pa.y - pc.y);
    if (oadc <= EPSILON) {
        return false;
    }
    return true;
}
exports.inScanArea = inScanArea;


/**
 * Check if the angle between (pa,pb) and (pa,pc) is obtuse i.e. (angle > π/2 || angle < -π/2)
 *
 * @private
 * @param {!XY} pa  point object with {x,y}
 * @param {!XY} pb  point object with {x,y}
 * @param {!XY} pc  point object with {x,y}
 * @return {boolean} true if angle is obtuse
 */
function isAngleObtuse(pa, pb, pc) {
    var ax = pb.x - pa.x;
    var ay = pb.y - pa.y;
    var bx = pc.x - pa.x;
    var by = pc.y - pa.y;
    return (ax * bx + ay * by) < 0;
}
exports.isAngleObtuse = isAngleObtuse;


},{}],36:[function(require,module,exports){
/*
 * Poly2Tri Copyright (c) 2009-2014, Poly2Tri Contributors
 * http://code.google.com/p/poly2tri/
 * 
 * poly2tri.js (JavaScript port) (c) 2009-2014, Poly2Tri Contributors
 * https://github.com/r3mi/poly2tri.js
 * 
 * All rights reserved.
 * 
 * Distributed under the 3-clause BSD License, see LICENSE.txt
 */

"use strict";

/**
 * The following functions operate on "Point" or any "Point like" object with {x,y},
 * as defined by the {@link XY} type
 * ([duck typing]{@link http://en.wikipedia.org/wiki/Duck_typing}).
 * @module
 * @private
 */

/**
 * poly2tri.js supports using custom point class instead of {@linkcode Point}.
 * Any "Point like" object with <code>{x, y}</code> attributes is supported
 * to initialize the SweepContext polylines and points
 * ([duck typing]{@link http://en.wikipedia.org/wiki/Duck_typing}).
 *
 * poly2tri.js might add extra fields to the point objects when computing the
 * triangulation : they are prefixed with <code>_p2t_</code> to avoid collisions
 * with fields in the custom class.
 *
 * @example
 *      var contour = [{x:100, y:100}, {x:100, y:300}, {x:300, y:300}, {x:300, y:100}];
 *      var swctx = new poly2tri.SweepContext(contour);
 *
 * @typedef {Object} XY
 * @property {number} x - x coordinate
 * @property {number} y - y coordinate
 */


/**
 * Point pretty printing : prints x and y coordinates.
 * @example
 *      xy.toStringBase({x:5, y:42})
 *      // → "(5;42)"
 * @protected
 * @param {!XY} p - point object with {x,y}
 * @returns {string} <code>"(x;y)"</code>
 */
function toStringBase(p) {
    return ("(" + p.x + ";" + p.y + ")");
}

/**
 * Point pretty printing. Delegates to the point's custom "toString()" method if exists,
 * else simply prints x and y coordinates.
 * @example
 *      xy.toString({x:5, y:42})
 *      // → "(5;42)"
 * @example
 *      xy.toString({x:5,y:42,toString:function() {return this.x+":"+this.y;}})
 *      // → "5:42"
 * @param {!XY} p - point object with {x,y}
 * @returns {string} <code>"(x;y)"</code>
 */
function toString(p) {
    // Try a custom toString first, and fallback to own implementation if none
    var s = p.toString();
    return (s === '[object Object]' ? toStringBase(p) : s);
}


/**
 * Compare two points component-wise. Ordered by y axis first, then x axis.
 * @param {!XY} a - point object with {x,y}
 * @param {!XY} b - point object with {x,y}
 * @return {number} <code>&lt; 0</code> if <code>a &lt; b</code>,
 *         <code>&gt; 0</code> if <code>a &gt; b</code>, 
 *         <code>0</code> otherwise.
 */
function compare(a, b) {
    if (a.y === b.y) {
        return a.x - b.x;
    } else {
        return a.y - b.y;
    }
}

/**
 * Test two Point objects for equality.
 * @param {!XY} a - point object with {x,y}
 * @param {!XY} b - point object with {x,y}
 * @return {boolean} <code>True</code> if <code>a == b</code>, <code>false</code> otherwise.
 */
function equals(a, b) {
    return a.x === b.x && a.y === b.y;
}


module.exports = {
    toString: toString,
    toStringBase: toStringBase,
    compare: compare,
    equals: equals
};

},{}],37:[function(require,module,exports){
module.exports=require(13)
},{}],38:[function(require,module,exports){
module.exports=require(14)
},{}],39:[function(require,module,exports){
module.exports=require(15)
},{"./Matrix3":37,"./Vector3":41,"./common":43}],40:[function(require,module,exports){
module.exports=require(16)
},{}],41:[function(require,module,exports){
module.exports=require(17)
},{}],42:[function(require,module,exports){
module.exports=require(18)
},{"./common":43}],43:[function(require,module,exports){
module.exports=require(19)
},{}],44:[function(require,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"./Matrix3":37,"./Matrix4":38,"./Quaternion":39,"./Vector2":40,"./Vector3":41,"./Vector4":42}]},{},[2])