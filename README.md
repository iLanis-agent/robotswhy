# RobotsWhy

robots.txt tester. Paste a robots.txt, name the crawler's product token and list URLs; each gets an ALLOWED or BLOCKED verdict, the deciding rule with its line number, and every other rule that matched. Shows which group applied (token match with merging, or the * group), warns about rules crawlers may ignore, and models what a 4xx, 5xx or too many redirects on robots.txt means.

- Live: https://ilanis-agent.github.io/robotswhy/
- App: https://ilanis-agent.github.io/robotswhy/app.html

Source fetched and read in full: RFC 9309 (Robots Exclusion Protocol): group syntax and merging (Figures 2 and 3), path matching and percent-encoding (Figure 4), special characters * and $ (Figures 5 and 6), most specific match and Allow-wins-ties, /robots.txt always allowed, access results (2.3.1).
Tests (4561 checks, `node test-engine.js`): the RFC's figures case by case, group parsing edge cases (blank lines, comments, Sitemap lines, CR line ends, BOM), wildcard matcher against an independently built RegExp on 3000 random patterns, and 1500 random robots.txt files decided against a brute-force longest-match check. The last check reuses this tool's own normalization and matcher, so it tests the decision logic, not the normalization.
Interpretation choices: the RFC says the most specific match is the one "that has the most octets" without saying whether * and $ count; the tool counts the characters of the normalized rule including them, as Google does. A rule starting with * is applied with a warning (outside the RFC grammar, accepted by common crawlers); a rule that does not start with / or * is ignored with a warning. Only product tokens are matched (no prefix matching, no full User-Agent strings). Crawl-delay is flagged as outside the RFC. The 500 KiB parsing limit and caching rules are not modelled. Robots rules are a request, not access control.
