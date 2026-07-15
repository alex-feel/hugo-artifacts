// youtube-embed: light-DOM, dependency-free progressive enhancement for the
// privacy-first YouTube facade shortcode.
//
// On load the facade is poster + <button> only -- no iframe, no third-party
// contact. This script wires each facade so that activating the button injects
// the youtube-nocookie player iframe built from the server-rendered
// data-embed-url, swaps it in place of the poster, marks the facade activated,
// and moves focus into the iframe for keyboard users.
//
// It is intentionally NOT a web component and uses NO Shadow DOM, so the
// consuming site styles the light-DOM BEM markup directly.
//
// The repo-root ESLint flat config is protected and grants browser globals only
// to enumerated bundle paths, so this file declares the DOM globals it uses via
// a flat-config-honored /* global */ directive rather than relying on an env.
/* global document */

(function () {
  'use strict';

  // Player permissions. autoplay is present because the user click is the
  // gesture that authorizes it (the embed URL carries autoplay=1 without mute).
  var ALLOW =
    'accelerometer; autoplay; clipboard-write; encrypted-media; ' +
    'gyroscope; picture-in-picture; web-share';

  function activate(root) {
    if (root.classList.contains('youtube-embed--activated')) {
      return;
    }

    var embedUrl = root.getAttribute('data-embed-url');
    if (!embedUrl) {
      return;
    }

    var body = root.querySelector('.youtube-embed__body') || root;

    var iframe = document.createElement('iframe');
    iframe.className = 'youtube-embed__iframe';
    iframe.setAttribute('src', embedUrl);
    iframe.setAttribute('allow', ALLOW);
    iframe.setAttribute('allowfullscreen', '');

    // The server-rendered data-title attribute carries the iframe title (the
    // video title, or a localized generic player label when untitled), so the
    // embedded player gets a meaningful accessible name in the site's own
    // language.
    var title = root.getAttribute('data-title');
    if (title) {
      iframe.setAttribute('title', title);
    }

    // Replace the facade interior with the player. Clearing the body removes the
    // poster, the button, the visible title, and the fallback link in one step.
    body.textContent = '';
    body.appendChild(iframe);

    root.classList.add('youtube-embed--activated');

    // Move focus into the freshly injected player for keyboard continuity.
    try {
      iframe.focus({preventScroll: true});
    } catch (_e) {
      iframe.focus();
    }
  }

  function wire(root) {
    var button = root.querySelector('.youtube-embed__button');
    if (!button) {
      return;
    }
    // With scripting available, the play button is the control. Hide the JS-off
    // fallback link so keyboard and screen-reader users do not meet a second,
    // away-navigating affordance for the same video. A visitor without JS never
    // runs this, so the link stays visible for them. The --enhanced modifier
    // lets the consuming site key any progressive-enhancement styling.
    var link = root.querySelector('.youtube-embed__link');
    if (link) {
      link.hidden = true;
    }
    root.classList.add('youtube-embed--enhanced');
    button.addEventListener('click', function (event) {
      event.preventDefault();
      activate(root);
    });
  }

  function init() {
    var nodes = document.querySelectorAll('.youtube-embed');
    for (var i = 0; i < nodes.length; i++) {
      wire(nodes[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
