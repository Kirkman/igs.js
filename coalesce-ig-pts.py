import os
import re
import json
import argparse
import warnings
from collections import defaultdict

# Utility function to change Nones or empty strings to zeroes
def noneToZero(value):
	if value == None:
		return int(0)
	elif str(value).strip() == '':
		return int(0)
	else:
		return value



# This function searches a list of points, and tries to convert them to lines.
# It will return a list of lines, and a list of any points that couldn't be joined to lines.
# With the Miami Dolphins piece, I found it was more effective to NOT check for vertical lines
# since this routine can cause them to interrupt would otherwise be longer horiz lines.
def coalesce_points(points):
	# Sort points for easier processing
	points = sorted(points, key=lambda p: (p[1], p[0]))  # Sort by y, then x

	new_lines = []
	new_points = []
	visited = set()

	def find_line_or_rectangle(start):
		x, y = start
		line_horiz = [(x, y)]
		line_vert = [(x, y)]

		# Check horizontal line
		for i in range(x + 1, x + 100):  # Arbitrary large limit for continuity
			if (i, y) in point_set:
				line_horiz.append((i, y))
			else:
				break

		# # Check vertical line
		# for i in range(y + 1, y + 100):
		# 	if (x, i) in point_set:
		# 		line_vert.append((x, i))
		# 	else:
		# 		break

		if len(line_horiz) > 1:
			for p in line_horiz:
				visited.add(p)
			return line_horiz

		# if len(line_vert) > 1:
		# 	for p in line_vert:
		# 		visited.add(p)
		# 	return line_vert

		return None

	# Add points to a set for quick lookup
	point_set = set((x, y) for x, y in points)

	for x, y in points:
		if (x, y) not in visited:
			contiguous = find_line_or_rectangle((x, y))
			if contiguous:
				new_lines.append(contiguous)
			else:
				new_points.append([x, y])

	final_lines = []
	for line in new_lines:
		final_lines.append([list(line[0]), list(line[-1])])


	return final_lines, new_points


# REMOVE "ERASED" PIXELS TO SAVE SPACE.
# This routine makes some assumptions that were true for the Miami Dolphins piece
# but may NOT be true with other art that I try to use this on:
# 1. Background color is 0
# 2. Color 0 is only used to "erase" previously-drawn non-BG-color pixels.
# 3. Entire piece was drawn with Pencil tool (`P` command)
def remove_erased_pts(history):
	for i, action in enumerate(history):
		if action['action'] == 'draw_point' and action['params']['color'] == 0:
			erase_points = action['params']['points'].copy()
			erase_matches = []
			for point in erase_points:
				for j, cmd in enumerate(history[0:i]):
					if cmd['action'] == 'draw_point' and cmd['params']['color'] != 0:
						if point in cmd['params']['points']:
							history[j]['params']['points'].remove(point)
							erase_matches.append(point)
			for point in erase_matches:
				if point in history[i]['params']['points']:
					history[i]['params']['points'].remove(point)

	# After running the previous routine, we will end up
	# with some draw_point commands that have empty points arrays.
	# This routine will delete those commands from the history.
	revised_history = []
	for action in history:
		if action['action'] not in ['draw_point']:
			revised_history.append(action)
		elif len(action['params']['points']) > 0:
			revised_history.append(action)

	return revised_history


def main(input_file=None, output_file=None):

	in_data = None
	with open(input_file, 'r') as f:
		in_data = json.load(f)


	num_pts_before = 0
	num_pts_after = 0

	# Check how many total points are stored by commands in this piece.
	for action in in_data['history']:
		if 'points' in action['params'].keys():
			num_pts_before += len(action['params']['points'])

	print(f'Total number of points originally: {num_pts_before}')

	in_data['history'] = remove_erased_pts(in_data['history'])

	# Check how many points we saved by running remove_erased_pts().
	for action in in_data['history']:
		if 'points' in action['params'].keys():
			num_pts_after += len(action['params']['points'])

	print(f'Total number of points after optimization: {num_pts_after}')

	revised_history = []
	for action in in_data['history']:
		if action['action'] not in ['draw_point']:
			revised_history.append(action)
		elif len(action['params']['points']) > 0:
			revised_history.append(action)


	# Write a copy of this pre-optimized data, for debugging.
	out_str = json.dumps(in_data).replace('{"action"','\n{"action"')

	with open(output_file.replace('.json','-preoptimized.json'), 'w') as f:
		f.write(out_str)


	# Prepare to optimize
	out_data = {'history': []}
	curr_color = None
	old_points = []

	# Iterate over every command
	for action in in_data['history']:
		new_lines = None
		new_points = None

		# If this is any non-pencil, non-color command, no need to process further.
		if action['action'] not in ['draw_point', 'set_color']:
			out_data['history'].append(action)
			continue

		# Right now, this routine is designed to work over "color groups."
		# It will collect all points in a consecutive set of draw_point commands
		# if they have the same color parameter. It will then reset and begin
		# a new group whenever the color changes.
		#
		# I set it up this way to attempt to preserve the rough order of the
		# Miami Dolphins drawing, when it renders in IG.
		#
		# For other less extreme/weird applications, it may make more sense
		# to only coalesce points that exist in the same draw_point command,
		# which is how this was originally coded.
		if curr_color != action['params']['color']:

			if len(old_points) > 0:

				new_lines, new_points = coalesce_points(old_points)

				if len(new_lines) > 0 or len(new_points) > 0:
					out_data['history'].append({
						"action":"set_color",
						"params":{
							"color":curr_color,
						}
					})

				if len(new_lines) > 0:
					for line in new_lines:
						out_data['history'].append({
							"action":"draw_line",
							"params":{
								"color":curr_color,
								"points":line
							}
						})

				if len(new_points) > 0:
					out_data['history'].append({
						"action":"draw_point",
						"params":{
							"color":curr_color,
							"points":new_points
						}
					})

				old_points = []

			curr_color = action['params']['color']

		else:
			old_points += action['params']['points']

	out_str = json.dumps(out_data).replace('{"action"','\n{"action"')


	with open(output_file, 'w') as f:
		f.write(out_str)




if __name__ == "__main__":

	# CHECK FOR COMMAND LINE ARGUMENTS
	parser = argparse.ArgumentParser()

	parser.add_argument(
		'input',
		type=str,
		nargs='?',
		help='Filename and path for input JSON file. REQUIRED.'
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
