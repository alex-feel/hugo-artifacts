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
    fillText(tags, ctx.show.tags && hit.tags && hit.tags.length ? hit.tags.join(', ') : '');
  }

  const categories = slot('categories');
  if (categories) {
    fillText(
      categories,
      ctx.show.categories && hit.categories && hit.categories.length
        ? hit.categories.join(', ')
        : '',
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
// carrying an h2.search__group-title and a nested .search__list. Group
// titles are real headings so screen-reader users navigate groups natively.
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
  for (const group of groups.values()) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search__group';
    if (group.title) {
      const heading = document.createElement('h2');
      heading.className = 'search__group-title';
      heading.textContent = group.title;
      wrapper.appendChild(heading);
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
