"""Same-origin market data endpoint, usable on Vercel and by server.py."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit, urlencode
from urllib.request import Request, urlopen
from datetime import datetime, timezone
import json
import math
import time

SYMBOLS = {'VFV', 'BMO', 'XEQT', 'RY', 'TD', 'ZNQ', 'CM', 'XDIV', 'VDY', 'XEI', 'XIU', 'XIC', 'VCN', 'ZCN', 'VEQT', 'ZSP', 'ZEB'}
CACHE = {}


def summarize_chart(chart, symbol, now=None):
    now = now or time.time()
    closes = chart['indicators']['quote'][0]['close']
    prices = [(t, float(p)) for t, p in zip(chart['timestamp'], closes)
              if p is not None and math.isfinite(p) and p > 0]
    if len(prices) < 2 or chart['meta'].get('currency') != 'CAD':
        raise ValueError('Insufficient CAD price history')
    end, price = prices[-1]
    # Yahoo close is split-adjusted but not dividend-adjusted: never use adjclose
    # here, because the forecast adds distributions separately.
    returns = {}
    for years in (1, 3, 5, 10):
        target = end - years * 365.25 * 86400
        prior = [(t, p) for t, p in prices if t <= target]
        if not prior:
            continue
        start, first = prior[-1]
        elapsed = (end - start) / (365.25 * 86400)
        returns[str(years)] = (price / first) ** (1 / elapsed) - 1
    events = chart.get('events', {})
    dividends = events.get('dividends', {}).values()
    splits = events.get('splits', {}).values()
    trailing = 0
    for d in dividends:
        if end - 365.25 * 86400 < d['date'] <= end:
            amount = d['amount']
            for split in splits:
                if d['date'] < split['date'] <= end:
                    amount /= split['numerator'] / split['denominator']
            trailing += amount
    return {'symbol': symbol, 'currency': 'CAD', 'price': price,
            'dividendYield': trailing / price, 'annualDistribution': trailing,
            'priceReturns': returns, 'asOf': datetime.fromtimestamp(end, timezone.utc).isoformat(),
            'fetchedAt': datetime.fromtimestamp(now, timezone.utc).isoformat(),
            'historyStart': datetime.fromtimestamp(prices[0][0], timezone.utc).isoformat(),
            'source': 'Yahoo Finance', 'sourceUrl': f'https://finance.yahoo.com/quote/{symbol}.TO/history/',
            'method': 'Trailing 12-month cash distributions / latest close; annualized split-adjusted price returns excluding distributions.'}


def market_data(symbol):
    symbol = symbol.upper()
    if symbol not in SYMBOLS:
        raise ValueError('Choose a supported Canadian ticker')
    cached = CACHE.get(symbol)
    if cached and time.time() - cached[0] < 3600:
        return cached[1]
    query = urlencode({'range': 'max', 'interval': '1d', 'events': 'div,splits'})
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.TO?{query}'
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    with urlopen(req, timeout=20) as response:
        payload = json.load(response)
    result = payload.get('chart', {}).get('result')
    if not result:
        raise ValueError('Market provider did not return data')
    data = summarize_chart(result[0], symbol)
    CACHE[symbol] = (time.time(), data)
    return data


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        symbol = parse_qs(urlsplit(self.path).query).get('symbol', [''])[0]
        try:
            data = market_data(symbol)
            status = 200
        except ValueError as error:
            data, status = {'error': str(error)}, 400
        except Exception:
            data, status = {'error': 'Market data unavailable. Try again or enter assumptions manually.'}, 502
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'public, max-age=3600' if status == 200 else 'no-store')
        self.end_headers()
        self.wfile.write(body)
