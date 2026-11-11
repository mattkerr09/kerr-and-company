#!/usr/bin/env python3
"""Offline source, content and similarity checks for the twelve new trade pages."""
from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
import html
import itertools
import json
from pathlib import Path
import re
import statistics
import sys
import xml.etree.ElementTree as ET

import build_trade_pages as build

ROOT = build.ROOT
ERRORS = []


def require(condition, message):
    if not condition:
        ERRORS.append(message)


def strip_tags(source):
    return html.unescape(re.sub(r'<[^>]+>', ' ', source))


def without(source, tags):
    for tag in tags:
        source = re.sub(rf'<{tag}\b.*?</{tag}>', ' ', source, flags=re.S | re.I)
    return source


def body_words(source):
    # Intentionally identical to bbk-page-verify, including its head/title handling.
    source = without(source, ('script', 'style', 'nav', 'header', 'footer', 'noscript', 'svg'))
    return len(re.findall(r"[A-Za-z0-9$%][\w'’$%.,-]*", re.sub(r'<[^>]+>', ' ', source)))


def normalize(source):
    return ' '.join(re.findall(r'[a-z0-9]+', html.unescape(source).casefold()))


class Reader(HTMLParser):
    """Read prose and numeric claims independently of the rendering functions."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.prose = []
        self.visible = []
        self.claims = []
        self.unbound = []
        self.measure_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            return
        self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, text):
        tags = {tag for tag, _ in self.stack}
        if tags & {'script', 'style', 'head', 'nav', 'header', 'footer', 'noscript', 'svg'}:
            return
        self.visible.append(text)
        related = any(attrs.get('data-related') == 'trades' or attrs.get('class') in ('anext', 'related')
                      for _, attrs in self.stack)
        bound = next((attrs['data-count'] for _, attrs in self.stack if 'data-count' in attrs), None)
        if bound:
            self.claims.append((bound, text.strip()))
        elif re.search(r'\d', text) and not related and 'time' not in tags:
            self.unbound.append(text.strip())
        if not related and 'table' not in tags and tags & {'p', 'li', 'h2', 'h3', 'blockquote'}:
            self.prose.append(text)


def shingles(source):
    reader = Reader()
    reader.feed(source)
    words = normalize(' '.join(reader.prose)).split()
    return set(zip(*(words[i:] for i in range(5))))


def jaccard(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def raw_value(data, label):
    # Do not call the builder's value/count/prose helpers: check actual saved values.
    if label.startswith('town:'):
        return next(t['listings'] for t in data['towns'] if t['town'] == label.split(':', 1)[1])
    value = data['summary']
    for part in build.MEASURES[label][0].split('.'):
        value = value[part]
    return value


def check_summary(data, path):
    records = data['rows']
    readable = [r for r in records if r.get('read')]
    summary = data['summary']
    direct = {
        'businesses': len(records), 'site_read': len(readable),
        'website_listed': sum(bool(r.get('website_listed')) for r in records),
        'no_website_listed': sum(not r.get('website_listed') and not r.get('social_profile') for r in records),
        'social_profile_listed': sum(bool(r.get('social_profile')) for r in records),
        'not_business_site': sum(bool(r.get('not_business_site')) for r in records),
        'site_unreadable': sum(bool(r.get('unreadable')) for r in records),
        # Count distinct towns so repeated locations in one town cannot inflate overlap.
        'listed_in_more_than_one_town': sum(len(set(r['towns'])) > 1 for r in records),
        'listings_total': sum(t['listings'] for t in data['towns']),
        'towns_with_listings': sum(t['listings'] > 0 for t in data['towns']),
        'towns_named_median': statistics.median(r.get('towns_named', 0) for r in readable),
        'html_kb_median': statistics.median(r['html_kb'] for r in readable if r.get('html_kb')),
    }
    for key, expected in direct.items():
        require(summary[key] == expected, f'{path}: source summary disagrees with saved businesses: {key}')
    require(summary['towns_without_listings'] == [t['town'] for t in data['towns'] if not t['listings']],
            f'{path}: source towns without listings disagree')
    for key, actual in summary['of_sites_read'].items():
        require(actual == sum(r.get(key) is True for r in readable),
                f'{path}: source homepage count disagrees: {key}')
    for town in data['towns']:
        town_slug = re.sub(r'[^a-z0-9]+', '-', town['town'].lower())
        source = build.DATA / f"{data['trade'].replace(' ', '-')}-{town_slug}-{build.DATE}.json"
        saved = json.loads(source.read_text())
        require(saved['listings'] == town['listings'] and saved['summary'] == town['summary'],
                f'{path}: regional town summary differs from saved town file: {town["town"]}')


def run():
    pages = {ROOT / 'articles' / build.filename(p): p for p in build.PAGES}
    trades = sorted(ROOT.glob('articles/*-websites-west-michigan.html'))
    require(len(trades) == 20, 'Expected exactly twenty trade articles')
    sources = {path: path.read_text() for path in ROOT.glob('articles/*.html')}
    all_names = set()
    for page in build.PAGES:
        for path in build.DATA.glob(f"{page['source']}-*-{build.DATE}.json"):
            data = json.loads(path.read_text())
            all_names.update(normalize(r.get('name') or '') for r in data.get('rows', []))
    all_names.discard('')
    questions_seen = {}
    word_counts = {}
    all_titles = build.titles()
    sitemap = ET.parse(ROOT / 'sitemap.xml').getroot()
    namespace = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    sitemap_urls = [u.find('s:loc', namespace).text for u in sitemap]

    for path in trades:
        source = sources[path]
        graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', source, re.S)[1])['@graph']
        faq = next(item for item in graph if item['@type'] == 'FAQPage')['mainEntity']
        for item in faq:
            question = normalize(item['name'])
            require(question not in questions_seen,
                    f'FAQ question repeated: {path.name} and {questions_seen.get(question)}: {item["name"]}')
            questions_seen[question] = path.name
        if path not in pages:
            continue
        page = pages[path]
        data = build.load_data(page)
        check_summary(data, path.name)
        reader = Reader()
        reader.feed(source)
        word_counts[path.name] = body_words(source)
        require(word_counts[path.name] >= 1000, f'{path.name}: fewer than 1000 body words')
        require(not reader.unbound, f'{path.name}: numeric text without a source binding: {reader.unbound}')
        labels = Counter(label for label, _ in reader.claims)
        for label, actual in reader.claims:
            try:
                require(float(actual) == raw_value(data, label),
                        f'{path.name}: count differs from JSON: {label}={actual}')
            except (KeyError, ValueError, StopIteration):
                ERRORS.append(f'{path.name}: invalid count: {label}={actual}')
        require(set(build.MEASURES) <= labels.keys(), f'{path.name}: a measured finding is missing')
        require(all(labels['town:' + t['town']] == 1 for t in data['towns']),
                f'{path.name}: missing or duplicate town counts')
        visible = ' '.join(reader.visible)
        normalized = ' ' + normalize(visible) + ' '
        for name in sorted(all_names):
            require(' ' + name + ' ' not in normalized,
                    f'{path.name}: a measured business name appears in visible text: {name}')
        banned = r'\b(?:tap_to_call|business_schema|dollar_figure|html_kb|towns_named|rows|fields|signals|entries|clients?)\b'
        require(not re.search(banned, source, re.I), f'{path.name}: banned internal or demonstration wording')
        require(not re.search('[\u2013\u2014]', source), f'{path.name}: en or em dash')
        require(not re.search(r'\$\d', source), f'{path.name}: unexpected money amount')
        require(len(re.findall(r'<h1\b', source)) == 1, f'{path.name}: h1 count')
        qa = re.search(r'<div class="qa">(.*?)\n</div>', source, re.S)
        require(qa is not None and len(re.findall(r'<p>', qa[1])) == 3, f'{path.name}: quick answer must have three paragraphs')
        require('Published 11 November 2026' in source and 'Updated 11 November 2026' in source,
                f'{path.name}: publication dates')
        require(f'<link rel="canonical" href="{build.BASE}articles/{path.name}">' in source,
                f'{path.name}: canonical')
        for tag in ('nav', 'footer'):
            require(build.block(source, tag) == build.block(sources[ROOT / 'articles/plumber-websites-west-michigan.html'], tag),
                    f'{path.name}: {tag} differs from model')
        article = next(item for item in graph if item['@type'] == 'Article')
        require(article['datePublished'] == build.DATE and article['dateModified'] == build.DATE,
                f'{path.name}: structured dates')
        require(article['headline'] == page['title'] and article['mainEntityOfPage'] == build.BASE + 'articles/' + path.name,
                f'{path.name}: Article title or URL')
        require(any(item['@type'] == 'BreadcrumbList' for item in graph), f'{path.name}: no breadcrumbs')
        visible_faq = re.findall(r'<div class="faq-item"><h3>(.*?)</h3><p>(.*?)</p></div>', source, re.S)
        require(len(visible_faq) >= 3 and len(visible_faq) == len(faq), f'{path.name}: visible FAQ count')
        for (question, answer), structured in zip(visible_faq, faq):
            require(normalize(strip_tags(question)) == normalize(structured['name']) and
                    normalize(strip_tags(answer)) == normalize(structured['acceptedAnswer']['text']),
                    f'{path.name}: visible FAQ differs from structured answer')
            # A sentence-level copy from the body would defeat the distinct FAQ requirement.
            body = source[source.index('<body>'):source.index('<h2>Questions before the first enquiry</h2>')]
            require(normalize(strip_tags(answer)) not in normalize(strip_tags(body)),
                    f'{path.name}: FAQ answer copied from body')
        related = re.search(r'<section class="anext" data-related="trades">(.*?)</section>', source, re.S)[1]
        for name, title in all_titles.items():
            require(f'<a href="/articles/{name}">{html.escape(title)}</a>' in related,
                    f'{path.name}: missing trade link or wrong title: {name}')
        body = source[source.index('<body>'):]
        external = re.findall(r'href="(https?://[^"]+)"', body)
        require(external == ['https://kerrandcompanyholdings.com/'], f'{path.name}: unexpected external body link')
        for href in re.findall(r'href="(/[^"#?]*)', source):
            target = ROOT / href.lstrip('/')
            require(target.exists(), f'{path.name}: dead internal link: {href}')
        url = build.BASE + 'articles/' + path.name
        require(sitemap_urls.count(url) == 1, f'{path.name}: sitemap URL missing or duplicated')
        lastmod = next(u.find('s:lastmod', namespace).text for u in sitemap if u.find('s:loc', namespace).text == url)
        require(lastmod == build.DATE, f'{path.name}: sitemap date')

    sets = {path: shingles(source) for path, source in sources.items()}
    highest_trade = (0.0, '', '')
    for a, b in itertools.combinations(trades, 2):
        score = jaccard(sets[a], sets[b])
        highest_trade = max(highest_trade, (score, a.name, b.name))
        require(score < 0.40, f'Trade prose Jaccard {score:.4f} >= 0.40: {a.name}, {b.name}')
    highest_other = (0.0, '', '')
    for a in pages:
        for b in sources:
            if a == b:
                continue
            score = jaccard(sets[a], sets[b])
            highest_other = max(highest_other, (score, a.name, b.name))
            require(score < 0.50, f'Other article prose Jaccard {score:.4f} >= 0.50: {a.name}, {b.name}')
    for name, words in word_counts.items():
        print(f'{name}: {words} body words')
    print('Highest trade prose Jaccard: %.4f %s / %s' % highest_trade)
    print('Highest new-page/other-article prose Jaccard: %.4f %s / %s' % highest_other)
    if ERRORS:
        for error in ERRORS:
            print('FAIL: ' + error)
        print(f'FAILED: {len(ERRORS)} checks')
        return 1
    print(f'OK: twelve pages; source counts checked; {len(questions_seen)} unique trade FAQ questions; '
          f'{len(sources)} articles compared')
    return 0


if __name__ == '__main__':
    sys.exit(run())
