# Dev-only static server: no-store cache headers so module edits show up
# on every reload. Not part of the shipped game.
import http.server


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


http.server.test(HandlerClass=Handler, port=8734, bind='127.0.0.1')
