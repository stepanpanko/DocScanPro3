# TODO

## OCR & scan quality – parked (Dec 2, 2025)

Current status:

- Imported PDFs:

  - Original vector PDF is preserved via `originalPdfPath`.

  - OCR uses the PDF's own text where available (highlighting works, multi-language fine).

  - File size and quality are good and comparable to competitors.

- Camera scans:

  - Single JPEG encode in `applyFinalFilterToPage` + `processedUri`.

  - File size still relatively large vs. goal.

  - Vision OCR works but bounding boxes / highlight accuracy and quality tuning still need work.

Later tasks:

- Tune quality profiles for camera scans (dimensions + jpegQuality) to hit ~200–350 KB for typical A4 doc while keeping text crisp.

- Re-check Vision OCR coordinate mapping on resized images (ensure 1:1 between processed dimensions and OCR input).

- Compare against a reference app (ScanGuru) with the same test page and match behavior as close as feasible.

That's enough context so you can safely forget it for a while.

