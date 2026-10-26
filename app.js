/**
 * Portfolio interactions (no dependencies)
 * - Theme toggle (remembers choice, defaults to the system setting)
 * - Sticky header state, scroll progress, active nav link, back-to-top
 * - Mobile navigation
 * - Reveal-on-scroll
 * - Project filters with counts, search, and a details dialog
 * - Copy-email button
 */

(function () {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ==========================================================================
  // Theme
  // ==========================================================================
  const themeToggle = document.getElementById('theme-toggle');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', nextTheme);
      try {
        localStorage.setItem('theme', nextTheme);
      } catch (error) {
        // Storage can be unavailable (private mode); the toggle still works for this visit.
      }
    });
  }

  // ==========================================================================
  // Header state, scroll progress, back-to-top
  // ==========================================================================
  const header = document.querySelector('.site-header');
  const progressBar = document.querySelector('.scroll-progress-bar');
  const backToTop = document.querySelector('.back-to-top');

  if (backToTop) {
    backToTop.hidden = false;
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }

  let scrollFrame = null;

  function onScroll() {
    if (scrollFrame) {
      return;
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null;
      const scrollTop = window.scrollY;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? scrollTop / scrollable : 0;

      if (progressBar) {
        progressBar.style.transform = `scaleX(${progress})`;
      }
      if (header) {
        header.classList.toggle('scrolled', scrollTop > 8);
      }
      if (backToTop) {
        backToTop.classList.toggle('show', scrollTop > window.innerHeight);
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ==========================================================================
  // Mobile navigation
  // ==========================================================================
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('nav-menu');

  function setMenu(open) {
    if (!navToggle || !navMenu) {
      return;
    }
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    navMenu.classList.toggle('open', open);
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setMenu(false));
    });

    document.addEventListener('click', (event) => {
      if (!navToggle.contains(event.target) && !navMenu.contains(event.target)) {
        setMenu(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setMenu(false);
      }
    });
  }

  // ==========================================================================
  // Active nav link (highlights the section currently in view)
  // ==========================================================================
  const navLinks = Array.from(document.querySelectorAll('.nav-menu a[href^="#"]'));
  const sectionsById = new Map();

  navLinks.forEach((link) => {
    const section = document.querySelector(link.getAttribute('href'));
    if (section) {
      sectionsById.set(section.id, link);
    }
  });

  if ('IntersectionObserver' in window && sectionsById.size) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((link) => link.classList.remove('active'));
          const activeLink = sectionsById.get(entry.target.id);
          if (activeLink) {
            activeLink.classList.add('active');
          }
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sectionsById.forEach((link, id) => {
      sectionObserver.observe(document.getElementById(id));
    });
  }

  // ==========================================================================
  // Reveal on scroll
  // ==========================================================================
  const revealItems = Array.from(document.querySelectorAll('.reveal'));

  function revealAll() {
    revealItems.forEach((item) => item.classList.add('visible'));
  }

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });

    revealItems.forEach((item) => revealObserver.observe(item));

    // Safety net: fast scrolling or anchor jumps can skip observer callbacks.
    const revealPassed = () => {
      revealItems.forEach((item) => {
        if (!item.classList.contains('visible') && item.getBoundingClientRect().top < window.innerHeight) {
          item.classList.add('visible');
        }
      });
    };
    window.addEventListener('scroll', revealPassed, { passive: true });
    window.addEventListener('resize', revealPassed, { passive: true });
    window.addEventListener('load', revealPassed);
    revealPassed();
  } else {
    revealAll();
  }

  // ==========================================================================
  // Projects: card enhancements
  // ==========================================================================
  const projectCards = Array.from(document.querySelectorAll('.project-card'));
  const filterTabs = Array.from(document.querySelectorAll('.filter-tab'));
  const searchInput = document.getElementById('project-search');
  const statusText = document.querySelector('.project-status');
  const emptyState = document.querySelector('.project-empty');
  const MAX_CARD_TAGS = 3;

  document.querySelectorAll('[data-project-count]').forEach((element) => {
    element.textContent = String(projectCards.length);
  });

  projectCards.forEach((card) => {
    const title = card.querySelector('.project-title');
    const titleText = title ? title.textContent.trim() : 'project';

    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${titleText} — open details`);

    // "+N" chip when a card has more tags than it shows.
    const tags = card.querySelectorAll('.project-tags .tag');
    if (tags.length > MAX_CARD_TAGS) {
      const moreTag = document.createElement('span');
      moreTag.className = 'tag tag-more';
      moreTag.textContent = `+${tags.length - MAX_CARD_TAGS}`;
      moreTag.setAttribute('aria-hidden', 'true');
      card.querySelector('.project-tags').appendChild(moreTag);
    }

    // Consistent "Details" action on every card.
    let links = card.querySelector('.project-links');
    if (!links) {
      links = document.createElement('div');
      links.className = 'project-links';
      card.querySelector('.project-content').appendChild(links);
    }
    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'project-more';
    detailsButton.textContent = 'Details';
    detailsButton.setAttribute('aria-label', `Details: ${titleText}`);
    links.appendChild(detailsButton);

    // Searchable text (title, category, summary, full description, tags).
    card.dataset.search = card.textContent.replace(/\s+/g, ' ').toLowerCase();
  });

  // ==========================================================================
  // Projects: filter + search
  // ==========================================================================
  let activeFilter = 'all';

  function categoryMatches(card, filter) {
    return filter === 'all' || card.getAttribute('data-category') === filter;
  }

  filterTabs.forEach((tab) => {
    const filter = tab.getAttribute('data-filter');
    const count = projectCards.filter((card) => categoryMatches(card, filter)).length;
    const badge = document.createElement('span');
    badge.className = 'filter-count';
    badge.textContent = String(count);
    badge.setAttribute('aria-hidden', 'true');
    tab.appendChild(badge);
    tab.setAttribute('aria-label', `${tab.firstChild.textContent.trim()} (${count})`);
    if (count === 0 && filter !== 'all') {
      tab.hidden = true;
    }
  });

  function applyFilters(animate) {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let visibleCount = 0;

    projectCards.forEach((card) => {
      const visible = categoryMatches(card, activeFilter) && (!query || card.dataset.search.includes(query));
      const wasHidden = card.classList.contains('hidden');
      card.classList.toggle('hidden', !visible);
      if (visible) {
        visibleCount += 1;
        if (animate && wasHidden && !reduceMotion.matches) {
          card.classList.remove('filter-enter');
          void card.offsetWidth;
          card.classList.add('filter-enter');
        }
      }
    });

    if (statusText) {
      const scope = activeFilter === 'all' ? 'all categories' : activeFilter;
      statusText.textContent = `Showing ${visibleCount} of ${projectCards.length} projects · ${scope}${query ? ` · “${query}”` : ''}`;
    }
    if (emptyState) {
      emptyState.hidden = visibleCount !== 0;
    }
  }

  function selectTab(tab) {
    activeFilter = tab.getAttribute('data-filter');
    filterTabs.forEach((otherTab) => {
      const selected = otherTab === tab;
      otherTab.classList.toggle('active', selected);
      otherTab.setAttribute('aria-selected', String(selected));
      otherTab.setAttribute('tabindex', selected ? '0' : '-1');
    });
    applyFilters(true);
  }

  filterTabs.forEach((tab) => {
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    tab.addEventListener('click', () => selectTab(tab));
  });

  const filterList = document.querySelector('.project-filters');
  if (filterList) {
    filterList.addEventListener('keydown', (event) => {
      const visibleTabs = filterTabs.filter((tab) => !tab.hidden);
      const index = visibleTabs.indexOf(document.activeElement);
      if (index === -1) {
        return;
      }
      let nextIndex = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % visibleTabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = visibleTabs.length - 1;
      }
      if (nextIndex !== null) {
        event.preventDefault();
        visibleTabs[nextIndex].focus();
        selectTab(visibleTabs[nextIndex]);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => applyFilters(false));
  }

  document.querySelectorAll('[data-reset-filters]').forEach((button) => {
    button.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
      }
      selectTab(filterTabs[0]);
    });
  });

  applyFilters(false);

  // ==========================================================================
  // Projects: details dialog
  // ==========================================================================
  const dialog = document.getElementById('project-dialog');
  let lastFocusedCard = null;

  function setDialogImage(src, alt) {
    const image = dialog.querySelector('.dialog-image');
    image.src = src;
    image.alt = alt || '';
    dialog.querySelectorAll('.dialog-thumb').forEach((thumb) => {
      thumb.setAttribute('aria-current', String(thumb.dataset.src === src));
    });
  }

  function openProject(card) {
    if (!dialog || typeof dialog.showModal !== 'function') {
      return;
    }
    lastFocusedCard = card;

    const cardImage = card.querySelector('.project-card-image');
    const details = card.querySelector('.project-details');
    const summary = card.querySelector('.project-description');

    dialog.querySelector('.dialog-category').textContent = card.querySelector('.project-category').textContent;
    dialog.querySelector('.dialog-title').textContent = card.querySelector('.project-title').textContent;
    dialog.querySelector('.dialog-description').innerHTML = (details || summary).innerHTML;

    const tagsTarget = dialog.querySelector('.dialog-tags');
    tagsTarget.innerHTML = '';
    card.querySelectorAll('.project-tags .tag:not(.tag-more)').forEach((tag) => {
      tagsTarget.appendChild(tag.cloneNode(true));
    });

    const linksTarget = dialog.querySelector('.dialog-links');
    linksTarget.innerHTML = '';
    card.querySelectorAll('.project-links .project-link').forEach((link) => {
      linksTarget.appendChild(link.cloneNode(true));
    });

    // Gallery: card image plus any extra thumbnails.
    const thumbsTarget = dialog.querySelector('.dialog-thumbs');
    thumbsTarget.innerHTML = '';
    const gallery = [];
    if (cardImage) {
      gallery.push({ src: cardImage.getAttribute('src'), alt: cardImage.getAttribute('alt') });
    }
    card.querySelectorAll('.thumbnail-btn').forEach((thumb) => {
      const src = thumb.getAttribute('data-primary');
      if (src && !gallery.some((item) => item.src === src)) {
        gallery.push({ src, alt: thumb.getAttribute('data-alt') });
      }
    });
    if (gallery.length > 1) {
      gallery.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dialog-thumb';
        button.dataset.src = item.src;
        button.setAttribute('aria-label', `Show image ${index + 1} of ${gallery.length}`);
        const thumbImage = document.createElement('img');
        thumbImage.src = item.src;
        thumbImage.alt = '';
        button.appendChild(thumbImage);
        button.addEventListener('click', () => setDialogImage(item.src, item.alt));
        thumbsTarget.appendChild(button);
      });
    }
    if (gallery.length) {
      setDialogImage(gallery[0].src, gallery[0].alt);
    }

    dialog.querySelector('.dialog-inner').scrollTop = 0;
    document.body.classList.add('dialog-open');
    dialog.showModal();
  }

  if (dialog) {
    dialog.addEventListener('close', () => {
      document.body.classList.remove('dialog-open');
      if (lastFocusedCard) {
        lastFocusedCard.focus({ preventScroll: true });
      }
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close-dialog]')) {
        dialog.close();
      }
    });
  }

  projectCards.forEach((card) => {
    card.addEventListener('click', (event) => {
      // Real links on the card keep working as links.
      if (event.target.closest('a')) {
        return;
      }
      openProject(card);
    });

    card.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
        event.preventDefault();
        openProject(card);
      }
    });
  });

  // Deep link: #models-3d-library etc. opens that card's details.
  function openFromHash() {
    const id = window.location.hash.slice(1);
    if (!id) {
      return;
    }
    const target = document.getElementById(id);
    if (target && target.classList.contains('project-card')) {
      target.scrollIntoView({ block: 'center' });
      openProject(target);
    }
  }
  window.addEventListener('load', openFromHash);

  // ==========================================================================
  // Copy email
  // ==========================================================================
  document.querySelectorAll('[data-copy]').forEach((button) => {
    const label = button.querySelector('.copy-label') || button;
    const originalText = label.textContent;

    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(value);
        label.textContent = 'Copied!';
      } catch (error) {
        window.location.href = `mailto:${value}`;
        return;
      }
      button.classList.add('copied');
      window.setTimeout(() => {
        label.textContent = originalText;
        button.classList.remove('copied');
      }, 1800);
    });
  });

  // ==========================================================================
  // Footer year
  // ==========================================================================
  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
})();
