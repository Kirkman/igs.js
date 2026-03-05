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
// SMUL_DIV — Port of gsxasm1.S with 16-bit rounding overflow
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
// Isin / Icos — Port of isin.c
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
// Calc_pts — compute one arc point
// ---------------------------------------------------------------------------
function calc_pt(angle, xc, yc, xrad, yrad) {
	const x = smul_div(Icos(angle), xrad, 32767) + xc;
	const y = yc - smul_div(Isin(angle), yrad, 32767);
	return [x, y];
}

// ---------------------------------------------------------------------------
// clc_arc — core point generation (single arc from beg_ang to end_ang)
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
// abline — Port of ABLINE from gsxasm1.S
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
// pline — draw open polyline (no closing segment)
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
// pline_closed — draw closed polyline (perimeter of polygon)
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
// scanline_fill — mirrors plygn() + CLC_FLIT() scanline fill
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
// v_circle — GDP case 3 (CONTRL[5]=4)
// Full circle. yrad = SMUL_DIV(xrad, xsize, ysize).
// Drawn as one full arc, dispatched to plygn()/scanline_fill.
// ---------------------------------------------------------------------------
function v_circle(xc, yc, xrad, res, filled) {
	const resolution = resolutions.find(r => r.mode == res);

	const yrad = smul_div(xrad, resolution.xsize, resolution.ysize);
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
// v_arc — GDP case 1 (CONTRL[5]=2)
// Circular arc (open). yrad = SMUL_DIV(xrad, xsize, ysize).
// beg_ang/end_ang from parameters. Dispatched to v_pline (open).
// ---------------------------------------------------------------------------
function v_arc(xc, yc, xrad, beg_ang, end_ang, res) {
	const { xsize, ysize } = RESOLUTIONS[res];
	const yrad = smul_div(xrad, xsize, ysize);
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
// v_pieslice — GDP case 2 (CONTRL[5]=3)
// Circular pie wedge. yrad = SMUL_DIV(xrad, xsize, ysize).
// Center point appended. Dispatched to plygn()/scanline_fill.
// ---------------------------------------------------------------------------
function v_pieslice(xc, yc, xrad, beg_ang, end_ang, res, filled) {
	const { xsize, ysize } = RESOLUTIONS[res];
	const yrad = smul_div(xrad, xsize, ysize);
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
// v_ellipse — GDP case 4 (CONTRL[5]=5)
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
// v_ellarc — GDP case 5 (CONTRL[5]=6)
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
// v_ellpie — GDP case 6 (CONTRL[5]=7)
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