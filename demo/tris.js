var test = require('canvas-testbed');

var Vector2 = require('vecmath').Vector2;

//the font we want to render
var Font = require('fontpath-test-fonts/lib/Alegreya-Regular.otf');

var TriangleRenderer = require('./TriangleRenderer');

// var text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
var text = "Resize your browser for word wrap.";

//padding we'll render the text from the top left edge
var padding = 20;

var renderer = TriangleRenderer({
	text: text,
	font: Font,
	fontSize: 100,
	align: 'right',
	wrapWidth: window.innerWidth-padding
})

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