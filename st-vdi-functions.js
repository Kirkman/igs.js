// =============================================================================
// ATARI ST DRAWING ROUTINES
// These Javascript functions are based on those in the ST's TOS and VDI,
// producing lines, circles, and polygons that replicate the unique quirks
// seen on that platform.
//
// Sources: monout.c, isin.c, gsxasm1.S from https://github.com/th-otto/tos1x/
//
// These ports were produced with Claude AI assistance.
// =============================================================================

const MAX_ARC_CT = 128;

// ---------------------------------------------------------------------------
// SMUL_DIV -- Port of gsxasm1.S with 16-bit rounding overflow
// ---------------------------------------------------------------------------
function smul_div(m1, m2, d1) {
	m1 = (m1 << 16 >> 16);
	m2 = (m2 << 16 >> 16);
	d1 = (d1 << 16 >> 16);
	if (d1 === 0) return 0;
	const product = m1 * m2;
	let inc = (product >= 0) ? 1 : -1;
	let quotient = (product / d1) | 0;
	let remainder = product - quotient * d1;
	let divisor = d1;
	if (divisor < 0) { inc = -inc; divisor = -divisor; }
	if (remainder < 0) { remainder = -remainder; }
	let doubled = (remainder + remainder) & 0xFFFF;
	let ds = doubled; 
	if (ds >= 0x8000) { ds -= 0x10000; }
	let divs = divisor & 0xFFFF;
	if (divs >= 0x8000) { divs -= 0x10000; }
	if (ds >= divs) { quotient += inc; }
	return quotient;
}

// ---------------------------------------------------------------------------
// Isin / Icos -- Port of isin.c
// ---------------------------------------------------------------------------
const SIN_TBL = new Int16Array([
	    0,   572,  1144,  1716,  2286,  2856,  3425,  3993,
	 4560,  5126,  5690,  6252,  6813,  7371,  7927,  8481,
	 9032,  9580, 10126, 10668, 11207, 11743, 12275, 12803,
	13328, 13848, 14364, 14876, 15383, 15886, 16383, 16876,
	17364, 17846, 18323, 18794, 19260, 19720, 20173, 20621,
	21062, 21497, 21925, 22347, 22762, 23170, 23571, 23964,
	24351, 24730, 25101, 25465, 25821, 26169, 26509, 26841,
	27165, 27481, 27788, 28087, 28377, 28659, 28932, 29196,
	29451, 29697, 29934, 30162, 30381, 30591, 30791, 30982,
	31163, 31335, 31498, 31650, 31794, 31927, 32051, 32165,
	32269, 32364, 32448, 32523, 32587, 32642, 32687, 32722,
	32747, 32762, 32767, 32767
]);

const HALFPI = 900, PI = 1800, TWOPI = 3600;

function Isin(ang) {
	while (ang > 3600) ang -= 3600;
	const quadrant = Math.trunc(ang / HALFPI);
	switch (quadrant) {
		case 0:                    break;
		case 1: ang = PI - ang;    break;
		case 2: ang -= PI;         break;
		case 3: ang = TWOPI - ang; break;
		case 4: ang -= TWOPI;      break;
	}
	const index = Math.trunc(ang / 10);
	const remainder = ang % 10;
	let tmpsin = SIN_TBL[index];
	if (remainder !== 0) {
		tmpsin += Math.trunc(((SIN_TBL[index + 1] - tmpsin) * remainder) / 10);
	}
	if (quadrant > 1) { tmpsin = -tmpsin; }
	return tmpsin;
}

function Icos(ang) {
	ang += HALFPI;
	if (ang > TWOPI) { ang -= TWOPI; }
	return Isin(ang);
}

// ---------------------------------------------------------------------------
// clc_nsteps
// ---------------------------------------------------------------------------
function clc_nsteps(xrad, yrad) {
	const minArc = 32;
	let n_steps = (xrad > yrad) ? xrad : yrad;
	n_steps = n_steps >> 2;
	if (n_steps < minArc) { n_steps = minArc; }
	else if (n_steps > MAX_ARC_CT) { n_steps = MAX_ARC_CT; }
	return n_steps;
}

// ---------------------------------------------------------------------------
// Calc_pts -- compute one arc point
// ---------------------------------------------------------------------------
function calc_pt(angle, xc, yc, xrad, yrad) {
	const x = smul_div(Icos(angle), xrad, 32767) + xc;
	const y = yc - smul_div(Isin(angle), yrad, 32767);
	return [x, y];
}

