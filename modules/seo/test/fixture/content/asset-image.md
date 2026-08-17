---
title: 'A Page Whose Image Is A Global Asset'
description: 'Declares an assets/ image, which Hugo publishes only when a template reads its URL -- unlike a bundled one, which ships with the page either way.'
images: ['img/wide.png']
---

Every other image in this fixture is either a page-bundle resource or a static file, and Hugo writes both of those into the output whether or not any template touches them. That makes them useless for telling a module that publishes what it names from one that publishes everything it considers: the file is there regardless.

An `assets/` image is the only shape where the difference shows. This page emits the 1.91:1 crop and nothing else, so the source measuring 800x400 reaches `public/` exactly when something reads its URL for no reason.
