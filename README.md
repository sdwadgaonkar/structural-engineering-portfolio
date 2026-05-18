# StruxLab

**Structural engineering, written in code.**

A portfolio and engineering tools website built by Sanket Wadgaonkar — a structural engineer with six years of practice. The site hosts interactive browser-based engineering calculators, long-form technical blog posts, and professional case studies.

**Live site:** https://struxlab.netlify.app

---

## Tech Stack

- **HTML5** — all pages are static HTML files
- **CSS** — single `styles.css` with CSS custom properties (design tokens)
- **JavaScript** — vanilla ES6, embedded in each page (no build step, no framework)
- **Hosting** — Netlify (auto-deploys from `main` branch)
- **Fonts** — Inter, Space Grotesk, JetBrains Mono via Google Fonts CDN

No npm packages, no build process, no server-side code.

---

## Project Structure

```
02-multi-page/
├── index.html                          # Home page
├── blog.html                           # Blog listing
├── tools.html                          # Tools gallery
├── projects.html                       # Project case studies
├── resume.html                         # CV and profile
├── contact.html                        # Contact info
├── 404.html                            # Custom error page
├── components.js                       # Shared navbar + footer
├── styles.css                          # Global stylesheet
├── favicon.svg                         # Site favicon
├── blog/
│   ├── semi-rigid-diaphragm-behavior.html
│   └── column-interaction-tool.html
└── tools/
    ├── beam-calculator.html            # Continuous beam (direct stiffness)
    ├── column-interaction.html         # ACI 318-19 P-M interaction
    ├── load-combinations.html          # ASCE 7-22 / IS 875 combos
    └── section-properties.html        # Built-up section properties
```

---

## How to Run Locally

**Recommended — VS Code Live Server:**
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → Open with Live Server
3. Browser opens at `http://127.0.0.1:5500` with auto-reload on save

**Alternatively — Python:**
```bash
python -m http.server 8080
# Visit http://localhost:8080
```

---

## Engineering Tools

| Tool | File | Method/Code |
|------|------|-------------|
| Continuous Beam Calculator | `tools/beam-calculator.html` | Direct stiffness method |
| Column Interaction Diagram | `tools/column-interaction.html` | ACI 318-19, strain compatibility |
| Load Combination Generator | `tools/load-combinations.html` | ASCE 7-22 LRFD / IS 875 LSD |
| Section Property Calculator | `tools/section-properties.html` | Built-up rectangular sections |

All tools use imperial units (kip, kip-ft, ft, in, ksi) and run entirely in the browser.

---

## How to Add a Blog Post

1. Copy an existing post file (e.g., `blog/column-interaction-tool.html`)
2. Update the `<title>`, OG meta tags, and `<h1>` with the new post title
3. Update the date and read time in `.post-meta`
4. Replace the article content inside `.post-body`
5. Add the post to `blog.html` (the listing page)
6. Link to it from `index.html` if it should appear in "Recent writing"

---

## How to Add a Tool

1. Copy an existing tool file (e.g., `tools/load-combinations.html`)
2. Update `<title>`, page header `<h1>`, and description
3. Replace the input form HTML and the embedded `<script>` with new calculation logic
4. Add a card for the new tool in `tools.html`
5. Add the tool-specific CSS to `styles.css` if needed

---

## Deployment

Push to `main` → Netlify automatically builds and deploys within ~30 seconds. No manual steps required.

---

## Design System

Colors and spacing are defined as CSS variables in `styles.css`:

```css
--accent:    #E85D24   /* orange — primary interactive color */
--bg-cream:  #FAF7F2   /* warm cream background */
--bg-dark:   #0F1419   /* dark navy (navbar, footer, hero) */
```

Change a variable once to update it site-wide.
