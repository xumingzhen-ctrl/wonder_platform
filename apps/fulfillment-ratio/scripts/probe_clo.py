import re
raw = open('data/raw/CLO/2026-09-05/zh-hk/page.html').read()
pat1 = re.compile(r'["\']([^"\']*(?:fulfil|ratio|dividend)[^"\']*)["\']', re.I)
for m in sorted(set(pat1.findall(raw))):
    if len(m) < 150:
        print('STR:', m)
print('---')
pat2 = re.compile(r'(?:url|href|src)\s*[:=]\s*["\']([^"\']*(?:json|api|ajax)[^"\']*)["\']', re.I)
for m in sorted(set(pat2.findall(raw))):
    print('EP:', m[:140])
