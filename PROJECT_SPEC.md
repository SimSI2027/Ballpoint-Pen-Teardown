# Ballpoint Pen Teardown - Initial Specification

## Goal
Build an interactive browser-based 3D teardown of a retractable click ballpoint pen.

The first release is an educational visual simulator, not a manufacturer-certified engineering model.

## Core mechanism
- Outer barrel, preferably transparent or cut away
- Push button
- Plunger
- Rotating cam and guide track
- Latching features
- Ink cartridge
- Compression spring
- Nose cone
- Ballpoint writing tip
- Pocket clip or exterior shell detail

## Canonical input and state
The primary user input is button travel normalized from 0 to 1.

The canonical state should derive:
- Button displacement
- Plunger displacement
- Cam rotation
- Cartridge displacement
- Spring compression
- Tip extension
- Approximate spring force
- Mechanism phase
- Latched or unlatched state

## Mechanism phases
1. Retracted
2. Initial button press
3. Cam transition
4. Extended and latched
5. Second button press
6. Release and return to retracted state

## Required views
- Assembled
- Transparent or cutaway
- Exploded
- Click-mechanism close-up
- Side view

## Initial controls
- Click or retract button
- Button-travel scrubber
- Exploded-view slider
- Play or pause
- Reset
- Camera-view buttons
- Part isolation

## Initial live measurements
- Button travel in millimetres
- Cartridge travel in millimetres
- Tip extension in millimetres
- Spring compression in millimetres
- Estimated spring force in newtons
- Cam angle in degrees
- Current mechanism phase

## Automated tour
- Show the assembled pen
- Reveal the internal mechanism
- Press the button slowly
- Highlight cam rotation and latching
- Highlight spring compression
- Show the extended writing tip
- Explode the parts
- Reassemble the pen
- Hand control to the user after any interaction
- Resume the tour following 25 seconds of inactivity

## Version 1 exclusions
- No final video rendering
- No procedural soundtrack
- No deployment
- No advanced mobile optimization
- No rigid-body physics engine
- No claims of manufacturer-specific accuracy without supporting references

## Reference policy
- Use only references that may legally be included or linked in a public repository.
- Store source and attribution information for every external reference.
- Do not commit copyrighted images unless permission or licensing allows redistribution.