// ---------------------------------------------------------------------------
// clc_arc -- core point generation (single arc from beg_ang to end_ang)
// Returns array of [x,y] points (n_steps + 1 points)
// ---------------------------------------------------------------------------
function clc_arc_pts(xc, yc, xrad, yrad, beg_ang, end_ang, del_ang, n_steps) {
	const points = [];
	const start = beg_ang;

	// First point
	points.push(calc_pt(beg_ang, xc, yc, xrad, yrad));

	// Inner loop: i=1 ... n_steps-1
	for (let i = 1; i < n_steps; i++) {
		const angle = smul_div(del_ang, i, n_steps) + start;
		points.push(calc_pt(angle, xc, yc, xrad, yrad));
	}

	// Final point forced to end_ang
	points.push(calc_pt(end_ang, xc, yc, xrad, yrad));

	return points;
}

// ---------------------------------------------------------------------------
// abline -- Port of ABLINE from gsxasm1.S
// Always reorders endpoints left-to-right before running DDA.
// ---------------------------------------------------------------------------
function abline(x0, y0, x1, y1) {
	let out_points = [];

	if (y0 === y1) {
		if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
		for (let x = x0; x <= x1; x++) {
			out_points.push([x, y0]);
		}
		return out_points;
	}
	if (x0 === x1) {
		if (y0 > y1) { const t = y0; y0 = y1; y1 = t; }
		for (let y = y0; y <= y1; y++) {
			out_points.push([x0, y]);
		}
		return out_points;
	}
	if (x0 > x1) {
		let t; t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t;
	}
	const dx = x1 - x0;
	let dy = y1 - y0;
	const y_inc = (dy >= 0) ? 1 : -1;
	dy = Math.abs(dy);
	let x = x0, y = y0;
	if (dy > dx) {
		const dMax = dy, dMin = dx;
		let eps = 2*dMin - dMax;
		const e1 = 2*dMin, e2 = 2*(dMin - dMax);
		for (let i = 0; i <= dMax; i++) {
			out_points.push([x,y]);
			if (i < dMax) {
				y += y_inc;
				if (eps >= 0) { x++; eps += e2; } 
				else { eps += e1 };
			}
		}
	}
	else {
		const dMax = dx, dMin = dy;
		let eps = 2*dMin - dMax;
		const e1 = 2*dMin, e2 = 2*(dMin - dMax);
		for (let i = 0; i <= dMax; i++) {
			out_points.push([x,y]);
			if (i < dMax) {
				x++;
				if (eps >= 0) { y += y_inc; eps += e2; } 
				else { eps += e1 };
			}
		}
	}
	return out_points;
}

// ---------------------------------------------------------------------------
// pline -- draw open polyline (no closing segment)
// Mirrors pline() in monout.c: draws N-1 segments for N points.
// ---------------------------------------------------------------------------
function pline(points) {
	let out_points = [];
	for (let i = 0; i < points.length - 1; i++) {
		const line_points = abline(
			points[i][0],
			points[i][1],
			points[i+1][0],
			points[i+1][1]
		);
		out_points = out_points.concat(line_points);
	}
	return out_points;
}

// ---------------------------------------------------------------------------
// pline_closed -- draw closed polyline (perimeter of polygon)
// Mirrors plygn()'s NPTSIN++ then pline() call: the first point is
// duplicated at the end, so pline draws N segments for N+1 points.
// ---------------------------------------------------------------------------
function pline_closed(points) {
	let out_points = [];
	let line_points = pline(points);
	out_points = out_points.concat(line_points);
	if (points.length > 1) {
		line_points = abline(
			points[points.length-1][0],
			points[points.length-1][1],
			points[0][0],
			points[0][1]
		);
		out_points = out_points.concat(line_points);
	}
	return out_points;
}

