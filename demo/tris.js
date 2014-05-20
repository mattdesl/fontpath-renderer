var test = require('canvas-testbed');

var Vector2 = require('vecmath').Vector2;

//the font we want to render
var Font = require('fontpath-test-fonts/lib/Alegreya-Regular.otf');

var TriangleRenderer = require('./TriangleRenderer');

// var text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
var text = "Resize your browser for word wrap.";

var renderer = new TriangleRenderer();

//setup the text renderer
renderer.text = text;
renderer.font = Font;
renderer.fontSize = 100;
renderer.layout(window.innerWidth);

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
	renderer.layout(window.innerWidth);
	textHeight = renderer.getBounds().height;
});

var time = 0;
function render(context, width, height) {
	context.clearRect(0, 0, width, height);

	//text is drawn with lower-left origin..
	var x = 20,
		y = 20+textHeight;

	time += 0.1;
	
	//simple linear tween to the new mouse position
	renderer.animationOrigin.lerp(mouse, 0.05);

	//animate the scaling effect
	renderer.explode = Math.sin(time*0.1)/2+0.5;

	//let's stroke the first word, and fill the rest
	var space = text.indexOf(' ');
	renderer.stroke(context, x, y, 0, space);	
	renderer.fill(context, x, y, space);	
}

test(render, undefined, { once: false });