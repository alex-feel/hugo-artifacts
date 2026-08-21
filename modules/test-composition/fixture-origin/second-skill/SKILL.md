---
name: second-skill
description: A second single-file skill, so the set of artifacts a build publishes has more than one member and an answer that named a constant could not pass for a derived one.
---

# Second skill

This skill exists only so that two artifacts are published rather than one. A hook that returned a hardcoded URL would satisfy every assertion about a single artifact, and this entry is what makes the difference visible.

The body names no sibling file of any kind, so the supporting-file detector must stay silent about it.
