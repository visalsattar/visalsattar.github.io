# visalsattar.github.io

My security portfolio: **https://visalsattar.github.io**

## What's on it

- **Interactive terminal**: type `help` to ask it about my projects, certifications and contact details.
- **IDS demo**: step through two real tests of my [AI-based intrusion detection system](https://github.com/visalsattar/AI-Based-Intrusion-Detection-System-for-Real-Time-Threat-Detection): a replay of the traffic the models were trained on, and a live flood they missed.
- **Projects, path and certifications**: what I've built and where I'm headed.
- **Writeups**: PortSwigger and TryHackMe lab walkthroughs. The first ones go up in November 2026.

There's also a flag hidden somewhere on the site. If you find it, email it to visalsattar.dev@gmail.com.

## How it's built

Plain HTML, CSS and JavaScript with no framework and no build step. GitHub Pages serves the files as they are.

- Fonts are self-hosted, so the site makes no third-party requests.
- A Content Security Policy only allows resources from the site itself.

```
index.html               the homepage
assets/site.css          shared styles (homepage and writeups)
assets/site.js           terminal and IDS demo
assets/fonts/            self-hosted fonts
writeups/_template/      starting point for a new writeup
favicon.svg, favicon.ico, og-image.png
```

## Adding a writeup

1. Copy `writeups/_template/` to `writeups/<lab-name>/`.
2. Fill in every `[bracket]`, then delete the `robots` noindex line and set the canonical and `og:url` to the new address.
3. Link the matching Writeups card on the homepage to the new page.

## Running it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk won't load the assets, because the site uses root-relative paths.
