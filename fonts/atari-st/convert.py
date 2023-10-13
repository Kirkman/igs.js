import argparse
import os
import json


def arrDecInt(arr):
	hex_str = ''.join([str(x.hex()) for x in arr])
	return int(hex_str, 16)

def arrDecStr(arr):
	return ''.join([str(int(x.hex(),16)) for x in arr])

def arrAscStr(arr):
	return ''.join([chr(int(x.hex(),16)) for x in arr])

# def arrHex(arr):
# 	return [x.hex() for x in arr]

# def arrDec(arr):
# 	return [int(x.hex(),16) for x in arr]



def main(input):
	font_file_bytes = []

	with open(input, 'rb') as f:
		while (byte := f.read(1)):
			font_file_bytes.append(byte)

	print(f'Length: {len(font_file_bytes)}')


	# JOSH NOTES:
	# Font should be 2,650 bytes
	# Offset table begins at offset 88 bytes
	# Font data begins at offset 602 bytes
	# Form width is 256
	# Form height is 8


	# font_id			Font identifier
	# point				Font size in points
	# name				Font name
	# first_ade			Lowest ADE value in the font, first char
	# last_ade			Highest ADE value in the font, last char
	# top				Top line distance
	# ascent			Ascent line distance
	# half				Half line distance
	# descent			Descent line distance
	# bottom			Bottom line distance
	# max_char_width	Width of the widest character in the font
	# max_cell_width	Width of the widest character cell in the face
	# left_offset		Left offset
	# right_offset		Right offset
	# thicken			Thickening: the number of pixels by which to widen thickened chars
	# ul_size			Underline size: the pixel-width of the underline
	# lighten			Lightening mask: used to drop pixels out when lightening (usually 5555H)
	# skew				Skewing mask: determines when add'l char rotation is required to perform skewing (usually 5555H)
	# flags				0 - Set if default system font
	#					1 - Set if horiz offset tables should be used
	#					2 - Reserved - must be 0
	#					3 - Set if monospaced font

	# hor_table			Pointer to the horiz offset table
	# off_table			Pointer to the char offset table
	# dat_table			Pointer to the font data
	# form_width		Form width
	# form_height		Form height

	# next_font			Pointer to the next font

	"""
	The font data is organized as a single raster area. The area's height equals the font height and its width equals the sum of the character widths.

	The top scan line of the first character in the font is aligned to a byte boundary. The top scan line of the second character is abutted to the first character and is not necessarily byte-aligned. That is, the end of any character and the beginning of the following character often occur within the same byte; no byte alignment occurs within the font form.

	Bit padding occurs only at the end of a scan line. Each scan line in the font form begins on a word boundary. The numebr of bytes from the beginning of one scan line to the beginning of the next is called the form width. The number of scan lines required to draw any character is called the form height.

	The format of the file is such that the low byte of a word occurs in memory before the high byte.
	"""




	font_bytes = iter(font_file_bytes)

	font_id        = [font_bytes.__next__() for x in range(0, 2)]
	point          = [font_bytes.__next__() for x in range(0, 2)]
	font_name      = [font_bytes.__next__() for x in range(0,32)]
	first_ade      = [font_bytes.__next__() for x in range(0, 2)]
	last_ade       = [font_bytes.__next__() for x in range(0, 2)]
	top            = [font_bytes.__next__() for x in range(0, 2)]
	ascent         = [font_bytes.__next__() for x in range(0, 2)]
	half           = [font_bytes.__next__() for x in range(0, 2)]
	descent        = [font_bytes.__next__() for x in range(0, 2)]		
	bottom         = [font_bytes.__next__() for x in range(0, 2)]
	max_char_width = [font_bytes.__next__() for x in range(0, 2)]
	max_cell_width = [font_bytes.__next__() for x in range(0, 2)]
	left_offset    = [font_bytes.__next__() for x in range(0, 2)]
	right_offset   = [font_bytes.__next__() for x in range(0, 2)]
	thicken        = [font_bytes.__next__() for x in range(0, 2)]
	ul_size        = [font_bytes.__next__() for x in range(0, 2)]
	lighten        = [font_bytes.__next__() for x in range(0, 2)]
	skew           = [font_bytes.__next__() for x in range(0, 2)]
	flags          = [font_bytes.__next__() for x in range(0, 2)]

	hor_table_pt   = [font_bytes.__next__() for x in range(0, 4)]
	off_table_pt   = [font_bytes.__next__() for x in range(0, 4)]
	dat_table_pt   = [font_bytes.__next__() for x in range(0, 4)]
	form_width     = [font_bytes.__next__() for x in range(0, 2)]
	form_height    = [font_bytes.__next__() for x in range(0, 2)]

	next_font      = [font_bytes.__next__() for x in range(0, 4)]


	first_ade = arrDecInt(first_ade)
	last_ade = arrDecInt(last_ade)
	top = arrDecInt(top)
	ascent = arrDecInt(ascent)
	half = arrDecInt(half)
	descent = arrDecInt(descent)
	bottom = arrDecInt(bottom)
	max_char_width = arrDecInt(max_char_width)
	max_cell_width = arrDecInt(max_cell_width)
	form_width = arrDecInt(form_width)
	form_height = arrDecInt(form_height)
	hor_table_pt = arrDecInt(hor_table_pt)
	off_table_pt = arrDecInt(off_table_pt)
	dat_table_pt = arrDecInt(dat_table_pt)


	print('font_id', arrDecInt(font_id))
	print('point', arrDecInt(point))
	print('font_name', arrAscStr(font_name).replace('\u0000',''))
	print('first_ade', first_ade)
	print('last_ade', last_ade)
	print('top', top)
	print('ascent', ascent)
	print('half', half)
	print('descent', descent)
	print('bottom', bottom)
	print('max_char_width', max_char_width)
	print('max_cell_width', max_cell_width)
	print('left_offset', arrDecInt(left_offset))
	print('right_offset', arrDecInt(right_offset))
	print('thicken', arrDecInt(thicken))
	print('ul_size', arrDecInt(ul_size))
	print('lighten', arrDecInt(lighten))
	print('skew', arrDecInt(skew))
	print('flags', arrDecInt(flags))
	print('hor_table_pt', hor_table_pt)
	print('off_table_pt', off_table_pt)
	print('dat_table_pt', dat_table_pt)
	print('form_width', form_width)
	print('form_height', form_height)
	print('next_font', arrDecInt(next_font))



	# 514 is the font data table offset (602) minus the offset table offset (88)
	off_table      = [font_bytes.__next__() for x in range(0, (dat_table_pt-off_table_pt))]

	font_data      = [None] * form_height

	for i in range(0, form_height):
		row = ''
		for b in [font_bytes.__next__() for b in range(0, form_width)]:
			row += "{:08b}".format(int(b.hex(),16))

		font_data[i] = [int(x) for x in row]



	bin_font_data = []

	for char_idx in range(0, (last_ade+1)):
		char_pos = char_idx * max_cell_width
		char = []
		for scan_line in range(0, form_height):
			bin_arr = font_data[scan_line][char_pos:(char_pos+max_cell_width)]
			char.append(bin_arr)
			# if char_idx == 66:
			# 	print(bin_arr)

		bin_font_data.append(char)


	font = {
		'font_id': arrDecInt(font_id),
		'font_name': arrAscStr(font_name).replace('\u0000',''),
		'system': 'atari_st',
		'point': arrDecInt(point),
		'top_line_dist': top,
		'ascent_line_dist': ascent,
		'half_line_dist': half,
		'descent_line_dist': descent,
		'bottom_line_dist': bottom,
		'form_height': form_height,
		'max_char_width': max_char_width,
		'max_cell_width': max_cell_width,
		'characters': bin_font_data,
	}

	output_file = input.replace('.fnt', '.json')

	with open(output_file, 'w') as f:
		json.dump(font, f)



if __name__ == "__main__":

	# Directory from which the script is running
	script_path = os.path.dirname(os.path.realpath(__file__))

	# CHECK FOR COMMAND LINE ARGUMENTS
	parser = argparse.ArgumentParser(description='Convert font data.')

	parser.add_argument(
		'file1',
		metavar='file1',
		type=str,
		help='Input file. REQUIRED.'
	)

	args = parser.parse_args()

	file1 = None
	if args.file1:
		file1 = args.file1


	main(input=file1)