import os
import re
import json
import argparse
import warnings

# Utility function to change Nones or empty strings to zeroes
def noneToZero(value):
	if value == None:
		return int(0)
	elif str(value).strip() == '':
		return int(0)
	else:
		return value



def main(input_file=None, output_file=None):
	ig_text = None

	#Variables to track state of colors, patterns, etc, to avoid duplicating the commands.
	marker_color = None
	line_color = None
	fill_color = None
	text_color = None
	pattern = None
	border_flag = None


	with open(input_file, 'r') as f:
		ig_text = f.read()

	ig_cmd_re = re.compile(r'(.)>(.+?)(:|@)')

	cmds = re.findall(ig_cmd_re, ig_text)

	out_cmds = []

	jump_idx = -1

	for idx, c in enumerate(cmds):
		print(f'idx: {idx}')

		# Skip iteration if we already went through these in the tool cmds
		if idx <= jump_idx:
			print(f'  - Skipping because idx({idx}) <= jump_idx(jump_idx)')
			continue

		cmd = c[0]
		params = c[1]
		out_params = [int(x) if x.isdigit() else x for x in params.split(',')]

		print(f'  - Cmd: {cmd}')


		# THIS FIRST SET OF COMMANDS ARE ADDED AUTOMATICALLY WHEN EXPORTING FROM JOSHDRAW, SO WE DON'T NEED TO PARSE.

		# Initialize. Ignore for now.
		if cmd == 'I':
			continue
		# Screen clear. Ignore for now
		if cmd == 's':
			continue
		# Cursor. Ignore for now
		if cmd == 'k':
			continue
		# Line/marker type. Ignore for now
		if cmd == 'T':
			continue

		# NEED TO PARSE THIS REMAINING SUBSET OF IGS COMMANDS.

		# Resolution switch.
		if cmd == 'R':
			# The `sys_palette_flag` corresponds to IGS, which has 3-4 options (depending on whether v2.19 or older)
			# The `palette_id` is my own local code for some custom palettes in JoshDraw.
			# When converting from IGS to JSON, we'll default to the IGS choices, since IGS has no notion of my custom palettes.
			pal_flag = out_params[1]
			pal_id = pal_flag
			if pal_flag == 0 or pal_flag == 1:
				pal_id = 0

			out_cmds.append({
				'action': 'set_resolution',
				'params': {
					'resolution': out_params[0],
					'palette_id': str(pal_id),
					'sys_palette_flag': pal_flag,
				}
			})
			continue

		# Drawing mode.
		if cmd == 'M':
			out_cmds.append({
				'action': 'change_drawing_mode',
				'params': {
					'mode': out_params[0],
				}
			})
			continue

		# Fill attributes.
		if cmd == 'A':
			this_pat_type = out_params[0]
			this_pat_num = out_params[1]
			if this_pat_type in [0, 1] and this_pat_num == 0:
				this_pat_num = 1

			this_pat_slug = f'{this_pat_type},{this_pat_num}'
			this_brd_flg = out_params[2]


			if pattern != this_pat_slug or border_flag != this_brd_flg:
				out_cmds.append({
					'action': 'change_pattern',
					'params': {
						'pattern': this_pat_slug,
						'border_flag': this_brd_flg,
					}
				})
				pattern == this_pat_slug
				border_flag == this_brd_flg
			continue

		# Set color
		if cmd == 'C':
			# Assign the color to the correct variable to keep track
			color_type = out_params[0]
			pen_id = out_params[1]

			# Set global variables for the various color_types,
			# but only if the color is actually different.
			if color_type == 0:
				if marker_color == pen_id:
					continue
				marker_color = pen_id
			elif color_type == 1:
				if line_color == pen_id:
					continue
				line_color = pen_id
			elif color_type == 2:
				if fill_color == pen_id:
					continue
				fill_color = pen_id
			elif color_type == 3:
				if text_color == pen_id:
					continue
				text_color = pen_id

			# My JSON format doesn't differentiate right now, and
			# the JSON version of set_color is probably pointless
			# since we track the colors within the tool commands
			out_cmds.append({
				'action': 'set_color',
				'params': {
					'color': pen_id,
				}
			})


			continue


		# Set pen color.
		if cmd == 'S':
			out_cmds.append({
				'action': 'change_color',
				'params': {
					'index': out_params[0],
					'r': out_params[1],
					'g': out_params[2],
					'b': out_params[3],
				}
			})
			continue


		# Plot polymarker 
		if cmd == 'P':
			out_cmds.append({
				'action': 'draw_point',
				'params': {
					'color': marker_color,
					'points': [[out_params[0], out_params[1]]],
				}
			})
			continue

		# Draw line
		if cmd == 'L':
			# Check if the next command is a "Draw to". If so, we'll convert to polyline
			if cmds[idx+1][0] == 'D':
				coords = [
					[out_params[0], out_params[1]],
					[out_params[2], out_params[3]],
				]
				# Look ahead and get points from any immediate sequence of D commands.
				for j in range(idx+1, len(cmds)):
					if cmds[j][0] == 'D':
						nxt_params = cmds[j][1]
						nxt_params = [int(x) if x.isdigit() else x for x in nxt_params.split(',')]
						coords.append([nxt_params[0], nxt_params[1]])
					else:
						jump_idx = j-1
						print(f'   jump_idx set | idx: {idx} | jump_idx: {jump_idx}')
						break

				out_cmds.append({
					'action': 'draw_polyline',
					'params': {
						'color': line_color,
						'points': coords,
					}
				})

			else:
				out_cmds.append({
					'action': 'draw_line',
					'params': {
						'color': line_color,
						'points': [
							[out_params[0], out_params[1]],
							[out_params[2], out_params[3]]
						],
					}
				})
			continue


		# Draw polyline
		if cmd == 'z':
			print('f:')
			print('len', out_params[0])
			print(out_params[1:])

			pts_len = out_params[0]
			pts = out_params[1:]
			coords = []

			# Collect the points into an array
			for p in range(0, pts_len):
				coords.append([pts[(2*p)], pts[(2*p)+1]])

			print(coords)
			out_cmds.append({
				'action': 'draw_polyline',
				'params': {
					'color': line_color,
					'points': coords,
				}
			})
			continue


		# Draw box/rect
		if cmd == 'B':
			out_cmds.append({
				'action': 'draw_rect',
				'params': {
					'color': fill_color,
					'points': [
						[out_params[0], out_params[1]],
						[out_params[2], out_params[3]],
					],
					# JoshDraw doesn't support the 5th parameter, but maybe it will in the future
					'corner_flag': out_params[4],
				}
			})
			continue

		# Draw filled box/rect
		if cmd == 'Z':
			out_cmds.append({
				'action': 'draw_rect',
				'params': {
					'color': fill_color,
					'points': [
						[out_params[0], out_params[1]],
						[out_params[2], out_params[3]],
					],
				}
			})
			continue


		# Draw filled polygon
		if cmd == 'f':
			pts_len = out_params[0]
			pts = out_params[1:]
			coords = []

			# Collect the points into an array
			for p in range(0, pts_len):
				coords.append([pts[(2*p)], pts[(2*p)+1]])

			out_cmds.append({
				'action': 'draw_polygon',
				'params': {
					'color': fill_color,
					'points': coords,
				}
			})
			continue

	out_obj = {'history': out_cmds}
	out_str = json.dumps(out_obj).replace('{"action"','\n{"action"')


	with open(output_file, 'w') as f:
		f.write(out_str)




if __name__ == "__main__":

	# CHECK FOR COMMAND LINE ARGUMENTS
	parser = argparse.ArgumentParser()

	parser.add_argument(
		'input',
		type=str,
		nargs='?',
		help='Filename and path for input IG file. REQUIRED.'
	)

	parser.add_argument(
		'output',
		type=str,
		default='output.json',
		nargs='?',
		help='Filename and path for output JSON. Defaults to `./output.json`.'
	)

	args = parser.parse_args()

	input_file = None
	if args.input:
		input_file = args.input

	output_file = None
	if args.output:
		output_file = args.output
	else:
		output_file = 'output.json'

	main(
		input_file=input_file,
		output_file=output_file,
	)
