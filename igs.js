// Root elements for manipulating styles
const root = document.documentElement;
let root_style = getComputedStyle(document.querySelector(':root'));

let screen_width = parseInt(root_style.getPropertyValue('--screen-width'));
let screen_height = parseInt(root_style.getPropertyValue('--screen-height'));

let scale_horiz = parseInt(root_style.getPropertyValue('--horizontal-scale'));
let scale_vert = parseInt(root_style.getPropertyValue('--vertical-scale'));

let display_width;
let display_height;

let loupe_size = parseInt(root_style.getPropertyValue('--loupe-size'));

let buffer_size = parseInt(root_style.getPropertyValue('--buffer-size'));

let buffer_horiz;
let buffer_vert;

let debug_flag = false;
let debug_mousemove = false;

let mouse_is_dragging = false;
let mouse_is_down = false;

let current_tool = null;
let current_state = null;
let current_pattern = null;
let current_font = null;
let current_drawing_mode = null;
let border_flag = null;
let origin_x = null;
let origin_y = null;

let last_loupe_x = null;
let last_loupe_y = null;

let polygon_start_x = null;
let polygon_start_y = null;

let virtual_canvas = {
	width: null,
	height: null,
	data: [],
	palette: [],
	color: 0,
	init_data: function(w, h) {
		this.width = w;
		this.height = h;
		this.reset_data();
	},
	reset_data: function() {
		this.data = Array(this.height).fill().map(() => Array(this.width).fill(0));
	},
	set_palette: function(pal) {
		this.palette = [...pal];
	},
	update_palette: function(i, v) {
		this.palette[i] = v;
	},
	get_palette: function() {
		return this.palette;
	},
	get_palette_color: function(i) {
		return this.palette[i];
	},
	get_rgb_palette: function() {
		return this.palette.map(color => atari_to_rgb(color));
	},
	get_rgb_palette_color: function(i) {
		return this.palette.map(color => atari_to_rgb(color))[i];
	},
	set_color: function(c) {
		this.color = c;
	},
	get_color: function() {
		return this.color;
	},
	set_pixel: function(x, y, idx) {
		this.data[y][x] = idx;
	},
	get_pixel: function(x, y) {
		return this.data[y][x];
	},
	get_data: function() {
		return this.data.flat();
		// return this.data.reduce((xs, ys) => xs.concat(ys));
	},
	draw: function(ctx) {
		const w = ctx.canvas.width;
		const h = ctx.canvas.height;

		// Pre-calculate the RGBs for each palette spot
		const rgb_palette = this.get_rgb_palette();

		// Get the arrays ready
		let virtual_data = this.get_data();
		let canvas_data = ctx.getImageData(0, 0, w, h);

		// Fetch the color of each pixel on the virtual canvas, then push its R,G,B values into canvas imageData
		for (let i=0; i<virtual_data.length; i++) {
			let new_color_rgb = rgb_palette[virtual_data[i]];
			canvas_data.data[4*i] = new_color_rgb[0];
			canvas_data.data[4*i+1] = new_color_rgb[1];
			canvas_data.data[4*i+2] = new_color_rgb[2];
		}

		// Update the canvas with revised imageData
		ctx.putImageData(canvas_data, 0, 0);
	},
	translate: function(point, mx, my) {
		let x = point[0], y = point[1];
		x = parseInt(x) + parseInt(mx);
		y = parseInt(y) + parseInt(my);
		// Kludge to avoid out-of-bounds errors if we do in fact
		// translate some coordinates out of bounds.
		if (x < 0) { x = 0; }
		if (x >= this.width) { x = this.width - 1; }
		if (y < 0) { y = 0; }
		if (y >= this.height) { y = this.height - 1; }
		return [x, y];
	}
}




const display = document.querySelector('.mouse-target');

const canvas = document.getElementById('paint-canvas');
const context = canvas.getContext('2d', {willReadFrequently: true});

const liveCanvas = document.getElementById('live-canvas');
const liveContext = liveCanvas.getContext('2d');

const cursorCanvas = document.getElementById('cursor-overlay');
const cursorContext = cursorCanvas.getContext('2d');

const patternCanvas = document.getElementById('pattern-canvas');
const patternContext = patternCanvas.getContext('2d');

const loupeContainer = document.querySelector('.loupe-container');

const loupeCanvas = document.getElementById('loupe-canvas');
const loupeContext = loupeCanvas.getContext('2d');



// Throttling Function
function throttleFunction(func, delay) {

	// Previously called time of the function
	let prev = 0;
	return (...args) => {
		// Current called time of the function
		let now = new Date().getTime();

		// If difference is greater
		// than delay call
		// the function again.
		if (now - prev > delay) {
			prev = now;

			// "..." is the spread operator here 
			// returning the function with the 
			// array of arguments
			return func(...args);
		}
	}
}


function debug(s) {
	if (debug_flag == true) {
		console.log(s);
	}
}


// shim layer with setTimeout fallback
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame       ||
          window.webkitRequestAnimationFrame ||
          window.mozRequestAnimationFrame    ||
          function( callback ){
            window.setTimeout(callback, delay);
          };
})();

function disableSmoothing(ctx) {
    ctx['mozImageSmoothingEnabled'] = false;    /* Firefox */
    ctx['oImageSmoothingEnabled'] = false;      /* Opera */
    ctx['webkitImageSmoothingEnabled'] = false; /* Safari */
    ctx['msImageSmoothingEnabled'] = false;     /* IE */
    ctx['imageSmoothingEnabled'] = false;       /* standard */
}


// Take mouse coordinates and convert them to the virtual screen's coordinates
function translate_to_screen(sx, sy) {
	let px = Math.floor(sx/scale_horiz);
	let py = Math.floor(sy/scale_vert);

	// Subtract offset to account for buffer around the display area
	px = px - buffer_size;
	py = py - buffer_size;

	// Let mouse go out-of-bounds in the buffer, but keep cursor within canvas
	if (px < 0) { px = 0; }
	if (py < 0) { py = 0; }
	if (px > screen_width - 1) { px = screen_width - 1; }
	if (py > screen_height - 1) { py = screen_height - 1; }

	return [px, py];
}


const button_load = document.querySelector('.load-json');
button_load.addEventListener('click', function(event) {

	document.querySelector('.step-1').style.display = 'none';
	document.querySelector('.step-2.upload').classList.remove('hidden');

});


const upload_input = document.querySelector('.upload-file');
upload_input.addEventListener('change', function(event) {
	// Hide intro modals
	document.querySelector('.modal-wrapper').classList.add('hidden');

	// Show the drawing canvases
	document.querySelector('.display-subcontainer').style.display = 'block';

	// Show the panes
	document.querySelector('.pane.disabled').classList.remove('disabled');

	// getting a hold of the file reference
	const file = event.target.files[0]; 

	// setting up the reader
	const reader = new FileReader();
	reader.readAsText(file, 'UTF-8');

	// here we tell the reader what to do when it's done reading...
	reader.onload = readerEvent => {
		const content = readerEvent.target.result; // this is the content!
		const json = JSON.parse(content);
		history.load(json.history);
		renderer.render();
	}



});




const button_create = document.querySelector('.create-new');
button_create.addEventListener('click', function(event) {
	document.querySelector('.step-1').style.display = 'none';
	document.querySelector('.step-2.create-new').classList.remove('hidden');

	document.querySelector('.widget-resolutions select').disabled = false;
	document.querySelector('.widget-palettes select').disabled = false;

	// Manually change the resolutions menu to select "Atari ST low" as the default.
	document.querySelector('.widget-resolutions select').dispatchEvent(new Event('change'));

	// Manually change the palette menu to select "Atari ST default" as the default.
	document.querySelector('.widget-palettes select').dispatchEvent(new Event('change'));

	// Enable the start button
	document.querySelector('.start').disabled = false;

});


const select_resolutions = document.querySelector('.widget-resolutions select');
select_resolutions.addEventListener('change', function(event) {

	// Get the chosen resolution 
	const user_choice = document.querySelector('.widget-resolutions select').value;

	// Get the details of the user's chosen resolution
	const user_resolution = resolutions.filter(elem => elem.slug == user_choice)[0];

	// Populate select
	const widget = document.querySelector('.widget-palettes select');
	// First, empty any existing color schemes
	widget.replaceChildren();
	for (let elem of user_resolution.palettes) {
		widget.insertAdjacentHTML('beforeend', `<option value="${elem.id}">${elem.name}</option>`);
	}
});





const button_start = document.querySelector('.start');
button_start.addEventListener('click', function(event) {
	// Hide intro modals
	document.querySelector('.modal-wrapper').classList.add('hidden');
	document.querySelector('.step-2.create-new').classList.add('hidden');

	// Show the drawing canvases
	document.querySelector('.display-subcontainer').style.display = 'block';

	// Show the panes
	document.querySelector('.pane.disabled').classList.remove('disabled');

	// Get the user's choices
	const user_res_id = document.querySelector('.widget-resolutions select').value;
	const user_pal_id = document.querySelector('.widget-palettes select').value;

	set_resolution_palette(user_res_id, user_pal_id, starting_new=true);

});


// ------------------------
// NOTE ABOUT THIS FUNCTION
// ------------------------
// It seems really dumb to be creating all those event handlers inside this function.
// I did it that way originally because I can't create these elements 
// until I know which resolution and which color palette we're using. 
//
// But since we replay the entire history stack every time we run renderer.render(),
// these click handlers were bound repeatedly, leading to a cascade of duplicate events.
//
// For now, I have fixed this by wrapping each addEventListener() with a check
// to ensure we don't bind multiple times. Still, there must be a better way.
// ------------------------

