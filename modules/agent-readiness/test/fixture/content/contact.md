---
title: 'Contact'
description: 'Contact channels, read by the facts document from this page.'
channels:
  - label: 'Email form'
    value: 'Contact form'
    href: '/contact/'
  - label: 'Repository'
    value: 'example/fixture'
    href: 'https://example.invalid/fixture'
  # A non-http scheme, so the site-relative resolution cannot be implemented
  # as "prepend the baseURL to everything".
  - label: 'Email'
    value: 'hello@fixture.example'
    href: 'mailto:hello@fixture.example'
  - label: 'No URL'
    value: 'A channel carrying no href at all'
  # A destination carrying parentheses, which unencoded would end the
  # Markdown link destination at the first closing parenthesis and leave a
  # stray ")" as literal text.
  - label: 'Reference'
    value: 'Fixture reference'
    href: 'https://wiki.example/Fixture_(reference)'
  - href: "https://probe.example/x\ny"
---

Contact prose.
