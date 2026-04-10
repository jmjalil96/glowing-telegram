import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

type LoggedChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface ProcessLogEntry {
  stream: "stdout" | "stderr";
  line: string;
}

export const collectProcessLogs = (
  childProcess: LoggedChildProcess,
): ProcessLogEntry[] => {
  const logs: ProcessLogEntry[] = [];
  const buffers: Record<ProcessLogEntry["stream"], string> = {
    stdout: "",
    stderr: "",
  };

  const collect = (stream: "stdout" | "stderr", chunk: string): void => {
    buffers[stream] += chunk;

    const lines = buffers[stream].split("\n");
    buffers[stream] = lines.pop() ?? "";

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      logs.push({
        stream,
        line: trimmedLine,
      });
    }
  };

  childProcess.stdout.setEncoding("utf8");
  childProcess.stderr.setEncoding("utf8");
  childProcess.stdout.on("data", (chunk: string) => {
    collect("stdout", chunk);
  });
  childProcess.stderr.on("data", (chunk: string) => {
    collect("stderr", chunk);
  });
  childProcess.once("close", () => {
    for (const stream of ["stdout", "stderr"] as const) {
      const trailingLine = buffers[stream].trim();

      if (!trailingLine) {
        continue;
      }

      logs.push({
        stream,
        line: trailingLine,
      });
    }
  });

  return logs;
};

export const waitForLog = async (
  logs: ProcessLogEntry[],
  matcher: (entry: ProcessLogEntry) => boolean,
  timeoutMs = 15_000,
): Promise<ProcessLogEntry> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = (): void => {
      const match = logs.find(matcher);

      if (match) {
        resolve(match);
        return;
      }

      if (Date.now() >= deadline) {
        reject(new Error("Timed out waiting for process log output"));
        return;
      }

      setTimeout(poll, 50);
    };

    poll();
  });

export const waitForExit = async (
  childProcess: LoggedChildProcess,
  timeoutMs = 15_000,
): Promise<number | null> =>
  new Promise((resolve, reject) => {
    if (childProcess.exitCode !== null) {
      resolve(childProcess.exitCode);
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for process exit"));
    }, timeoutMs);

    childProcess.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });

    childProcess.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
