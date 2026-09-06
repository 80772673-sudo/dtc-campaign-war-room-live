(() => {
  'use strict';

  const COHORT = 'warroom39_v1';
  const LAST_QV_KEY = 'warroom39_v1_last_qv_ms';
  const ROLLING_24H_MS = 24 * 60 * 60 * 1000;
  const allowed = Object.freeze({
    organic_search: { medium: 'seo', creative: 'seo_gmv_profit_v1' },
    youtube_search: { medium: 'video', creative: 'youtube_demo_v1' },
    notion_marketplace: { medium: 'marketplace', creative: 'notion_listing_v1' }
  });
  const searchHosts = /(^|\.)(google\.|bing\.com$|duckduckgo\.com$|search\.yahoo\.|baidu\.com$)/i;
  const obviousBot = /(bot|crawler|spider|headless|selenium|webdriver|phantom|slurp)/i;

  function explicitCandidate(loc) {
    const q = new URLSearchParams(loc.search || '');
    if (q.get('internal') === '1' || q.get('test') === '1') return { blocked: true, reason: 'internal_or_test' };
    const source = q.get('source') || '';
    const hasCohortParams = ['source','medium','campaign','creative'].some(k => q.has(k));
    if (!hasCohortParams) return null;
    const rule = allowed[source];
    if (!rule) return { blocked: true, reason: 'invalid_explicit_source' };
    if (q.get('medium') !== rule.medium) return { blocked: true, reason: 'invalid_explicit_medium' };
    if (q.get('campaign') !== COHORT) return { blocked: true, reason: 'invalid_explicit_campaign' };
    if (q.get('creative') !== rule.creative) return { blocked: true, reason: 'invalid_explicit_creative' };
    return { source, medium: rule.medium, campaign: COHORT, creative: rule.creative };
  }

  function organicCandidate(loc, referrer) {
    if (!referrer) return null;
    let host = '';
    try { host = new URL(referrer).hostname; } catch (_) { return null; }
    if (!searchHosts.test(host)) return null;
    return {
      source: 'organic_search',
      medium: 'seo',
      campaign: COHORT,
      creative: 'seo_gmv_profit_v1'
    };
  }

  function resolveCandidate(loc, referrer) {
    const explicit = explicitCandidate(loc);
    if (explicit && explicit.blocked) return null;
    return explicit || organicCandidate(loc, referrer);
  }

  function eligibility({ candidate, now, storage, navigatorLike, endpoint }) {
    if (!endpoint) return { ok: false, reason: 'endpoint_missing' };
    if (!candidate) return { ok: false, reason: 'source_not_qualified' };
    if (navigatorLike && (navigatorLike.webdriver || obviousBot.test(navigatorLike.userAgent || ''))) {
      return { ok: false, reason: 'obvious_bot' };
    }
    let last = 0;
    try { last = Number(storage.getItem(LAST_QV_KEY) || 0); }
    catch (_) { return { ok: false, reason: 'storage_unavailable' }; }
    if (last && now - last < ROLLING_24H_MS) return { ok: false, reason: 'repeat_within_24h' };
    return { ok: true, reason: 'qualified' };
  }

  function qvPath(candidate, pathname) {
    const page = (pathname || '/').replace(/[^A-Za-z0-9._/-]/g, '_');
    return `/qv/${COHORT}/${candidate.source}/${candidate.creative}${page.startsWith('/') ? page : `/${page}`}`;
  }

  function boot() {
    const cfg = window.WARROOM_QV_CONFIG || {};
    const endpoint = String(cfg.endpoint || '').trim();
    const candidate = resolveCandidate(window.location, document.referrer);
    const now = Date.now();
    const gate = eligibility({ candidate, now, storage: window.localStorage, navigatorLike: window.navigator, endpoint });
    window.WARROOM_QV_STATE = Object.freeze({ candidate, gate });
    if (!gate.ok) return;

    window.goatcounter = { no_onload: true };
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://gc.zgo.at/count.js';
    script.dataset.goatcounter = endpoint;
    script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    script.onload = () => {
      if (!window.goatcounter || typeof window.goatcounter.count !== 'function') return;
      if (typeof window.goatcounter.filter === 'function' && window.goatcounter.filter()) return;
      try { window.localStorage.setItem(LAST_QV_KEY, String(now)); }
      catch (_) { return; }
      window.goatcounter.count({
        path: qvPath(candidate, window.location.pathname),
        title: `War Room QV | ${candidate.source} | ${candidate.creative}`,
        event: true,
        referrer: document.referrer || ''
      });
    };
    document.head.appendChild(script);
  }

  window.WARROOM_QV = Object.freeze({
    COHORT,
    LAST_QV_KEY,
    ROLLING_24H_MS,
    resolveCandidate,
    eligibility,
    qvPath
  });

  boot();
})();
