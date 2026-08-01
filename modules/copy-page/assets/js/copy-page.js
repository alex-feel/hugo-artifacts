// copy-page: light-DOM, dependency-free progressive enhancement for the
// style-agnostic "Copy page" split-button partial/shortcode.
//
// The server renders a native <details> disclosure menu of link rows that
// works without JavaScript and causes zero third-party contact before a
// deliberate click. This script adds only what genuinely needs scripting:
// it reveals the dual-hidden copy controls when the Clipboard API exists,
// wires the copy flow and the menu conveniences (Escape, outside-close,
// close-on-activate), and dispatches bubbling CustomEvents so the consuming
// site can observe activity without any tracker:
//
//   copy-page:action  detail: {action: 'copy', url, ok} - copy attempt done
//   copy-page:open    detail: {row, href, url}          - link row activated
//
// detail.url is always the widget's Markdown URL from data-copy-page-url,
// never a row's destination href. All user-visible strings arrive as data
// attributes on the root (server-side i18n), so this script is
// translation-free; status messages are written with textContent only.
//
// Copy flow: every path starts synchronously inside the click handler,
// because Safari expires transient user activation across await boundaries
// (WebKit bug 222262) -- a writeText issued after an awaited fetch throws
// NotAllowedError there. Layered write paths, chosen at click time:
//   1. Cache hit: writeText immediately (a synchronous string read -- never
//      an already-resolved promise, which still crosses a microtask).
//   2. Cache miss + ClipboardItem: clipboard.write() of a ClipboardItem
//      whose text/plain is a promise resolving to a Blob (Chrome/Edge
//      98-132 reject string payloads). A synchronous constructor throw
//      falls through to path 3 (it consumes no activation); a rejected
//      write() whose embedded fetch nevertheless populated the cache
//      retries once with writeText (rescues Chrome/Edge 76-97, which
//      auto-grant clipboard-write to the focused tab).
//   3. Cache miss, no usable ClipboardItem (Firefox 63-126, Chrome 66-75):
//      await the fetch, then writeText.
// Any failure, including a non-ok response, announces the error label,
// dispatches ok:false, and writes NOTHING to the clipboard.
//
// The repo-root ESLint flat config grants browser globals only to
// enumerated bundle paths, so this file declares the DOM globals it uses
// via a flat-config-honored /* global */ directive.
/* global document, navigator, window, CustomEvent, ClipboardItem, Blob, fetch */

