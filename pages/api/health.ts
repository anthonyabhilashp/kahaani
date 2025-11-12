import type { NextApiRequest, NextApiResponse } from "next";

// Global flag set by server.js during shutdown
declare global {
  var isShuttingDown: boolean | undefined;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Return 503 if server is shutting down (Railway will route traffic elsewhere)
  if (global.isShuttingDown) {
    return res.status(503).json({
      status: "shutting_down",
      message: "Server is gracefully shutting down. Please try again shortly."
    });
  }

  res.status(200).json({ status: "ok" });
}
