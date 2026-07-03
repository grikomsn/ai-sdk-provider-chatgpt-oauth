import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CallbackResult {
  code: string;
  state: string;
}

export class OAuthCallbackServer {
  private server?: ReturnType<typeof createServer>;
  private port: number;

  constructor(port: number = 1455) {
    this.port = port;
  }

  /**
   * Start the callback server and wait for OAuth callback
   */
  async waitForCallback(expectedState: string, timeoutMs: number = 300000): Promise<string> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      let settled = false;
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.stop();
      };
      const resolveOnce = (code: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(code);
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      // Create HTTP server
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '', `http://localhost:${this.port}`);

        if (url.pathname === '/auth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          // Handle OAuth errors
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Authorization Failed</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center; }
                  .error { color: #d73a49; font-size: 20px; margin-bottom: 20px; }
                  .message { color: #586069; }
                </style>
              </head>
              <body>
                <div class="error">❌ Authorization Failed</div>
                <div class="message">Error: ${escapeHtml(error)}</div>
                <div class="message">${escapeHtml(url.searchParams.get('error_description') || '')}</div>
              </body>
              </html>
            `);

            rejectOnce(new Error(`OAuth error: ${error}`));
            return;
          }

          // Validate state to prevent CSRF attacks
          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Invalid State</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center; }
                  .error { color: #d73a49; font-size: 20px; margin-bottom: 20px; }
                </style>
              </head>
              <body>
                <div class="error">❌ Invalid State</div>
                <div>The authorization state doesn't match. Please try again.</div>
              </body>
              </html>
            `);

            rejectOnce(new Error('State mismatch - possible CSRF attack'));
            return;
          }

          // Success!
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Authorization Successful</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center; }
                  .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
                  .message { color: #586069; font-size: 16px; }
                  .close-hint { margin-top: 30px; color: #999; font-size: 14px; }
                </style>
                <script>
                  // Auto-close window after 3 seconds
                  setTimeout(() => {
                    window.close();
                    // If window.close() doesn't work (common in modern browsers)
                    document.querySelector('.close-hint').innerHTML = 'You can now close this window and return to the terminal.';
                  }, 3000);
                </script>
              </head>
              <body>
                <div class="success">✅ Authorization Successful!</div>
                <div class="message">You have successfully authorized the application.</div>
                <div class="close-hint">This window will close automatically...</div>
              </body>
              </html>
            `);

            resolveOnce(code);
            return;
          }

          // Missing code
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Missing Code</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center; }
                .error { color: #d73a49; font-size: 20px; }
              </style>
            </head>
            <body>
              <div class="error">❌ Missing authorization code</div>
            </body>
            </html>
          `);

          rejectOnce(new Error('Missing authorization code'));
        } else {
          // 404 for any other path
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      // Start listening
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`🔐 OAuth callback server listening on http://localhost:${this.port}`);
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        rejectOnce(new Error('Authorization timeout - no callback received'));
      }, timeoutMs);

      // Handle server errors
      this.server.on('error', (error) => {
        rejectOnce(error);
      });
    });
  }

  /**
   * Stop the server if it's running
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character
  );
}
