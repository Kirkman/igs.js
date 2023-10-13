igs.js (JoshDraw)
=================

[JoshDraw](https://breakintochat.com/atari/igs.js/) is an experimental art program for drawing images that can be exported in the ["Instant Graphics and Sound" (IGS)](https://breakintochat.com/wiki/Instant_Graphics_and_Sound_(IGS)) format.

The goal was to make a simple, browser-based app that to make creating IGS art more accessible, since the existing Atari ST-based tools can be difficult to use.

![JoshDraw screenshot](/supplemental-info/screenshots/screenshot.png)

Try JoshDraw
------------

You can [try JoshDraw right now](https://breakintochat.com/atari/igs.js/), hosted on Break Into Chat. If you create cool art, _please_ send it to me! Someday I'd like to release an entirely-IGS artpack.

It implements only a subset of IGS commands:

* Pencil (1-pixel polymarker)
* Draw line
* Draw polyline
* Draw polygon
* Draw filled rectangle
* Draw filled polygon
* Write text
* Text effects (font size only)
* Fill patterns 2,1 to 2,8 and 3,7 to 3,12
* Drawing modes 2 (transparent) and 1 (replace/overwrite)

I don't intend to add support for animation or sound effects. My goal is limited to making it possible to draw static screens.

JoshDraw's "native" file format is JSON, which is human-understandable, and human-editable. It also will export in .IG format, and attempts to some simple optimizations to reduce the exported file's size. 

Some handy features:

* Has a "Loupe" for magnifying the pixels around the cursor, to help with editing fine details. 
* Hold `[Shift]` while drawing lines or polygons to snap the line to multiples of 45°.
* Single-click a color in the palette to choose that color. Double-click to redefine that palette slot.
* Supports undo (`[Ctrl/Cmd]-[Z]`) and redo (`[Shift]-[Ctrl/Cmd]-[Z]`).


Not a release
-------------

* The code in this repository is awful and hacky, and is not really meant for public consumption.

* The line algorithms need to be tweaked to better match the ST. (Filled polygon algorithm, though, has been updated with new code derived from EmuTOS)



