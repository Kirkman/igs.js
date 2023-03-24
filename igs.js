// Root elements for manipulating styles
const root = document.documentElement;
const root_style = getComputedStyle(document.querySelector(':root'));
let canvas_width = parseInt(root_style.getPropertyValue('--canvas-width'));
let canvas_height = parseInt(root_style.getPropertyValue('--canvas-height'));
let scale_factor = parseInt(root_style.getPropertyValue('--scale-factor'));
let loupe_size = parseInt(root_style.getPropertyValue('--loupe-size'));

let debug_flag = true;

let current_tool = null;
let current_state = null;
let current_palette = null;
let current_pattern = null;
let current_color_index = null;
let current_drawing_mode = null;
let border_flag = null;
let origin_x = null;
let origin_y = null;

let polygon_start_x = null;
let polygon_start_y = null;





const canvasContainer = document.querySelector('.canvas-subcontainer');

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
	document.querySelector('.canvas-subcontainer').style.display = 'block';

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
	document.querySelector('.canvas-subcontainer').style.display = 'block';

	// Show the panes
	document.querySelector('.pane.disabled').classList.remove('disabled');

	// Get the user's choices
	const user_res_id = document.querySelector('.widget-resolutions select').value;
	const user_pal_id = document.querySelector('.widget-palettes select').value;

	set_resolution_palette(user_res_id, user_pal_id, starting_new=true);

});


