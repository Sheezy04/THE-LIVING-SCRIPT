# THE LIVING SCRIPT · 字启千年

An interactive, static-web exploration of Chinese character structure and representative historical glyphs. Open `index.html` with the entire repository folder present; no backend or build step is required.

The experience has a home page and six modules: character exploration, glyph evolution, structure lab, challenge, personal creation, and a character relationship map. Visitors can inspect a character, manipulate components, create a digital glyph, and export a PNG poster or a transparent SVG.

The teaching catalog contains 134 entries. Of these, 106 have modern glyph outlines for the main interactive modules; the other 28 have meanings and relationships but no complete glyph set. The five historical-glyph categories contain 508 representative outlines across 530 candidate slots. Missing slots are shown as missing, not reconstructed. The separate evidence reader has selected reference examples for nine characters; its images are database query glyphs, not photographs of original artifacts. Three characters—木, 休, and 明—have deeper interpretive notes pending specialist review.

The project uses Vue, local SVG glyph paths, and Canvas. It does not run an AI recognition or glyph-generation model. Third-party assets, licenses, and usage limits are documented in [the asset inventory](assets/vendor/LICENSES.md). The historical-glyph display is a curated selection, not a complete or uniquely established evolution chain; personal creations are digital artworks, not newly recognized Chinese characters.

Earlier development notes in the Chinese README may describe historical states. For the current running experience, start with `index.html` and the asset inventory above.
