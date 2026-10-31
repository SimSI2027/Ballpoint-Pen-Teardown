# output/

Generated files land here. Everything except this README is git-ignored.

- `ballpoint-pen-teardown-v<version>.mp4` - 1920x1080, 60 fps, H.264, yuv420p, faststart, silent (`npm run video`)
- `ballpoint-pen-contact-sheet.jpg` - 12 frames extracted from that MP4
- `.frames-tmp/` - numbered PNG frames, only with `npm run video -- --disk`; deleted after a successful encode, kept on failure for diagnosis

The film is rendered from explicit frame indexes (not screen recording), using the same mechanism model as the interactive simulator.