// Set the screen resolution, and the color palette, either from user-defined selections, or from data from a loaded file.
function set_resolution_palette(res_id, pal_id, starting_new=false) {

	// Get the details of the user's chosen resolution
	const user_resolution = resolutions.filter(elem => elem.slug == res_id)[0];

	// Set emulated screen resolution in CSS variable
	root.style.setProperty(`--screen-width`, user_resolution.width);
	root.style.setProperty(`--screen-height`, user_resolution.height);
	screen_width = user_resolution.width;
	screen_height = user_resolution.height;

	// Atari medium has double the horizontal pixels, but same same number of vertical pixels as Atari low, 
	// so the pixels in medium become more like vertical rectangles.
	if (user_resolution.slug == 'atari_st_medium') {
		scale_horiz = 2;
		scale_vert = 4;
		root.style.setProperty(`--horizontal-scale`, scale_horiz);
		root.style.setProperty(`--vertical-scale`, scale_vert);
	}

	// Set up virtual canvas
	if (virtual_canvas.data.length < 1) {
		virtual_canvas.init_data(screen_width, screen_height);
	}

	// Calculate display width/height
	display_width = screen_width * scale_horiz;
	display_height = screen_height * scale_vert;

	// Calculate buffer around the display
	buffer_horiz = buffer_size * scale_horiz;
	buffer_vert = buffer_size * scale_vert;

	// Get a reference to the chosen color palette
	const user_colors = user_resolution.palettes[pal_id].colors;

	// IMPORTANT: Use the spread operator so that we COPY these values.
	// This will help us avoid modifying the original master resolution object.
	virtual_canvas.set_palette(user_colors);
	virtual_canvas.set_color(0);

	// Set up colors widget
	const widget = document.querySelector('.widget-colors .palette-wrapper');

	// First, empty any existing buttons
	widget.replaceChildren();

	// Now, add new buttons
	const current_palette = virtual_canvas.get_palette();
	for (let i=0; i<current_palette.length; i++) {
		let color_array = current_palette[i];
		let color_rgb = atari_to_rgb(color_array);
		let color_str = `rgb(${color_rgb[0]}, ${color_rgb[1]}, ${color_rgb[2]})`;

		// Set color values in CSS variables
		root.style.setProperty(`--palette-color-${i}`, color_str);

		widget.insertAdjacentHTML('beforeend', `
			<button type="button" class="palette-button palette-color-${i}" value="${i}">${i}</button>
		`);
	}

	// If we are starting a new document, then add this command to the history stack.
	// If we're loading from a saved file, or replaying history, ignore this part.
	if (starting_new == true) {
		let sys_palette_flag = 1;
		if (pal_id == 2) { sys_palette_flag = 2; }

		// Add the resolution and color palette selection to our history stack.
		history.add({
			action: 'set_resolution',
			params: {
				resolution: user_resolution.id,
				sys_palette_flag: sys_palette_flag, // default ST palette. 0=no change, 1=Atari default, 2=IGS default palette
				palette_id: pal_id, // This is my JoshDraw palette ID. 0=Atari default, 2=IGS default, 3=Dawnbringer
			}
		});
	}

	// Click handlers for color palette buttons
	document.querySelectorAll('.widget-colors .palette-button').forEach((elem)=> {

		// These outer .hasAttribute() checks ensure we don't re-bind this event
		// when we render or replay the history (which can cascade).
		if (!elem.hasAttribute('hasClickHandler')) {
			elem.addEventListener('click', function(event) {
				if (this.value !== null) {
					// Keep track of whether we actually changed the color, 
					// or just clicked the same palette square again.
					let color_change_flag = false;
					if (virtual_canvas.get_color() !== parseInt(this.value)) {
						color_change_flag = true;
					}

					// Once a tool has been chosen, let's removing pulsing circle.
					document.querySelector('.pulse-container').classList.remove('color-unset');

					virtual_canvas.set_color(parseInt(this.value));

					// Toggle the active class on the buttons
					document.querySelectorAll('.widget-colors .palette-button').forEach((button)=> {
						button.classList.remove('active');
					});
					this.classList.add('active');

					// Add this action to our history stack, if we actually changed colors.
					if (current_state !== 'rendering' && color_change_flag == true) {
						history.add({
							action: 'set_color',
							params: {
								color: virtual_canvas.get_color(),
							}
						});
					}
					set_color(virtual_canvas.get_color(), context);

				} // end if
			}); // end click handler
			elem.setAttribute('hasClickHandler', 'true');
		}

		// These outer .hasAttribute() checks ensure we don't re-bind this event
		// when we render or replay the history (which can cascade).
		if (!elem.hasAttribute('hasDblClickHandler')) {
			elem.addEventListener('dblclick', function(event) {
				// Configure the color picker so the existing color is pre-set.
				const color_atari = virtual_canvas.get_palette_color(parseInt(this.value));
				document.querySelector('#picker-red').value = color_atari[0];
				document.querySelector('#picker-green').value = color_atari[1];
				document.querySelector('#picker-blue').value = color_atari[2];
				document.querySelector('#picker-red').dispatchEvent(new Event('input'));

				// Display the modal
				document.querySelector('.modal-wrapper').classList.remove('hidden');
				document.querySelector('.widget-color-picker').classList.remove('hidden');
			}); // end click handler
			elem.setAttribute('hasDblClickHandler', 'true');
		}

	});


	// Click handler for Move dialog cancel button
	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	const move_dialog_cancel = document.querySelector('.widget-move-art .cancel');
	if (!move_dialog_cancel.hasAttribute('hasClickHandler')) {
		move_dialog_cancel.addEventListener('click', function(event) {
			// Close the modal
			document.querySelector('.modal-wrapper').classList.add('hidden');
			document.querySelector('.widget-move-art').classList.add('hidden');
		});
		move_dialog_cancel.setAttribute('hasClickHandler', 'true');
	}



	// Populate the color picker with all possible Atari colors.	
	const color_picker_inputs = document.querySelector('.widget-color-picker .palette-squares');
	// First, empty any existing buttons
	color_picker_inputs.replaceChildren();
	for (let g=0; g<8; g++) {
		for (let b=0; b<8; b++) {
			for (let r=0; r<8; r++) {
				let pal_rgb = atari_to_rgb([r,g,b]);
				color_picker_inputs.insertAdjacentHTML('beforeend', `<div class="palette-square" style="background: rgb(${pal_rgb[0]}, ${pal_rgb[1]}, ${pal_rgb[2]})" data-r="${r}" data-g="${g}" data-b="${b}"></div>`);
			}
		}
	}

	// Click handlers for the 512 tiny color palette squares. Clicking one will update the color picker.
	document.querySelectorAll('.widget-color-picker .palette-squares .palette-square').forEach((elem)=> {
		// These outer .hasAttribute() checks ensure we don't re-bind this event
		// when we render or replay the history (which can cascade).
		if (!elem.hasAttribute('hasClickHandler')) {
			elem.addEventListener('click', function(event) {
				document.querySelector('#picker-red').value = parseInt(this.getAttribute('data-r'));
				document.querySelector('#picker-green').value = parseInt(this.getAttribute('data-g'));
				document.querySelector('#picker-blue').value = parseInt(this.getAttribute('data-b'));
				document.querySelector('#picker-red').dispatchEvent(new Event('input'));
			}); // end click handler
			elem.setAttribute('hasClickHandler', 'true');
		}
	});

	// Click handler for Color Picker cancel button
	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	const color_choose_cancel = document.querySelector('.widget-color-picker .cancel');
	if (!color_choose_cancel.hasAttribute('hasClickHandler')) {
		color_choose_cancel.addEventListener('click', function(event) {
			// Close the modal
			document.querySelector('.modal-wrapper').classList.add('hidden');
			document.querySelector('.widget-color-picker').classList.add('hidden');
		});
		color_choose_cancel.setAttribute('hasClickHandler', 'true');
	}

	// Click handler for use-this-color button
	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	const color_choose_button = document.querySelector('.color-choose');
	if (!color_choose_button.hasAttribute('hasClickHandler')) {
		color_choose_button.addEventListener('click', function(event) {
			const r = parseInt(document.querySelector('#picker-red').value);
			const g = parseInt(document.querySelector('#picker-green').value);
			const b = parseInt(document.querySelector('#picker-blue').value);

			if (current_state !== 'rendering') {
				// Add this action to our history stack.
				history.add({
					action: 'change_color',
					params: {
						index: virtual_canvas.get_color(),
						r: r,
						g: g,
						b: b,
					}
				});
			}

			renderer.render();

			// Close the modal
			document.querySelector('.modal-wrapper').classList.add('hidden');
			document.querySelector('.widget-color-picker').classList.add('hidden');
		});
		color_choose_button.setAttribute('hasClickHandler', 'true');
	}


	let canvas_bg_rgb = virtual_canvas.get_rgb_palette_color(0);

	// Set up the painting canvas
	canvas.width = screen_width;
	canvas.height = screen_height;
	disableSmoothing(context);
	clearCanvas(context, canvas, `rgb(${canvas_bg_rgb[0]}, ${canvas_bg_rgb[1]}, ${canvas_bg_rgb[2]})`);

	// Set up the live drawing canvas (showing in-progress lines as cursor moves)
	liveCanvas.width = screen_width;
	liveCanvas.height = screen_height;
	disableSmoothing(liveContext);
	clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

	// Set up the pattern canvas
	patternCanvas.width = screen_width;
	patternCanvas.height = screen_height;
	disableSmoothing(patternContext);
	clearCanvas(patternContext, patternCanvas, 'rgba(0,0,0,0)');

	// Set up the cursor overlay -- Its dimensions are larger to align with buffer
	cursorCanvas.width = screen_width + (buffer_horiz/scale_horiz*2);
	cursorCanvas.height = screen_height + (buffer_vert/scale_vert*2);
	disableSmoothing(cursorContext);
	clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');


	// Set up the loupe canvas
	loupeCanvas.width = loupe_size;
	loupeCanvas.height = loupe_size;
	disableSmoothing(loupeContext);
	clearCanvas(loupeContext, loupeCanvas, 'rgba(255,255,255,0)');


	// CANVAS EVENT HANDLERS
	// ---------------------

	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!display.hasAttribute('hasClickHandler')) {
		// CANVAS CLICK HANDLER
		display.addEventListener('click', function(event) {
			event.stopPropagation();
			event.preventDefault();
			// Avoid extra click after a drag event
			if (mouse_is_down == true) {
				mouse_is_down = false;
				return false;
			}
			// Otherwise check if this is a valid click.
			if (current_tool !== null && current_tool !== 'draw_point') {
				debug(`Event Listener: Click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
				tool_functions[current_tool].onclick(event);
			}
			return false;
		}, false);
		display.setAttribute('hasClickHandler', 'true');
	}


	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!display.hasAttribute('hasDragHandler')) {
		// CANVAS MOUSEDOWN/MOUSEUP HANDLER - SPECIFICALLY FOR PENCIL
		// Basically we have to watch for mousedown. If mousemove comes next, it's a drag.
		// If not, and we record a mouseup, then treat it like a single click.
		display.addEventListener('mousedown', function(event) {
			if (current_tool !== null && current_tool == 'draw_point') {
				event.stopPropagation();
				event.preventDefault();
				mouse_is_down = true;
			}
			return false;
		}, false);
		display.addEventListener('mouseup', function(event) {
			if (current_tool !== null && current_tool == 'draw_point') {
				debug(`Event Listener: Mouseup\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
				event.stopPropagation();
				event.preventDefault();
				if (mouse_is_dragging == true) {
					tool_functions[current_tool].ondragend(event);
				}
				else if (mouse_is_dragging == false) {
					tool_functions[current_tool].onclick(event);
				}
			}
			// mouse_is_down = false;
			mouse_is_dragging = false;
			return false;
		}, false);

		display.setAttribute('hasDragHandler', 'true');
	}



	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!display.hasAttribute('hasRightClickHandler')) {
		// CANVAS RIGHT-CLICK HANDLER
		display.addEventListener('contextmenu', function(event) {
			event.stopPropagation();
			event.preventDefault();
			if (current_tool !== null) {
				debug(`Event Listener: Right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
				tool_functions[current_tool].onrightclick(event);
			}
			return false;
		}, false);
		display.setAttribute('hasRightClickHandler', 'true');
	}


	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!display.hasAttribute('hasMouseMoveHandler')) {
		// CANVAS MOUSEMOVE HANDLER
		// Using a throttle function to keep the app snappier, especially with the blitting.
		display.addEventListener('mousemove', throttleFunction(() => {
			if (current_tool !== 'rendering') {
				const [px, py] = translate_to_screen(event.layerX, event.layerY);

				if (px <= screen_width && py <= screen_height) {
					if (current_tool !== null) {
						if (debug_mousemove == true) {
							debug(`Event Listener: Mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
						}
						tool_functions[current_tool].mousemove(event);
					}
					if (current_tool !== null && current_tool == 'draw_point') {
						if (mouse_is_down == true) {
							mouse_is_dragging = true;
							tool_functions[current_tool].ondrag(event);
						}
					}
				}
				else {
					update_status(null,null);
				}
			}
			return false;
		}, 25), false);
		display.setAttribute('hasMouseMoveHandler', 'true');
	}

	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!display.hasAttribute('hasMouseOutHandler')) {
		// CANVAS MOUSEOUT HANDLER
		display.addEventListener('mouseout', function(event) {
			update_status(null,null);
			return false;
		}, false);
		display.setAttribute('hasMouseOutHandler', 'true');
	}



	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	const save_button = document.querySelector('.files-save-json');
	if (!save_button.hasAttribute('hasClickHandler')) {
		// Click handler for save button
		save_button.addEventListener('click', function(event) {
			event.preventDefault();
			history.save('illustration.json');
			return false;
		}, false);
		save_button.setAttribute('hasClickHandler', 'true');
	}



	const export_ig_button = document.querySelector('.files-export-ig');
	if (!export_ig_button.hasAttribute('hasClickHandler')) {
		// Click handler for IG export button
		export_ig_button.addEventListener('click', function(event) {
			event.preventDefault();
			history.export_ig('illustration.ig');
			return false;
		}, false);
		export_ig_button.setAttribute('hasClickHandler', 'true');
	}

	const export_png_button = document.querySelector('.files-export-png');
	if (!export_png_button.hasAttribute('hasClickHandler')) {
		// Click handler for PNG export button
		export_png_button.addEventListener('click', function(event) {
			event.preventDefault();
			history.export_png('illustration.png');
			return false;
		}, false);
		export_png_button.setAttribute('hasClickHandler', 'true');
	}


	// Set a pointer to the chosen color pattern
	current_pattern = fill_patterns[1];

	// Set up patterns widget
	const pattern_select = document.querySelector('.widget-patterns select');

	// First, empty any existing buttons
	pattern_select.replaceChildren();

	for (let i=0; i<fill_patterns.length; i++) {
		let pattern_obj = fill_patterns[i];

		// This requires the use of my custom "Atari Patterns" fontset.
		// Also, for maximum cross-platform compatibility, requires select to be set to "multiple" rather than typical dropdown.
		let icon_code = (59392 + i).toString(16);

		pattern_select.insertAdjacentHTML('beforeend', `
			<option class="pattern-option pattern-${i}" value="${i}">&#x${icon_code}; ${pattern_obj.name}</option>
		`);
	}



	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!pattern_select.hasAttribute('hasChangeHandler')) {
		// Change handler for pattern widget
		pattern_select.addEventListener('change', function(event) {
			// In order to show the pattern icons on all browsers, we're using the multi-select interface.
			// But we don't want to allow multiple selections. So check if someone *did* do multiple selections.
			if (this.selectedOptions.length > 1) {
				let wanted_opt = current_pattern.id;
				for (let opt of this.selectedOptions) {
					if (parseInt(opt.value) != parseInt(current_pattern.id)) {
						wanted_opt = parseInt(opt.value);
					}
				}
				this.value = wanted_opt;
			}


			// Set global current_pattern to new value.
			const new_pattern_index = parseInt(this.value);
			current_pattern = fill_patterns[new_pattern_index];

			if (current_state !== 'rendering') {
				// Add this action to our history stack.
				history.add({
					action: 'change_pattern',
					params: {
						pattern: current_pattern.slug,
						border_flag: border_flag
					}
				});
			}
		});
		pattern_select.setAttribute('hasChangeHandler', 'true');
	}


	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	const border_flag_input = document.querySelector('#fill-border');
	if (!border_flag_input.hasAttribute('hasChangeHandler')) {
		// Change handler for fill-border input
		border_flag_input.addEventListener('change', function(event) {
			// Set global border_flag to new value.
			const current_fill_border_flag = this.checked;


			if (current_fill_border_flag == true || current_fill_border_flag == 'true') {
				border_flag = 1;
			}
			else {
				border_flag = 0;
			}

			if (current_state !== 'rendering') {
				// Add this action to our history stack.
				history.add({
					action: 'change_pattern',
					params: {
						pattern: current_pattern.slug,
						border_flag: border_flag
					}
				});
			}
		});
		border_flag_input.setAttribute('hasChangeHandler', 'true');
	}



	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	const drawing_mode_select = document.querySelector('.widget-drawing-mode select');
	if (!drawing_mode_select.hasAttribute('hasChangeHandler')) {
		// Change handler for pattern widget
		drawing_mode_select.addEventListener('change', function(event) {
			// Set global current_pattern to new value.
			current_drawing_mode = parseInt(this.value);

			if (current_state !== 'rendering') {
				// Add this action to our history stack.
				history.add({
					action: 'change_drawing_mode',
					params: {
						mode: current_drawing_mode,
					}
				});
			}
		});
		drawing_mode_select.setAttribute('hasChangeHandler', 'true');
	}



	// Set a pointer to the chosen color pattern
	current_font = fonts[1];

	// Set up fonts widget
	const font_select = document.querySelector('.widget-fonts select');

	// First, empty any existing buttons
	font_select.replaceChildren();

	for (let i=0; i<fonts.length; i++) {
		let font_obj = fonts[i];

		font_select.insertAdjacentHTML('beforeend', `
			<option class="font-option font-${i}" value="${i}">${font_obj.name}</option>
		`);
	}



	// These outer .hasAttribute() checks ensure we don't re-bind this event
	// when we render or replay the history (which can cascade).
	if (!font_select.hasAttribute('hasChangeHandler')) {
		// Change handler for font widget
		font_select.addEventListener('change', function(event) {
			// In order to show the font icons on all browsers, we're using the multi-select interface.
			// But we don't want to allow multiple selections. So check if someone *did* do multiple selections.
			if (this.selectedOptions.length > 1) {
				let wanted_opt = current_font.id;
				for (let opt of this.selectedOptions) {
					if (parseInt(opt.value) != parseInt(current_font.id)) {
						wanted_opt = parseInt(opt.value);
					}
				}
				this.value = wanted_opt;
			}


			// Set global current_font to new value.
			const new_font_index = parseInt(this.value);
			current_font = fonts[new_font_index];

			if (current_state !== 'rendering') {
				// Add this action to our history stack.
				history.add({
					action: 'change_font',
					params: {
						font: current_font.point, // IGS identifies fonts by point size.
						effect: 0, // FOR NOW DEFAULT TO NORMAL. In future will support other effects.
						rotation: 0 // FOR NOW DEFAULT TO NORMAL. In future will support other effects.
					}
				});
			}
		});
		font_select.setAttribute('hasChangeHandler', 'true');
	}









	// Manually change the mode menu to select "Replace" as the default.
	document.querySelector('.widget-drawing-mode select').dispatchEvent(new Event('change'));

	// Manually change the pattern menu to select "Filled" as the default.
	document.querySelector('#fill-border').dispatchEvent(new Event('change'));

	// Next manually set the pattern select to 1, and trigger the change event.
	document.querySelector('.widget-patterns select').value = '1';
	document.querySelector('.widget-patterns select').dispatchEvent(new Event('change'));

	// Next manually set the font select to 1, and trigger the change event.
	document.querySelector('.widget-fonts select').value = '1';
	document.querySelector('.widget-fonts select').dispatchEvent(new Event('change'));

}


