igs.js (JoshDraw)
=================

[JoshDraw](https://breakintochat.com/atari/igs.js/) is an experimental browser-based art program for drawing images that can be exported in the ["Instant Graphics and Sound" (IGS)](https://breakintochat.com/wiki/Instant_Graphics_and_Sound_(IGS)) format.

The goal is to make it easier to creating IGS art more accessible, since the existing Atari ST-based tools are difficult to use.

![JoshDraw screenshot](/supplemental-info/screenshots/screenshot.png)

Try JoshDraw
------------

You can [try JoshDraw right now](https://breakintochat.com/atari/igs.js/), hosted on Break Into Chat. If you create cool art, _please_ send it to me! In 2025, I released the world's [first all-IGS artpack](https://breakintochat.com/blog/2024/12/31/ignite-the-first-all-igs-artpack/) featuring art from myself and seven other artists. I'd love to release more packs in the future!

It implements only a subset of IGS commands:

* Pencil (1-pixel polymarker)
* Draw line
* Draw polyline
* Draw filled/hollow polygon
* Draw filled/hollow rectangle
* Draw filled/hollow ellipse
* Write text
* Text effects (font size only)
* Fill patterns 2,1 to 3,12
* Grab/Blit (all 5 types)
* Drawing modes 2 (transparent) and 1 (replace/overwrite)

JoshDraw's fill and line-drawing algorithms are now identical to those on the ST and reproduce the various quirks.

I don't intend to add support for animation or sound effects. My goal is limited to making it possible to draw static screens.

JoshDraw's "native" file format is JSON, which is human-understandable, and human-editable. It also will export in .IG format, and attempts to perform some simple optimizations to reduce the exported file's size. 

Some handy features:

* Has a "Loupe" for magnifying the pixels around the cursor, to help with editing fine details. 
* Hold `[Shift]` while drawing lines or polygons to snap the line to multiples of 45°.
* Single-click a color in the palette to choose that color. Double-click to redefine that palette slot.
* Supports undo (`[Ctrl/Cmd]-[Z]`) and redo (`[Shift]-[Ctrl/Cmd]-[Z]`).


Not a release
-------------

* The code in this repository is awful and hacky, and is not really meant for public consumption.