// Set the screen resolution, and the color palette, either from user-defined selections, or from data from a loaded file.
function set_resolution_palette(res_id, pal_id, starting_new=false) {

	// Get the details of the user's chosen resolution
	const user_resolution = resolutions.filter(elem => elem.slug == res_id)[0];

	// Set canvas dimensions in CSS variable
	root.style.setProperty(`--canvas-width`, user_resolution.width);
	root.style.setProperty(`--canvas-height`, user_resolution.height);

	// Atari medium has double the horizontal pixels, but same same number of vertical pixels as Atari low, 
	// so the pixels in medium become more like vertical rectangles.
	if (user_resolution.slug == 'atari_st_medium') {
		root.style.setProperty(`--horizontal-scale`, 2);
		root.style.setProperty(`--vertical-scale`, 4);
	}

	// Set a pointer to the chosen color palette
	current_palette = user_resolution.palettes[pal_id].colors;
	current_color_index = 0;

	// Set up colors widget
	const widget = document.querySelector('.widget-colors .palette-wrapper');

	// First, empty any existing buttons
	widget.replaceChildren();

	// Now, add new buttons
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
		elem.addEventListener('click', function(event) {
			if (this.value !== null) {
				// Once a tool has been chosen, let's removing pulsing circle.
				document.querySelector('.pulse-container').classList.remove('color-unset');

				current_color_index = parseInt(this.value);
				debug(`Event Listener: Colors change  |  Color idx: ${current_color_index}`);
				// Toggle the active class on the buttons
				document.querySelectorAll('.widget-colors .palette-button').forEach((button)=> {
					button.classList.remove('active');
				});
				this.classList.add('active');

				if (current_state !== 'rendering') {
					// Add this action to our history stack.
					history.add({
						action: 'set_color',
						params: {
							color: current_color_index,
						}
					});
				}
				set_color(current_color_index, context);

			} // end if
		}); // end click handler

		elem.addEventListener('dblclick', function(event) {
			// Configure the color picker so the existing color is pre-set.
			const this_color_index = parseInt(this.value);
			const color_atari = current_palette[this_color_index];
			document.querySelector('#picker-red').value = color_atari[0];
			document.querySelector('#picker-green').value = color_atari[1];
			document.querySelector('#picker-blue').value = color_atari[2];
			document.querySelector('#picker-red').dispatchEvent(new Event('input'));

			// Display the modal
			document.querySelector('.modal-wrapper').classList.remove('hidden');
			document.querySelector('.widget-color-picker').classList.remove('hidden');
		}); // end click handler


	});


	// Populate the color picker with all possible Atari colors.	
	const color_picker_inputs = document.querySelector('.widget-color-picker .palette-squares');
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
		elem.addEventListener('click', function(event) {
			document.querySelector('#picker-red').value = parseInt(this.getAttribute('data-r'));
			document.querySelector('#picker-green').value = parseInt(this.getAttribute('data-g'));
			document.querySelector('#picker-blue').value = parseInt(this.getAttribute('data-b'));
			document.querySelector('#picker-red').dispatchEvent(new Event('input'));
		}); // end click handler
	});

	// Click handler for use-this-color button
	document.querySelector('.color-choose').addEventListener('click', function(event) {
		const r = parseInt(document.querySelector('#picker-red').value);
		const g = parseInt(document.querySelector('#picker-green').value);
		const b = parseInt(document.querySelector('#picker-blue').value);

		// change_palette_color(context, current_color_index, [r,g,b]);

		if (current_state !== 'rendering') {
			// Add this action to our history stack.
			history.add({
				action: 'change_color',
				params: {
					index: current_color_index,
					r: r,
					g: g,
					b: b,
				}
			});
		}

		// Close the modal
		document.querySelector('.modal-wrapper').classList.add('hidden');
		document.querySelector('.widget-color-picker').classList.add('hidden');
	});


	// Set a pointer to the chosen color pattern
	current_pattern = fill_patterns[1];

	// Set up patterns widget
	for (let i=0; i<fill_patterns.length; i++) {
		let pattern_obj = fill_patterns[i];

		// This requires the use of my custom "Atari Patterns" fontset.
		// Also, for maximum cross-platform compatibility, requires select to be set to "multiple" rather than typical dropdown.
		let icon_code = (59392 + i).toString(16);

		let widget = document.querySelector('.widget-patterns select');
		widget.insertAdjacentHTML('beforeend', `
			<option class="pattern-option pattern-${i}" value="${i}">&#x${icon_code}; ${pattern_obj.name}</option>
		`);
	}


	let canvas_bg_rgb = atari_to_rgb(current_palette[0]);

	// Set up the painting canvas
	canvas.width = user_resolution.width;
	canvas.height = user_resolution.height;
	disableSmoothing(context);
	clearCanvas(context, canvas, `rgb(${canvas_bg_rgb[0]}, ${canvas_bg_rgb[1]}, ${canvas_bg_rgb[2]})`);

	// Set up the live drawing canvas (showing in-progress lines as cursor moves)
	liveCanvas.width = user_resolution.width;
	liveCanvas.height = user_resolution.height;
	disableSmoothing(liveContext);
	clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

	// Set up the cursor overlay
	cursorCanvas.width = user_resolution.width;
	cursorCanvas.height = user_resolution.height;
	disableSmoothing(cursorContext);
	clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');

	// Set up the pattern canvas
	patternCanvas.width = user_resolution.width;
	patternCanvas.height = user_resolution.height;
	disableSmoothing(patternContext);
	clearCanvas(patternContext, patternCanvas, 'rgba(0,0,0,0)');


	// Set up the loupe
	loupeCanvas.width = 21;
	loupeCanvas.height = 21;
	disableSmoothing(loupeContext);
	clearCanvas(loupeContext, loupeCanvas, 'rgba(255,255,255,0)');


	// SET UP CANVAS CLICK HANDLERS
	canvasContainer.addEventListener('click', function(event) {
		event.stopPropagation();
		event.preventDefault();
		if (current_tool !== null) {
			debug(`Event Listener: Click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			tool_functions[current_tool].onclick(event);
		}
		return false;
	}, false);

	// AN APPROACH FOR DISAMBIGUATING CLICK FROM DOUBLE-CLICK CAN BE FOUND HERE:
	// https://stackoverflow.com/a/60177326/566307
	// ... it works well, but after trying it, I find the delay unacceptable. 
	// Going to have to live without double-click for completing polylines/polygons.

	// // SET UP CANVAS DOUBLE CLICK HANDLERS
	// canvasContainer.addEventListener('dblclick', function(event) {
	// 	if (current_tool !== null) {
	// 		console.log(`Event Listener: Double-click\t|\tTool: ${current_tool}`);
	// 		debug(`Event Listener: Double-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
	// 		tool_functions[current_tool].ondblclick(event);
	// 	}
	// 	return false;
	// }, false);

	// SET UP CANVAS RIGHT-CLICK HANDLERS
	canvasContainer.addEventListener('contextmenu', function(event) {
		event.stopPropagation();
		event.preventDefault();
		if (current_tool !== null) {
			debug(`Event Listener: Right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
			tool_functions[current_tool].onrightclick(event);
		}
		return false;
	}, false);


	// NEED TO REFACTOR ALL THIS TO CONVERT ACTUAL SCREEN COORDS TO CANVAS COORDINATES
	// (rather than use CSS to scale up, which makes mouse transitions from
	// the canvas back to the rest of the UI become weird)
	canvasContainer.addEventListener('mousemove', function(event) {
		if (current_tool !== 'rendering') {
			const px = event.layerX;
			const py = event.layerY;

			if (px <= canvas_width && py <= canvas_height) {
				if (current_tool !== null) {
					debug(`Event Listener: Mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);
					tool_functions[current_tool].mousemove(event);
				}
			}
			else {
				update_status(null,null);
			}
		}
		return false;
	}, false);

	canvasContainer.addEventListener('mouseout', function(event) {
		update_status(null,null);
		return false;
	}, false);



	// Click handler for save button
	const save_button = document.querySelector('.files-save-json');
	save_button.addEventListener('click', function(event) {
		event.preventDefault();
		history.save('illustration.json');
		return false;
	}, false);

	// Click handler for IG export button
	const export_button = document.querySelector('.files-export-ig');
	export_button.addEventListener('click', function(event) {
		event.preventDefault();
		history.export('illustration.ig');
		return false;
	}, false);


	// Change handler for pattern widget
	document.querySelector('.widget-patterns select').addEventListener('change', function(event) {
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

		debug(`Event Listener: patterns change  |  pattern: ${current_pattern.name}`);

	});

	// Change handler for fill-border input
	document.querySelector('#fill-border').addEventListener('change', function(event) {
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

		debug(`Event Listener: border_flag change  |  flag: ${border_flag}`);

	});


	// Change handler for pattern widget
	document.querySelector('.widget-drawing-mode select').addEventListener('change', function(event) {
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

		debug(`Event Listener: drawing mode change  |  mode: ${current_drawing_mode}`);

	});


	// Manually change the mode menu to select "Replace" as the default.
	document.querySelector('.widget-drawing-mode select').dispatchEvent(new Event('change'));

	// Manually change the pattern menu to select "Filled" as the default.
	document.querySelector('#fill-border').dispatchEvent(new Event('change'));

	// Next manually set the pattern select to 1, and trigger the change event.
	document.querySelector('.widget-patterns select').value = '1';
	document.querySelector('.widget-patterns select').dispatchEvent(new Event('change'));



	// Keydown handler for Cmd/Ctrl-Z (undo) and Shift-Cmd/Ctrl-Z (redo)
	window.addEventListener('keydown', function(evt) {
		evt.stopImmediatePropagation();
		// REDO
		if ((evt.key === 'Z' || evt.key === 'z') && (evt.ctrlKey || evt.metaKey) && evt.shiftKey) {
			history.redo();
			renderer.render();
		}
		// UNDO
		else if ((evt.key === 'Z' || evt.key === 'z') && (evt.ctrlKey || evt.metaKey)) {
			history.undo();
			renderer.render();
		}
	});

}





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

function draw_cursor(sprite_num, px, py) {
	const sprite_w = 16;
	const sprite_h = 16;

	// These values are good for crosshairs, which are odd to allow an empty center pixel.
	// Not sure if they will also be good for all other cursor icons.
	const icon_offset_x = 7;
	const icon_offset_y = 7;

	// NAIVE!!! THIS ROUTINE DOESN'T YET ACCOUNT FOR MULTIPLE ROWS ON THE SPRITE SHEET.
	const sprite_x = sprite_w * sprite_num;
	const sprite_y = sprite_w * sprite_num;

	const dx = px - icon_offset_x;
	const dy = py - icon_offset_y;

	cursorContext.drawImage(icon_sprites, sprite_x, sprite_y, sprite_w, sprite_h, dx, dy, sprite_w, sprite_h);
	// cursorContext.drawImage(icon_sprites,px,py);

}


function update_status(px, py) {
	let dx = '';
	let dy = '';
	if (px && py) {
		dx = px.toString();
		dy = py.toString();
	}
	document.querySelector('.status-x .status-value').textContent = dx;
	document.querySelector('.status-y .status-value').textContent = dy;
}

function update_loupe(px, py) {
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
	load: function(actions) {
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
		const obj_str = JSON.stringify(obj);

		const a = document.createElement('a');
		const type = filename.split('.').pop();
		a.href = URL.createObjectURL( new Blob([obj_str], { type:`text/${type === 'txt' ? 'plain' : type}` }) );
		a.download = filename;
		a.click();
	},
	// Export in IG format
	export: function(filename) {
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

		for (cmd of full_history) {
			switch (cmd.action) {
				case 'set_resolution':
					cmd_str += `G#R>${cmd.params.resolution},${cmd.params.sys_palette_flag}:\r\n`;
					break;
				// Need to redo the way I'm handling colors. Have to keep track of poly/line/fill/text.
				case 'set_color':
					cmd_str += `G#C>1,${cmd.params.color}:\r\n`;
					break;
				case 'change_color':
					cmd_str += `G#S>${cmd.params.index},${cmd.params.r},${cmd.params.g},${cmd.params.b}:\r\n`;
					break;
				case 'change_drawing_mode':
					cmd_str += `G#M>${cmd.params.mode}:\r\n`;
					break;
				case 'change_pattern':
					cmd_str += `G#A>${cmd.params.pattern},${cmd.params.border_flag}:\r\n`;
					break;
				case 'draw_point':
					cmd_str += `G#P>${cmd.params.points[0][0]},${cmd.params.points[0][1]}:\r\n`;
					break;
				case 'draw_line':
					cmd_str += `G#L>${cmd.params.points[0][0]},${cmd.params.points[0][1]},${cmd.params.points[1][0]},${cmd.params.points[1][1]}:\r\n`;
					break;
				case 'draw_polyline':
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
					// For now I'm manually setting fill color at draw time. This isn't efficient, and I'll need to revisit.
					cmd_str += `G#C>2,${cmd.params.color}:\r\n`;
					// IGS' BOX command includes 5th parameter for rounded corners. Right now I don't support that.
					cmd_str += `G#B>${cmd.params.points[0][0]},${cmd.params.points[0][1]},${cmd.params.points[1][0]},${cmd.params.points[1][1]},0:\r\n`;
					break;
				case 'draw_polygon':
					// For now I'm manually setting fill color at draw time. This isn't efficient, and I'll need to revisit.
					cmd_str += `G#C>2,${cmd.params.color}:\r\n`;
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
			}
		}


		const a = document.createElement('a');
		const type = filename.split('.').pop();
		a.href = URL.createObjectURL( new Blob([cmd_str], { type:`text/${type === 'txt' ? 'plain' : type}` }) );
		a.download = filename;
		a.click();
	}

}





const renderer = {
	cls: function() {
		let canvas_bg_rgb = atari_to_rgb(current_palette[0]);
		clearCanvas(context, canvas, `rgb(${canvas_bg_rgb[0]}, ${canvas_bg_rgb[1]}, ${canvas_bg_rgb[2]})`);
	},
	render: function() {
		debug('!!! RENDER() BEGIN');
		// Set state as rendering
		current_state = 'rendering';

		// Iterate over command history
		for (let i=0; i<history.past.length; i++) {
			const cmd = history.past[i];

			renderer[cmd.action](cmd.params);

			if (i == 0 && cmd.action == 'set_resolution') {
				this.cls();
			}
		}
		// End with current command
		renderer[history.present.action](history.present.params);
		// Reset state
		current_state = 'start';
		debug('!!! RENDER() END');
	},
	update_tool: function(tool_name) {
		document.querySelector('.widget-tools select').value = tool_name;
		document.querySelector('.widget-tools select').dispatchEvent(new Event('change'));
	},
	set_resolution: function(params) {
		// For now we'll default to low rez.
		set_resolution_palette('atari_st_low', params.palette_id, starting_new=false);
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
		fill_pixel(context, params.points[0][0], params.points[0][1]);
	},
	draw_line: function(params) {
		this.update_tool('draw_line');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Draw the line
		bresenhamLine(context, params.points[0][0], params.points[0][1], params.points[1][0], params.points[1][1]);
	},
	draw_polyline: function(params) {
		this.update_tool('draw_polyline');
		// My command history includes a `color` param, but I probably shouldn't be including that. 
		// For now I will ignore it in the renderer. If all is fine, then I'll strip that out.

		// Draw first segment
		bresenhamLine(context, params.points[0][0], params.points[0][1], params.points[1][0], params.points[1][1]);

		// Draw remaining segments
		for (let p=1; p<params.points.length-1; p++) {
			bresenhamLine(context, params.points[p][0], params.points[p][1], params.points[p+1][0], params.points[p+1][1]);
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
		fill_rect(context, corners);

		// Draw the edges of the rectangle atop the fill, if border_flag is true
		if (border_flag) {
			bresenhamLine(context, params.points[0][0], params.points[0][1], params.points[1][0], params.points[0][1]);
			bresenhamLine(context, params.points[1][0], params.points[0][1], params.points[1][0], params.points[1][1]);
			bresenhamLine(context, params.points[1][0], params.points[1][1], params.points[0][0], params.points[1][1]);
			bresenhamLine(context, params.points[0][0], params.points[1][1], params.points[0][0], params.points[0][1]);
		}
	},
	draw_polygon: function(params) {
		this.update_tool('draw_polygon');

		// Fill the polygon
		fill_poly(context, params.points);

		// Draw the edges of the polygon, if border_flag is true
		if (border_flag) {
			// Iterate over all points and draw segments between them
			if (params.points.length > 1) {
				for (let i=0; i<params.points.length; i++) {
					let j=i+1;
					if (i == params.points.length-1) { j=0; }
					bresenhamLine(
						context,
						params.points[i][0],
						params.points[i][1],
						params.points[j][0],
						params.points[j][1]
					);
				}
			}
		}
	}
}


const tool_functions = {
	draw_point: {
		onclick: function(event) {
			debug(`draw_point click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let [px, py] = checkBounds(context, event.layerX, event.layerY);

			// Add this action to our history stack.
			history.add({
				action: 'draw_point',
				params: {
					color: current_color_index,
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
			debug(`draw_point mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let px = event.layerX;
			let py = event.layerY;

			// Clear live-drawing and cursor canvases
			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px, py);
		}
	},
	draw_line: {
		onclick: function(event) {
			debug(`draw_line click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let [px, py] = checkBounds(context, event.layerX, event.layerY);

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
						color: current_color_index,
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
			debug(`draw_line mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let px = event.layerX;
			let py = event.layerY;

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
				set_color(current_color_index, liveContext, 1);
				bresenhamLine(liveContext, origin_x, origin_y, px, py);
				// set_color(current_color_index, liveContext, 1);
			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px,py);
		}
	},
	draw_polyline: {
		points: [],
		onclick: function(event) {
			debug(`draw_polyline click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let [px, py] = checkBounds(context, event.layerX, event.layerY);

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
			tool_functions.draw_polyline.points.push([px,py]);
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
						color: current_color_index,
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
			debug(`draw_polyline mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let px = event.layerX;
			let py = event.layerY;

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Set up the live context
				set_color(current_color_index, liveContext, 1);

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
			update_status(px,py);
		}
	},
	draw_rect: {
		points: [],
		onclick: function(event) {
			console.log(event);
			debug(`draw_rect click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			const [px, py] = checkBounds(context, event.layerX, event.layerY);

			// Start state means first click
			if (current_state == 'start') {
				current_state = 'drawing';
				// Mark origin of the rect
				origin_x = px;
				origin_y = py;

				// We're not going to add all four points, but just the origin and the extent.
				tool_functions.draw_rect.points.push([px,py]);
			}

			// Drawing state means second click. Time to draw the rect.
			else if (current_state == 'drawing') {
				// We're not going to add all four points, but just the origin and the extent.
				tool_functions.draw_rect.points.push([px,py]);

				// Reset the cursor layer to get rid of the guide line
				clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
				clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');
				draw_cursor(0, px, py);

				// Add this action to our history stack.
				history.add({
					action: 'draw_rect',
					params: {
						color: current_color_index,
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

			const [px, py] = checkBounds(context, event.layerX, event.layerY);

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
			debug(`draw_rect mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			const px = event.layerX;
			const py = event.layerY;

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Draw the edges of the temporary rectangle
				set_color(current_color_index, liveContext, 1);
				bresenhamLine(liveContext, origin_x, origin_y, px, origin_y);
				bresenhamLine(liveContext, px, origin_y, px, py);
				bresenhamLine(liveContext, px, py, origin_x, py);
				bresenhamLine(liveContext, origin_x, py, origin_x, origin_y);
				// set_color(current_color_index, liveContext, 1);
			}
			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px,py);
		}
	},

	draw_polygon: {
		points: [],
		onclick: function(event) {
			debug(`draw_polygon click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let [px, py] = checkBounds(context, event.layerX, event.layerY);

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

			tool_functions.draw_polygon.points.push([px,py]);
		},
		// ondblclick: function(event) {
		// }, 
		// When we see a right click, it's time to close this polygon.
		onrightclick: function(event) {
			debug(`draw_polygon right-click\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			const [px, py] = checkBounds(context, event.layerX, event.layerY);

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
							color: current_color_index,
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
			debug(`draw_polygon mousemove\t|\tTool: ${current_tool}\t|\tState: ${current_state}`);

			let px = event.layerX;
			let py = event.layerY;

			clearCanvas(cursorContext, cursorCanvas, 'rgba(0,0,0,0)');
			clearCanvas(liveContext, liveCanvas, 'rgba(0,0,0,0)');

			if (current_state == 'drawing') {
				// Check if shift key is being held.
				// If so, restrict line to multiples of 45 degrees.
				if (event.shiftKey) {
					[px, py] = convert_to_45_deg([origin_x, origin_y], [px, py]);
				}

				set_color(current_color_index, liveContext, 1);

				// Draw previous segments of the polyline
				draw_polyline(liveContext, tool_functions.draw_polygon.points);

				// Draw the temporary line for current segment
				bresenhamLine(liveContext, origin_x, origin_y, px, py);
				set_color(current_color_index, liveContext, 1);
			}

			draw_cursor(0, px, py);
			update_loupe(px, py);
			update_status(px,py);
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
	}

	if (current_tool !== null) {
		debug(`Event Listener: Tools change  |  Tool: ${current_tool}`);
		debug(`Event Listener: Tools change  |  State: ${current_state}`);
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







function update_canvas_colors(ctx, old_color_rgb, new_color_rgb) {
	const w = ctx.canvas.height;
	const h = ctx.canvas.width;

	let image_data = context.getImageData(0, 0, w, h);

	for (var i=0; i<image_data.data.length; i+=4) {
		// If pixel has old color, change it to the new color
		if (
			image_data.data[i] == old_color_rgb[0] &&
			image_data.data[i+1] == old_color_rgb[1] &&
			image_data.data[i+2] == old_color_rgb[2]
		) {
			image_data.data[i] = new_color_rgb[0];
			image_data.data[i+1] = new_color_rgb[1];
			image_data.data[i+2] = new_color_rgb[2];
		}
	}
	// Update the canvas with revised data
	ctx.putImageData(image_data, 0, 0);

}



function change_palette_color(ctx, current_color_index, new_color_array) {
	const old_color_array = current_palette[current_color_index];
	const old_color_rgb = atari_to_rgb(old_color_array);
	const new_color_rgb = atari_to_rgb(new_color_array);

	update_canvas_colors(ctx, old_color_rgb, new_color_rgb);

	current_palette[current_color_index] = new_color_array;

	const new_color_str = `rgb(${new_color_rgb[0]}, ${new_color_rgb[1]}, ${new_color_rgb[2]})`;

	// Set color values in CSS variables
	root.style.setProperty(`--palette-color-${current_color_index}`, new_color_str);

	// set_color(current_color_index, ctx);

}



function atari_to_rgb(color_array) {
	return color_array.map(c => c*32);
}


function set_color(color_index, ctx, opacity=1) {

	const color_atari = current_palette[color_index];
	const color_rgb = atari_to_rgb(color_atari);
	debug(`set_color()  |  Index: ${color_index}  |  Color: ${color_atari}`);

	ctx.fillStyle = `rgba(${color_rgb[0]}, ${color_rgb[1]}, ${color_rgb[2]}, ${opacity})`;
}


function rgba_to_word32(str) {
	let values = str.match(/rgba\((\d+), (\d+), (\d+), (\d+)\)/)
	debug(values);
	r = parseInt(values[1]);
	g = parseInt(values[2]);
	b = parseInt(values[3]);
	a = parseInt(values[4]); // May want to hardcode this as 255

	// Cast the r, g, b, a integer values to bytes
	r = r & 0xFF;
	g = g & 0xFF;
	b = b & 0xFF;
	a = a & 0xFF;

	debug(`  - r, g, b, a: ${r}, ${g}, ${b}, ${a}` );

	const color_code = (a << 24 >>> 0) + (b << 16 >>> 0) + (g <<  8 >>> 0) + (r >>> 0);
	debug(`  - word32: ${color_code}`);

	return color_code;
}

function fillstyle_to_word32(ctx) {
	let r, g, b, a;
	fillStyle = ctx.fillStyle;
	debug(`  - fillStyle: ${fillStyle}`);

	// If it's an rgba() style string, then use that function.
	if (!fillStyle.includes('#')) {
		return rgba_to_word32(fillStyle);
	}

	// Otherwise, if it's a hex string, parse here.
	r = parseInt(ctx.fillStyle.substring(1,3), 16);
	g = parseInt(ctx.fillStyle.substring(3,5), 16);
	b = parseInt(ctx.fillStyle.substring(5), 16);
	a = 255;

	// Cast the r, g, b, a integer values to bytes
	r = r & 0xFF;
	g = g & 0xFF;
	b = b & 0xFF;
	a = a & 0xFF;

	debug(`  - r, g, b, a: ${r}, ${g}, ${b}, ${a}` );

	const color_code = (a << 24 >>> 0) + (b << 16 >>> 0) + (g <<  8 >>> 0) + (r >>> 0);
	debug(`  - word32: ${color_code}`);

	return color_code;
}


function pixel_color_to_word32(ctx, x, y) {
	let pixel = ctx.getImageData(x, y, 1, 1);
	debug(pixel);

	// Get r, g, b, a integer values, but cast them to bytes
	const r = pixel.data[0] & 0xFF;
	const g = pixel.data[1] & 0xFF;
	const b = pixel.data[2] & 0xFF;
	const a = pixel.data[3] & 0xFF; // May want to hardcode this as 255
	debug(`  - r, g, b, a: ${r}, ${g}, ${b}, ${a}` );

	const color_code = (a << 24 >>> 0) + (b << 16 >>> 0) + (g <<  8 >>> 0) + (r >>> 0);
	debug(`  - word32: ${color_code}`);

	return color_code;
}


// This is a wrapper for set_pixel that checks against the pattern 
// to see if this specific pixel should be drawn or left hollow.
// Also checks drawing mode to check if "empty" pattern pixels 
// will render as color 0, or as transparent/
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
			set_pixel(ctx, x, y);
			set_color(current_color_index, ctx, 1);
		}
		else if (current_drawing_mode == 2) {
			// pass
		}
	}


}


var set_pixel = function (ctx, x, y) {
	ctx.fillRect(x, y, 1, 1);
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


function bresenhamLine(ctx, x0, y0, x1, y1) {
	var dx = Math.abs(x1-x0);
	var dy = Math.abs(y1-y0);
	var sx = (x0 < x1) ? 1 : -1;
	var sy = (y0 < y1) ? 1 : -1;
	var err = dx-dy;

	while(true) {
		set_pixel(ctx, x0,y0);

		if ((x0==x1) && (y0==y1)) break;
		var e2 = 2*err;
		if (e2 >-dy){ err -= dy; x0  += sx; }
		if (e2 < dx){ err += dx; y0  += sy; }
	}
}




function bresenhamCircle(ctx, xm,  ym,  r) {
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
	bresenhamLine(ctx, x0,y0, x2,y2);                  /* plot remaining part to end */
} 





function check_intersect(a, b) {
	// We only need to compare the X-coordinates, so let's flatten to one-dimensional by dropping Y coord.
	const c = a.map(point => point[0]);
	const d = b.map(point => point[0]);

	const intersection = c.filter(value => d.includes(value));

	if (intersection.length > 0) { return true; }

	return false;
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


function fill_poly(ctx, vertices) {
	// console.log(`points: ${points}`);

	let bresenham_line_pixels = [];
	if (vertices.length > 1) {
		for (let i=0; i<vertices.length; i++) {
			let j=i+1;
			if (i == vertices.length-1) { j=0; }
			bresenham_line_pixels.push(
				getBresenhamLinePixels(
					context,
					vertices[i][0],
					vertices[i][1],
					vertices[j][0],
					vertices[j][1]
				)
			);
		}
	}

	const num_lines = bresenham_line_pixels.length;

	const canvas_top = 0;
	const canvas_left = 0;
	const canvas_bottom = ctx.canvas.height;
	const canvas_right = ctx.canvas.width;

	// Holder for all pixels we determine we need to fill
	let pixels_to_fill = [];

	//  Loop through the rows of the image.
	for (let scan_line=canvas_top; scan_line<canvas_bottom; scan_line++) {

		// Find all the places where the bresenham lines intersect with this row/scanline
		let scan_intersections = bresenham_line_pixels.map(line => line.filter(pixel => pixel[1] == scan_line ).sort((a,b) => a[0] - b[0]));

		// Remove empty line arrays
		scan_intersections = scan_intersections.filter(line => line.length > 0);

		// Sort the intersections by X-coordinate, so they are arranged left to right
		scan_intersections = scan_intersections.sort(function(a,b) {
			if (a.length == 0) { return -1 }
			if (b.length == 0) { return -1 }
			return a[0][0] - b[0][0];
		});

		if (scan_intersections.length > 0) {
			debug(`scan_line: ${scan_line}`);
			debug(`    - intersections: ${scan_intersections}`);
			debug(`    - intersections[0]: ${scan_intersections[0]}`);
			debug(`    - intersections[1]: ${scan_intersections[1]}`);
			debug(scan_intersections);
		}

		// If there are an odd number of intersections, we need to intervene and coalesce either the first or last pair.
		if (scan_intersections.length > 1 && scan_intersections.length % 2) {
			debug('    - RESHAPING NEEDED');
			debug(check_intersect(scan_intersections[0], scan_intersections[1]));
			debug(check_intersect(scan_intersections[scan_intersections.length-2], scan_intersections[scan_intersections.length-1]));

			// Coalesce *opening* lines if they form a vertex/corner of the polygon
			if (check_intersect(scan_intersections[0], scan_intersections[1]) == true) {
				debug('    - COALESCING FIRST INTERSECTIONS');
				// Remove first line from the intersections
				const line1 = scan_intersections.shift();
				// Merge with new first line
				scan_intersections[0] = line1.concat(scan_intersections[0]);
				debug(scan_intersections);
			}

			// Coalesce *ending* lines if they form a vertex/corner of the polygon
			else if (check_intersect(scan_intersections[scan_intersections.length-2], scan_intersections[scan_intersections.length-1]) == true) {
				debug('    - COALESCING FINAL INTERSECTIONS');
				// Remove first line from the intersections
				const line1 = scan_intersections.pop();
				// Merge with new first line
				scan_intersections[scan_intersections.length-1] = scan_intersections[scan_intersections.length-1].concat(line1);
				debug(scan_intersections);
			}

			else {
				debug('    - FAILED BOTH TESTS');
				debug('    - SEARCHING FOR AN INTERSECTION TO COALESCE');
				let new_scan_intersections = [scan_intersections[0]];
				for (let i=1; i<scan_intersections.length; i++) {
					if (check_intersect(scan_intersections[i-1], scan_intersections[i]) != true) {
						new_scan_intersections.push(scan_intersections[i]);
					}
				}
				scan_intersections = new_scan_intersections;
				debug(new_scan_intersections);
			}
		}





		// Fill all the line pixels, and the pixels between the line pixels
		for (i=0; i<scan_intersections.length; i+=2) {
			// Add the pixels from the first intersection
			for (p of scan_intersections[i]) {
				pixels_to_fill.push(p);
			}
			// If this is final rightmost intersection, then there's nothing else to do.
			if (i == scan_intersections.length-1) {
				continue;
			}

			const int_0 = scan_intersections[i];
			const int_1 = scan_intersections[i+1];

			// Determine if we need to fill pixels between this intersection and the next.
			// We don't need to if these intersections already overlap.
			if (int_0[int_0.length-1] != int_1[0]) {
				const left_x = int_0[int_0.length-1][0];
				const right_x = int_1[0][0];
				for (x=left_x+1; x<right_x; x++) {
					pixels_to_fill.push([x,scan_line]);
				}
			}
			// Add the pixels from the second intersection
			for (p of scan_intersections[i+1]) {
				pixels_to_fill.push(p);
			}

		}
	}

	debug(pixels_to_fill);

	// alternate for correcting missing col: (scan_col=x_nodes[i]; scan_col<=x_nodes[i+1]; scan_col++)
	for (p of pixels_to_fill) { 
		fill_pixel(ctx, p[0], p[1]);
	}


}