// Keydown handler for Cmd/Ctrl-Z (undo) and Shift-Cmd/Ctrl-Z (redo)
window.addEventListener('keydown', function(event) {
	// REDO
	if ((event.key === 'Z' || event.key === 'z') && (event.ctrlKey || event.metaKey) && event.shiftKey) {
		event.preventDefault();
		event.stopImmediatePropagation();
		history.redo();
		renderer.render();
	}
	// UNDO
	else if ((event.key === 'Z' || event.key === 'z') && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		event.stopImmediatePropagation();
		history.undo();
		renderer.render();
	}
	// MOVE (since we're intercepting all keydowns)
	else if ((event.key === 'M' || event.key === 'm') && (event.ctrlKey || event.metaKey) && event.shiftKey) {
		event.preventDefault();
		event.stopImmediatePropagation();
		history.move();
	}
	// // RELOAD (since we're intercepting all keydowns)
	// else if ((event.key === 'R' || event.key === 'r') && (event.ctrlKey || event.metaKey)) {
	// 	window.location.reload();
	// }

	const non_ascii_allowed = [
		'Spacebar',
		'Backspace',
		'ArrowLeft',
		'ArrowRight',
		'ArrowUp',
		'ArrowDown',
		'Enter',
		'Return',
	];

	// We need to pass keydowns to the "write text" function
	if (current_tool !== null && current_tool == 'write_text') {
		// JS no longer supports .keyCode(), so we have to fall back to sniffing out if the key pressed
		// with these goofy tests.
		if (event.key.length == 1 || (event.key.length > 1 && /[^a-zA-Z0-9]/.test(event.key)) || non_ascii_allowed.includes(event.key)) {
			// We need to do this to avoid the normal behavior where hitting the space bar scrolls the webpage.
			event.preventDefault();
			event.stopImmediatePropagation();

			debug(`Event Listener: Write_text\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			tool_functions[current_tool].keydown(event);
		}
	}
});




const color_picker_inputs = document.querySelectorAll('.widget-color-picker input');
color_picker_inputs.forEach((elem)=> { 
	elem.addEventListener('input', function(event) {
		const r = parseInt(document.querySelector('#picker-red').value);
		const g = parseInt(document.querySelector('#picker-green').value);
		const b = parseInt(document.querySelector('#picker-blue').value);

		const color_rgb = atari_to_rgb([r,g,b]);

		document.querySelector('#picker-red ~ .value').textContent = r;
		document.querySelector('#picker-green ~ .value').textContent = g;
		document.querySelector('#picker-blue ~ .value').textContent = b;

		document.querySelector('.color-preview').style.backgroundColor = `rgb(${color_rgb[0]}, ${color_rgb[1]}, ${color_rgb[2]})`;

	});

});





const tools = [
	{ 'name': 'Pencil', 'function': 'draw_point' },
	{ 'name': 'Draw line', 'function': 'draw_line' },
	{ 'name': 'Draw polyline', 'function': 'draw_polyline' },
	{ 'name': 'Draw filled rectangle', 'function': 'draw_rect' },
	{ 'name': 'Draw filled polygon', 'function': 'draw_polygon' },
	{ 'name': 'Draw circle', 'function': 'draw_circle' },
	{ 'name': 'Grab / blit', 'function': 'blit' },
	{ 'name': 'Write text', 'function': 'write_text' },
];

// Set up tools widget
for (let elem of tools) {
	let widget = document.querySelector('.widget-tools select');
	widget.insertAdjacentHTML('beforeend', `<option value="${elem.function}">${elem.name}</option>`);
}


function clearCanvas(ctx, cvs, fill) {
	ctx.clearRect(0, 0, cvs.width, cvs.height);
	ctx.fillStyle = fill;
	ctx.fillRect(0, 0, cvs.width, cvs.height);
}


// The cursor canvas is now larger, and offset, to align with the buffer around the display
function draw_cursor(sprite_num, px, py) {
	const sprite_w = 16;
	const sprite_h = 16;

	// These values are good for crosshairs, which are odd to allow an empty center pixel.
	// Not sure if they will also be good for all other cursor icons.
	const icon_offset_x = 7;
	const icon_offset_y = 7;

	// NAIVE!!! THIS ROUTINE DOESN'T YET ACCOUNT FOR MULTIPLE ROWS ON THE SPRITE SHEET.
	const sprite_x = sprite_w * sprite_num;
	const sprite_y = 0;

	const dx = px - icon_offset_x + buffer_size;
	const dy = py - icon_offset_y + buffer_size;

	cursorContext.drawImage(icon_sprites, sprite_x, sprite_y, sprite_w, sprite_h, dx, dy, sprite_w, sprite_h);
	// cursorContext.drawImage(icon_sprites, px, py);

}


function update_status(px, py) {
	let dx = '';
	let dy = '';
	if (px !== null && py !== null && px > -1 && py > -1) {
		dx = px.toString();
		dy = py.toString();
	}
	document.querySelector('.status-x .status-value').textContent = dx;
	document.querySelector('.status-y .status-value').textContent = dy;
}

function update_loupe(px=null, py=null) {
	// Keep the loupe updated at the last mouse position when we re-render (e.g. when undoing, etc)
	if (px === null && py === null && last_loupe_x !== null && last_loupe_y !== null) {
		px = last_loupe_x;
		py = last_loupe_y;
	}
	else {
		last_loupe_x = px;
		last_loupe_y = py;
	}

	const loupe_offset = (loupe_size - 1) / 2;
	const loupe_x = px - loupe_offset;
	const loupe_y = py - loupe_offset;

	loupeContext.clearRect(0, 0, loupe_size, loupe_size);

	// Draw the actual painted canvas
	loupeContext.drawImage(
		canvas, // source
		loupe_x, // source x-coord
		loupe_y, // source y-coord
		loupe_size, // source width
		loupe_size, // source height
		0, // destination x-coord
		0, // destination y-coord
		loupe_size, // destination width
		loupe_size // destination height
	);

	// Draw the live-drawing canvas (where in-progress lines are rendered)
	loupeContext.drawImage(
		liveCanvas, // source
		loupe_x, // source x-coord
		loupe_y, // source y-coord
		loupe_size, // source width
		loupe_size, // source height
		0, // destination x-coord
		0, // destination y-coord
		loupe_size, // destination width
		loupe_size // destination height
	);
}



function checkBounds(ctx, px, py) {
	if (px < 0) { px = 0; }
	else if (px > ctx.canvas.width-1) { px = ctx.canvas.width-1; }

	if (py < 0) { py = 0; }
	else if (py > ctx.canvas.height-1) { py = ctx.canvas.height-1; }

	return [px, py];
}


function convert_to_45_deg(start, end) {
	const delta_x = end[0] - start[0];
	const delta_y = end[1] - start[1];
	const dist = Math.sqrt(Math.pow(delta_x,2) + Math.pow(delta_y,2));
	const new_angle = Math.atan2(delta_y, delta_x);
	const shifted_angle = Math.round(new_angle / Math.PI * 4) / 4 * Math.PI;
	return [
		Math.round(start[0]+dist*Math.cos(shifted_angle)),
		Math.round(start[1]+dist*Math.sin(shifted_angle))
	];
}


const history = {
	past: [],
	present: null,
	future: [],
	add: function(action) {
		// Push present state (if there is one) to end of the history.
		if (this.present != null) {
			this.past.push(this.present);
		}
		// Set current action as the present
		this.present = action;
		// Clear the future
		this.future = [];
	},
	undo: function() {
		if (this.past.length > 0) {
			// Take the present state and prepend it to the future stack.
			this.future.unshift(this.present);
			// Remove last item from the past and use it to replace the present.
			this.present = this.past.pop();
		}
	},
	redo: function() {
		if (this.future.length > 0) {
			// Push the present state as the last item of the past.
			this.past.push(this.present);
			// Remove the first item from the future, and use it to replace the present.
			this.present = this.future.shift();
		}
	},
	move: function() {
		// Display the modal
		document.querySelector('.modal-wrapper').classList.remove('hidden');
		document.querySelector('.widget-move-art').classList.remove('hidden');

		// Click handler for use-this-color button
		// These outer .hasAttribute() checks ensure we don't re-bind this event
		// when we render or replay the history (which can cascade).
		const apply_move_button = document.querySelector('.apply-move');
		if (!apply_move_button.hasAttribute('hasClickHandler')) {
			apply_move_button.addEventListener('click', function(event) {
				const mx = parseInt(document.querySelector('#picker-x').value);
				const my = parseInt(document.querySelector('#picker-y').value);

				// Close the modal
				document.querySelector('.modal-wrapper').classList.add('hidden');
				document.querySelector('.widget-move-art').classList.add('hidden');

				// Iterate over full command history and change coordinates of every point.
				for (cmd of history.past) {
					if (cmd.params.hasOwnProperty('points')) {
						for (i in cmd.params.points) {
							cmd.params.points[i] = virtual_canvas.translate(cmd.params.points[i], mx, my);
						}
					}
				}
				if (history.present) {
					if (history.present.params.hasOwnProperty('points')) {
						for (i in history.present.params.points) {
							 history.present.params.points[i] = virtual_canvas.translate(history.present.params.points[i], mx, my);
						}
					}
				}
				for (cmd of history.future) {
					if (cmd.params.hasOwnProperty('points')) {
						for (i in cmd.params.points) {
							cmd.params.points[i] = virtual_canvas.translate(cmd.params.points[i], mx, my);
						}
					}
				}

				// Re-render with transformation applied
				renderer.render();

			});
			apply_move_button.setAttribute('hasClickHandler', 'true');
		}
	},
	load: function(actions) {
		// Remove any objects that don't have actions. This can allow me to include non-action objects in the JSON to use for 'comments'.
		actions = actions.filter(obj => Object.keys(obj).includes('action'));
		// Take all actions from the JSON file and load them into the past.
		this.past = actions;
		// Set the final action as our "present".
		this.present = this.past.pop();
	},
	// Save in JSON format
	save: function(filename) {
		// Combine the past and present to generate a full history object.
		const full_history = this.past.concat([this.present]);
		const obj = { history: full_history };
		// Convert command history into a JSON string. 
		// Add a line break before each action object to make it easier to edit in text editors.
		let obj_str = JSON.stringify(obj).replaceAll('{"action"','\n{"action"');
		const a = document.createElement('a');
		const type = filename.split('.').pop();
		a.href = URL.createObjectURL( new Blob([obj_str], { type:`text/${type === 'txt' ? 'plain' : type}` }) );
		a.download = filename;
		a.click();
	},
	// Export in PNG format
	export_png: function(filename) {
		// Create a temporary canvas so we can scale the image up from 320x200 to 1,280x800
		const tempCanvas = document.createElement('canvas');
		const tempContext = tempCanvas.getContext('2d');
		tempCanvas.width = canvas.width * 4;
		tempCanvas.height = canvas.height * 4;

		disableSmoothing(tempContext);

		tempContext.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, tempCanvas.width, tempCanvas.height);

		tempCanvas.toBlob(function(blob) {
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = filename;
			a.click();
		});
	},
	// Export in IG format
	export_ig: function(filename) {
		// Combine the past and present to generate a full history object.
		const full_history = this.past.concat([this.present]);

		let cmd_str = '';

		if (full_history[0].action == 'set_resolution') {
			// Get the initial resolution command
			const init = full_history.shift();
			cmd_str += `G#I>0:R>${init.params.resolution},${init.params.sys_palette_flag}:s>5:k>0:T>1,1,1:\r\n`;

			// Manually set the colors, because when switching from medium to low res, 
			// the Atari low default does NOT get set automatically.
			if (init.params.sys_palette_flag == 1 || init.params.sys_palette_flag == 2) {
				for (let c=0; c<resolutions[0].palettes[init.params.palette_id].colors.length; c++) {
					let color = resolutions[0].palettes[init.params.palette_id].colors[c];
					cmd_str += `G#S>${c},${color[0]},${color[1]},${color[2]}:\r\n`;
				}
			}
		}
		else {
			cmd_str += 'G#I>0:s>5:k>0:T>1,1,1:\r\n';
		}

		// Variables to track state of colors, patterns, etc, to avoid duplicating the commands.
		let exp_marker_color = null;
		let exp_line_color = null;
		let exp_fill_color = null;
		let exp_text_color = null;
		let exp_pattern = null;
		let exp_border_flag = null;

		for (cmd of full_history) {
			switch (cmd.action) {
				case 'set_resolution':
					cmd_str += `G#R>${cmd.params.resolution},${cmd.params.sys_palette_flag}:\r\n`;
					break;
				// I am now manually setting the colors within the tool commands.
				case 'set_color':
					// if (exp_fill_color !== cmd.params.color) {
					// 	cmd_str += `G#C>1,${cmd.params.color}:\r\n`;
					// 	exp_fill_color = cmd.params.color;
					// }
					break;
				case 'change_color':
					cmd_str += `G#S>${cmd.params.index},${cmd.params.r},${cmd.params.g},${cmd.params.b}:\r\n`;
					break;
				case 'change_drawing_mode':
					cmd_str += `G#M>${cmd.params.mode}:\r\n`;
					break;
				case 'change_pattern':
					if (exp_pattern !== cmd.params.pattern || exp_border_flag !== cmd.params.border_flag) {
						cmd_str += `G#A>${cmd.params.pattern},${cmd.params.border_flag}:\r\n`;
						exp_pattern = cmd.params.pattern;
						exp_border_flag = cmd.params.border_flag;
					}
					break;
				case 'draw_point':
					if (exp_marker_color !== cmd.params.color) {
						cmd_str += `G#C>0,${cmd.params.color}:\r\n`;
						exp_marker_color = cmd.params.color;
					}
					for (point of cmd.params.points) {
						cmd_str += `G#P>${point[0]},${point[1]}:\r\n`;
					}
					break;
				case 'draw_line':
					if (exp_line_color !== cmd.params.color) {
						cmd_str += `G#C>1,${cmd.params.color}:\r\n`;
						exp_line_color = cmd.params.color;
					}
					cmd_str += `G#L>${cmd.params.points[0][0]},${cmd.params.points[0][1]},${cmd.params.points[1][0]},${cmd.params.points[1][1]}:\r\n`;
					break;
				case 'draw_polyline':
					if (exp_line_color !== cmd.params.color) {
						cmd_str += `G#C>1,${cmd.params.color}:\r\n`;
						exp_line_color = cmd.params.color;
					}
					// THIS CODE IS COMPATIBLE WITH OLD IGS VERSIONS (DRAW LINE + DRAW TOs)
					// // Draw first segment using DRAW LINE
					// cmd_str += `G#L>${cmd.params.points[0][0]},${cmd.params.points[0][1]},${cmd.params.points[1][0]},${cmd.params.points[1][1]}:\r\n`;
					// // Draw remaining segments using DRAW TO
					// for (let p=1; p<cmd.params.points.length; p++) {
					// 	cmd_str += `G#D>${cmd.params.points[p][0]},${cmd.params.points[p][1]}:\r\n`;
					// }

					// THIS CODE REQUIRES IGS 2.19 OR GREATER (SINGLE POLY LINE)
					// First parameter of POLYLINE cmd is the number of points.
					cmd_str += `G#z>${cmd.params.points.length}`;
					for (let p=0; p<cmd.params.points.length; p++) {
						cmd_str += `,${cmd.params.points[p][0]},${cmd.params.points[p][1]}`;
						// If we're at the last command, then use the terminator and line breaks
						if (p == cmd.params.points.length - 1) {
							cmd_str += `:\r\n`;
						}
					}
					break;
				case 'draw_rect':
					if (exp_fill_color !== cmd.params.color) {
						cmd_str += `G#C>2,${cmd.params.color}:\r\n`;
						exp_fill_color = cmd.params.color;
					}
					// IGS' BOX command includes 5th parameter for rounded corners. Right now I don't support that.
					cmd_str += `G#B>${cmd.params.points[0][0]},${cmd.params.points[0][1]},${cmd.params.points[1][0]},${cmd.params.points[1][1]},0:\r\n`;
					break;
				case 'draw_polygon':
					if (exp_fill_color !== cmd.params.color) {
						cmd_str += `G#C>2,${cmd.params.color}:\r\n`;
						exp_fill_color = cmd.params.color;
					}
					// First parameter of POLYFILL cmd is the number of points.
					cmd_str += `G#f>${cmd.params.points.length}`;
					for (let p=0; p<cmd.params.points.length; p++) {
						cmd_str += `,${cmd.params.points[p][0]},${cmd.params.points[p][1]}`;
						// If we're at the last command, then use the terminator and line breaks
						if (p == cmd.params.points.length - 1) {
							cmd_str += `:\r\n`;
						}
					}
					break;
				case 'draw_circle':
					if (exp_fill_color !== cmd.params.color) {
						cmd_str += `G#C>2,${cmd.params.color}:\r\n`;
						exp_fill_color = cmd.params.color;
					}
					// !!! Need to add logic for handling IGS' "Hollow" command
					// which controls whether circle is drawn filled or as an outline. !!!
					cmd_str += `G#O>${cmd.params.center[0]},${cmd.params.center[1]},${cmd.params.radius}:\r\n`;
					break;
				case 'blit':
					// Right now I only support screen-to-screen blitting (type=0).
					cmd_str += `G#G>${cmd.params.type},${cmd.params.mode}`;
					for (let p=0; p<cmd.params.source_points.length; p++) {
						cmd_str += `,${cmd.params.source_points[p][0]},${cmd.params.source_points[p][1]}`;
					}
					for (let p=0; p<cmd.params.dest_points.length; p++) {
						cmd_str += `,${cmd.params.dest_points[p][0]},${cmd.params.dest_points[p][1]}`;
						// If we're at the last command, then use the terminator and line breaks
						if (p == cmd.params.dest_points.length - 1) {
							cmd_str += `:\r\n`;
						}
					}
					break;
			}
		}

		// OPTIMIZATIONS

		// POINTS

		// Let's search for groups of two consecutive Point commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#P>(\d+,\d+):\r\nG#P>(\d+,\d+):\r\n/g,
			'G#P>$1:P>$2:\r\n'
		)
		// Now let's search for groups of three lines with two consecutive Point commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#P>(\d+,\d+):P>(\d+,\d+):\r\nG#P>(\d+,\d+):P>(\d+,\d+):\r\nG#P>(\d+,\d+):P>(\d+,\d+):\r\n/g,
			'G#P>$1:P>$2:P>$3:P>$4:P>$5:P>$6:\r\n'
		)
		// Finally let's search for groups of two lines with two consecutive Point commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#P>(\d+,\d+):P>(\d+,\d+):\r\nG#P>(\d+,\d+):P>(\d+,\d+):\r\n/g,
			'G#P>$1:P>$2:P>$3:P>$4:\r\n'
		)

		// LINES

		// Let's search for groups of four consecutive Line commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#L>(\d+,\d+,\d+,\d+):\r\nG#L>(\d+,\d+,\d+,\d+):\r\n/g,
			'G#L>$1:L>$2:\r\n'
		)

		// Finally let's search for groups of two lines with two consecutive Line commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#L>(\d+,\d+,\d+,\d+):L>(\d+,\d+,\d+,\d+):\r\nG#L>(\d+,\d+,\d+,\d+):L>(\d+,\d+,\d+,\d+):\r\n/g,
			'G#L>$1:L>$2:L>$3:L>$4:\r\n'
		)

		// BOXES

		// Let's search for groups of two consecutive Box commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#B>(\d+,\d+,\d+,\d+,\d+):\r\nG#B>(\d+,\d+,\d+,\d+,\d+):\r\n/g,
			'G#B>$1:B>$2:\r\n'
		)
		// Now let's search for groups of three lines with two consecutive Box commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#B>(\d+,\d+,\d+,\d+,\d+):B>(\d+,\d+,\d+,\d+,\d+):\r\nG#B>(\d+,\d+,\d+,\d+,\d+):B>(\d+,\d+,\d+,\d+,\d+):\r\nG#B>(\d+,\d+,\d+,\d+,\d+):B>(\d+,\d+,\d+,\d+,\d+):\r\n/g,
			'G#B>$1:B>$2:B>$3:B>$4:B>$5:B>$6:\r\n'
		)
		// Finally let's search for groups of two lines with two consecutive Box commands and combine them onto a single line.
		cmd_str = cmd_str.replace(
			/G#B>(\d+,\d+,\d+,\d+,\d+):B>(\d+,\d+,\d+,\d+,\d+):\r\nG#B>(\d+,\d+,\d+,\d+,\d+):B>(\d+,\d+,\d+,\d+,\d+):\r\n/g,
			'G#B>$1:B>$2:B>$3:B>$4:\r\n'
		)



		const a = document.createElement('a');
		const type = filename.split('.').pop();
		a.href = URL.createObjectURL( new Blob([cmd_str], { type:`text/${type === 'txt' ? 'plain' : type}` }) );
		a.download = filename;
		a.click();
	}

}




