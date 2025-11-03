(() => {
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // === Estado global ===
  const state = {
    brandSlug: new URLSearchParams(location.search).get('brand') || 'demo',
    config: null,
    products: [],
    filters: {
      search: '',
      category: '__all__',
      badge: '__all__',
      sort: 'featured'
    },
    currency: 'USD',
    wishlist: new Set(),
  };

  // === Utilidades ===
  const money = (amount, currency) => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
  const sanitizePhone = (p) => (p || '').replace(/\D/g, '');

  const convert = (amount, from, to, rates) => {
    const rFrom = rates[from];
    const rTo = rates[to];
    if (!rFrom || !rTo) return amount; // fallback
    // Convertimos vía USD como base conceptual según rates dados (pueden estar ya normalizados)
    // Aquí asumimos que los rates están expresados "1 USD -> rate[currency]" si config.base="USD".
    // Si se desea precisión, se puede definir rates como "1 base -> X" y setear base en config.
    const base = amount / rFrom; // a USD/base
    return base * rTo;
  };

  const buildWaLink = (number, text) => `https://wa.me/${sanitizePhone(number)}?text=${encodeURIComponent(text)}`;

  const badgeLabel = (b) => ({ nuevo: 'Nuevo', oferta: 'Oferta', proximamente: 'Próximamente', agotado: 'Agotado' }[b] || '');

  const saveWishlist = () => localStorage.setItem(`wishlist:${state.brandSlug}`, JSON.stringify([...state.wishlist]));
  const loadWishlist = () => {
    try {
      const raw = localStorage.getItem(`wishlist:${state.brandSlug}`);
      if (raw) state.wishlist = new Set(JSON.parse(raw));
    } catch {}
  };

  const setTheme = (mode) => {
    if (mode === 'auto') {
      document.documentElement.setAttribute('data-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
    localStorage.setItem('theme', mode);
  };

  const applyBranding = () => {
    const { brand, contact, currency, seo } = state.config;
    // Título y textos
    document.title = brand.seo_title || brand.name || 'Catálogo';
    qs('#brand-name').textContent = brand.name || 'Tu Marca';
    qs('#brand-name-footer').textContent = brand.name || 'Tu Marca';
    qs('#hero-title').textContent = brand.hero_title || 'Soluciones de Streaming, IA y Desarrollo';
    qs('#hero-subtitle').textContent = brand.hero_subtitle || 'Alquiler y venta de plataformas de streaming, acceso a IA, scripts y sitios web';

    // Logo
    const logoEl = qs('#brand-logo');
    if (brand.logo_img) { logoEl.src = brand.logo_img; logoEl.classList.remove('hidden'); logoEl.width = 28; logoEl.height = 28; }
    else { logoEl.style.display = 'none'; }

    // Colores
    if (brand.primary_color) {
      document.documentElement.style.setProperty('--primary', brand.primary_color);
    }
    // theme-color meta
    const themeMeta = qs('#meta-theme-color');
    themeMeta.setAttribute('content', brand.primary_color || '#0ea5e9');

    // WhatsApp CTAs
    const baseMsg = contact.default_message || 'Hola, vi tu sitio web y me interesa saber más.';
    const waLink = buildWaLink(contact.whatsapp_number, baseMsg.replace('{brand}', brand.name || ''));
    qs('#wa-cta').href = waLink;
    qs('#hero-wa').href = waLink;
    qs('#footer-wa').href = waLink;
    qs('#fab-wa').href = waLink;

    // Moneda
    state.currency = (currency && currency.default) || 'USD';
    const sel = qs('#currency-select');
    sel.innerHTML = (currency.supported || ['USD','EUR','ARS']).map(c => `<option ${c===state.currency?'selected':''}>${c}</option>`).join('');

    // SEO estático básico (OG)
    if (seo) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', seo.og_title || brand.seo_title || brand.name || 'Catálogo');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', seo.og_description || 'Catálogo de servicios digitales');
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg && seo.og_image) ogImg.setAttribute('content', seo.og_image);
    }

    // Tema
    const storedTheme = localStorage.getItem('theme') || brand.theme || 'auto';
    setTheme(storedTheme);
  };

  const productMatches = (p) => {
    const { search, category, badge } = state.filters;
    const haystack = `${p.name} ${p.short_description} ${(p.tags||[]).join(' ')}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (category !== '__all__' && p.category !== category) return false;
    if (badge !== '__all__' && (p.badge||'') !== badge) return false;
    return true;
  };

  const sortProducts = (arr) => {
    switch (state.filters.sort) {
      case 'price-asc': return arr.slice().sort((a,b) => a.price - b.price);
      case 'price-desc': return arr.slice().sort((a,b) => b.price - a.price);
      case 'newest': return arr.slice().sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
      default: return arr.slice().sort((a,b) => (b.featured?1:0) - (a.featured?1:0));
    }
  };

  const renderedPrice = (p) => {
    const cfgCur = state.config.currency;
    const target = state.currency;
    if (p.currency === target) return money(p.price, target);
    const amount = convert(p.price, p.currency || cfgCur.default || 'USD', target, cfgCur.rates || {USD:1,EUR:0.92,ARS:1000});
    return money(amount, target);
  };

  const productCard = (p) => {
    const { contact, brand } = state.config;
    const msgTpl = contact.product_message || 'Hola, vi "{product}" en el sitio de {brand}. ¿Me das más info?';
    const text = msgTpl.replace('{product}', p.name).replace('{brand}', brand.name || '');
    const wa = buildWaLink(contact.whatsapp_number, text);

    const inWishlist = state.wishlist.has(p.id);

    return `
      <article class="card" data-id="${p.id}">
        <div class="card-media">
          ${p.badge ? `<span class="badge ${p.badge}">${badgeLabel(p.badge)}</span>` : ''}
          <img data-src="${p.image}" alt="${p.name}" width="480" height="300" loading="lazy" decoding="async" />
        </div>
        <div class="card-body">
          <h3 class="card-title">${p.name}</h3>
          <p class="card-desc">${p.short_description || ''}</p>
          <div class="card-meta">
            <span class="price">${renderedPrice(p)}</span>
            <small>${p.status || 'disponible'}</small>
          </div>
          <div class="card-actions">
            <a class="btn primary" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>
            <button class="wishlist-btn ${inWishlist?'active':''}" title="Wishlist" aria-label="Wishlist">❤</button>
          </div>
        </div>
      </article>
    `;
  };

  const mountImagesLazy = (root = document) => {
    const imgs = qsa('img[data-src]', root);
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target; img.src = img.dataset.src; img.onload = () => img.classList.add('loaded');
        obs.unobserve(img);
      });
    }, { rootMargin: '200px' });
    imgs.forEach(i => io.observe(i));
  };

  const renderCatalog = () => {
    const grid = qs('#products-grid');
    const empty = qs('#empty-state');
    const filtered = sortProducts(state.products.filter(productMatches));

    grid.innerHTML = filtered.map(productCard).join('');
    mountImagesLazy(grid);

    // Click handlers dentro del grid
    qsa('.wishlist-btn', grid).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const card = ev.currentTarget.closest('.card');
        const id = card.dataset.id;
        if (state.wishlist.has(id)) state.wishlist.delete(id); else state.wishlist.add(id);
        saveWishlist();
        renderCatalog();
        renderWishlist();
      });
    });

    empty.classList.toggle('hidden', filtered.length > 0);
  };

  const renderFilters = () => {
    // Categorías
    const sel = qs('#category-filter');
    const cats = ['__all__', ...new Set(state.products.map(p => p.category).filter(Boolean))];
    sel.innerHTML = cats.map(c => `<option value="${c}">${c==='__all__'?'Todas las categorías':c}</option>`).join('');
  };

  const renderWishlist = () => {
    const wrap = qs('#wishlist-items');
    const ids = new Set(state.wishlist);
    const items = state.products.filter(p => ids.has(p.id));
    wrap.innerHTML = items.map(productCard).join('');
    mountImagesLazy(wrap);

    // Enlaces WA por wishlist
    const { contact, brand } = state.config;
    const total = items.reduce((acc, p) => acc + convert(p.price, p.currency || state.config.currency.default, state.currency, state.config.currency.rates), 0);
    const lines = items.map(p => `• ${p.name} – ${renderedPrice(p)}`).join('\n');
    const msg = `Hola, me interesan estos productos del sitio de ${brand.name}:\n${lines}\nTotal estimado: ${money(total, state.currency)}\n¿Me das más info?`;
    qs('#wishlist-wa').href = buildWaLink(contact.whatsapp_number, msg);

    // Botones dentro del wishlist para quitar
    qsa('.wishlist-btn', wrap).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const id = ev.currentTarget.closest('.card').dataset.id;
        if (state.wishlist.has(id)) state.wishlist.delete(id); else state.wishlist.add(id);
        saveWishlist();
        renderCatalog();
        renderWishlist();
      });
    });
  };

  const attachEvents = () => {
    qs('#search').addEventListener('input', (e) => { state.filters.search = e.target.value; renderCatalog(); });
    qs('#category-filter').addEventListener('change', (e) => { state.filters.category = e.target.value; renderCatalog(); });
    qs('#sort-select').addEventListener('change', (e) => { state.filters.sort = e.target.value; renderCatalog(); });

    qsa('#badges-filter .chip').forEach(chip => chip.addEventListener('click', (e) => {
      qsa('#badges-filter .chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.filters.badge = e.currentTarget.dataset.badge;
      renderCatalog();
    }));

    qs('#currency-select').addEventListener('change', (e) => {
      state.currency = e.target.value;
      renderCatalog();
      renderWishlist();
    });

    qs('#wishlist-clear').addEventListener('click', () => { state.wishlist.clear(); saveWishlist(); renderCatalog(); renderWishlist(); });

    // Tema
    qs('#theme-toggle').addEventListener('click', () => {
      const current = localStorage.getItem('theme') || 'auto';
      const next = current === 'light' ? 'dark' : current === 'dark' ? 'auto' : 'light';
      setTheme(next);
    });
  };

  const injectJSONLDProducts = () => {
    const list = state.products.map(p => ({
      "@type": "Product",
      name: p.name,
      description: p.short_description,
      image: p.image,
      category: p.category,
      sku: p.id,
      offers: {
        "@type": "Offer",
        availability: p.status === 'agotado' ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        price: p.price,
        priceCurrency: p.currency || state.config.currency.default || 'USD'
      }
    }));
    const json = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: list
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(json);
    document.head.appendChild(el);
  };

  const registerPWA = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(console.error);
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      // se podría mostrar un botón personalizado si hace falta
      // e.prompt() bajo interacción del usuario
    });
  };

  const boot = async () => {
    // Cargar config y productos según brand
    try {
      loadWishlist();
      const cfg = await fetch(`./clients/${state.brandSlug}/config.json`).then(r => r.json());
      state.config = cfg;
      applyBranding();

      const products = await fetch(`./clients/${state.brandSlug}/products.json`).then(r => r.json());
      state.products = products;

      // Popular filtros y render inicial
      renderFilters();
      attachEvents();
      renderCatalog();
      renderWishlist();
      injectJSONLDProducts();
      registerPWA();

      // Año footer
      qs('#year').textContent = new Date().getFullYear();
    } catch (err) {
      console.error('Error cargando brand', err);
      // Fallback simple
      qs('#products-grid').innerHTML = '<div class="empty">No se pudo cargar la configuración del sitio. Revisa el parámetro ?brand o las carpetas en /clients.</div>';
    }
  };

  boot();
})();