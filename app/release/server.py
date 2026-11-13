"""Local-only launcher. Python 3, no dependencies or Internet needed."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import webbrowser

PAGE = Path(__file__).with_name('index.html').read_bytes()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] not in ('/', '/index.html'):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(PAGE)))
        self.end_headers()
        self.wfile.write(PAGE)

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 8765), Handler)
    address = 'http://127.0.0.1:8765/'
    print('Kitchen World: ' + address + '\nKeep this window open. Ctrl+C stops the game server.', flush=True)
    webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
