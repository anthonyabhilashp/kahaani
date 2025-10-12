import fs from "fs";
import path from "path";

export class JobLogger {
  private logPath: string;
  private stream: fs.WriteStream;

  constructor(jobId: string, context: string = "general") {
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const logFile = `log_${jobId}_${context}.txt`;
    this.logPath = path.join(logDir, logFile);
    this.stream = fs.createWriteStream(this.logPath, { flags: "a" });
  }

  private write(level: string, msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${msg}\n`;
    this.stream.write(line);
    console.log(line.trim());
  }

  log(msg: string) {
    this.write("INFO", msg);
  }

  error(msg: string, err?: any) {
    this.write("ERROR", `${msg}${err ? " " + (err.message || err) : ""}`);
  }

  close() {
    this.stream.end();
  }
}
