(() => {
  function norm(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim().toUpperCase();
  }

  function parseMoney(text) {
    const matches = [...String(text || '').matchAll(/R\$\s*([0-9.]+(?:,[0-9]{2})?)/gi)];
    if (!matches.length) return null;
    const values = matches.map(m => Number(m[1].replace(/\./g, '').replace(',', '.')))
      .filter(n => Number.isFinite(n) && n > 0);
    return values.length ? values[values.length - 1] : null;
  }

  function extractIds() {
    const s = (location.href + ' ' + document.documentElement.innerHTML).toUpperCase();
    const up = s.match(/MLBU\d{6,16}/)?.[0] || '';
    const item = s.match(/MLB\d{6,16}/)?.[0] || '';
    return { productId: up || item, itemId: item };
  }

  function priceNearLabel(labelMatcher) {
    const els = [...document.querySelectorAll('body *')];
    for (const el of els) {
      const own = norm(el.innerText || el.textContent || '');
      if (!own || own.length > 80 || !labelMatcher(own)) continue;

      const scopes = [el, el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(Boolean);
      for (const scope of scopes) {
        const txt = scope.innerText || scope.textContent || '';
        const n = norm(txt);
        if (!n || n.length > 500) continue;
        const p = parseMoney(txt);
        if (p) return { price: p, evidence: txt.trim().replace(/\s*\n\s*/g, ' | ') };
      }
    }
    return null;
  }

  function findPrice() {
    // 1) Prioridade absoluta: "Você pagará". Nunca confundir com subtotal.
    let found = priceNearLabel(t => t === 'VOCE PAGARA' || t.startsWith('VOCE PAGARA '));
    if (found) return found;

    // 2) Busca por linhas: pega o preço associado somente ao rótulo "Você pagará".
    const lines = (document.body?.innerText || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const n = norm(lines[i]);
      if (n === 'VOCE PAGARA' || n.startsWith('VOCE PAGARA ')) {
        const same = parseMoney(lines[i]);
        if (same) return { price: same, evidence: lines[i] };
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
          const p = parseMoney(lines[j]);
          if (p) return { price: p, evidence: lines.slice(i, j + 1).join(' | ') };
        }
      }
    }

    // 3) Fallback: rótulo TOTAL exato. "SUBTOTAL" não entra aqui.
    found = priceNearLabel(t => t === 'TOTAL' || t.startsWith('TOTAL '));
    if (found) return found;

    for (let i = 0; i < lines.length; i++) {
      const n = norm(lines[i]);
      if (n === 'TOTAL' || n.startsWith('TOTAL ')) {
        const same = parseMoney(lines[i]);
        if (same) return { price: same, evidence: lines[i] };
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
          const p = parseMoney(lines[j]);
          if (p) return { price: p, evidence: lines.slice(i, j + 1).join(' | ') };
        }
      }
    }

    return null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'RADAR_CAPTURE') return;
    try {
      const ids = extractIds();
      const found = findPrice();
      sendResponse({
        ok: !!found,
        ...ids,
        price: found?.price || null,
        evidence: found?.evidence || '',
        url: location.href,
        title: document.title,
        capturedAt: new Date().toISOString()
      });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  });
})();