const renderer = {
	cls: function() {
		virtual_canvas.reset_data();
	},
	render: function() {
		debug('!!! RENDER() BEGIN');
		debug(`   - history.past.length: ${history.past.length}`);

		// Set state as rendering
		current_state = 'rendering';

		// Iterate over command history
		for (let i=0; i<history.past.length; i++) {
			const cmd = history.past[i];

			debug(`   - ${cmd.action}`);
			renderer[cmd.action](cmd.params);

			if (i == 0 && cmd.action == 'set_resolution') {
				this.cls();
			}
		}
		// End with current command
		renderer[history.present.action](history.present.params);

		// We're only going to do this once at the end of the render.
		virtual_canvas.draw(context);

		// Make sure loupe is refreshed, so it doesn't go blank after undo/redo, etc.
		update_loupe();

		// Reset state
		current_state = 'start';
		debug('!!! RENDER() END');
	},
	update_tool: function(tool_name) {
		document.querySelector('.widget-tools select').value = tool_name;
		document.querySelector('.widget-tools select').dispatchEvent(new Event('change'));
	},
	set_resolution: function(params) {
		let resolution_slug = resolutions[params.resolution].slug;
		set_resolution_palette(resolution_slug, params.palette_id, starting_new=false);
	},
	set_color: function(params) {
		// Manually trigger a click on the color we're choosing so it will be selected in the interface
		document.querySelectorAll('.widget-colors .palette-button')[params.color].dispatchEvent(new Event('click'));
		// // This is probably unnecessary since this gets set in the click handler.
		// set_color(params.color, context, 1);
	},
	change_color: function(params) {
		change_palette_color(context, params.index, [params.r, params.g, params.b]);
	},
	change_drawing_mode: function(params) {
		// Manually trigger a click on the drawing mode we're choosing so it will be selected in the interface
		document.querySelector('.widget-drawing-mode select').value = params.mode;
		document.querySelector('.widget-drawing-mode select').dispatchEvent(new Event('change'));
	},
	change_pattern: function(params) {
		// Manually trigger a click on the pattern we're choosing so it will be selected in the interface
		document.querySelector('.widget-patterns select').value = fill_patterns.find(d => d.slug == params.pattern).id;
		document.querySelector('.widget-patterns select').dispatchEvent(new Event('change'));

		document.querySelector('#fill-border').checked = Boolean(params.border_flag);
		document.querySelector('#fill-border').dispatchEvent(new Event('change'));

		// // Set global current_pattern to new value.
		// current_pattern = fill_patterns.find(d => d.slug == params.pattern);

		// // Set global border_flag to new value.
		// border_flag = params.border_flag;
	},
	draw_point: function(params) {
		this.update_tool('draw_point');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Draw the point
		for (point of params.points) {
			// Use set_pixel() directly rather than fill_pixel().
			// Polymarkers don't need to respect fill patterns.
			set_pixel('virtual', point[0], point[1]);
		}

	},
	draw_line: function(params) {
		this.update_tool('draw_line');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Draw the line
		bresenhamLine('virtual', params.points[0][0], params.points[0][1], params.points[1][0], params.points[1][1]);
	},
	draw_polyline: function(params) {
		this.update_tool('draw_polyline');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Draw first segment
		bresenhamLine('virtual', params.points[0][0], params.points[0][1], params.points[1][0], params.points[1][1]);

		// Draw remaining segments
		for (let p=1; p<params.points.length-1; p++) {
			bresenhamLine('virtual', params.points[p][0], params.points[p][1], params.points[p+1][0], params.points[p+1][1]);
		}
	},
	draw_rect: function(params) {
		this.update_tool('draw_rect');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Fill_rect wants all four corners, but history saves only upper left and lower right.
		const corners = [
			params.points[0], 
			[params.points[1][0], params.points[0][1]], 
			params.points[1], 
			[params.points[0][0], params.points[1][1]], 
		];

		// Draw the rectangle with fill
		fill_rect('virtual', corners);

		// Draw the edges of the rectangle atop the fill, if border_flag is true
		if (border_flag) {
			bresenhamLine('virtual', params.points[0][0], params.points[0][1], params.points[1][0], params.points[0][1]);
			bresenhamLine('virtual', params.points[1][0], params.points[0][1], params.points[1][0], params.points[1][1]);
			bresenhamLine('virtual', params.points[1][0], params.points[1][1], params.points[0][0], params.points[1][1]);
			bresenhamLine('virtual', params.points[0][0], params.points[1][1], params.points[0][0], params.points[0][1]);
		}
	},

	draw_circle: function(params) {
		this.update_tool('draw_circle');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Draw the rectangle with fill
		fill_circle('virtual', params.center[0], params.center[1], params.radius);

		// Draw the edges of the rectangle atop the fill, if border_flag is true
		if (border_flag) {
			draw_circle('virtual', params.center[0], params.center[1], params.radius);
		}
	},
	draw_polygon: function(params) {
		this.update_tool('draw_polygon');

		// Fill the polygon
		fill_poly_vdi('virtual', params.points);

		// Draw the edges of the polygon, if border_flag is true
		if (border_flag) {
			// Iterate over all points and draw segments between them
			if (params.points.length > 1) {
				for (let i=0; i<params.points.length; i++) {
					let j=i+1;
					if (i == params.points.length-1) { j=0; }
					bresenhamLine(
						'virtual',
						params.points[i][0],
						params.points[i][1],
						params.points[j][0],
						params.points[j][1]
					);
				}
			}
		}
	},
	blit: function(params) {
		this.update_tool('blit');

		// blit_rect wants all four corners, but history saves only upper left and lower right.
		const source_corners = [
			params.source_points[0], 
			[params.source_points[1][0], params.source_points[0][1]], 
			params.source_points[1], 
			[params.source_points[0][0], params.source_points[1][1]], 
		];

		blit_rect('virtual', source_corners, params.dest_points, params.mode);

	},


	change_font: function(params) {
		// Manually trigger a click on the pattern we're choosing so it will be selected in the interface
		document.querySelector('.widget-fonts select').value = fonts.find(d => d.point == params.font).id;
		document.querySelector('.widget-fonts select').dispatchEvent(new Event('change'));

		// TK TK TK: effects and rotation
	},
	write_text: function(params) {
		this.update_tool('write_text');

		// Put text on the screen
		write_text_vdi('virtual', params.text, params.points);
	}
}


