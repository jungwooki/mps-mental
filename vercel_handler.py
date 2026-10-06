"""Reuse authenticated AI routes without exposing the local static file server."""
import urllib.parse

from server import Handler


class VercelHandler(Handler):
    def do_GET(self):
        if urllib.parse.urlparse(self.path).path.rstrip('/') == '/api/health':
            return super().do_GET()
        return self.json_response(405, {'error': 'POST 요청이 필요합니다.'})

    def do_HEAD(self):
        self.send_response(405)
        self.send_header('Allow', 'GET, POST')
        self.end_headers()

    def log_message(self, format, *args):
        # Do not put request paths or identifiers in function logs.
        pass
