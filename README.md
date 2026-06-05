# SmartForm Comparator

Compare SAP SmartForm XML files (ECC vs S4 HANA) and see all differences — layout dimensions, heights, widths, positions, borders, text content, ABAP code, conditions, and more.

## Features

- Upload two SmartForm XMLs (downloaded via SMARTFORMS transaction → Download Form)
- Side-by-side comparison with categorized differences
- Full Layout View showing all heights/widths/positions from both files
- Search and filter by category
- Light/Dark theme toggle
- Works with any SmartForm XML

## How to Run

```bash
npm install
node server.js
```

Open http://localhost:3000 in your browser.

## Usage

1. Download SmartForm XML from ECC (SMARTFORMS → Utilities → Download Form)
2. Download the same form from S4 HANA
3. Upload ECC XML on the left, S4 XML on the right
4. Click Compare — see all differences

## What It Compares

- **Layout & Dimensions** — Height, Width, Top, Left positions of all windows
- **Borders & Colors** — Thickness, color, distance for all borders
- **Text Content** — Text element content and formatting
- **Program Code** — ABAP code in initialization and within nodes
- **Conditions** — Condition rules and operators
- **Tables & Templates** — Column/row definitions
- **Interface** — Import/Export/Exception parameters
- **Global Data** — Variables and type definitions
- **Page Settings** — Page format, orientation, next page
- **Styles** — Style names, application modes
