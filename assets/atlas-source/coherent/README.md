# Current atlas sources

`raw/` preserves the selected complete generated images. `master.png` is the complete idle source pose, including the shoe pixels that the former equal-grid crop truncated. `generation.json` records selected sources and prompts; reconstructed instructions are explicitly marked as summaries.

`rows/` contains the final reviewed RGBA cells, arranged as eleven 1536×208 strips. These are the build inputs. `manifest.json` pins file hashes and the complete decoded atlas hash. Running `npm run build:atlas` copies these pixels without fitting, centering, patching, or resampling, and verifies an exact lossless WebP round trip before replacing the output.

The raw-to-cell preparation used the work-pets 0.1.6 creation scripts: prepare, component extraction, frame inspection, composition, cardinal extraction, two-stage look registration, edge cleanup, structural validation and final quality checks. `source-extraction.json` and the registration records preserve the selected bounds and transforms. Ordinary states received one integer translation per group. Both look rows share the registration scale recorded in `row9-registration.json`.

To change artwork, edit a coherent source group with ImageGen, recover complete poses, register and review it against the unchanged master-coordinate crops, then replace its fixed row and update the review hashes. Do not update hashes merely to silence a failed build. The previous `normalized/` and `look/` directories are historical inputs, not production build inputs.

Review evidence and limits: [atlas review](../../../docs/atlas-review.md). The native-cell GIFs, fixed crops, sixteen-direction observations and exact-file validation reports are under `docs/atlas-qa/`.
