/* ==========================================================================
   AJS Mobile — Product Handbook
   Vanilla JS, no dependencies, no build step. See html-document-design.md §15.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- Theme ---------------- */
  const Theme = {
    key: 'ajs-handbook-theme',
    init() {
      let saved = safeGet(this.key);
      if (!saved) {
        saved = 'light';
        safeSet(this.key, saved);
      }
      document.documentElement.setAttribute('data-theme', saved);
      const btn = document.getElementById('theme-toggle');
      if (!btn) return;
      btn.addEventListener('click', () => this.cycle());
      this.updateIcon();
    },
    cycle() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';

      const applyTheme = () => {
        document.documentElement.setAttribute('data-theme', next);
        safeSet(this.key, next);
        this.updateIcon();
      };

      const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        applyTheme();
        return;
      }

      if (document.startViewTransition) {
        try {
          document.startViewTransition(() => {
            applyTheme();
          });
        } catch (e) {
          applyTheme();
        }
      } else {
        document.documentElement.classList.add('theme-transitioning');
        applyTheme();
        window.clearTimeout(this._transitionTimer);
        this._transitionTimer = window.setTimeout(() => {
          document.documentElement.classList.remove('theme-transitioning');
        }, 320);
      }
    },
    updateIcon() {
      const btn = document.getElementById('theme-toggle');
      if (!btn) return;
      const t = document.documentElement.getAttribute('data-theme') || 'system';
      btn.setAttribute('aria-label', 'Theme: ' + t + '. Click to change.');
      btn.setAttribute('title', 'Theme: ' + t);
    }
  };

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  /* ---------------- Sidebar collapse (desktop) ---------------- */
  const SidebarCollapse = {
    key: 'ajs-handbook-sidebar',
    init() {
      const shell = document.querySelector('.app-shell');
      const btn = document.getElementById('sidebar-collapse-toggle');
      if (!shell || !btn) return;
      if (safeGet(this.key) === 'collapsed') shell.setAttribute('data-sidebar', 'collapsed');
      btn.addEventListener('click', () => {
        const collapsed = shell.getAttribute('data-sidebar') === 'collapsed';
        if (collapsed) { shell.removeAttribute('data-sidebar'); safeSet(this.key, 'expanded'); }
        else { shell.setAttribute('data-sidebar', 'collapsed'); safeSet(this.key, 'collapsed'); }
      });
    }
  };

  /* ---------------- Mobile nav ---------------- */
  const MobileNav = {
    init() {
      this.toggle = document.getElementById('mobile-nav-toggle');
      this.closeBtn = document.getElementById('mobile-nav-close');
      if (!this.toggle) return;
      this.toggle.addEventListener('click', () => {
        document.body.hasAttribute('data-nav-open') ? this.close(true) : this.open();
      });
      if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close(true));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.hasAttribute('data-nav-open')) this.close(true);
      });
    },
    open() {
      if (!this.toggle) return;
      document.body.setAttribute('data-nav-open', 'true');
      this.toggle.setAttribute('aria-expanded', 'true');
      const firstLink = document.querySelector('.sidebar .sidebar__link');
      if (firstLink) firstLink.focus();
    },
    close(shouldFocus) {
      if (!document.body.hasAttribute('data-nav-open')) return;
      document.body.removeAttribute('data-nav-open');
      if (this.toggle) {
        this.toggle.setAttribute('aria-expanded', 'false');
        if (shouldFocus) {
          try { this.toggle.focus({ preventScroll: true }); } catch (e) { }
        }
      }
    }
  };

  /* ---------------- Active-section tracking + reading progress ---------------- */
  const SectionTracker = {
    init() {
      this.sections = Array.from(document.querySelectorAll('.section[id]'));
      this.links = Array.from(document.querySelectorAll('.sidebar__link[data-section]'));
      this.progressBar = document.querySelector('.topbar__progress-bar');
      if (!this.sections.length) return;

      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(
          (entries) => this.onIntersect(entries),
          { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
        );
        this.sections.forEach((s) => this.observer.observe(s));
      }

      this.subLinks = Array.from(document.querySelectorAll('.sidebar__sub a[href^="#"]'));
      this.subTargets = this.subLinks
        .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
        .filter(Boolean);

      if ('IntersectionObserver' in window && this.subTargets.length) {
        this.subObserver = new IntersectionObserver(
          (entries) => {
            if (isNavigating) return;
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                this.setActiveSub(entry.target.id);
              }
            });
          },
          { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
        );
        this.subTargets.forEach((el) => this.subObserver.observe(el));
      }

      window.addEventListener('scroll', () => this.updateProgress(), { passive: true });
      this.updateProgress();

      // Intercept sidebar parent links for smooth coordinate scrolling with offset
      this.links.forEach((l) => {
        l.addEventListener('click', (e) => {
          const href = l.getAttribute('href');
          if (!href || !href.startsWith('#')) return;
          const targetId = decodeURIComponent(href.slice(1));
          const targetEl = document.getElementById(targetId);
          if (!targetEl) return;
          e.preventDefault();
          this.setActive(targetId);
          navigateToTarget(targetEl, targetId);
        });
      });

      // Intercept sidebar sub-links for smooth coordinate scrolling with offset
      this.subLinks.forEach((a) => {
        a.addEventListener('click', (e) => {
          const href = a.getAttribute('href');
          if (!href || !href.startsWith('#')) return;
          const targetId = decodeURIComponent(href.slice(1));
          const targetEl = document.getElementById(targetId);
          if (!targetEl) return;
          e.preventDefault();
          this.setActiveSub(targetId);
          navigateToTarget(targetEl, targetId);
        });
      });

      // Intercept other in-page anchor links (topbar brand, hero buttons, etc.)
      document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach((a) => {
        if (!a.closest('.sidebar')) {
          a.addEventListener('click', (e) => {
            const href = a.getAttribute('href');
            if (!href || href === '#') return;
            const targetId = decodeURIComponent(href.slice(1));
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;
            e.preventDefault();
            navigateToTarget(targetEl, targetId);
          });
        }
      });
    },
    onIntersect(entries) {
      if (isNavigating) return;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        this.setActive(entry.target.id);
      });
    },
    setActive(id) {
      this.links.forEach((l) => {
        const match = l.getAttribute('data-section') === id;
        l.classList.toggle('is-active', match);
        l.setAttribute('aria-expanded', String(match));
        const group = l.closest('.sidebar__section');
        if (group) group.classList.toggle('is-active', match);
      });
    },
    setActiveSub(subId) {
      if (!subId) return;
      this.subLinks.forEach((a) => {
        const match = a.getAttribute('href') === '#' + subId;
        a.classList.toggle('is-active', match);
        if (match) {
          a.setAttribute('aria-current', 'location');
          const group = a.closest('.sidebar__section');
          if (group) {
            const parentLink = group.querySelector('.sidebar__link');
            if (parentLink) {
              const secId = parentLink.getAttribute('data-section');
              if (secId) this.setActive(secId);
            }
          }
        } else {
          a.removeAttribute('aria-current');
        }
      });
    },
    updateProgress() {
      if (!this.progressBar) return;
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const height = doc.scrollHeight - doc.clientHeight;
      const pct = height > 0 ? Math.min(100, (scrollTop / height) * 100) : 0;
      this.progressBar.style.width = pct + '%';
    }
  };

  /* ---------------- Back to top ---------------- */
  const BackToTop = {
    init() {
      this.btn = document.getElementById('back-to-top');
      if (!this.btn) return;
      window.addEventListener('scroll', () => this.toggle(), { passive: true });
      this.btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      });
      this.toggle();
    },
    toggle() {
      this.btn.classList.toggle('is-visible', window.scrollY > 600);
    }
  };

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------------- Robust Clipboard System with Fallback & Toast ---------------- */
  const Clipboard = {
    copy(text, message) {
      const done = () => this.toast(message || 'Copied to clipboard');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(done)
          .catch(() => this.fallback(text, done));
      } else {
        this.fallback(text, done);
      }
    },
    fallback(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      try {
        const ok = document.execCommand('copy');
        if (ok) cb();
      } catch (e) {
        console.warn('Clipboard fallback failed', e);
      }
      document.body.removeChild(ta);
    },
    toast(msg) {
      let el = document.querySelector('.copy-toast');
      if (!el) {
        el = document.createElement('div');
        el.className = 'copy-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
      }
      el.innerHTML = `
        <svg class="copy-toast__check" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="var(--status-green-soft, #e6f4ea)" stroke="var(--status-green, #34a853)" stroke-width="1.2" />
          <path d="M5 8.2l2.2 2.2 4-4.2" stroke="var(--status-green, #34a853)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>${msg}</span>
      `;
      el.classList.add('is-visible');
      clearTimeout(this._t);
      this._t = setTimeout(() => el.classList.remove('is-visible'), 2200);
    }
  };

  /* ---------------- Copy-link on headings ---------------- */
  const CopyLink = {
    init() {
      document.querySelectorAll('[data-copy-link]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-copy-link');
          const url = window.location.origin + window.location.pathname + '#' + id;
          Clipboard.copy(url, 'Link copied to clipboard');
        });
      });
    }
  };

  /* ---------------- Quick Copy for Cards, Rules, Workflows, and Hex Codes ---------------- */
  const QuickCopy = {
    init() {
      this.initFeatureCards();
      this.initRuleCards();
      this.initWorkflowCards();
      this.initHexChips();
    },

    createBtn(label, ariaLabel) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-copy-btn';
      btn.setAttribute('aria-label', ariaLabel || 'Copy to clipboard');
      btn.title = ariaLabel || 'Copy to clipboard';
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="5" y="5" width="8" height="8" rx="1.5" />
          <path d="M3 11V3a1 1 0 011-1h8" stroke-linecap="round" />
        </svg>
        <span>${label || 'Copy'}</span>
      `;
      return btn;
    },

    setCopiedState(btn) {
      const origHtml = btn.innerHTML;
      btn.classList.add('is-copied');
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 8.5l3.5 3.5 6.5-6.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Copied!</span>
      `;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = origHtml;
      }, 1600);
    },

    initFeatureCards() {
      document.querySelectorAll('.feature-card').forEach((card) => {
        if (card.querySelector('.card-copy-btn')) return;

        const idRow = card.querySelector('.feature-card__id-row');
        const idEl = card.querySelector('.feature-card__id');
        const rawId = idEl?.textContent.trim() || card.id || 'Feature';
        const cleanId = rawId.replace(/^#/, '');
        const btn = this.createBtn('Copy', `Copy ${cleanId} details to clipboard`);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const title = card.querySelector('h3')?.textContent.trim() || '';
          const tag = card.querySelector('.tag')?.textContent.trim() || '';
          const purpose = card.querySelector('.feature-card__purpose')?.textContent.trim() || '';

          let detailsText = '';
          const detailInner = card.querySelector('.feature-card__detail-inner');
          if (detailInner) {
            const paragraphs = Array.from(detailInner.querySelectorAll('p:not(.related-chips)'))
              .map((p) => p.textContent.replace(/\s+/g, ' ').trim())
              .filter(Boolean);
            if (paragraphs.length) {
              detailsText = '\n\nDetails:\n' + paragraphs.map((p) => '• ' + p).join('\n');
            }
          }

          const copyText = `[${cleanId}] ${title}${tag ? ' (' + tag + ')' : ''}\nPurpose: ${purpose}${detailsText}`;
          Clipboard.copy(copyText, `Copied ${cleanId} details to clipboard`);
          this.setCopiedState(btn);
        });

        if (idRow) {
          idRow.appendChild(btn);
        } else if (idEl) {
          idEl.after(btn);
        } else {
          const head = card.querySelector('.feature-card__head');
          if (head) head.appendChild(btn);
        }
      });
    },

    initRuleCards() {
      document.querySelectorAll('.rule-card').forEach((card) => {
        const head = card.querySelector('.rule-card__head');
        if (!head || head.querySelector('.card-copy-btn')) return;

        const id = card.querySelector('.rule-card__id')?.textContent.trim() || card.id || 'Rule';
        const btn = this.createBtn('Copy', `Copy rule ${id} to clipboard`);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = card.querySelector('.rule-card__name')?.textContent.trim() || '';

          let whenText = '';
          let thenText = '';
          const wtValues = card.querySelectorAll('.wt__value');
          if (wtValues[0]) whenText = wtValues[0].textContent.replace(/\s+/g, ' ').trim();
          if (wtValues[1]) thenText = wtValues[1].textContent.replace(/\s+/g, ' ').trim();

          const condText = card.querySelector('.rule-card__conditions')?.textContent.replace(/\s+/g, ' ').trim() || '';

          let copyText = `[${id}] ${name}`;
          if (whenText) copyText += `\nWHEN: ${whenText}`;
          if (thenText) copyText += `\nTHEN: ${thenText}`;
          if (condText) copyText += `\nConditions & Result: ${condText}`;

          Clipboard.copy(copyText, `Copied rule ${id} to clipboard`);
          this.setCopiedState(btn);
        });

        head.appendChild(btn);
      });
    },

    initWorkflowCards() {
      document.querySelectorAll('article.workflow').forEach((card) => {
        const head = card.querySelector('.workflow__head');
        if (!head || head.querySelector('.card-copy-btn')) return;

        const badge = card.querySelector('.workflow__badge')?.textContent.trim() || card.id || 'Workflow';
        const btn = this.createBtn('Copy', `Copy ${badge} workflow to clipboard`);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const title = card.querySelector('.workflow__title')?.textContent.trim() || '';
          const goal = card.querySelector('.workflow__goal')?.textContent.trim() || '';

          let steps = [];
          card.querySelectorAll('.flow-node, .decision-node, .branch').forEach((node) => {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (text) steps.push('• ' + text);
          });

          const failText = card.querySelector('.flow-fail')?.textContent.replace(/\s+/g, ' ').trim() || '';

          let copyText = `[${badge}] ${title}`;
          if (goal) copyText += `\nPurpose: ${goal}`;
          if (steps.length) copyText += `\n\nWorkflow Steps:\n` + steps.join('\n');
          if (failText) copyText += `\n\nFailure & Edge Cases:\n${failText}`;

          Clipboard.copy(copyText, `Copied ${badge} workflow to clipboard`);
          this.setCopiedState(btn);
        });

        head.appendChild(btn);
      });
    },

    initHexChips() {
      // 1. In .status-chip-card__hex
      document.querySelectorAll('.status-chip-card__hex').forEach((el) => {
        if (el.querySelector('.copy-hex-btn')) return;
        const text = el.textContent;
        const html = text.replace(/(#[0-9A-Fa-f]{6})/g, (match) => {
          return `<button type="button" class="copy-hex-btn" data-hex="${match}" title="Click to copy ${match}" aria-label="Copy color code ${match}">${match} <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8" stroke-linecap="round"/></svg></button>`;
        });
        el.innerHTML = html;
      });

      // 2. In .cap-tile .text-caption with hex codes
      document.querySelectorAll('.cap-tile h3 .text-caption').forEach((el) => {
        if (el.querySelector('.copy-hex-btn')) return;
        const text = el.textContent;
        const match = text.match(/(#[0-9A-Fa-f]{6})/);
        if (match) {
          const hex = match[1];
          el.innerHTML = `<button type="button" class="copy-hex-btn" data-hex="${hex}" title="Click to copy ${hex}" aria-label="Copy color code ${hex}">${hex} <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8" stroke-linecap="round"/></svg></button>`;
        }
      });

      // Attach click listeners to all .copy-hex-btn
      document.querySelectorAll('.copy-hex-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const hex = btn.getAttribute('data-hex');
          if (!hex) return;
          Clipboard.copy(hex, `Copied ${hex} to clipboard`);
          btn.classList.add('is-copied');
          setTimeout(() => btn.classList.remove('is-copied'), 1500);
        });
      });
    }
  };

  /* ---------------- Generic accordion (business rules, more-workflows, feature detail) ---------------- */
  const Accordion = {
    init(selector, opts) {
      opts = opts || {};
      document.querySelectorAll(selector).forEach((group) => {
        const header = group.querySelector('[data-accordion-trigger]');
        if (!header) return;
        header.addEventListener('click', () => {
          const isOpen = group.classList.contains('is-open');
          if (!opts.multiOpen && window.innerWidth < 900) {
            group.parentElement.querySelectorAll(selector).forEach((g) => {
              if (g !== group) { g.classList.remove('is-open'); const h = g.querySelector('[data-accordion-trigger]'); if (h) h.setAttribute('aria-expanded', 'false'); }
            });
          }
          group.classList.toggle('is-open', !isOpen);
          header.setAttribute('aria-expanded', String(!isOpen));
        });
      });
    }
  };

  /* ---------------- Feature card expand ---------------- */
  const FeatureCards = {
    init() {
      document.querySelectorAll('.feature-card').forEach((card) => {
        const btn = card.querySelector('.feature-card__expand-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
          const open = card.classList.toggle('is-open');
          btn.setAttribute('aria-expanded', String(open));
        });
      });
    }
  };

  /* ---------------- Rule card conditions toggle ---------------- */
  const RuleCards = {
    init() {
      document.querySelectorAll('.rule-card__toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.rule-card');
          const open = card.classList.toggle('is-open');
          btn.setAttribute('aria-expanded', String(open));
        });
      });
    }
  };

  /* ---------------- Filter controller (generic, reused for features / rules / reference) ---------------- */
  function FilterController(config) {
    const root = document.querySelector(config.root);
    if (!root) return;
    const input = root.querySelector(config.inputSelector);
    const chips = Array.from(root.querySelectorAll(config.chipSelector));
    const items = Array.from(document.querySelectorAll(config.itemSelector));
    const countEl = root.querySelector(config.countSelector);
    let activeChip = chips.find((c) => c.classList.contains('is-active')) || chips[0];
    let query = '';
    let debounceTimer;

    function matches(item) {
      const text = (item.getAttribute('data-search') || item.textContent || '').toLowerCase();
      const area = item.getAttribute('data-area');
      const chipValue = activeChip ? activeChip.getAttribute('data-filter') : 'all';
      const chipOk = !chipValue || chipValue === 'all' || area === chipValue ||
        (item.getAttribute('data-role') === chipValue);
      const queryOk = !query || text.indexOf(query) !== -1;
      return chipOk && queryOk;
    }

    function apply() {
      let visible = 0;
      items.forEach((item) => {
        const ok = matches(item);
        item.hidden = !ok;
        if (item.tagName === 'TR') item.classList.toggle('is-filtered-out', !ok);
        if (ok) visible++;
      });
      if (countEl) countEl.textContent = visible + (config.noun ? ' ' + (visible === 1 ? config.noun.singular : config.noun.plural) : '');
      if (config.onApply) config.onApply(visible);
    }

    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          query = input.value.trim().toLowerCase();
          apply();
          announce(root, (countEl ? countEl.textContent : ''));
        }, 140);
      });
    }
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        activeChip = chip;
        apply();
      });
    });

    apply();
    return { apply };
  }

  function announce(root, msg) {
    let live = root.querySelector('.sr-live');
    if (!live) {
      live = document.createElement('div');
      live.className = 'visually-hidden sr-live';
      live.setAttribute('aria-live', 'polite');
      root.appendChild(live);
    }
    live.textContent = msg;
  }

  /* ---------------- Reference tabs ---------------- */
  const RefTabs = {
    init() {
      const tabs = Array.from(document.querySelectorAll('.ref-tab'));
      const panels = Array.from(document.querySelectorAll('.ref-panel'));
      if (!tabs.length) return;
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
          panels.forEach((p) => p.setAttribute('hidden', ''));
          tab.classList.add('is-active');
          tab.setAttribute('aria-selected', 'true');
          const panel = document.getElementById(tab.getAttribute('aria-controls'));
          if (panel) panel.removeAttribute('hidden');
        });
        tab.addEventListener('keydown', (e) => {
          const idx = tabs.indexOf(tab);
          if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); tabs[(idx + 1) % tabs.length].click(); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); tabs[(idx - 1 + tabs.length) % tabs.length].click(); }
        });
      });
    }
  };

  /* ---------------- Reference row expand (screens tab) ---------------- */
  const RefRowExpand = {
    init() {
      document.querySelectorAll('[data-row-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.getAttribute('data-row-toggle'));
          if (!target) return;
          const willShow = target.hasAttribute('hidden');
          target.toggleAttribute('hidden');
          btn.setAttribute('aria-expanded', String(willShow));
        });
      });
    }
  };

  /* ---------------- Smooth Coordinate-Based Navigation & Offset ---------------- */
  let isNavigating = false;
  let navLockTimer = null;

  function setNavigationLock() {
    isNavigating = true;
    clearTimeout(navLockTimer);
    navLockTimer = setTimeout(() => {
      isNavigating = false;
    }, 750);
  }

  function navigateToTarget(targetEl, targetId, options) {
    options = options || {};
    if (!targetEl) return;

    setNavigationLock();

    // 1. If target is inside a hidden reference tab or is a reference panel, activate that tab first
    const panel = targetEl.closest('.ref-panel') || (targetEl.classList.contains('ref-panel') ? targetEl : null);
    if (panel) {
      const tab = document.querySelector(`.ref-tab[aria-controls="${panel.id}"]`);
      if (tab && !tab.classList.contains('is-active')) {
        tab.click();
      }
    }

    // 2. If target is an accordion group or inside one, automatically expand it
    const group = targetEl.closest('.accordion-group') || (targetEl.classList.contains('accordion-group') ? targetEl : null);
    if (group) {
      group.classList.add('is-open');
      const trigger = group.querySelector('[data-accordion-trigger]');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }

    // 3. If target is a feature card or inside one, automatically expand details
    const card = targetEl.closest('.feature-card') || (targetEl.classList.contains('feature-card') ? targetEl : null);
    if (card) {
      card.classList.add('is-open');
      const expandBtn = card.querySelector('.feature-card__expand-btn');
      if (expandBtn) expandBtn.setAttribute('aria-expanded', 'true');
    }

    // 4. Automatically dismiss mobile navigation drawer on smaller screens
    MobileNav.close(false);

    // 5. Update browser address bar cleanly without triggering native abrupt jump
    if (targetId && options.updateHistory !== false) {
      if (window.location.hash !== '#' + targetId) {
        try {
          history.pushState(null, '', '#' + targetId);
        } catch (e) {
          window.location.hash = targetId;
        }
      }
    }

    // 6. Coordinate-based scroll with accurate topbar offset + comfortable spacing
    requestAnimationFrame(() => {
      // If hero or top of page, scroll smoothly to coordinate 0
      if (targetEl.id === 'hero' || targetEl.classList.contains('hero')) {
        window.scrollTo({
          top: 0,
          behavior: (options.instant || prefersReducedMotion()) ? 'auto' : 'smooth'
        });
        return;
      }

      // If target is a reference panel, position cleanly at reference tabs so tabs & table are both visible
      let scrollEl = targetEl;
      if (targetEl.classList.contains('ref-panel')) {
        const refTabs = targetEl.closest('#reference')?.querySelector('.ref-tabs');
        if (refTabs) scrollEl = refTabs;
      }

      const topbar = document.querySelector('.topbar');
      const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 64;
      const spacing = 20; // 20px comfortable breathing room below fixed header

      const rect = scrollEl.getBoundingClientRect();
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = Math.max(0, Math.round(rect.top + currentScrollY - topbarHeight - spacing));

      window.scrollTo({
        top: targetY,
        behavior: (options.instant || prefersReducedMotion()) ? 'auto' : 'smooth'
      });
    });
  }

  function revealDeepLink(instant) {
    if (!window.location.hash) return;
    let id = '';
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch (e) {
      id = window.location.hash.slice(1);
    }
    const el = document.getElementById(id);
    if (!el) return;
    navigateToTarget(el, id, {
      updateHistory: false,
      instant: Boolean(instant)
    });
  }

  /* ---------------- Workflow Infographic ---------------- */
  const WorkflowInfographic = {
    init() {
      const root = document.getElementById('glance-workflow');
      if (!root) return;
      const nodes = root.querySelectorAll('.hub-node');
      nodes.forEach(node => {
        const pathId = node.getAttribute('data-path');
        if (!pathId) return;
        const path = root.querySelector('#' + pathId);
        const marker = root.querySelector('#marker-' + pathId);

        const activate = () => {
          if (path) path.classList.add('is-active');
          if (marker) marker.classList.add('is-active');
        };
        const deactivate = () => {
          if (path) path.classList.remove('is-active');
          if (marker) marker.classList.remove('is-active');
        };

        node.addEventListener('mouseenter', activate);
        node.addEventListener('mouseleave', deactivate);
        node.addEventListener('focus', activate);
        node.addEventListener('blur', deactivate);
      });
    }
  };

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    Theme.init();
    SidebarCollapse.init();
    MobileNav.init();
    SectionTracker.init();
    BackToTop.init();
    CopyLink.init();
    QuickCopy.init();
    WorkflowInfographic.init();
    Accordion.init('.accordion-group', { multiOpen: true });
    FeatureCards.init();
    RuleCards.init();
    RefTabs.init();
    RefRowExpand.init();

    FilterController({
      root: '#features',
      inputSelector: '#feature-search',
      chipSelector: '.feature-chip',
      itemSelector: '.feature-card',
      countSelector: '#feature-count',
      noun: { singular: 'feature', plural: 'features' }
    });

    FilterController({
      root: '#business-rules',
      inputSelector: '#rule-search',
      chipSelector: '.rule-area-chip',
      itemSelector: '.rule-card',
      countSelector: '#rule-count',
      noun: { singular: 'rule', plural: 'rules' },
      onApply: function () {
        const input = document.getElementById('rule-search');
        const isSearch = !!(input && input.value.trim());
        const activeChip = document.querySelector('#business-rules .rule-area-chip.is-active');
        const isFilter = !!(activeChip && activeChip.getAttribute('data-filter') !== 'all');

        document.querySelectorAll('#business-rules .accordion-group').forEach((g) => {
          const anyVisible = Array.from(g.querySelectorAll('.rule-card')).some((c) => !c.hidden);
          if (isSearch || isFilter) {
            if (isSearch) {
              g.classList.toggle('is-open', anyVisible);
              const h = g.querySelector('[data-accordion-trigger]');
              if (h) h.setAttribute('aria-expanded', String(anyVisible));
            } else if (isFilter && anyVisible) {
              g.classList.add('is-open');
              const h = g.querySelector('[data-accordion-trigger]');
              if (h) h.setAttribute('aria-expanded', 'true');
            }
            g.hidden = !anyVisible;
          } else {
            g.hidden = false;
          }
        });
      }
    });

    FilterController({
      root: '#ref-rules-panel',
      inputSelector: '#ref-rule-search',
      chipSelector: '.ref-rule-chip',
      itemSelector: '#ref-rules-table tbody tr',
      countSelector: '#ref-rule-count',
      noun: { singular: 'rule', plural: 'rules' }
    });

    FilterController({
      root: '#ref-glossary-panel',
      inputSelector: '#ref-glossary-search',
      chipSelector: '.ref-glossary-chip',
      itemSelector: '#ref-glossary-table tbody tr',
      countSelector: '#ref-glossary-count',
      noun: { singular: 'term', plural: 'terms' }
    });

    FilterController({
      root: '#ref-screens-panel',
      inputSelector: '#ref-screen-search',
      chipSelector: '.ref-screen-chip-none',
      itemSelector: '#ref-screens-table tbody tr',
      countSelector: '#ref-screen-count',
      noun: { singular: 'screen', plural: 'screens' }
    });

    if (window.location.hash) {
      setTimeout(() => {
        revealDeepLink(true);
      }, 100);
    }
    window.addEventListener('popstate', () => {
      revealDeepLink(false);
    });
    window.addEventListener('hashchange', () => {
      revealDeepLink(false);
    });
  });
})();