// ---------------------------------------------------------------------------
// scanline_fill -- mirrors plygn() + CLC_FLIT() scanline fill
// Fills from fill_maxy down to fill_miny+1 (topmost row left for perimeter).
// Uses integer intercepts matching CLC_FLIT()'s method.
// ---------------------------------------------------------------------------
function scanline_fill(polygon) {
	let out_points = [];
	if (polygon.length < 3) return;
	let ymin = Infinity, ymax = -Infinity;
	for (const p of polygon) {
		if (p[1] < ymin) ymin = p[1];
		if (p[1] > ymax) ymax = p[1];
	}
	const n = polygon.length;
	// plygn: for (Y1 = fill_maxy; Y1 > fill_miny; Y1--)
	for (let y = ymax; y > ymin; y--) {
		const xs = [];
		for (let i = 0; i < n; i++) {
			const a = polygon[i];
			const b = polygon[(i + 1) % n];
			const dy = b[1] - a[1];
			if (dy === 0) { continue; }
			const dy1 = y - a[1];
			const dy2 = y - b[1];
			// CLC_FLIT singularity test: signs of dy1 and dy2 must differ
			if ((dy1 ^ dy2) >= 0) { continue; }
			// CLC_FLIT integer intercept: x = ((2*dx*dy1)/dy + 1) / 2 + x1
			const dx = b[0] - a[0];
			const numerator = 2 * dx * dy1;
			let d4 = Math.trunc(numerator / dy);
			if (d4 >= 0) { d4 = (d4 + 1) >> 1; }
			else { d4 = -d4; d4 = (d4 + 1) >> 1; d4 = -d4; }
			xs.push(d4 + a[0]);
		}
		xs.sort((a, b) => a - b);
		for (let k = 0; k + 1 < xs.length; k += 2) {
			const x0 = xs[k], x1 = xs[k + 1];
			if (x1 >= x0) {
				let line_points = abline(x0, y, x1, y);
				out_points = out_points.concat(line_points);
			}
		}
	}
	return out_points;
}

// =============================================================================
// GDP GRAPHICS PRIMITIVES
// =============================================================================

// ---------------------------------------------------------------------------
// v_circle -- GDP case 3 (CONTRL[5]=4)
// Full circle. yrad = SMUL_DIV(xrad, xsize, ysize).
// Drawn as one full arc, dispatched to plygn()/scanline_fill.
// ---------------------------------------------------------------------------
function v_circle(xc, yc, xrad, res, filled) {
	const yrad = smul_div(xrad, res.xsize, res.ysize);
	const n_steps = clc_nsteps(xrad, yrad);

	const vertices = clc_arc_pts(xc, yc, xrad, yrad, 0, 3600, 3600, n_steps);

	let out_points = [];

	// If the 'filled' parameter was passed, then scanline_fill
	if (filled) {
		out_points = scanline_fill(vertices);
	}
	// Otherwise, we draw the perimeter using a polyline connecting the vertices.
	else {
		out_points = pline_closed(vertices);
	}

	return out_points;
}

// ---------------------------------------------------------------------------
// v_arc -- GDP case 1 (CONTRL[5]=2)
// Circular arc (open). yrad = SMUL_DIV(xrad, xsize, ysize).
// beg_ang/end_ang from parameters. Dispatched to v_pline (open).
// ---------------------------------------------------------------------------
function v_arc(xc, yc, xrad, beg_ang, end_ang, res) {
	const yrad = smul_div(xrad, res.xsize, res.ysize);
	let del_ang = end_ang - beg_ang;
	if (del_ang < 0) { del_ang += 3600; }
	const n_steps = clc_nsteps(xrad, yrad);

	const vertices = clc_arc_pts(xc, yc, xrad, yrad, beg_ang, end_ang, del_ang, n_steps);

	// Draw polyline connecting the vertices
	let out_points = [];
	out_points = pline(vertices);

	return out_points;
}

// ---------------------------------------------------------------------------
// v_pieslice -- GDP case 2 (CONTRL[5]=3)
// Circular pie wedge. yrad = SMUL_DIV(xrad, xsize, ysize).
// Center point appended. Dispatched to plygn()/scanline_fill.
// ---------------------------------------------------------------------------
function v_pieslice(xc, yc, xrad, beg_ang, end_ang, res, filled) {
	const yrad = smul_div(xrad, res.xsize, res.ysize);
	let del_ang = end_ang - beg_ang;
	if (del_ang < 0) { del_ang += 3600; }
	const n_steps = clc_nsteps(xrad, yrad);

	const vertices = clc_arc_pts(xc, yc, xrad, yrad, beg_ang, end_ang, del_ang, n_steps);

	// Pie: append center point
	vertices.push([xc, yc]);

	let out_points = [];
	// If the 'filled' parameter was passed, then scanline_fill
	if (filled) {
		out_points = scanline_fill(vertices);
	}
	// Otherwise, we draw the perimeter using a polyline connecting the vertices.
	else {
		out_points = pline_closed(vertices);
	}

	return out_points;
}

