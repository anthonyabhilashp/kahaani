const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let isShuttingDown = false;
const connections = new Set();
let server;

app.prepare().then(() => {
  server = createServer(async (req, res) => {
    try {
      // If server is shutting down, reject new requests with user-friendly message
      if (isShuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'System Maintenance in Progress',
          message: 'We are deploying an update to improve your experience. Please try again in a few moments.',
          retry_after: 30, // Suggest retry after 30 seconds
          status: 'maintenance'
        }));
        return;
      }

      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Track all connections
  server.on('connection', (conn) => {
    connections.add(conn);
    conn.on('close', () => {
      connections.delete(conn);
    });
  });

  // Graceful shutdown on SIGTERM (Railway/Docker sends this)
  process.on('SIGTERM', gracefulShutdown);

  // Graceful shutdown on SIGINT (Ctrl+C during development)
  process.on('SIGINT', gracefulShutdown);

  function gracefulShutdown() {
    if (isShuttingDown) {
      console.log('⚠️ Shutdown already in progress...');
      return;
    }

    console.log('🛑 Shutdown signal received, starting graceful shutdown...');
    console.log(`📊 Active connections: ${connections.size}`);
    isShuttingDown = true;
    global.isShuttingDown = true; // Signal health check to return 503

    // Stop accepting new connections
    server.close(() => {
      console.log('✅ HTTP server closed - no more connections accepted');
      console.log('👋 Exiting gracefully');
      process.exit(0);
    });

    // Give ongoing requests time to complete (5 minutes for video generation)
    const shutdownTimeout = setTimeout(() => {
      console.error('⏰ Graceful shutdown timeout - forcing exit');
      console.error(`💀 Forcefully closing ${connections.size} remaining connections`);

      // Force close all remaining connections
      connections.forEach((conn) => {
        try {
          conn.destroy();
        } catch (err) {
          console.error('Error destroying connection:', err);
        }
      });

      process.exit(1);
    }, 300000); // 5 minutes - enough time for complex video generation

    // Don't let the timeout prevent exit if everything closes naturally
    shutdownTimeout.unref();
  }

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);
  });
});
