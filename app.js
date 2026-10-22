/**
 * Portfolio Interactive Features
 * - Theme toggle with localStorage persistence
 * - Project filtering by category
 * - Scroll progress indicator
 * - Timeline reveal on scroll
 * - Mobile navigation toggle
 * - Smooth scroll for anchor links
 */

(function() {
  'use strict';

  // ==========================================================================
  // Theme Management
  // ==========================================================================
  const themeToggle = document.getElementById('theme-toggle');
  const html = document.documentElement;
  
  // Check for saved theme preference or default to 'dark'
  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);
  
  function toggleTheme() {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }
  
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // ==========================================================================
  // Project Filtering
  // ==========================================================================
  const filterTabs = document.querySelectorAll('.filter-tab');
  const projectCards = document.querySelectorAll('.project-card');
  
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.getAttribute('data-filter');
      
      // Update active state on tabs
      filterTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      
      // Filter projects
      projectCards.forEach(card => {
        const category = card.getAttribute('data-category');
        
        if (filter === 'all' || category === filter) {
          card.classList.remove('hidden');
          // Add subtle animation
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
          }, 50);
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // ==========================================================================
  // Scroll Progress Indicator
  // ==========================================================================
  const progressBar = document.querySelector('.scroll-progress-bar');
  
  function updateScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = (scrollTop / docHeight) * 100;
    progressBar.style.width = scrollPercent + '%';
  }
  
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  updateScrollProgress(); // Initial call

  // ==========================================================================
  // Timeline Reveal on Scroll (Intersection Observer)
  // ==========================================================================
  const timelineItems = document.querySelectorAll('.timeline-item');
  
  const timelineObserverOptions = {
    root: null,
    rootMargin: '0px 0px -100px 0px',
    threshold: 0.1
  };
  
  if ('IntersectionObserver' in window) {
    const timelineObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Unobserve after revealing (animate once)
          timelineObserver.unobserve(entry.target);
        }
      });
    }, timelineObserverOptions);

    timelineItems.forEach(item => {
      timelineObserver.observe(item);
    });
  } else {
    // Fallback: reveal everything if IntersectionObserver is unavailable.
    timelineItems.forEach(item => item.classList.add('visible'));
  }

  // ==========================================================================
  // Mobile Navigation Toggle
  // ==========================================================================
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
      navMenu.classList.toggle('active');
    });
    
    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('active');
      });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
        navToggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('active');
      }
    });
  }

  // ==========================================================================
  // Smooth Scroll for Anchor Links (with reduced motion support)
  // ==========================================================================
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (!targetElement) return;
      
      e.preventDefault();
      
      const headerOffset = 80;
      const elementPosition = targetElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
      if (prefersReducedMotion.matches) {
        window.scrollTo(0, offsetPosition);
      } else {
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
      
      // Update URL without triggering scroll
      history.pushState(null, '', targetId);
    });
  });

  // ==========================================================================
  // Keyboard Navigation for Filter Tabs
  // ==========================================================================
  const filterTabList = document.querySelector('.project-filters');
  
  if (filterTabList) {
    filterTabList.addEventListener('keydown', (e) => {
      const tabs = Array.from(filterTabs);
      const currentIndex = tabs.indexOf(document.activeElement);
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
          tabs[prevIndex].focus();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
          tabs[nextIndex].focus();
          break;
        case 'Home':
          e.preventDefault();
          tabs[0].focus();
          break;
        case 'End':
          e.preventDefault();
          tabs[tabs.length - 1].focus();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          document.activeElement.click();
          break;
      }
    });
  }

  // ==========================================================================
  // Header Shadow on Scroll
  // ==========================================================================
  const header = document.querySelector('.site-header');
  
  function updateHeaderShadow() {
    if (window.scrollY > 10) {
      header.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    } else {
      header.style.boxShadow = 'none';
    }
  }
  
  window.addEventListener('scroll', updateHeaderShadow, { passive: true });

  // ==========================================================================
  // Initialize
  // ==========================================================================
  console.log('Portfolio initialized successfully.');
  
})();
