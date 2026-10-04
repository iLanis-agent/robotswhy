'use strict';
var R = require('./engine.js'), assert = require('assert'), n = 0, fails = 0;
function eq(a, b, m) { n++; try { assert.deepStrictEqual(a, b); } catch (e) { fails++; console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); } }
function allowed(txt, tok, path) { return R.check(R.parse(txt), tok, path).allowed; }
// RFC 9309 Figure 2: two groups for the same token are merged
var f2 = 'user-agent: ExampleBot\ndisallow: /foo\ndisallow: /bar\n\nuser-agent: ExampleBot\ndisallow: /baz\n';
eq(['/foo', '/bar', '/baz', '/qux'].map(function (p) { return allowed(f2, 'ExampleBot', p); }), [false, false, false, true], 'fig 2 merge');
eq(R.check(R.parse(f2), 'examplebot', '/baz').allowed, false, 'token match is case-insensitive');
eq(R.parse(f2).groups.length, 2, 'two groups parsed');
// Figure 3: no matching group, the * group applies
var f3 = 'user-agent: *\ndisallow: /foo\ndisallow: /bar\n\nuser-agent: BazBot\ndisallow: /baz\n';
eq(['/foo', '/bar', '/baz'].map(function (p) { return allowed(f3, 'ExampleBot', p); }), [false, false, true], 'fig 3 star group');
eq(R.check(R.parse(f3), 'ExampleBot', '/foo').selection, 'star', 'selection star'); eq(R.check(R.parse(f3), 'BazBot', '/baz').selection, 'token', 'selection token');
eq(allowed('user-agent: BazBot\ndisallow: /\n', 'ExampleBot', '/x'), true, 'no group and no star: no rules apply');
eq(R.check(R.parse(''), 'X', '/x').selection, 'none', 'empty file');
// a group with several user-agent lines
eq(allowed('user-agent: A\nuser-agent: B\ndisallow: /x\n', 'B', '/x'), false, 'multi user-agent group');
eq(allowed('user-agent: A\n\n# comment\nuser-agent: B\ndisallow: /x\n', 'A', '/x'), false, 'blank lines and comments do not end the UA list');
eq(allowed('user-agent: A\ndisallow: /x\nsitemap: https://e.com/s.xml\ndisallow: /y\n', 'A', '/y'), false, 'sitemap record does not end the group');
eq(allowed('user-agent: A\ndisallow: /x\nuser-agent: B\ndisallow: /y\n', 'A', '/y'), true, 'user-agent line after a rule starts a new group');
// Figure 4: percent-encoding examples
eq(R.normalize('/foo/bar?baz=quz', true), '/foo/bar?baz=quz', 'fig4 row1'); eq(R.normalize('/foo/bar?baz=https://foo.bar', false), '/foo/bar?baz=https://foo.bar', 'plain URI keeps reserved');
eq(R.normalize('/foo/bar?baz=https%3A%2F%2Ffoo.bar', true), '/foo/bar?baz=https%3A%2F%2Ffoo.bar', 'fig4 row2');
eq(R.normalize('/foo/bar/\u30C4', true), '/foo/bar/%E3%83%84', 'fig4 row3 non-ASCII encoded'); eq(R.normalize('/foo/bar/%E3%83%84', false), '/foo/bar/%E3%83%84', 'fig4 row4');
eq(R.normalize('/foo/bar/%62%61%7A', false), '/foo/bar/baz', 'fig4 row5 unreserved decoded'); eq(R.normalize('/a%2fb', false), '/a%2Fb', 'reserved escape stays, hex upper-cased');
eq(allowed('user-agent: *\ndisallow: /foo/bar/\u30C4\n', 'x', '/foo/bar/%E3%83%84'), false, 'pattern with U+30C4 matches its escaped URI');
eq(allowed('user-agent: *\ndisallow: /foo/bar/baz\n', 'x', '/foo/bar/%62%61%7A'), false, 'escaped unreserved matches plain rule');
eq(allowed('user-agent: *\ndisallow: /foo/bar?baz=https%3A%2F%2Ffoo.bar\n', 'x', '/foo/bar?baz=https%3A%2F%2Ffoo.bar'), false, 'encoded reserved matches');
// Figure 5 and 6: special characters
eq(allowed('user-agent: *\ndisallow: /path/file-with-a-%2A.html\n', 'x', 'https://www.example.com/path/file-with-a-*.html'), false, 'fig6 %2A');
eq(allowed('user-agent: *\ndisallow: /path/foo-%24\n', 'x', 'https://www.example.com/path/foo-$'), false, 'fig6 %24');
eq(allowed('user-agent: *\ndisallow: /this/*/exactly\n', 'x', '/this/a/b/exactly'), false, 'star'); eq(allowed('user-agent: *\ndisallow: /this/*/exactly\n', 'x', '/this/exactly'), true, 'star needs the slash');
eq(allowed('user-agent: *\ndisallow: /this/path/exactly$\n', 'x', '/this/path/exactly'), false, '$ exact'); eq(allowed('user-agent: *\ndisallow: /this/path/exactly$\n', 'x', '/this/path/exactly/more'), true, '$ stops longer');
eq(allowed('user-agent: *\ndisallow: /*.php$\n', 'x', '/a/b.php?x=1'), true, '$ vs query'); eq(allowed('user-agent: *\ndisallow: /*.php\n', 'x', '/a/b.php?x=1'), false, 'no $');
eq(allowed('user-agent: *\ndisallow: /fish\n', 'x', '/Fish'), true, 'case-sensitive path'); eq(allowed('user-agent: *\ndisallow: /fish\n', 'x', '/fish.html'), false, 'prefix match'); eq(allowed('user-agent: *\ndisallow: /fish\n', 'x', '/fi'), true, 'shorter URL');
// most specific wins, allow wins ties
var sp = 'user-agent: *\ndisallow: /folder/\nallow: /folder/page\n';
eq([allowed(sp, 'x', '/folder/other'), allowed(sp, 'x', '/folder/page'), allowed(sp, 'x', '/folder/page2')], [false, true, true], 'longer allow wins');
var tie = 'user-agent: *\ndisallow: /p\nallow: /p\n'; eq(allowed(tie, 'x', '/p'), true, 'equal allow and disallow: allow'); eq(R.check(R.parse(tie), 'x', '/p').deciding.type, 'allow', 'deciding is allow');
eq(allowed('user-agent: *\nallow: /p\ndisallow: /p\n', 'x', '/p'), true, 'order does not matter for a tie');
eq(allowed('user-agent: *\ndisallow:\n', 'x', '/anything'), true, 'empty disallow allows all'); eq(allowed('user-agent: *\ndisallow: /\n', 'x', '/anything'), false, 'disallow all');
eq(allowed('user-agent: *\ndisallow: /\n', 'x', '/robots.txt'), true, '/robots.txt always allowed'); eq(allowed('user-agent: *\ndisallow: /\n', 'x', 'https://e.com/robots.txt'), true, 'full robots URL');
eq(allowed('user-agent: *\ndisallow: /\nallow: /$\n', 'x', '/'), true, 'allow root only'); eq(allowed('user-agent: *\ndisallow: /\nallow: /$\n', 'x', '/a'), false, 'allow root only blocks the rest');
// parsing leniency and errors
eq(allowed('DISALLOW: /x\nUser-Agent: *\nDisallow: /y # c\n', 'x', '/x'), true, 'rule before the first group is ignored'); eq(allowed('User-Agent:*\nDisallow:/y # c\n', 'x', '/y'), false, 'no spaces, comment, keys in any case');
eq(allowed('user-agent: *\r\ndisallow: /a\r\ndisallow: /b\r', 'x', '/b'), false, 'CRLF and CR line ends'); eq(allowed('\uFEFFuser-agent: *\ndisallow: /a\n', 'x', '/a'), false, 'BOM tolerated');
eq(allowed('user-agent: *\ndisallow: admin\n', 'x', '/admin'), true, 'pattern without / is ignored'); eq(R.parse('user-agent: *\ndisallow: admin\n').warnings.length, 1, 'warning for that');
eq(allowed('user-agent: *\ndisallow: *private\n', 'x', '/a/private'), false, 'leading * applied with a warning'); eq(R.parse('user-agent: *\ndisallow: *private\n').warnings.length, 1, 'leading * warning');
eq(R.parse('user-agent: Bad Bot\ndisallow: /\n').warnings.length >= 1, true, 'invalid token warned');
eq(R.parse('user-agent: *\ncrawl-delay: 5\n').warnings.length, 1, 'crawl-delay noted');
eq(R.pathOf('https://e.com/a/b?c=1#frag'), '/a/b?c=1', 'url to path'); eq(R.pathOf('https://e.com'), '/', 'bare host'); eq(R.pathOf('?q=1'), '/?q=1', 'query only'); eq(R.pathOf('/x#y'), '/x', 'fragment dropped');
// fetch outcomes
eq(R.fetchOutcome('unavailable').allowedAll, true, '4xx'); eq(R.fetchOutcome('unreachable').allowedAll, false, '5xx'); eq(R.fetchOutcome('redirects').allowedAll, true, 'redirects'); eq(R.fetchOutcome('ok'), null, '200');
// random patterns: recursive matcher against a RegExp built independently
var seed = 4242; function rnd(k) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; }
var AL = ['a', 'b', '/', '.', '?', '=', 'x', '-', '%41'];
function rs(len) { var s = ''; for (var i = 0; i < len; i++) s += AL[rnd(AL.length)]; return s; }
function esc(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
for (var i = 0; i < 3000; i++) {
  var p = '/' + rs(rnd(6)), parts = []; for (var k = 0, c = rnd(3); k < c; k++) { var at = 1 + rnd(p.length); p = p.slice(0, at) + '*' + p.slice(at); }
  var dollar = rnd(3) === 0; if (dollar) p += '$';
  var str = '/' + rs(rnd(10)), body = dollar ? p.slice(0, -1) : p;
  var re = new RegExp('^' + body.split('*').map(function (x) { return x.split('').map(esc).join(''); }).join('[\\s\\S]*') + (dollar ? '$' : ''));
  eq(R.matchPattern(p, str), re.test(str), 'matcher ' + p + ' vs ' + str);
}
// random files: decision equals a brute-force longest-match oracle
for (i = 0; i < 1500; i++) {
  var rules = [], lines = ['user-agent: *'];
  for (k = 0, c = 1 + rnd(5); k < c; k++) { var typ = rnd(2) ? 'allow' : 'disallow', pat = '/' + rs(rnd(5)) + (rnd(4) === 0 ? '*' + rs(rnd(2)) : '') + (rnd(5) === 0 ? '$' : ''); lines.push(typ + ': ' + pat); rules.push({ typ: typ, pat: pat }); }
  var u = '/' + rs(rnd(9)), best = null;
  rules.forEach(function (r) { var pp = r.pat; if (R.matchPattern(R.normalize(pp, true), R.normalize(u, false))) { var L = R.normalize(pp, true).length; if (!best || L > best.L || (L === best.L && r.typ === 'allow')) best = { L: L, typ: r.typ }; } });
  eq(allowed(lines.join('\n'), 'bot', u), best ? best.typ === 'allow' : true, 'file ' + lines.join('|') + ' url ' + u);
}
console.log(n + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
