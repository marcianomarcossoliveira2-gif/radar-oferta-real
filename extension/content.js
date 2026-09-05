(() => {
  function parseMoney(text) {
    const m = String(text || '').match(/R\$\s*([0-9.]+(?:,[0-9]{2})?)/i);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function extractIds() {
    const s = (location.href + ' ' + document.documentElement.innerHTML).toUpperCase();
    const up = s.match(/MLBU\d{6,16}/)?.[0] || '';
    const item = s.match(/MLB\d{6,15}/)?.[0] || '';
    return { productId: up || item, itemId: item };
  }

  function findPrice() {
    const bodyText = document.body?.innerText || '';
    const lines = bodyText.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const anchors = ['VOCÊ PAGARÁ', 'VOCE PAGARA', 'TOTAL'];
    for (let i = 0; i < lines.length; i++) {
      const u = lines[i].toUpperCase();
      if (anchors.some(a => u.includes(a))) {
        for (let j = i; j <= Math.min(lines.length - 1, i + 4); j++) {
          const p = parseMoney(lines[j]);
          if (p) return { price: p, evidence: lines.slice(i, Math.min(lines.length, i + 5)).join(' | ') };
        }
      }
    }
    const candidates = [];
    document.querySelectorAll('body *').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 160) return;
      if (/VOCÊ PAGARÁ|VOCE PAGARA|TOTAL/i.test(t)) {
        const p = parseMoney(t);
        if (p) candidates.push({ price: p, evidence: t });
      }
    });
    return candidates[0] || null;
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