// ---------------------------------------------------------------------------
// v_ellipse -- GDP case 4 (CONTRL[5]=5)
// Full ellipse. xrad and yrad from parameters directly.
// For xfm_mode < 2: yrad = yres - yrad (NDC mode). We skip this since
// we're in raster mode (xfm_mode >= 2).
// Drawn as one full arc, dispatched to plygn()/scanline_fill.
// ---------------------------------------------------------------------------
function v_ellipse(xc, yc, xrad, yrad, filled) {
	const n_steps = clc_nsteps(xrad, yrad);

	const vertices = clc_arc_pts(xc, yc, xrad, yrad, 0, 0, 3600, n_steps);

	let out_points = [];
	// If the 'filled' parameter was passed, then scanline_fill
	if (filled) {
		out_points = scanline_fill(vertices);
	}
	// Otherwise, we draw the perimeter using a polyline connecting the vertices.
	else {
		out_points = pline_closed(vertices);
	}

	return out_points;
}

// ---------------------------------------------------------------------------
// v_ellarc -- GDP case 5 (CONTRL[5]=6)
// Elliptical arc (open). xrad/yrad from parameters.
// Dispatched to v_pline (open).
// ---------------------------------------------------------------------------
function v_ellarc(xc, yc, xrad, yrad, beg_ang, end_ang) {
	let del_ang = end_ang - beg_ang;
	if (del_ang < 0) del_ang += 3600;
	const n_steps = clc_nsteps(xrad, yrad);

	const vertices = clc_arc_pts(xc, yc, xrad, yrad, beg_ang, end_ang, del_ang, n_steps);

	// Draw polyline connecting the vertices
	let out_points = [];
	out_points = pline(vertices);

	return out_points;
}

// ---------------------------------------------------------------------------
// v_ellpie -- GDP case 6 (CONTRL[5]=7)
// Elliptical pie wedge. xrad/yrad from parameters.
// Center point appended. Dispatched to plygn()/scanline_fill.
// ---------------------------------------------------------------------------
function v_ellpie(xc, yc, xrad, yrad, beg_ang, end_ang, filled) {
	let del_ang = end_ang - beg_ang;
	if (del_ang < 0) del_ang += 3600;
	const n_steps = clc_nsteps(xrad, yrad);

	const vertices = clc_arc_pts(xc, yc, xrad, yrad, beg_ang, end_ang, del_ang, n_steps);
	vertices.push([xc, yc]);

	let out_points = [];
	// If the 'filled' parameter was passed, then scanline_fill
	if (filled) {
		out_points = scanline_fill(vertices);
	}
	// Otherwise, we draw the perimeter using a polyline connecting the vertices.
	else {
		out_points = pline_closed(vertices);
	}

	return out_points;
}


// ---------------------------------------------------------------------------
// v_rfbox -- GDP case 8 (CONTRL[5]=9)
// Filled rounded rectangle
// Calls plygn(): scanline fill, then closed perimeter pline.
// ---------------------------------------------------------------------------
function v_rfbox(x1, y1, x2, y2, res, filled) {

	const vertices = gdp_rbox(x1, y1, x2, y2, res);

	let out_points = [];
	// If the 'filled' parameter was passed, then scanline_fill
	if (filled) {
		out_points = scanline_fill(vertices);
	}
	// Otherwise, we draw the perimeter using a polyline connecting the vertices.
	else {
		out_points = pline_closed(vertices);
	}

	return out_points;
}


