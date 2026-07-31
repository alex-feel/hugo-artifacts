---
title: 'Map-form opt-out'
description: 'Uses the documented agent: {exclude: true} map form rather than the bare shorthand.'
date: 2026-06-10T09:00:00Z
agent:
  exclude: true
---

Placed INSIDE the sections allow-list on purpose: at the site root it would be dropped by the allow-list instead, and the assertion would not be about the opt-out at all. The README publishes `agent: false` and `agent: {exclude: true}` as equivalent. Only the shorthand had a fixture page, so the `isset` branch that implements the map form survived deletion with the suite green.
