# fontpath-renderer

[![experimental](http://badges.github.io/stability-badges/dist/experimental.svg)](http://github.com/badges/stability-badges)

A generic renderer for fontpath glyphs. 

**This is a low-level module** and is mostly used internally.

Instead, you are encouraged to use [fontpath-canvas](https://github.com/mattdesl/fontpath-canvas) for 2D canvas, [fontpath-gl](https://github.com/mattdesl/fontpath-gl) for WebGL, or [fontpath-simple-renderer](https://github.com/mattdesl/fontpath-simple-renderer) for basic render-agnostic custom solutions.

However, this produces the least amount of GC thrashing, and is best suited for highly optimized font rendering. 

[![NPM](https://nodei.co/npm/fontpath-renderer.png)](https://nodei.co/npm/fontpath-renderer/)

## demo

In the [demo](demo) folder is a simple implementation rendering triangles with some mouse interaction.

[![Result](http://i.imgur.com/jC4hqB2.png)](http://mattdesl.github.io/fontpath-renderer/demo/tris.html)

You can [run the demo here](http://mattdesl.github.io/fontpath-renderer/demo/tris.html).

## License 

MIT.