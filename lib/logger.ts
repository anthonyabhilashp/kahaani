import fs from "fs";
import path from "path";

const IST_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Kolkata",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

function getISTTimestamp(): string {
  return `${new Date().toLocaleString("en-IN", IST_OPTIONS)} IST`;
}

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
    const timestamp = getISTTimestamp();
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