(function () {
  'use strict';

  // Window-level run guard: the partial emits the script tag once per
  // PLACEMENT (paginator outputs), and hosts like Turbo Drive re-execute
  // body scripts on every visit; a second execution is a no-op.
  if (window.__copyPageInit) {
    return;
  }
  window.__copyPageInit = true;

  var COPY_RESET_MS = 3000;

  // Module-scope plain-string cache keyed by Markdown URL. The hit check
  // MUST stay a synchronous string read (see the header): caching the
  // fetch PROMISE instead would put even a warm hit behind a microtask
  // boundary, back inside Safari's unreliable zone.
  var cache = {};

  function dispatch(root, name, detail) {
    root.dispatchEvent(new CustomEvent(name, {bubbles: true, detail: detail}));
  }

  function announce(root, text) {
    var status = root.querySelector('.copy-page__status');
    if (status) {
      status.textContent = text || '';
    }
  }

  function fetchText(url) {
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        return response.text();
      })
      .then(function (text) {
        cache[url] = text;
        return text;
      });
  }

  // The server hides the JS-only copy controls with BOTH the hidden
  // attribute and an inline display:none (the attribute alone loses to
  // ordinary consumer display rules); reveal must clear both. The primary
  // button carries the pair itself; the menu copy row carries it on its
  // <li> wrapper.
  function revealControl(control) {
    var target = control.closest('.copy-page__item') || control;
    target.hidden = false;
    target.style.removeProperty('display');
  }

  // Outside interaction closes any open menu: one delegated pair of
  // document listeners serves every widget (the run guard above ensures a
  // single registration). Only enhanced widgets are touched -- a widget
  // inserted later and not yet rescanned keeps pure native behavior.
  function closeMenusOutside(target) {
    var menus = document.querySelectorAll('.copy-page--enhanced .copy-page__menu[open]');
    for (var i = 0; i < menus.length; i++) {
      if (!(target && menus[i].contains(target))) {
        menus[i].removeAttribute('open');
      }
    }
  }

  document.addEventListener('pointerdown', function (event) {
    closeMenusOutside(event.target);
  });

  document.addEventListener('focusin', function (event) {
    closeMenusOutside(event.target);
  });

  function resetFeedback(root) {
    // A widget restored from a DOM snapshot (Turbo/PJAX page caches restore
    // via cloneNode) can carry copy feedback frozen mid-reset with no timer
    // running; wiring starts from a clean state.
    root.classList.remove('copy-page--copied');
    var copied = root.querySelectorAll('.copy-page__copy--copied, .copy-page__row--copied');
    for (var i = 0; i < copied.length; i++) {
      copied[i].classList.remove('copy-page__copy--copied');
      copied[i].classList.remove('copy-page__row--copied');
    }
    announce(root, '');
  }

  function wire(root) {
    resetFeedback(root);

    var url = root.getAttribute('data-copy-page-url') || '';
    var primary = root.querySelector('.copy-page__copy');
    var details = root.querySelector('.copy-page__menu');
    var summary = details ? details.querySelector('.copy-page__toggle') : null;
    var canCopy = !!(
      window.isSecureContext &&
      navigator.clipboard &&
      navigator.clipboard.writeText
    );
    var timer = null;
    var warming = false;

    function closeMenu() {
      if (details) {
        details.open = false;
      }
    }

    function succeed(control) {
      announce(root, root.getAttribute('data-copy-page-copied-label'));
      root.classList.add('copy-page--copied');
      if (control.classList.contains('copy-page__copy')) {
        control.classList.add('copy-page__copy--copied');
      } else {
        control.classList.add('copy-page__row--copied');
        // The menu's copy row mirrors its copied state on the primary
        // button, so the visible half of the split button reflects the
        // action even though the row itself just closed with the menu.
        if (primary) {
          primary.classList.add('copy-page__copy--copied');
        }
      }
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(function () {
        resetFeedback(root);
        timer = null;
      }, COPY_RESET_MS);
      dispatch(root, 'copy-page:action', {action: 'copy', url: url, ok: true});
    }

    function fail() {
      announce(root, root.getAttribute('data-copy-page-error-label'));
      dispatch(root, 'copy-page:action', {action: 'copy', url: url, ok: false});
    }

    function performCopy(control) {
      var write = null;
      if (typeof cache[url] === 'string') {
        // Path 1: warm cache, write immediately.
        write = navigator.clipboard.writeText(cache[url]);
      } else {
        // The fetch starts synchronously either way; paths 2 and 3 differ
        // only in how its result reaches the clipboard.
        var pending = fetchText(url);
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
          try {
            // Path 2: hand the clipboard a promise for the text.
            var item = new ClipboardItem({
              'text/plain': pending.then(function (text) {
                return new Blob([text], {type: 'text/plain'});
              }),
            });
            write = navigator.clipboard.write([item]).catch(function (error) {
              if (typeof cache[url] === 'string') {
                // The write was rejected but the embedded fetch landed:
                // retry once with plain writeText (Chrome/Edge 76-97
                // reject promise payloads yet auto-grant clipboard-write
                // to the focused tab, so the late writeText succeeds).
                return navigator.clipboard.writeText(cache[url]);
              }
              throw error;
            });
          } catch (_constructionError) {
            // A synchronous ClipboardItem construction throw consumes no
            // user activation; fall through to path 3.
            write = null;
          }
        }
        if (!write) {
          // Path 3: await the (already started) fetch, then writeText.
          write = pending.then(function (text) {
            return navigator.clipboard.writeText(text);
          });
        }
      }
      write.then(function () {
        succeed(control);
      }, fail);
    }

    if (canCopy) {
      var controls = root.querySelectorAll('[data-copy-page-action="copy"]');
      for (var i = 0; i < controls.length; i++) {
        (function (control) {
          revealControl(control);
          control.addEventListener('click', function () {
            if (details && details.contains(control)) {
              closeMenu();
            }
            performCopy(control);
          });
        })(controls[i]);
      }

      // Warm-up: pre-fetch into the cache on the first hover or focus, so
      // the click usually lands on path 1. An optimization only -- touch
      // devices get no hover, and the miss paths above remain the
      // structural guarantee.
      var warm = function () {
        if (warming || typeof cache[url] === 'string') {
          return;
        }
        warming = true;
        fetchText(url).then(null, function () {
          warming = false;
        });
      };
      root.addEventListener('pointerenter', warm);
      root.addEventListener('focusin', warm);
    }

    if (details) {
      // Escape closes the menu and returns focus to its toggle; the event
      // is consumed so an ancestor dismissal (a modal host) does not also
      // fire off the same keypress.
      details.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && details.open) {
          event.stopPropagation();
          closeMenu();
          if (summary) {
            summary.focus();
          }
        }
      });

      // Activating a link row closes the menu; the navigation itself is
      // left to the browser.
      var rows = details.querySelectorAll('a.copy-page__row');
      for (var j = 0; j < rows.length; j++) {
        (function (row) {
          row.addEventListener('click', function () {
            dispatch(root, 'copy-page:open', {
              row: row.getAttribute('data-copy-page-row'),
              href: row.href,
              url: url,
            });
            closeMenu();
          });
        })(rows[j]);
      }
    }

    // The wired-guard is a property on the element, not the class below: a
    // widget restored from a DOM snapshot keeps its class attributes but
    // loses its listeners AND its expando properties, so a restored clone
    // is correctly seen as unwired. The class is purely the CSS state hook.
    root.__copyPageWired = true;
    root.classList.add('copy-page--enhanced');
  }

  function init() {
    var roots = document.querySelectorAll('.copy-page');
    for (var i = 0; i < roots.length; i++) {
      if (!roots[i].__copyPageWired) {
        wire(roots[i]);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Widgets inserted or restored after the initial load (PJAX/Turbo swaps
  // and cache restores, AJAX-loaded content) are not wired automatically;
  // the host page opts in by dispatching this event after inserting them
  // (for Turbo Drive, on turbo:load). The run guard above already limits
  // this registration to one listener per document.
  document.addEventListener('copy-page:rescan', init);
})();
