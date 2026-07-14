// social-share: light-DOM, dependency-free progressive enhancement for the
// style-agnostic sharing bar partial/shortcode.
//
// The server renders plain share-intent links that work without JavaScript
// and cause zero third-party contact before a deliberate click. This script
// adds only what genuinely needs scripting: it reveals the hidden Web Share,
// copy-link, and print buttons when the underlying capability exists, wires
// their behavior, and dispatches bubbling CustomEvents so the consuming site
// can observe sharing activity without any tracker:
//
//   social-share:share   detail: {network, url}    - intent link clicked
//   social-share:action  detail: {action, url, ok} - button action finished
//
// detail.url is always the canonical page URL from data-share-url, never a
// constructed intent href. All user-visible strings arrive as data
// attributes on the root <nav> (server-side i18n), so this script is
// translation-free; status messages are written with textContent only.
//
// The repo-root ESLint flat config grants browser globals only to enumerated
// bundle paths, so this file also declares the DOM globals it uses via a
// flat-config-honored /* global */ directive.
/* global document, navigator, window, CustomEvent */

(function () {
  'use strict';

  var COPY_RESET_MS = 3000;

  function dispatch(root, name, detail) {
    root.dispatchEvent(new CustomEvent(name, {bubbles: true, detail: detail}));
  }

  function announce(root, text) {
    var status = root.querySelector('.social-share__status');
    if (status) {
      status.textContent = text || '';
    }
  }

  function revealItem(button) {
    var item = button.closest('.social-share__item');
    if (item) {
      // The server hides action items with BOTH the hidden attribute and an
      // inline display:none (the attribute alone loses to ordinary consumer
      // display rules); reveal must clear both.
      item.hidden = false;
      item.style.removeProperty('display');
    }
  }

  function wireWebShare(root, button, url, title, text) {
    if (!navigator.share) {
      return;
    }
    revealItem(button);
    button.addEventListener('click', function () {
      var data = {title: title, url: url};
      if (text) {
        data.text = text;
      }
      navigator.share(data).then(
        function () {
          dispatch(root, 'social-share:action', {action: 'webshare', url: url, ok: true});
        },
        function (error) {
          // Closing the share sheet rejects with AbortError (a user
          // decision) and a second click while a share sheet is already
          // open rejects with InvalidStateError (the first share is still
          // working); neither is a failure -- stay silent.
          if (error && (error.name === 'AbortError' || error.name === 'InvalidStateError')) {
            return;
          }
          announce(root, root.getAttribute('data-share-error-label'));
          dispatch(root, 'social-share:action', {action: 'webshare', url: url, ok: false});
        },
      );
    });
  }

  function wireCopy(root, button, url) {
    if (!(navigator.clipboard && window.isSecureContext)) {
      return;
    }
    revealItem(button);
    var timer = null;
    button.addEventListener('click', function () {
      navigator.clipboard.writeText(url).then(
        function () {
          announce(root, root.getAttribute('data-share-copied-label'));
          button.classList.add('social-share__button--copied');
          root.classList.add('social-share--copied');
          if (timer) {
            window.clearTimeout(timer);
          }
          timer = window.setTimeout(function () {
            announce(root, '');
            button.classList.remove('social-share__button--copied');
            root.classList.remove('social-share--copied');
            timer = null;
          }, COPY_RESET_MS);
          dispatch(root, 'social-share:action', {action: 'copy', url: url, ok: true});
        },
        function () {
          announce(root, root.getAttribute('data-share-copy-error-label'));
          dispatch(root, 'social-share:action', {action: 'copy', url: url, ok: false});
        },
      );
    });
  }

  function resetCopyFeedback(root) {
    // A bar restored from a DOM snapshot (Turbo/PJAX page caches restore
    // via cloneNode) can carry copy feedback frozen mid-reset with no timer
    // running; wiring starts from a clean state.
    root.classList.remove('social-share--copied');
    var copied = root.querySelectorAll('.social-share__button--copied');
    for (var i = 0; i < copied.length; i++) {
      copied[i].classList.remove('social-share__button--copied');
    }
    announce(root, '');
  }

  function wirePrint(root, button, url) {
    revealItem(button);
    button.addEventListener('click', function () {
      window.print();
      dispatch(root, 'social-share:action', {action: 'print', url: url, ok: true});
    });
  }

  function wireLinks(root, url) {
    var links = root.querySelectorAll('.social-share__link');
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        link.addEventListener('click', function () {
          dispatch(root, 'social-share:share', {
            network: link.getAttribute('data-share-network'),
            url: url,
          });
        });
      })(links[i]);
    }
  }

  function wire(root) {
    resetCopyFeedback(root);

    var url = root.getAttribute('data-share-url') || window.location.href;
    var title = root.getAttribute('data-share-title') || document.title;
    var text = root.getAttribute('data-share-text') || '';

    wireLinks(root, url);

    var buttons = root.querySelectorAll('.social-share__button[data-share-action]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var action = button.getAttribute('data-share-action');
      if (action === 'webshare') {
        wireWebShare(root, button, url, title, text);
      } else if (action === 'copy') {
        wireCopy(root, button, url);
      } else if (action === 'print') {
        wirePrint(root, button, url);
      }
    }

    // The wired-guard is a property on the element, not the class below: a
    // bar restored from a DOM snapshot (Turbo/PJAX page caches restore via
    // cloneNode) keeps its class attributes but loses its listeners AND its
    // expando properties, so a restored clone is correctly seen as unwired.
    // The class is purely the CSS state hook.
    root.__socialShareWired = true;
    root.classList.add('social-share--enhanced');
  }

  function init() {
    // Idempotent: a page can legitimately carry this script more than once
    // (a list layout embedding the rendered .Content of several posts), and
    // consumers may re-run it for late-inserted or snapshot-restored bars;
    // the wired-guard property lives on the element object itself, so every
    // script instance sees it and no bar ever gets duplicate listeners.
    var roots = document.querySelectorAll('.social-share');
    for (var i = 0; i < roots.length; i++) {
      if (!roots[i].__socialShareWired) {
        wire(roots[i]);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Bars inserted or restored after the initial load (PJAX/Turbo swaps and
  // cache restores, AJAX-loaded content) are not wired automatically; the
  // host page opts in by dispatching this event after inserting them (for
  // Turbo Drive, on turbo:load). One listener serves every script instance:
  // init reads no per-instance state, and under Turbo Drive the document
  // survives navigations while body scripts re-execute on every visit, so
  // an unguarded registration would accumulate one listener per visit.
  if (!document.__socialShareRescanWired) {
    document.__socialShareRescanWired = true;
    document.addEventListener('social-share:rescan', init);
  }
})();