const tool_functions = {
	draw_point: {
		points: [],
		init: function() {},
		onclick: function(event) {
			debug(`draw_point click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Add this action to our history stack.
			history.add({
				action: 'draw_point',
				params: {
					color: virtual_canvas.get_color(),
					points: [
						[px, py]
					]
				}
			});

			// Redraw everything
			renderer.render();

			// Reset state and variables
			current_state = 'start';
		},
		// ondblclick: function(event) {
		// }, 
		onrightclick: function(event) {
			// Clear live-drawing canvas
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			// Redraw everything
			renderer.render();

			// Reset state and variables
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`draw_point mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;

			let [px, py] = translate_to_screen(sx, sy);

			// Clear live-drawing and cursor canvases
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		},
		ondrag: function(event) {
			if (current_state == 'start' || current_state == null) {
				current_state = 'drawing';
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			let new_pixels = [[px, py]];
			if (tool_functions.draw_point.points.length > 0) {
				let origin = tool_functions.draw_point.points.at(-1);
				new_pixels = getBresenhamLinePixels(context, origin[0], origin[1], px, py);
			}

			for (pixel of new_pixels) {
				tool_functions.draw_point.points.push(pixel);
			}

			// Clear live-drawing and cursor canvases
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			// Draw the temporary points
			set_color(virtual_canvas.get_color(), liveContext, 1);
			for (point of tool_functions.draw_point.points) {
				// Use set_pixel() directly rather than fill_pixel().
				// Polymarkers don't need to respect fill patterns.
				set_pixel(liveContext, point[0], point[1]);
			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);

		},
		ondragend: function(event) {
			debug(`draw_point dragend\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			tool_functions.draw_point.points.push([px, py]);

			// Remove duplicate points from the array
			tool_functions.draw_point.points = Array.from(new Set(tool_functions.draw_point.points.map(JSON.stringify)), JSON.parse);

			// MAY WANT TO CONSIDER ALGORITHM TO CONVERT THESE POINTS INTO LINES/POLYLINES WHERE POSSIBLE

			// Add this action to our history stack.
			history.add({
				action: 'draw_point',
				params: {
					color: virtual_canvas.get_color(),
					points: tool_functions.draw_point.points
				}
			});

			// Redraw everything
			renderer.render();

			// Reset state and variables
			origin_x = null;
			origin_y = null;
			tool_functions.draw_point.points = [];
			current_state = 'start';
		},

	},

	draw_line: {
		init: function() {},
		onclick: function(event) {
			debug(`draw_line click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				origin_x = px;
				origin_y = py;
			}

			// Drawing state means second click
			else if (current_state == 'drawing') {
				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// Add this action to our history stack.
				history.add({
					action: 'draw_line',
					params: {
						color: virtual_canvas.get_color(),
						points: [
							[origin_x, origin_y],
							[px, py]
						]
					}
				});

				// Redraw everything
				renderer.render();

				// Reset state and variables
				origin_x = null;
				origin_y = null;
				current_state = 'start';
			}
		},
		// ondblclick: function(event) {
		// }, 
		onrightclick: function(event) {
			// Clear live-drawing canvas
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			// Redraw everything
			renderer.render();

			// Reset state and variables
			origin_x = null;
			origin_y = null;
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`draw_line mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			// Clear live-drawing and cursor canvases
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// Draw the temporary line
				set_color(virtual_canvas.get_color(), liveContext, 1);
				bresenhamLine(liveContext, origin_x, origin_y, px, py);
			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},

	draw_polyline: {
		points: [],
		init: function() {},
		onclick: function(event) {
			debug(`draw_polyline click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				origin_x = px;
				origin_y = py;
			}

			// Drawing state means second click
			else if (current_state == 'drawing') {
				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// Set the origin and variables
				origin_x = px;
				origin_y = py;
				current_state = 'drawing';
			}
			tool_functions.draw_polyline.points.push([px, py]);
		},
		// ondblclick: function(event) {
		// }, 
		// When we see a right click, that's the end of this polyline.
		onrightclick: function(event) {
			debug(`draw_polyline right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			// Clear live-drawing canvas
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			// Only add this action to our history stack if we have at least three points,
			// otherwise this is a line, not a polyline, and will make errors on an Atari.
			if (tool_functions.draw_polyline.points.length > 2) {
				// Add this action to our history stack.
				history.add({
					action: 'draw_polyline',
					params: {
						color: virtual_canvas.get_color(),
						'points': tool_functions.draw_polyline.points
					}
				});
			}

			// Redraw everything
			renderer.render();

			// Reset all variables
			origin_x = null;
			origin_y = null;
			tool_functions.draw_polyline.points = [];
			current_state = 'start';

		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`draw_polyline mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Set up the live context
				set_color(virtual_canvas.get_color(), liveContext, 1);

				// Draw previous segments of the polyline
				draw_polyline(liveContext, tool_functions.draw_polyline.points);

				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// Draw the new segment
				bresenhamLine(liveContext, origin_x, origin_y, px, py);
			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},

	draw_rect: {
		points: [],
		init: function() {},
		onclick: function(event) {
			debug(`draw_rect click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				// Mark origin of the rect
				origin_x = px;
				origin_y = py;

				// We're not going to add all four points, but just the origin and the extent.
				tool_functions.draw_rect.points.push([px, py]);
			}

			// Drawing state means second click. Time to draw the rect.
			else if (current_state == 'drawing') {
				// We're not going to add all four points, but just the origin and the extent.
				tool_functions.draw_rect.points.push([px, py]);

				// Reset the cursor layer to get rid of the guide line
				clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
				clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
				draw_cursor(0, px, py);

				// Add this action to our history stack.
				history.add({
					action: 'draw_rect',
					params: {
						color: virtual_canvas.get_color(),
						'points': tool_functions.draw_rect.points
					}
				});

				// Reset all variables
				origin_x = null;
				origin_y = null;
				tool_functions.draw_rect.points = [];
				current_state = 'start';

				// Redraw everything
				renderer.render();
			}
		},
		// ondblclick: function(event) {
		// }, 
		// When we see a right click, we need to cancel the rectangle.
		onrightclick: function(event) {
			debug(`draw_rect right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Reset the cursor layer to get rid of the guide line
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
			draw_cursor(0, px, py);

			if (current_state == 'drawing') {

				// Reset all variables
				origin_x = null;
				origin_y = null;
				tool_functions.draw_rect.points = [];
			}
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`draw_rect mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Draw the edges of the temporary rectangle
				set_color(virtual_canvas.get_color(), liveContext, 1);
				bresenhamLine(liveContext, origin_x, origin_y, px, origin_y);
				bresenhamLine(liveContext, px, origin_y, px, py);
				bresenhamLine(liveContext, px, py, origin_x, py);
				bresenhamLine(liveContext, origin_x, py, origin_x, origin_y);
			}
			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},

	draw_circle: {
		center: null,
		radius: null,
		init: function() {},
		onclick: function(event) {
			debug(`draw_circle click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				// Mark origin of the circle
				origin_x = px;
				origin_y = py;

				// Add the center
				tool_functions.draw_circle.center = [px, py];
			}

			// Drawing state means second click. Time to draw the rect.
			else if (current_state == 'drawing') {
				// Find the radius based from origin to this second point.
				let radius = get_distance(origin_x, origin_y, px, py);

				// We're not going to add all four points, but just the origin and the extent.
				tool_functions.draw_circle.radius = radius;

				// Reset the cursor layer to get rid of the guide line
				clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
				clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
				draw_cursor(0, px, py);

				// Add this action to our history stack.
				history.add({
					action: 'draw_circle',
					params: {
						color: virtual_canvas.get_color(),
						center: tool_functions.draw_circle.center,
						radius: tool_functions.draw_circle.radius
					}
				});

				// Reset all variables
				origin_x = null;
				origin_y = null;
				tool_functions.draw_circle.center = null;
				tool_functions.draw_circle.radius = null;
				current_state = 'start';

				// Redraw everything
				renderer.render();
			}
		},
		// ondblclick: function(event) {
		// }, 
		// When we see a right click, we need to cancel the rectangle.
		onrightclick: function(event) {
			debug(`draw_circle right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Reset the cursor layer to get rid of the guide line
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
			draw_cursor(0, px, py);

			if (current_state == 'drawing') {

				// Reset all variables
				origin_x = null;
				origin_y = null;
				tool_functions.draw_circle.center = null;
				tool_functions.draw_circle.radius = null;
			}
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`draw_circle mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Draw the edges of the temporary rectangle
				set_color(virtual_canvas.get_color(), liveContext, 1);

				// Find the radius based from origin to this second point.
				let radius = get_distance(origin_x, origin_y, px, py);

				draw_circle(liveContext, origin_x, origin_y, radius);
			}
			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},

	draw_polygon: {
		points: [],
		init: function() {},
		onclick: function(event) {
			debug(`draw_polygon click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				// Mark origin of the line
				origin_x = px;
				origin_y = py;
				// Mark beginning of entire polygon so we can close it later.
				polygon_start_x = px;
				polygon_start_y = py;
			}

			// Drawing state means second click
			else if (current_state == 'drawing') {
				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// Reset the origin
				origin_x = px;
				origin_y = py;
				current_state = 'drawing';
			}

			tool_functions.draw_polygon.points.push([px, py]);
		},
		// ondblclick: function(event) {
		// }, 
		// When we see a right click, it's time to close this polygon.
		onrightclick: function(event) {
			debug(`draw_polygon right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Reset the cursor layer to get rid of the guide line
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
			draw_cursor(0, px, py);

			if (current_state == 'drawing') {

				// Only add this action to our history stack if we have at least three points,
				// otherwise this is a line, not a polygon, and will make errors on an Atari.
				if (tool_functions.draw_polygon.points.length > 2) {
					// Add this action to our history stack.
					history.add({
						action: 'draw_polygon',
						params: {
							color: virtual_canvas.get_color(),
							'points': tool_functions.draw_polygon.points
						}
					});
				}

				// Redraw everything
				renderer.render();

				// Reset all variables
				origin_x = null;
				origin_y = null;
				polygon_start_x = null;
				polygon_start_y = null;
				tool_functions.draw_polygon.points = [];
			}
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`draw_polygon mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				set_color(virtual_canvas.get_color(), liveContext, 1);

				// Draw previous segments of the polyline
				draw_polyline(liveContext, tool_functions.draw_polygon.points);

				// Draw the temporary line for current segment
				bresenhamLine(liveContext, origin_x, origin_y, px, py);
				set_color(virtual_canvas.get_color(), liveContext, 1);
			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},

	blit: {
		source_points: [],
		dest_points: [],
		source_width: null,
		source_height: null,
		type: 0, // Screen to screen
		mode: 3, // Replace mode (dest=S)
		init: function() {
			console.log('BLIT INIT!');
			// Display the modal
			document.querySelector('.modal-wrapper').classList.remove('hidden');
			document.querySelector('.widget-blit-picker').classList.remove('hidden');

			// Click handler for use-this-color button
			// These outer .hasAttribute() checks ensure we don't re-bind this event
			// when we render or replay the history (which can cascade).
			const start_blit_button = document.querySelector('.start-blit');

			// Enable the start button
			start_blit_button.disabled = false;

			if (!start_blit_button.hasAttribute('hasClickHandler')) {
				start_blit_button.addEventListener('click', function(event) {

					// Set the mode and type
					const selected_mode = parseInt(document.querySelector('#picker-mode').value);
					const selected_type = parseInt(document.querySelector('#picker-type').value);

					console.log(selected_type, selected_mode);

					tool_functions.blit.type = selected_type;
					tool_functions.blit.mode = selected_mode;

					// Close the modal
					document.querySelector('.modal-wrapper').classList.add('hidden');
					document.querySelector('.widget-blit-picker').classList.add('hidden');

				});
				start_blit_button.setAttribute('hasClickHandler', 'true');
			}
		},
		onclick: function(event) {
			console.log(`blit click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			debug(`blit click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				// Mark origin of the rect
				origin_x = px;
				origin_y = py;

				// Add origin. (We're not going to add all four points of the rect, but just the origin and extent.)
				tool_functions.blit.source_points.push([px, py]);
			}

			// Drawing state means second click. Time to draw the rect.
			else if (current_state == 'drawing') {
				current_state = 'moving';

				// Add extent. (We're not going to add all four source_points of the rect, but just the origin and extent.)
				tool_functions.blit.source_points.push([px, py]);

				tool_functions.blit.source_width = px - origin_x;
				tool_functions.blit.source_height = py - origin_y;

				// Reset the cursor layer to get rid of the guide lines
				clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
				clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
				draw_cursor(0, px, py);
			}

			// Moving state means third click. Time to blit the original rect.
			else if (current_state == 'moving') {
				// Check if shift key is being held.
				// If so, restrict movement to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// Add destination. Only upper left corner.
				tool_functions.blit.dest_points.push([px, py]);

				// Reset the cursor layer to get rid of the guide lines
				clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
				clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
				draw_cursor(0, px, py);


				// Add this action to our history stack.
				history.add({
					action: 'blit',
					params: {
						'type': tool_functions.blit.type, 
						'mode': tool_functions.blit.mode, 
						'source_points': tool_functions.blit.source_points,
						'dest_points': tool_functions.blit.dest_points
					}
				});

				// Reset all variables
				origin_x = null;
				origin_y = null;
				// // Once I add the ability to change blit modes and/or types, I will need to reset those values here.
				// tool_functions.blit.type = null;
				// tool_functions.blit.mode = null;
				tool_functions.blit.source_points = [];
				tool_functions.blit.dest_points = [];
				tool_functions.blit.source_width = null;
				tool_functions.blit.source_height = null;

				current_state = 'start';

				// Redraw everything
				renderer.render();
			}
		},
		// ondblclick: function(event) {
		// }, 
		// When we see a right click, we need to cancel the rectangle.
		onrightclick: function(event) {
			debug(`blit right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Reset the cursor layer to get rid of the guide line
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
			draw_cursor(0, px, py);

			if (current_state == 'drawing' || current_state == 'pasting') {
				// Reset all variables
				origin_x = null;
				origin_y = null;
				// // Once I add the ability to change blit modes and/or types, I will need to reset those values here.
				// tool_functions.blit.type = null;
				// tool_functions.blit.mode = null;
				tool_functions.blit.source_points = [];
				tool_functions.blit.dest_points = [];
				tool_functions.blit.source_width = null;
				tool_functions.blit.source_height = null;
			}
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`blit mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Draw the edges of the temporary rectangle

				// In this case (blitting), the user has not selected a fill or stroke color,
				// and the canvas palette might be set to the background color. 
				// So we'll use something different, then set it back to be safe.
				const orig_color = virtual_canvas.get_color();
				const temp_color = 15 - orig_color;

				set_color(temp_color, liveContext, 1);
				// Set XOR to true when drawing these lines. Ensures they will 
				// always be visible over the area we are tracing.
				bresenhamLine(liveContext, origin_x, origin_y, px, origin_y, true);
				bresenhamLine(liveContext, px, origin_y, px, py, true);
				bresenhamLine(liveContext, px, py, origin_x, py, true);
				bresenhamLine(liveContext, origin_x, py, origin_x, origin_y, true);
				set_color(orig_color, liveContext, 1);
			}

			if (current_state == 'moving') {
				// Check if shift key is being held.
				// If so, restrict movement to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				// blit_rect wants all four corners, but history saves only upper left and lower right.
				const source_corners = [
					tool_functions.blit.source_points[0], 
					[tool_functions.blit.source_points[1][0], tool_functions.blit.source_points[0][1]], 
					tool_functions.blit.source_points[1], 
					[tool_functions.blit.source_points[0][0], tool_functions.blit.source_points[1][1]], 
				];

				blit_rect(liveContext, source_corners, [[px, py]], tool_functions.blit.mode);

			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},

	write_text: {
		insertion_point: 0,
		points: [],
		text: '',
		last_mouse_pos: [],
		init: function() {},
		finish_text: function(pos) {
			if (pos == undefined) {
				pos = tool_functions.write_text.last_mouse_pos;
			}
			let px = pos[0];
			let py = pos[1];

			// Reset the cursor layer to get rid of the preview text
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
			draw_cursor(3, px, py);

			// Add this action to our history stack.
			history.add({
				action: 'write_text',
				params: {
					color: virtual_canvas.get_color(),
					effect: 0, // hard-coded for now
					rotation: 0, // hard-coded for now
					text: tool_functions.write_text.text,
					points: tool_functions.write_text.points
				}
			});

			// Reset all variables
			tool_functions.write_text.insertion_point = 0;
			tool_functions.write_text.points = [];
			tool_functions.write_text.text = '';
			tool_functions.write_text.last_mouse_pos = [];
			current_state = 'start';

			// Redraw everything
			renderer.render();
		},
		onclick: function(event) {
			debug(`write_text click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			tool_functions.write_text.last_mouse_pos = [px, py];

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';

				// Add the origin for the text
				tool_functions.write_text.points.push([px, py]);

				// Set up the live context for drawing insertion point
				set_color(1, liveContext, 1);
				draw_insertion_point(liveContext, tool_functions.write_text.points, tool_functions.write_text.insertion_point);

			}

			// We'll treat a second click as the end of text entry.
			else if (current_state == 'drawing') {
				tool_functions.write_text.finish_text([px, py]);
			}
		},
		// When we see a right click, we need to cancel the text.
		onrightclick: function(event) {
			debug(`write_text right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);
			[px, py] = checkBounds(context, px, py);

			// Reset the cursor layer to get rid of the guide line
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
			draw_cursor(3, px, py);

			if (current_state == 'drawing') {
				// Reset all variables
				tool_functions.write_text.insertion_point = 0;
				tool_functions.write_text.points = [];
				tool_functions.write_text.text = '';
				tool_functions.write_text.last_mouse_pos = [];
			}
			current_state = 'start';
		},
		mousemove: function(event) {
			if (debug_mousemove == true) {
				debug(`write_text mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			}

			let sx = event.layerX;
			let sy = event.layerY;
			let [px, py] = translate_to_screen(sx, sy);

			tool_functions.write_text.last_mouse_pos = [px, py];

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');

			// In this initial version I'm not supporting moving text around. 
			if (current_state == 'drawing') {
			}

			draw_cursor(3, px, py);
			update_loupe(px, py);
			update_status(px, py);
		},
		keydown: function(event) {
			debug(`write_text keydown\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (event.key == 'Spacebar') {
				tool_functions.write_text.text += ' ';
				if (tool_functions.write_text.insertion_point < tool_functions.write_text.text.length) {
					tool_functions.write_text.insertion_point += 1;
				}
			}
			else if (event.key == 'Return' || event.key == 'Enter') {
				tool_functions.write_text.finish_text();
			}
			else if (event.key == 'Backspace') {
				tool_functions.write_text.text = 
					tool_functions.write_text.text.substring(0,tool_functions.write_text.insertion_point-1) + 
					tool_functions.write_text.text.substring(tool_functions.write_text.insertion_point, tool_functions.write_text.insertion_point.length)
				;
				if (tool_functions.write_text.insertion_point > 0) {
					tool_functions.write_text.insertion_point -= 1;
				}
			}
			else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) {
				if (tool_functions.write_text.insertion_point > 0) {
					tool_functions.write_text.insertion_point -= 1;
				}
			}
			else if (['ArrowRight', 'ArrowDown'].includes(event.key)) {
				if (tool_functions.write_text.insertion_point < tool_functions.write_text.text.length) {
					tool_functions.write_text.insertion_point += 1;
				}
			}
			else {
				tool_functions.write_text.text = 
					tool_functions.write_text.text.substring(0, tool_functions.write_text.insertion_point) + 
					event.key + 
					tool_functions.write_text.text.substring(tool_functions.write_text.insertion_point)
				;
				if (tool_functions.write_text.insertion_point < tool_functions.write_text.text.length) {
					tool_functions.write_text.insertion_point += 1;
				}
			}

			if (current_state == 'drawing') {
				// Set up the live context
				set_color(virtual_canvas.get_color(), liveContext, 1);
				// Write the temporary letters
				write_text_vdi(liveContext, tool_functions.write_text.text, tool_functions.write_text.points);
				// Set up the live context for drawing insertion point
				set_color(1, liveContext, 1);
				draw_insertion_point(liveContext, tool_functions.write_text.points, tool_functions.write_text.insertion_point);
			}
		}
	}
}

document.querySelector('.widget-tools select').addEventListener('change', function(event) {
	// Once a tool has been chosen, let's removing pulsing circle.
	document.querySelector('.pulse-container').classList.remove('tool-unset');

	// But if colors remain unset, we need to add a circle to them.
	if (document.querySelectorAll('.widget-colors .palette-button.active').length == 0) {
		document.querySelector('.pulse-container').classList.add('color-unset');
	}

	const new_tool = this.value;
	current_tool = new_tool;

	if (current_state !== 'rendering') {
		current_state = 'start';
		tool_functions[current_tool].init();
	}

	if (current_tool !== null) {
		debug(`Event Listener: Tools change\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
	}

});


// Set up resolutions widget
for (let elem of resolutions) {
	let widget = document.querySelector('.widget-resolutions select');
	widget.insertAdjacentHTML('beforeend', `<option value="${elem.system}_${elem.mode}">${elem.name}</option>`);
}



document.querySelector('#show-overlay').addEventListener('click', function(event) {

	const show_overlay_flag = this.checked;

	if (show_overlay_flag == true || show_overlay_flag == 'true') {
		document.querySelector('#canvas-overlay').classList.remove('hidden');
	}
	else {
		document.querySelector('#canvas-overlay').classList.add('hidden');			
	}

});










function change_palette_color(ctx, current_color_index, new_color_array) {
	const new_color_rgb = atari_to_rgb(new_color_array);

	// Update global palette with new RGB values for this palette position
	virtual_canvas.update_palette(current_color_index, new_color_array);

	const new_color_str = `rgb(${new_color_rgb[0]}, ${new_color_rgb[1]}, ${new_color_rgb[2]})`;

	// Update color values in CSS variables
	root.style.setProperty(`--palette-color-${current_color_index}`, new_color_str);

	// // NOT SURE IF THIS IS STILL NECESSARY
	// ctx.fillStyle = new_color_str;

}



function atari_to_rgb(color_array) {
	return color_array.map(c => c*32);
}


function set_color(color_index, ctx, opacity=1) {

	const color_rgb = virtual_canvas.get_rgb_palette_color(color_index);

	debug(`set_color()  |  Index: ${color_index}  |  Color: ${color_rgb}`);

	ctx.fillStyle = `rgba(${color_rgb[0]}, ${color_rgb[1]}, ${color_rgb[2]}, ${opacity})`;
}



function get_distance(x1, y1, x2, y2) {
	let dx = x2 - x1;
	let dy = y2 - y1;
	return Math.round(Math.sqrt(dx * dx + dy * dy));
}


// This is a wrapper for set_pixel that checks against the pattern 
// to see if this specific pixel should be drawn or left hollow.
// Also checks drawing mode to check if "empty" pattern pixels 
// will render as color 0, or as transparent.
function fill_pixel(ctx, x, y) {
	// debug(`------------------------------`);
	// debug(`fill_pixel | x: ${x}, y: ${y}`);
	let px, py;
	let end_idx = current_pattern.array.length;

	if (x >= end_idx) {
		px = (x % end_idx);
	}
	else { px = x; }
	if (y >= end_idx) {
		py = (y % end_idx);
	}
	else { py = y; }

	// debug(`fill_pixel | px: ${px}, py: ${py}`);

	if (current_pattern.array[py][px] == 1) {
		set_pixel(ctx, x, y);
	}
	// If this is an "empty" pixel, we won't draw it if in "transparent" mode.
	// But if we're in "replace" mode, we'll render it as color 0.
	else {
		if (current_drawing_mode == 1) {
			set_color(0, ctx, 1);
			set_pixel(ctx, x, y, 0);
			set_color(virtual_canvas.get_color(), ctx, 1);
		}
		else if (current_drawing_mode == 2) {
			// pass
		}
	}


}


function set_pixel(ctx, x, y, idx=null) {
	if (idx == null) { idx = virtual_canvas.get_color(); }
	if (ctx == 'virtual') {
		virtual_canvas.set_pixel(x, y, idx);
	}
	else {
		ctx.fillRect(x, y, 1, 1);
	}
}





function draw_polyline(ctx, points) {
	if (points.length > 1) {
		for (let i=1; i<points.length; i++) {
			bresenhamLine(
				ctx,
				points[i-1][0],
				points[i-1][1],
				points[i][0],
				points[i][1]
			);
		}
	}
}





function getBresenhamLinePixels(ctx, x0, y0, x1, y1) {
	var points = [];
	var dx = Math.abs(x1-x0);
	var dy = Math.abs(y1-y0);
	var sx = (x0 < x1) ? 1 : -1;
	var sy = (y0 < y1) ? 1 : -1;
	var err = dx-dy;

	while(true) {
		points.push([x0,y0]);

		if ((x0==x1) && (y0==y1)) break;
		var e2 = 2*err;
		if (e2 >-dy){ err -= dy; x0  += sx; }
		if (e2 < dx){ err += dx; y0  += sy; }
	}

	return points;
}


function bresenhamLine(ctx, x0, y0, x1, y1, xor=false) {
	var dx = Math.abs(x1-x0);
	var dy = Math.abs(y1-y0);
	var sx = (x0 < x1) ? 1 : -1;
	var sy = (y0 < y1) ? 1 : -1;
	var err = dx-dy;

	while(true) {
		let idx = null;

		if (xor == true) {
			// The `& 0xF` part is a mask to keep only the lowest 4 bits of the result. 
			// This effectively limits it to an unsigned 4-bit integer, which is what
			// we need to get the same result as on the Atari ST. 
			idx = (~ virtual_canvas.get_pixel(x0, y0)) & 0xF;
			set_color(idx, ctx);
		}


		set_pixel(ctx, x0, y0, idx);

		if ((x0==x1) && (y0==y1)) break;
		var e2 = 2*err;
		if (e2 >-dy){ err -= dy; x0  += sx; }
		if (e2 < dx){ err += dx; y0  += sy; }
	}
}


// Temporary wrappers for circle functions until I can write proper ones.
function draw_circle(ctx, xm, ym, r) {
	bresenhamCircle(ctx, xm, ym, r);	
}

function fill_circle(ctx, xm, ym, r) {
	bresenhamCircle(ctx, xm, ym, r);	
}


function bresenhamCircle(ctx, xm, ym, r) {
	var x = -r, y = 0, err = 2-2*r;
	while (x<0) {
		set_pixel(ctx, xm-x, ym+y); /*   I. Quadrant */
		set_pixel(ctx, xm-y, ym-x); /*  II. Quadrant */
		set_pixel(ctx, xm+x, ym-y); /* III. Quadrant */
		set_pixel(ctx, xm+y, ym+x); /*  IV. Quadrant */
		r = err;
		if (r <= y) {
			err += ++y*2+1;           /* e_xy+e_y < 0 */
		}
		if (r > x || err > y) {
			err += ++x*2+1; /* e_xy+e_x > 0 or no 2nd y-step */
		}
	}
}




function plotEllipse(ctx, xm, ym, a, b) {
	var x = -a, y = 0;           /* II. quadrant from bottom left to top right */
	var e2 = b*b, err = x*(2*e2+x)+e2;         /* error of 1.step */

	while (x <= 0) {
		set_pixel(ctx, xm-x, ym+y);                                 /*   I. Quadrant */
		set_pixel(ctx, xm+x, ym+y);                                 /*  II. Quadrant */
		set_pixel(ctx, xm+x, ym-y);                                 /* III. Quadrant */
		set_pixel(ctx, xm-x, ym-y);                                 /*  IV. Quadrant */
		e2 = 2*err;
		if (e2 >= (x*2+1)*b*b)                           /* e_xy+e_x > 0 */
			err += (++x*2+1)*b*b;
		if (e2 <= (y*2+1)*a*a)                           /* e_xy+e_y < 0 */
			err += (++y*2+1)*a*a;
	}

	while (y++ < b) {                  /* too early stop of flat ellipses a=1, */
		set_pixel(ctx, xm, ym+y);                        /* -> finish tip of ellipse */
		set_pixel(ctx, xm, ym-y);
	}
}




function bresenhamBezierCurve(ctx, x0, y0, x1, y1, x2, y2) {                            
	var sx = x2-x1, sy = y2-y1;
	var xx = x0-x1, yy = y0-y1, xy;         /* relative values for checks */
	var dx, dy, err, cur = xx*sy-yy*sx;                    /* curvature */

	assert(xx*sx <= 0 && yy*sy <= 0);  /* sign of gradient must not change */

	if (sx*sx+sy*sy > xx*xx+yy*yy) { /* begin with longer part */ 
		x2 = x0; x0 = sx+x1; y2 = y0; y0 = sy+y1; cur = -cur;  /* swap P0 P2 */
	}  
	if (cur != 0) {                                    /* no straight line */
		xx += sx; xx *= sx = x0 < x2 ? 1 : -1;           /* x step direction */
		yy += sy; yy *= sy = y0 < y2 ? 1 : -1;           /* y step direction */
		xy = 2*xx*yy; xx *= xx; yy *= yy;          /* differences 2nd degree */
		if (cur*sx*sy < 0) {                           /* negated curvature? */
			xx = -xx; yy = -yy; xy = -xy; cur = -cur;
		}
		dx = 4.0*sy*cur*(x1-x0)+xx-xy;             /* differences 1st degree */
		dy = 4.0*sx*cur*(y0-y1)+yy-xy;
		xx += xx; yy += yy; err = dx+dy+xy;                /* error 1st step */    
		while (dy < dx ) {                              
			set_pixel(ctx, x0,y0);                                     /* plot curve */
			if (x0 == x2 && y0 == y2) return;  /* last pixel -> curve finished */
			y1 = 2*err < dx;                  /* save value for test of y step */
			if (2*err > dy) { x0 += sx; dx -= xy; err += dy += yy; } /* x step */
			if (    y1    ) { y0 += sy; dy -= xy; err += dx += xx; } /* y step */
		};           /* gradient negates -> algorithm fails */
	}
	bresenhamLine(ctx, x0, y0, x2, y2);                  /* plot remaining part to end */
} 





// function check_intersect(a, b) {
// 	// We only need to compare the X-coordinates, so let's flatten to one-dimensional by dropping Y coord.
// 	const c = a.map(point => point[0]);
// 	const d = b.map(point => point[0]);

// 	const intersection = c.filter(value => d.includes(value));

// 	if (intersection.length > 0) { return true; }

// 	return false;
// }


function draw_insertion_point(ctx, points, ip) {
	// By default text is left-aligned, so X coordinate is good as-is.
	let src_x = points[0][0];
	// By default text is baseline-aligned, so we have to calculate an offset to make sure font baseline is where user clicked.
	let src_y = points[0][1] - (current_font.form_height - current_font.bottom);

	let x_offset = ip * current_font.max_cell_width;

	let height = current_font.form_height;

	let x = src_x + x_offset;
	let y0 = src_y;
	let y1 = src_y + height;

	bresenhamLine(ctx, x, y0, x, y1);

}


function write_text_vdi(ctx, text, points) {
	let cw, ch;
	if (ctx == 'virtual') {
		cw = virtual_canvas.width;
		ch = virtual_canvas.height;
	}
	else {
		cw = ctx.canvas.width;
		ch = ctx.canvas.height;
	}

	// Split the string into an array of ASCII character codes
	let chars = text.split('').map(c => c.charCodeAt(0));

	// By default text is left-aligned, so X coordinate is good as-is.
	let src_x = points[0][0];
	// By default text is baseline-aligned, so we have to calculate an offset to make sure font baseline is where user clicked.
	let src_y = points[0][1] - (current_font.form_height - current_font.bottom);

	// Iterate over each character in the string
	for (let i=0; i<chars.length; i++) {
		// Load the raw character pixel data
		let char = chars[i];
		let char_data = current_font.characters[char];
		// Calculate the offset for this character 
		let x_offset = i * current_font.max_cell_width;

		// Iterate over each column in the character data
		for (var y=0; y<char_data.length; y++) {
			// Iterate over each row in this col of the character data
			for (var x=0; x<char_data[y].length; x++) {
				// Only proceed if this pixel is supposed to be drawn.
				if (char_data[y][x] == 1) {
					// Calculate the destination coordinates on the canvas
					let dx = src_x + x_offset + x;
					let dy = src_y + y;
					// Only set the pixel if it's within canvas bounds
					if (dx > -1 && dx < cw && dy > -1 && dy < ch) {
						set_pixel(ctx, dx, dy);
					}
				}
			}
		}
	}
}

function color_idx_to_pixel_val(c) {
	if (c == 0) { return 0; }
	else if (c == 1) { return 15; }
	else if (c == 2) { return 1; }
	else if (c == 3) { return 2; }
	else if (c == 4) { return 4; }
	else if (c == 5) { return 6; }
	else if (c == 6) { return 3; }
	else if (c == 7) { return 5; }
	else if (c == 8) { return 7; }
	else if (c == 9) { return 8; }
	else if (c == 10) { return 9; }
	else if (c == 11) { return 10; }
	else if (c == 12) { return 12; }
	else if (c == 13) { return 14; }
	else if (c == 14) { return 11; }
	else if (c == 15 ) { return 13; }
}

function pixel_val_to_color_idx(c) {
	if (c == 0) { return 0; }
	else if (c == 15) { return 1; }
	else if (c == 1) { return 2; }
	else if (c == 2) { return 3; }
	else if (c == 4) { return 4; }
	else if (c == 6) { return 5; }
	else if (c == 3) { return 6; }
	else if (c == 5) { return 7; }
	else if (c == 7) { return 8; }
	else if (c == 8) { return 9; }
	else if (c == 9) { return 10; }
	else if (c == 10) { return 11; }
	else if (c == 12) { return 12; }
	else if (c == 14) { return 13; }
	else if (c == 11) { return 14; }
	else if (c ==  13) { return 15; }
}



function blit_rect(ctx, corners, dest, mode) {
	let cw, ch;
	if (ctx == 'virtual') {
		cw = virtual_canvas.width;
		ch = virtual_canvas.height;
	}
	else {
		cw = ctx.canvas.width;
		ch = ctx.canvas.height;
	}

	const source_x0 = Math.min(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);
	const source_x1 = Math.max(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);

	const source_y0 = Math.min(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
	const source_y1 = Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);

	const offset_x = dest[0][0] - source_x0;
	const offset_y = dest[0][1] - source_y0;


	for (let y=source_y0; y<source_y1+1; y++) {
		for (let x=source_x0; x<source_x1+1; x++) {
			const dx = x+offset_x;
			const dy = y+offset_y;

			// Skip to next loop iteration if this destination pixel is not within canvas bounds.
			if (!(dx > -1 && dx < cw && dy > -1 && dy < ch)) {
				continue;
			}

			// Get the source and destination pixels.

			// NOTE: I storing these in virtual_canvas as color indices.
			// But to proprely perform logical operations for the blit, 
			// I first have to convert the color indices into pixel values. 
			// Then, after doing the math, I will convert them back.
			//
			// Reference tables here:
			// https://www.atarimagazines.com/v4n12/ControlGEM.php
			// https://bitsavers.computerhistory.org/pdf/atari/ST/Atari_ST_GEM_Programming_1986/GEM_0174.pdf

			const S = color_idx_to_pixel_val( virtual_canvas.get_pixel(x, y) );
			const D = color_idx_to_pixel_val( virtual_canvas.get_pixel(dx, dy) );

			let new_idx = null;

			// The `& 0xF` part is a mask to keep only the lowest 4 bits of the result. 
			// This effectively limits it to an unsigned 4-bit integer, which is what
			// we need to get the same result as on the Atari ST. 
			// (JS performs bitwise operations on signed 32-bit integers by default)

			if (mode == 0) {
				new_idx = 0;
			}
			else if (mode == 1) {
				new_idx = (S & D) & 0xF;
			}
			else if (mode == 2) {
				new_idx = (S & (~D)) & 0xF;
			}
			else if (mode == 3) {
				new_idx = (S) & 0xF;
			}
			else if (mode == 4) {
				new_idx = ((~S) & D) & 0xF;
			}
			else if (mode == 5) {
				new_idx = (D) & 0xF;
			}
			else if (mode == 6) {
				new_idx = (S ^ D) & 0xF;
			}
			else if (mode == 7) {
				new_idx = (S | D) & 0xF;
			}
			else if (mode == 8) {
				new_idx = (~(S | D)) & 0xF;
			}
			else if (mode == 9) {
				new_idx = (~(S ^ D)) & 0xF;
			}
			else if (mode == 10) {
				new_idx = (~ D) & 0xF;
			}
			else if (mode == 11) {
				new_idx = (S | (~D)) & 0xF;
			}
			else if (mode == 12) {
				new_idx = (~S) & 0xF;
			}
			else if (mode == 13) {
				new_idx = ((~S) | D) & 0xF;
			}
			else if (mode == 14) {
				new_idx = (~(S & D)) & 0xF;
			}
			else if (mode == 15) {
				new_idx = 1;
			}
			else {
				throw new Error('COULD NOT PARSE MODE.')
			}

			// Now that we've done the math, we need to convert from
			// pixel values back to color indices.
			new_idx = pixel_val_to_color_idx(new_idx);

			// To make the blit rectangle show up on mousemove, 
			// I have to explicitly set the color here.
			set_color(new_idx, ctx);

			set_pixel(ctx, dx, dy, new_idx);

		}
	}

}




function fill_rect(ctx, corners) {
	const x0 = Math.min(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);
	const x1 = Math.max(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);

	const y0 = Math.min(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
	const y1 = Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);

	for (let y=y0; y<y1+1; y++) {
		for (let x=x0; x<x1+1; x++) {
			fill_pixel(ctx, x, y);
		}
	}
}


// This function generates a filled polygon identical to VDI's `v_fillarea`.
// My code is based on the `clc_flit()` function in EmuTOS:
// https://github.com/emutos/emutos/blob/43d5f408babf826244b5c0d693271bc5cfcf0683/vdi/vdi_fill.c#L435

function fill_poly_vdi(ctx, points) {
	const MAX_VERTICES = 512;

	const y_coords = points.map(function(p) {return p[1]});

	const y_max = Math.max(...y_coords); // start row (bottom)
	const y_min = Math.min(...y_coords); // end row (top)

	// VDI apparently loops over the scan lines from bottom to top
	for (let y = y_max; y > y_min; y--) {

		// Set up counter for vector intersections
		let intersections = 0;

		// Set up a buffer for storing polygon edges that intersect the scan line
		let edge_buffer = [];

		// Loop over all vertices/points and find the intersections
		for (let i = 0; i < points.length; i++) {
			// Account for fact that final point connects to the first point
			let next_point = i+1;
			if (next_point == points.length) {
				next_point = 0;
			}

			// Convenience variables for endpoints
			const p1 = points[i];
			const p2 = points[next_point];

			const y1 = p1[1]; // Get Y-coord of 1st endpoint.
			const y2 = p2[1]; // Get Y-coord of 2nd endpoint.

			// Get Y delta of current vector/segment/edge
			const dy = y2 - y1;

			// If the current vector is horizontal (0), ignore it.
			if (dy) {

				// Calculate deltas of each endpoint with current scan line.
				const dy1 = y - y1;
				const dy2 = y - y2;

				// Determine whether the current vector intersects with
				// the scan line by comparing the Y-deltas we calculated
				// of the two endpoints from the scan line.
				//
				// If both deltas have the same sign, then the line does
				// not intersect and can be ignored.  The origin for this
				// test is found in Newman and Sproull.
				if ((dy1^dy2) < 0) {

					const x1 = p1[0]; // Get X-coord of 1st endpoint.
					const x2 = p2[0]; // Get X-coord of 2nd endpoint.

					// Calculate X delta of current vector
					const dx = (x2 - x1) << 1;  // Left shift so we can round by adding 1 below

					// Stop if we have reached the max number of verticies allowed (512)
					if (intersections >= MAX_VERTICES) {
						break;
					}

					intersections++;

					// Add X value for this vector to edge buffer
					if (dx < 0) {
						edge_buffer.push(((dy2 * dx / dy + 1) >> 1) + x2);
					}
					else {
						edge_buffer.push(((dy1 * dx / dy + 1) >> 1) + x1);
					}
				}
			}
		}


		// All of the points of intersection have now been found.  If there
		// were none (or one, which I think is impossible), then there is
		// nothing more to do.  Otherwise, sort the list of points of
		// intersection in ascending order.
		// (The list contains only the x-coordinates of the points.)

		if (intersections < 2) {
			continue;
		}


		// Sort the X-coordinates, so they are arranged left to right.
		// There are almost always exactly 2, except for weird shapes.
		edge_buffer = edge_buffer.sort((a,b) => a-b);

		// EmuTOS testers found that in Atari TOS the fill area always *includes*
		// the left and right perimeter (for those functions that allow the
		// perimeter to be drawn separately, it is drawn on top of the edge
		// pixels).  The routine below conforms to Atari TOS.

		// Loop through all edges in pairs, filling the pixels in between.
		let i = intersections / 2;
		let j = 0;
		while(i--) {
			/* grab a pair of endpoints */
			x1 = edge_buffer[j];
			x2 = edge_buffer[j+1];

			j = j + 2

			// ===============================================
			// As far as I can tell, I don't need any of this
			// clipping code.
			// ===============================================

			// // Handle clipping
			// if (attr->clip) {
			// 	if (x1 < clipper->xmn_clip) {
			// 		if (x2 < clipper->xmn_clip)
			// 			continue;           /* entire segment clipped left */
			// 		x1 = clipper->xmn_clip; /* clip left end of line */
			// 	}
			//
			// 	if (x2 > clipper->xmx_clip) {
			// 		if (x1 > clipper->xmx_clip)
			// 			continue;           /* entire segment clipped right */
			// 		x2 = clipper->xmx_clip; /* clip right end of line */
			// 	}
			// }
			// rect.x1 = x1;
			// rect.y1 = y;
			// rect.x2 = x2;
			// rect.y2 = y;
			//
			// // Rectangle fill routine draws horizontal line
			// draw_rect_common(attr, &rect);

			// Fill in all pixels horizontally from (x1, y) to (x2, y)
			for (k=x1; k<=x2; k++) {
				fill_pixel(ctx, k, y);
			}
		}
	}
}