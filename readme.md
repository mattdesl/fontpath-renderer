A generic renderer for fontpath glyphs. See [fontpath-canvas](https://github.com/mattdesl/fontpath-canvas) for an implementation with HTML5 canvas.

This simply lays out glyphs and underlines using [fontpath-wordwrap](https://github.com/mattdesl/fontpath-wordwrap) and [fontpath-glyph-iterator](https://github.com/mattdesl/fontpath-glyph-iterator). 

## features

This primarily targets left-to-right text layouts using Latin fonts.

- Word wraps text with `normal`, `nowrap`, or `pre` modes
- Wrapped text is aligned with `left`, `center`, or `right`
- Handles underline position and size based on font metrics (some fonts embed the underline metrics)
- Provides a way to get the bounding box of the wrapped text
- `start` and `end` indices provide a basic interface for styling different glyphs in a string

## implementations

This is essentially an 'abstract' base class. It's up to the renderer to implement the glyph/underline drawing functions. Some examples of possible renderers:

- Decompose a glyph outline into a series of path operations for HTML5 canvas (see [fontpath-canvas](https://github.com/mattdesl/fontpath-canvas))
- Render the glyph as triangles for WebGL, using [shape2d-triangulate](https://github.com/mattdesl/shape2d-triangulate) (see the [demo](demo))
- Render the glyph as bitmap fonts, ideal for hinting and small, fixed-size fonts
- Render the glyph as quadratic curves on the GPU
- etc...

## usage

By default, the text renderer draws all the glyphs in a single line (like fillText). You will need to call `layout()` to word-wrap the current text. Whever the text property is changed, the layout is reset to a single line. 

Typical usage looks something like this:

```js
var TextRenderer = require('fontpath-renderer');

var textRenderer = new TextRenderer();

//set the current font and pixel size
textRenderer.font = TestFont;
textRenderer.fontSize = fontSize;
textRenderer.text = text;
textRenderer.layout(wrapWidth);
textRenderer.align = CanvasRenderer.Align.LEFT;
```

## demo

In the [demo](demo) folder is a simple implementation rendering triangles with some mouse interaction.

[![Result](http://i.imgur.com/7aJQwWz.png)](http://mattdesl.github.io/fontpath-renderer/demo/tris.html)

You can [run the demo here](http://mattdesl.github.io/fontpath-renderer/demo/tris.html).