// ---------------------------------------------------------------------------
// gdp_rbox -- Faithful port of gdp_rbox() from monout.c (TOS 1.04)
//
// Rounded rectangle. The corner radius is xres>>6 (5 pixels in low-res,
// 9 in med/high), clamped so the arcs don't exceed half the box size.
// yrad is aspect-corrected from xrad via SMUL_DIV(xrad, xsize, ysize).
//
// The polygon is 21 points: 5 per corner × 4 corners + 1 closing point.
// Corner arcs use a hardcoded 5-point quarter-arc template at angles
// 0, 22.5, 45, 67.5, and 90 -- NOT clc_arc.
//
// The C code builds the polygon IN-PLACE in the PTSIN array, overwriting
// the template with corner 4. This port replicates that exact behavior
// using a flat array to ensure identical results.
//
// Dispatch:
//   v_rbox  (GDP case 7, CONTRL[5]=8): outline only -> pline (open polyline
//           with NPTSIN=21, which draws 20 segments including the closing
//           segment from pt20 back along the perimeter, since pt20 == pt0)
//           IGS does *NOT* call this. The main difference from v_rfbox is
//           that v_rbox draws only an outline, and it uses polyline
//           attributes (line width, line color, etc).
//   v_rfbox (GDP case 8, CONTRL[5]=9): filled -> plygn (scanline fill +
//           closed perimeter via pline with NPTSIN incremented)
//           This is the one IGS calls from the "B" command.
//           The perimeter/outline is drawn using FILL color, not line.
//
// Parameters:
//   x1, y1, x2, y2: rectangle corners (any order, will be normalized)
//   res: IGS resolution object, with .width property.
//
// Returns: points
// ---------------------------------------------------------------------------
function gdp_rbox(x1, y1, x2, y2, res) {

	// According to tables.c, xres and yres are 1 lower than rez width/height.
	// (e.g. xres = 320-1; yres = 200-1)
	// https://github.com/th-otto/tos1x/blob/master/vdi/tables.c
	const xres = res.width - 1;

	// arb_corner(LLUR): normalize to X1<=X2, Y2<=Y1
	// (LLUR = lower-left/upper-right; "lower" = larger Y in screen coords)
	if (x1 > x2) { const t = x1; x1 = x2; x2 = t; }
	if (y1 < y2) { const t = y1; y1 = y2; y2 = t; }
	// Now: x1=left, x2=right, y2=top, y1=bottom

	const rdeltax = ((x2 - x1) / 2) | 0;   // integer division
	const rdeltay = ((y1 - y2) / 2) | 0;

	let xrad = xres >> 6;
	if (xrad > rdeltax) { xrad = rdeltax; }

	let yrad = smul_div(xrad, res.xsize, res.ysize);
	if (yrad > rdeltay) { yrad = rdeltay; }

	// 5-point quarter-arc template stored as flat array (matching C layout)
	// Angles: 90, 67.5, 45, 22.5, 0 -> stored as (dx, dy) pairs
	const ptsin = new Array(50).fill(0);
	ptsin[0] = 0;
	ptsin[1] = yrad;
	ptsin[2] = smul_div(Icos(675), xrad, 32767);
	ptsin[3] = smul_div(Isin(675), yrad, 32767);
	ptsin[4] = smul_div(Icos(450), xrad, 32767);
	ptsin[5] = smul_div(Isin(450), yrad, 32767);
	ptsin[6] = smul_div(Icos(225), xrad, 32767);
	ptsin[7] = smul_div(Isin(225), yrad, 32767);
	ptsin[8] = xrad;
	ptsin[9] = 0;

	// Corner 1: bottom-right (pts 5-9)
	// Reads template backward (9->0), writes to ptsin[10-19]
	let xc = x2 - xrad;
	let yc = y1 - yrad;
	let j = 10, i = 9;
	while (i >= 0) {
		ptsin[j + 1] = yc + ptsin[i]; i--;
		ptsin[j]     = xc + ptsin[i]; i--;
		j += 2;
	}

	// Corner 2: bottom-left (pts 10-14)
	// Reads template forward (0->9), writes to ptsin[20-29]
	xc = x1 + xrad;
	j = 20; i = 0;
	while (i < 10) {
		ptsin[j] = xc - ptsin[i]; i++; j++;
		ptsin[j] = yc + ptsin[i]; i++; j++;
	}

	// Corner 3: top-left (pts 15-19)
	// Reads template backward (9->0), writes to ptsin[30-39]
	yc = y2 + yrad;
	j = 30; i = 9;
	while (i >= 0) {
		ptsin[j + 1] = yc - ptsin[i]; i--;
		ptsin[j]     = xc - ptsin[i]; i--;
		j += 2;
	}

	// Corner 4: top-right (pts 0-4)
	// Reads template forward (0->9), OVERWRITES ptsin[0-9] (template consumed)
	xc = x2 - xrad;
	j = 0; i = 0;
	while (i < 10) {
		ptsin[j] = xc + ptsin[i]; i++; j++;
		ptsin[j] = yc - ptsin[i]; i++; j++;
	}

	// Close polygon: pt20 = pt0
	ptsin[40] = ptsin[0];
	ptsin[41] = ptsin[1];

	// Convert flat array to point objects
	const points = [];
	for (let k = 0; k < 21; k++) {
		points.push([ ptsin[k * 2], ptsin[k * 2 + 1] ]);
	}

	return points;
}

