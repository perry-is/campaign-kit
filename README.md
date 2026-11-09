<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/campaignkit-wordmark-dark.png">
    <img src="docs/brand/campaignkit-wordmark.png" alt="CampaignKit" width="520">
  </picture>
</p>

**Paste an event, get a finished campaign.** CampaignKit is a Mac desktop app that turns rough
event details (an email, notes, last year's flyer) into checked facts, platform-ready posts, an
on-brand poster and a one-click publish, for any number of client brands.

![Three poster options for one event](docs/screenshots/04-three-posters.png)

> Shown with **Northlight Events** and **Copper Kettle Bakery**, two fictional demo brands.

## From a brand's past flyers to a brand-new one

Give the app a couple of a client's old flyers. For a new event, it designs three finished flyers
in that brand's style, places the real logo, and reads every flyer back to check the date, time,
venue and price against the confirmed facts. These are real, unedited outputs:

| The brand's past flyers (input) | New event: three AI-designed flyers (output) |
| --- | --- |
| <img src="docs/brand-examples/northlight-founders-after-dark.jpg" width="150"><br><img src="docs/brand-examples/northlight-winter-coffee.jpg" width="150"> | <img src="docs/ai-flyers/northlight-summer-rooftop-1.jpg" width="190"> <img src="docs/ai-flyers/northlight-summer-rooftop-2.jpg" width="190"> <img src="docs/ai-flyers/northlight-summer-rooftop-3.jpg" width="190"> |
| <img src="docs/brand-examples/copper-kettle-sourdough-101.jpg" width="150"><br><img src="docs/brand-examples/copper-kettle-bread-table.jpg" width="150"> | <img src="docs/ai-flyers/copper-kettle-croissant-1.jpg" width="190"> <img src="docs/ai-flyers/copper-kettle-croissant-2.jpg" width="190"> <img src="docs/ai-flyers/copper-kettle-croissant-3.jpg" width="190"> |

The chosen design is then re-laid out (not just cropped) for each platform's shape and
fact-checked again:

![Eventbrite-size version](docs/ai-flyers/northlight-summer-rooftop-eventbrite.jpg)

![Every platform size](docs/screenshots/05b-every-platform.png)

> The fact-checker is strict: in the top screenshot it flagged one Northlight flyer for adding
> an "RSVP now" button that wasn't in the event details, so a person can decide.

## What it does

| Step | |
| --- | --- |
| **1. Event** | Paste anything or drop a flyer image/PDF. |
| **2. Facts** | AI pulls out title, date, times, venue, price; anything it's unsure of is highlighted for a human check. Title suggestions with a "dice" button. |
| **3. Posts** | Event listing (Eventbrite / Meetup) plus Facebook, Instagram and LinkedIn posts, each written for its platform in the client's voice. Revise any of them with a plain-English instruction. |
| **4. Poster** | Three different takes at once. Modes: AI designs the whole flyer, AI paints the art and the app typesets every word (facts always exact), or remix a past flyer. Every AI poster is fact-checked by a second model pass. Exports every platform size, including Instagram 4:5. |
| **5. Approve** | Nothing publishes until a person approves the *exact* text and poster. Any later edit invalidates the approval (content fingerprint). |
| **6. Publish** | Eventbrite, Instagram, LinkedIn and Meetup, plus a guided checklist for Facebook groups (which have no posting API). Practice mode runs the whole flow without anything going live. |

## One app, many businesses

Each client is a **brand profile**: logo, colors, writing voice, default venue and poster style.
Drop in a logo and the app extracts a palette from it and re-themes the whole interface, then
picks the closest matching font for the app icon. Switching clients swaps everything.

| Northlight Events | Copper Kettle Bakery |
| --- | --- |
| ![Northlight brand settings](docs/screenshots/08-brand-settings.png) | ![Bakery brand settings](docs/screenshots/09-second-client-settings.png) |
| ![Northlight posters](docs/screenshots/04-three-posters.png) | ![Bakery posters](docs/screenshots/10-second-client-posters.png) |

### It learns each brand's look

Give a client's past flyers to the app and the AI describes their style in words (editable), then
uses up to three of them as visual references for every new poster. Ask for a change like "use
lighter backgrounds" and it decides whether that's a one-off tweak or a lasting rule for all
future posters.

| Brand's past flyers (inputs) | What the app learned |
| --- | --- |
| <img src="docs/brand-examples/northlight-founders-after-dark.jpg" width="160"> <img src="docs/brand-examples/northlight-winter-coffee.jpg" width="160"> | ![Northlight style](docs/screenshots/08b-brand-style-northlight.png) |
| <img src="docs/brand-examples/copper-kettle-sourdough-101.jpg" width="160"> <img src="docs/brand-examples/copper-kettle-bread-table.jpg" width="160"> | ![Bakery style](docs/screenshots/09b-brand-style-bakery.png) |

## Screenshots

| | |
| --- | --- |
| ![Paste the event](docs/screenshots/01-paste-event.png) **Paste the event** | ![Check the facts](docs/screenshots/02-check-facts.png) **Check the facts** |
| ![Posts per platform](docs/screenshots/03-posts-per-platform.png) **Posts per platform** | ![Refine a poster](docs/screenshots/05-refine-poster.png) **Refine the chosen poster** |
| ![Approve](docs/screenshots/06-approve.png) **Approve the exact version** | ![Publish](docs/screenshots/07-publish.png) **Publish and the Facebook checklist** |

## How it's built

- **Electron + React 19 + TypeScript + Vite**, tested with Vitest (80+ unit tests).
- **Secrets never reach the UI.** The OpenAI key lives in the main process, encrypted with the
  macOS Keychain (`safeStorage`); the renderer talks to AI only through a narrow preload bridge.
  Optional app password lock.
- **Structured AI output.** Every AI task uses a JSON schema (fact extraction, copy, titles, style
  summaries, poster checks), and all user-supplied text is passed as data, never as instructions.
- **Facts stay exact.** In "exact text" mode the AI paints only the art; the app typesets the
  title, date, time and venue itself on a canvas. AI-drawn posters are read back and compared
  against the confirmed facts before they're offered.
- **Theme from a logo.** `src/theme/extract.ts` clusters logo pixels into a palette and checks
  contrast; `brandCssVars()` turns it into the CSS variables every component uses.
- **Sync-ready data.** Every record has an id, client, timestamps, soft delete and a revision
  counter, ready for the planned phone companion app. Local saves are atomic with rolling backups.
- **Practice AI.** With no key (or in a plain browser) a deterministic stand-in answers every
  task, so the full flow can be demoed and developed offline.

```
electron/   main process: window, AI calls, Keychain secrets, media files, app lock
src/steps/  one screen per step (intake, facts, copy, poster, approve, publish)
src/ai/     prompts + schemas, task functions, practice AI
src/poster/ canvas compositing, text layout, platform sizes
src/theme/  brand profiles, logo palette extraction, fonts, app icon
src/data/   data model, store, date/time parsing
```

## Run it

```bash
npm install
npm run dev     # UI in a browser at http://localhost:5317 (practice AI)
npm run app     # build and open the desktop app
npm test
```

Add an OpenAI key in **Settings → OpenAI** for real AI output.

## Note on this repository

This is a public showcase of a product in active development. The production prompt engineering
(extraction rules, editorial voice guidance and poster art direction) is private; `src/ai/prompts.ts`
here contains condensed stand-ins with the same functions and schemas, so everything builds, runs
and passes its tests. Live publishing connectors are being finished; practice mode covers the
full flow today.

© 2026 Michael Perry. All rights reserved.
