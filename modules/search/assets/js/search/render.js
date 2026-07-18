// search/render.js: <template> cloning and slot filling. Slots are filled
// exclusively with textContent and attribute setters -- NO innerHTML of
// query- or index-derived strings, ever. href is trusted without a scheme
// filter ONLY because the index pipeline sources it exclusively from the
// page's own relative permalink; that invariant is the trust boundary. The
// img slot DOES carry a scheme filter: only http(s) and relative URLs may
// reach src.
/* global document, URL */

function reveal(el) {
  el.hidden = false;
  el.style.removeProperty('display');
}

function fillText(el, text) {
  if (text) {
    el.textContent = text;
    reveal(el);
    return true;
  }
  el.remove();
  return false;
}

// Fills a taxonomy slot with one child element per term, so every term is
// an addressable styling hook (chip presentation), and puts each separator
// in its own classed element so a consumer can hide them -- unstyled, the
// slot still reads "a, b, c". A list slot (a shadowed template may use
// <ul>/<ol>) gets <li> children and no text separators; any other slot
// element gets <span> children.
function fillTerms(el, terms, termClass, separatorClass) {
  if (!terms || !terms.length) {
    el.remove();
    return;
  }
  el.textContent = '';
  const isList = el.tagName === 'UL' || el.tagName === 'OL';
  terms.forEach((term, index) => {
    if (index > 0 && !isList) {
      const separator = document.createElement('span');
      separator.className = separatorClass;
      separator.textContent = ', ';
      el.appendChild(separator);
    }
    const item = document.createElement(isList ? 'li' : 'span');
    item.className = termClass;
    item.textContent = term;
    el.appendChild(item);
  });
  reveal(el);
}

function safeImageSrc(src) {
  if (!src) {
    return '';
  }
  let url;
  try {
    url = new URL(src, document.baseURI);
  } catch {
    return '';
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? src : '';
}

function localizedDate(iso, lang) {
  try {
    const date = new Date(iso + 'T00:00:00Z');
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return iso;
  }
}

// Clones the surface's result template for one hit. ctx:
// {lang, show: {description, image, tags, categories, dates}, grouped,
//  listbox, optionId, highlighter, terms}.
export function renderResult(template, hit, ctx) {
  const fragment = template.content.cloneNode(true);
  const item = fragment.firstElementChild;
  if (!item) {
    return null;
  }

  if (ctx.listbox) {
    item.classList.remove('search__result');
    item.classList.add('search__option');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    if (ctx.optionId) {
      item.id = ctx.optionId;
    }
  }

  const slot = (name) => item.querySelector('[data-search-slot="' + name + '"]');

  const link = slot('href');
  if (link) {
    link.setAttribute('href', hit.href);
    if (ctx.listbox) {
      // The activedescendant pattern keeps DOM focus in the input: options
      // are reached with arrow keys (and remain clickable), never with Tab.
      link.setAttribute('tabindex', '-1');
    }
  }

  const title = slot('title');
  if (title) {
    title.textContent = hit.title || hit.href;
    if (ctx.highlighter && ctx.terms) {
      ctx.highlighter.highlight(title, ctx.terms);
    }
  }

  const section = slot('section');
  if (section) {
    // The section slot displays the human section title; in grouped mode the
    // group heading already names it, so the slot stays out of the way.
    fillText(section, ctx.grouped ? '' : hit.sectionTitle || '');
  }

  const snippet = slot('snippet');
  if (snippet) {
    const filled = fillText(snippet, ctx.show.description ? hit.snippet || '' : '');
    if (filled && ctx.highlighter && ctx.terms) {
      ctx.highlighter.highlight(snippet, ctx.terms);
    }
  }

  const date = slot('date');
  if (date) {
    if (ctx.show.dates && hit.date) {
      date.setAttribute('datetime', hit.date);
      fillText(date, localizedDate(hit.date, ctx.lang));
    } else {
      date.remove();
    }
  }

  const tags = slot('tags');
  if (tags) {
    fillTerms(
      tags,
      ctx.show.tags && hit.tags ? hit.tags : [],
      'search__result-tag',
      'search__result-tag-separator',
    );
  }

  const categories = slot('categories');
  if (categories) {
    fillTerms(
      categories,
      ctx.show.categories && hit.categories ? hit.categories : [],
      'search__result-category',
      'search__result-category-separator',
    );
  }

  const image = slot('image');
  if (image) {
    const src = ctx.show.image ? safeImageSrc(hit.image) : '';
    if (src) {
      image.setAttribute('src', src);
      reveal(image);
    } else {
      image.remove();
    }
  }

  return item;
}

// Renders the dedicated page's results container: either a flat
// .search__list or, when grouping is on, .search__group blocks each
// carrying an h2.search__group-title with a span.search__group-count
// beside it and a nested .search__list. Group titles are real headings so
// screen-reader users navigate groups natively. Each group block exposes
// its section key as data-search-section (empty for root pages) and its
// rendered-result count as data-search-count -- the count covers the
// results currently rendered in the group, so it grows as "show more"
// reveals further chunks. The count element's text is zero-padded to
// ctx.countPad digits (data-search-count always carries the bare number).
// The visible count element rides only with the heading: a heading-less
// root-page group would otherwise lead with a bare, contextless number,
// so there the data attribute alone carries the value.
export function renderPageResults(container, template, hits, ctx) {
  container.textContent = '';
  if (!hits.length) {
    return;
  }
  if (!ctx.grouped) {
    const list = document.createElement('ul');
    list.className = 'search__list';
    for (const hit of hits) {
      const item = renderResult(template, hit, ctx);
      if (item) {
        list.appendChild(item);
      }
    }
    container.appendChild(list);
    return;
  }
  const groups = new Map();
  for (const hit of hits) {
    const key = hit.section || '';
    if (!groups.has(key)) {
      groups.set(key, {title: hit.sectionTitle || '', hits: []});
    }
    groups.get(key).hits.push(hit);
  }
  for (const [key, group] of groups.entries()) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search__group';
    wrapper.setAttribute('data-search-section', key);
    wrapper.setAttribute('data-search-count', String(group.hits.length));
    if (group.title) {
      const heading = document.createElement('h2');
      heading.className = 'search__group-title';
      heading.textContent = group.title;
      wrapper.appendChild(heading);
      const count = document.createElement('span');
      count.className = 'search__group-count';
      count.textContent = String(group.hits.length).padStart(ctx.countPad || 1, '0');
      wrapper.appendChild(count);
    }
    const list = document.createElement('ul');
    list.className = 'search__list';
    for (const hit of group.hits) {
      const item = renderResult(template, hit, ctx);
      if (item) {
        list.appendChild(item);
      }
    }
    wrapper.appendChild(list);
    container.appendChild(wrapper);
  }
}
