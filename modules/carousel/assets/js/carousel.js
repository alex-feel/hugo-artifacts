// carousel: light-DOM, dependency-free progressive enhancement for the
// style-agnostic APG grouped (buttons-only, non-tabbed) carousel shortcode.
//
// The server renders a labeled region of visible, stacked, labeled slides
// (WAI-ARIA APG carousel baseline) that works fully without JavaScript --
// this script only reveals the JS-only controls/picker and wires navigation.
// Keyboard model (APG grouped/buttons-only variant, implemented exactly,
// never a hybrid): Tab reaches prev, next, picker buttons, then interactive
// slide content; Enter/Space are native button activation; activating
// prev/next NEVER moves focus off the button (repeat-press per APG); there
// is no arrow-key roving tabindex (that is the tabbed variant, deliberately
// not shipped here). This script never manages focus anywhere, ever.
//
// Events dispatched on the root (bubbling CustomEvents):
//   carousel:init   detail: {index, count}                   - once, after wiring
//   carousel:change detail: {index, count, trigger}           - trigger: prev|next|goto|scroll
//
// Refuses to: autoplay or run any timer (no rotation code exists at all);
// implement swipe/drag math (native scrolling covers touch additively;
// buttons are the WCAG 2.5.1 single-pointer path); clone DOM for looping
// (index wrap only); inject styles or CSS; write history entries (no
// :target); touch the network; observe mutations; manage focus.
//
// The repo-root ESLint flat config grants browser globals only to
// enumerated bundle paths, so this file declares the DOM globals it uses
// via a flat-config-honored /* global */ directive.
/* global window, document, CustomEvent, IntersectionObserver */

