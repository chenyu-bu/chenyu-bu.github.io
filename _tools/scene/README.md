# Background scene art

These scripts drew the ink-wash images in `assets/img/scene/`. They are kept
here so the art can be adjusted and redrawn. Jekyll does not publish folders
whose names start with an underscore, so nothing here appears on the site.

| Script | Writes |
|---|---|
| `mountains_islet.py` | `far.jpg` (sky, sun, mountains, horizon, reflections) and `mid.jpg` (the islet with its trees and pavilion) |
| `paper_mist_reeds.py` | `paper.jpg` (paper grain), `mist.jpg` (drifting mist), `near.jpg` (reeds) |
| `inkling_edge.py` | `edge.png` (the soft, uneven edge on inkling photographs on Comings & Goings) |

To redraw, from the top folder of the repository (needs Python 3 with
`numpy` and `Pillow`):

```bash
python3 _tools/scene/mountains_islet.py assets/img/scene
```

```bash
python3 _tools/scene/paper_mist_reeds.py assets/img/scene
```

```bash
python3 _tools/scene/inkling_edge.py assets/img/scene
```

Every random choice is seeded, so running a script unchanged gives exactly
the images already in the repository. To change the art, edit the numbers
in the script (positions, sizes and tones are named in the comments) and run
it again.

The boats and birds are not images: `assets/js/scene.js` draws them as the
page runs, and that file also sets how the layers move, the colour of the
wash, and the cursor effects.
