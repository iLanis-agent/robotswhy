(function (root) {
  'use strict';
  // robots.txt per RFC 9309: groups, merging, wildcard patterns, most specific rule wins, allow wins ties.
  var HEXU = '0123456789ABCDEF';
  function utf8(str) { return new TextEncoder().encode(str.toWellFormed ? str.toWellFormed() : str); }
  function isUnreserved(b) { return (b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || b === 45 || b === 46 || b === 95 || b === 126; }
  function pctb(b) { return '%' + HEXU[b >> 4] + HEXU[b & 15]; }
  function hexv(c) { return c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1; }
  // Normalize a path or pattern for comparison (RFC 9309 section 2.2.2): non-ASCII octets are percent-encoded; a
  // percent-encoded octet is decoded only when it is an unreserved character; other escapes keep their escape (upper-case hex).
  // For URIs (isPattern false) the characters * and $ are also written as %2A and %24 so that they match the escaped pattern forms (section 2.2.3).
  function normalize(s, isPattern) {
    var b = utf8(s), out = '';
    for (var i = 0; i < b.length; i++) {
      var c = b[i];
      if (c === 0x25 && i + 2 < b.length + 0 && hexv(b[i + 1]) >= 0 && hexv(b[i + 2]) >= 0) {
        var v = hexv(b[i + 1]) * 16 + hexv(b[i + 2]);
        out += isUnreserved(v) ? String.fromCharCode(v) : pctb(v); i += 2;
      } else if (c > 0x7e || c < 0x21) out += pctb(c);
      else if (!isPattern && (c === 0x2a || c === 0x24)) out += pctb(c);
      else out += String.fromCharCode(c);
    }
    return out;
  }
  function pathOf(input) { // accepts a path with optional query, or a full URL
    var s = String(input).trim();
    s = s.replace(/#.*$/, '');
    var m = /^[a-z][a-z0-9+.-]*:\/\/[^\/?]*(.*)$/i.exec(s); if (m) s = m[1];
    if (s === '' || s[0] === '?') s = '/' + s;
    return s;
  }
  // pattern match: pattern may contain * (any run) and a final $ (end anchor); matching starts at the first octet
  function matchPattern(pat, str) {
    var end = false, p = pat;
    if (p.length && p[p.length - 1] === '$') { end = true; p = p.slice(0, -1); }
    function rec(pi, si) {
      if (pi === p.length) return end ? si === str.length : true;
      if (p[pi] === '*') { for (var k = si; k <= str.length; k++) if (rec(pi + 1, k)) return true; return false; }
      if (si < str.length && str[si] === p[pi]) return rec(pi + 1, si + 1);
      return false;
    }
    return rec(0, 0);
  }
  function parse(text) {
    var lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/), groups = [], cur = null, lastWasUA = false, warnings = [], ignoredBefore = 0;
    lines.forEach(function (raw, i) {
      var ln = i + 1, line = raw.replace(/#.*$/, '').replace(/^[ \t]+|[ \t]+$/g, '');
      if (line === '') return;
      var m = /^([A-Za-z-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
      if (!m) { warnings.push('Line ' + ln + ' is not a "name: value" record and was ignored.'); return; }
      var key = m[1].toLowerCase(), val = m[2];
      if (key === 'user-agent') {
        if (!/^(\*|[-A-Za-z_]+)$/.test(val)) { warnings.push('Line ' + ln + ': "' + val + '" is not a valid product token (letters, underscore and hyphen only, or *). The line was ignored.'); return; }
        if (!cur || !lastWasUA) { cur = { agents: [], rules: [], line: ln }; groups.push(cur); }
        cur.agents.push(val); lastWasUA = true;
      } else if (key === 'allow' || key === 'disallow') {
        if (!cur) { ignoredBefore++; warnings.push('Line ' + ln + ': ' + m[1] + ' rule before any user-agent line is ignored.'); return; }
        lastWasUA = false;
        if (val === '') { cur.rules.push({ type: key, raw: val, pattern: '', line: ln, empty: true }); return; }
        if (val[0] !== '/' && val[0] !== '*') { warnings.push('Line ' + ln + ': pattern "' + val + '" does not start with / so it is not valid under the RFC grammar. The rule was ignored.'); return; }
        if (val[0] === '*') warnings.push('Line ' + ln + ': pattern starting with * is outside the RFC grammar (paths start with /). Many crawlers accept it, so it is applied here.');
        cur.rules.push({ type: key, raw: val, pattern: normalize(val, true), line: ln });
      } else {
        if (key === 'crawl-delay') warnings.push('Line ' + ln + ': crawl-delay is not part of RFC 9309; some crawlers honor it, Google does not.');
        // other records (sitemap, host, ...) never end a group
      }
    });
    return { groups: groups, warnings: warnings };
  }
  function selectGroups(parsed, token) {
    var t = token.toLowerCase(), exact = parsed.groups.filter(function (g) { return g.agents.some(function (a) { return a.toLowerCase() === t; }); });
    if (exact.length) return { kind: 'token', groups: exact };
    var star = parsed.groups.filter(function (g) { return g.agents.indexOf('*') >= 0; });
    if (star.length) return { kind: 'star', groups: star };
    return { kind: 'none', groups: [] };
  }
  function check(parsed, token, pathInput) {
    var path = pathOf(pathInput), norm = normalize(path, false), sel = selectGroups(parsed, token);
    var res = { path: path, normalized: norm, selection: sel.kind, groups: sel.groups, matches: [] };
    if (norm === '/robots.txt') { res.allowed = true; res.reason = 'The /robots.txt file itself is always allowed.'; return res; }
    var rules = []; sel.groups.forEach(function (g) { g.rules.forEach(function (r) { rules.push(r); }); });
    rules.forEach(function (r) { if (!r.empty && matchPattern(r.pattern, norm)) res.matches.push({ type: r.type, raw: r.raw, pattern: r.pattern, line: r.line, length: r.pattern.length }); });
    if (!res.matches.length) { res.allowed = true; res.reason = sel.kind === 'none' ? 'No group applies to this crawler, so nothing is restricted.' : 'No rule in the applicable group matches this URL.'; return res; }
    var best = null;
    res.matches.forEach(function (m) { if (!best || m.length > best.length || (m.length === best.length && m.type === 'allow' && best.type !== 'allow')) best = m; });
    res.deciding = best; res.allowed = best.type === 'allow';
    var tie = res.matches.some(function (m) { return m !== best && m.length === best.length && m.type !== best.type; });
    res.reason = (res.allowed ? 'Allowed' : 'Blocked') + ' by ' + (best.type === 'allow' ? 'Allow' : 'Disallow') + ': ' + best.raw + ' (line ' + best.line + ', ' + best.length + ' characters, the longest match)' + (tie ? '; an Allow and a Disallow tied and Allow wins' : '') + '.';
    return res;
  }
  // robots.txt fetch outcomes (section 2.3.1)
  function fetchOutcome(kind) {
    if (kind === 'ok') return null;
    if (kind === 'unavailable') return { allowedAll: true, text: 'Unavailable (HTTP 4xx): the crawler MAY access any resource on the site.' };
    if (kind === 'unreachable') return { allowedAll: false, text: 'Unreachable (HTTP 5xx or network error): the crawler MUST assume complete disallow.' };
    if (kind === 'redirects') return { allowedAll: true, text: 'More than five consecutive redirects: the crawler MAY assume the file is unavailable, which means it may access any resource.' };
    return null;
  }
  var api = { parse: parse, check: check, normalize: normalize, matchPattern: matchPattern, pathOf: pathOf, selectGroups: selectGroups, fetchOutcome: fetchOutcome };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RobotsWhy = api;
})(typeof window !== 'undefined' ? window : this);