(function () {
  'use strict';

  // Window-level run guard: the shortcode emits the script tag once per
  // placement, and a second script execution (a re-run, a host that
  // re-executes body scripts) must be a no-op.
  if (window.__carouselInit) {
    return;
  }
  window.__carouselInit = true;

  var IO_THRESHOLD = 0.6;
  var IO_DEBOUNCE_MS = 120;

  function dispatch(root, name, detail) {
    root.dispatchEvent(new CustomEvent(name, {bubbles: true, detail: detail}));
  }

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollBehavior() {
    return reduceMotion() ? 'auto' : 'smooth';
  }

  // A slide is "concealed" only when the consumer's own CSS actually hides
  // it (display:none/visibility:hidden collapse the box to zero client
  // rects); an unstyled page keeps every slide visible and this guard then
  // correctly skips inert/aria-hidden rather than hiding visible content.
  function isConcealed(slide) {
    return slide.getClientRects().length === 0;
  }

  function wire(root) {
    var slides = root.querySelectorAll('[data-carousel-track] > .carousel__slide');
    var count = slides.length;
    if (count < 1) {
      return;
    }

    var track = root.querySelector('[data-carousel-track]');
    var prevButton = root.querySelector('[data-carousel-prev]');
    var nextButton = root.querySelector('[data-carousel-next]');
    var pickerButtons = root.querySelectorAll('[data-carousel-goto]');
    var loop = root.hasAttribute('data-loop');
    var mode = root.getAttribute('data-mode') || 'scroll';

    var start = parseInt(root.getAttribute('data-start'), 10);
    if (!(start >= 1 && start <= count)) {
      start = 1;
    }
    var current = start;

    function controlWrapper(control) {
      return control ? control.closest('.carousel__controls') : null;
    }

    function pickerWrapper() {
      return root.querySelector('.carousel__picker');
    }

    function reveal(wrapper) {
      if (wrapper) {
        wrapper.hidden = false;
      }
    }

    function applyConcealment(index) {
      if (mode !== 'slide') {
        return;
      }
      for (var i = 0; i < count; i++) {
        var slide = slides[i];
        if (i === index - 1) {
          slide.removeAttribute('inert');
          slide.removeAttribute('aria-hidden');
        } else if (isConcealed(slide)) {
          slide.setAttribute('inert', '');
          slide.setAttribute('aria-hidden', 'true');
        }
      }
    }

    function applyState(index) {
      current = index;
      for (var i = 0; i < count; i++) {
        var slide = slides[i];
        if (i === index - 1) {
          slide.classList.add('carousel__slide--current');
          slide.setAttribute('data-current', 'true');
        } else {
          slide.classList.remove('carousel__slide--current');
          slide.removeAttribute('data-current');
        }
      }
      applyConcealment(index);

      for (var p = 0; p < pickerButtons.length; p++) {
        var button = pickerButtons[p];
        var isCurrent = parseInt(button.getAttribute('data-carousel-goto'), 10) === index;
        button.classList.toggle('carousel__picker-button--current', isCurrent);
        if (isCurrent) {
          button.setAttribute('aria-disabled', 'true');
          button.setAttribute('aria-current', 'true');
        } else {
          button.removeAttribute('aria-disabled');
          button.removeAttribute('aria-current');
        }
      }

      if (prevButton) {
        if (!loop && index <= 1) {
          prevButton.setAttribute('aria-disabled', 'true');
        } else {
          prevButton.removeAttribute('aria-disabled');
        }
      }
      if (nextButton) {
        if (!loop && index >= count) {
          nextButton.setAttribute('aria-disabled', 'true');
        } else {
          nextButton.removeAttribute('aria-disabled');
        }
      }
    }

    function applyCurrent(index, trigger) {
      applyState(index);
      dispatch(root, 'carousel:change', {index: index, count: count, trigger: trigger});
    }

    function goTo(index, trigger) {
      var target = index;
      if (loop) {
        target = ((target - 1 + count) % count) + 1;
      } else if (target < 1 || target > count) {
        return;
      }
      if (target === current) {
        return;
      }
      applyCurrent(target, trigger);
      slides[target - 1].scrollIntoView({
        behavior: scrollBehavior(),
        inline: 'center',
        block: 'nearest',
      });
    }

    if (prevButton) {
      prevButton.addEventListener('click', function () {
        if (!loop && current <= 1) {
          return;
        }
        goTo(current - 1, 'prev');
      });
    }
    if (nextButton) {
      nextButton.addEventListener('click', function () {
        if (!loop && current >= count) {
          return;
        }
        goTo(current + 1, 'next');
      });
    }
    for (var g = 0; g < pickerButtons.length; g++) {
      (function (button) {
        button.addEventListener('click', function () {
          var index = parseInt(button.getAttribute('data-carousel-goto'), 10);
          if (index >= 1 && index <= count) {
            goTo(index, 'goto');
          }
        });
      })(pickerButtons[g]);
    }

    // mode=scroll: sync the current-slide state from the user's own
    // scrolling (buttons, native touch scroll, keyboard scroll) rather than
    // only from button clicks. scrollend fires once per gesture; the
    // IntersectionObserver fallback is debounced because it can fire
    // multiple times during one flick.
    if (mode === 'scroll' && track) {
      var syncFromMajorityVisible = function (visible) {
        if (!visible) {
          return;
        }
        var index = -1;
        for (var i = 0; i < count; i++) {
          if (slides[i] === visible) {
            index = i + 1;
            break;
          }
        }
        if (index >= 1 && index !== current) {
          applyCurrent(index, 'scroll');
        }
      };

      if ('onscrollend' in window) {
        track.addEventListener('scrollend', function () {
          var trackRect = track.getBoundingClientRect();
          var center = trackRect.left + trackRect.width / 2;
          var best = null;
          var bestDistance = Infinity;
          for (var i = 0; i < count; i++) {
            var rect = slides[i].getBoundingClientRect();
            var mid = rect.left + rect.width / 2;
            var distance = Math.abs(mid - center);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = slides[i];
            }
          }
          syncFromMajorityVisible(best);
        });
      } else if (typeof IntersectionObserver !== 'undefined') {
        var pendingTimer = null;
        var observer = new IntersectionObserver(
          function (entries) {
            if (pendingTimer) {
              window.clearTimeout(pendingTimer);
            }
            pendingTimer = window.setTimeout(function () {
              var best = null;
              var bestRatio = 0;
              for (var i2 = 0; i2 < entries.length; i2++) {
                var entry = entries[i2];
                if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
                  bestRatio = entry.intersectionRatio;
                  best = entry.target;
                }
              }
              syncFromMajorityVisible(best);
              pendingTimer = null;
            }, IO_DEBOUNCE_MS);
          },
          {root: track, threshold: IO_THRESHOLD},
        );
        for (var s = 0; s < count; s++) {
          observer.observe(slides[s]);
        }
      }
    }

    reveal(controlWrapper(prevButton) || controlWrapper(nextButton));
    reveal(pickerWrapper());
    if (track) {
      track.setAttribute('aria-live', 'polite');
      track.setAttribute('aria-atomic', 'false');
    }

    applyState(current);
    root.classList.add('carousel--enhanced');
    root.setAttribute('data-enhanced', 'true');
    dispatch(root, 'carousel:init', {index: current, count: count});
  }

  function init() {
    var roots = document.querySelectorAll('[data-carousel]:not([data-enhanced])');
    for (var i = 0; i < roots.length; i++) {
      wire(roots[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
