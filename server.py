"""Run the calculator and its market-data API: python3 server.py."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
from urllib.parse import urlsplit
import argparse
from api.market import handler as MarketHandler


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path in ('/api/market', '/api/market.py'):
            return MarketHandler.do_GET(self)
        return super().do_GET()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(Path(__file__).parent)))
    print(f'Smith Manoeuvre calculator: http://localhost:{args.port}', flush=True)
    server.serve_forever()
