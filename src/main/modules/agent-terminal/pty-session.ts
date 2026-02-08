import * as pty from "node-pty";
import { Observable, Subject, BehaviorSubject } from "rxjs";
import { randomUUID } from "crypto";
import type { SessionState } from "./types";

export interface PtySessionOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExitEvent {
  code: number | null;
  signal?: string;
}

export class PtySession {
  readonly id: string;
  readonly output$: Observable<Buffer>;
  readonly exit$: Observable<ExitEvent>;
  readonly state$: BehaviorSubject<SessionState>;

  private readonly ptyProcess: pty.IPty;
  private readonly outputSubject = new Subject<Buffer>();
  private readonly exitSubject = new Subject<ExitEvent>();
  private disposed = false;

  constructor(options: PtySessionOptions) {
    this.id = randomUUID();
    this.state$ = new BehaviorSubject<SessionState>("running");
    this.output$ = this.outputSubject.asObservable();
    this.exit$ = this.exitSubject.asObservable();

    const shell = options.command;
    const args = options.args ?? [];

    this.ptyProcess = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 30,
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env } as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      if (!this.disposed) {
        // Filter out Node.js debugger noise
        if (
          data.includes("Debugger listening on") ||
          data.includes("docs/inspector") ||
          data.includes("Debugger attached") ||
          data.includes("Waiting for the debugger to disconnect")
        ) {
          return;
        }
        this.outputSubject.next(Buffer.from(data));
      }
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      if (!this.disposed) {
        this.state$.next("exited");
        this.exitSubject.next({ code: exitCode, signal: signal?.toString() });
        this.exitSubject.complete();
        this.outputSubject.complete();
      }
    });
  }

  write(data: string): void {
    if (!this.disposed && this.state$.getValue() === "running") {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.disposed && this.state$.getValue() === "running") {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill(signal?: string): void {
    if (!this.disposed && this.state$.getValue() === "running") {
      this.ptyProcess.kill(signal);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.state$.getValue() === "running") {
      this.ptyProcess.kill();
    }

    this.outputSubject.complete();
    this.exitSubject.complete();
    this.state$.complete();
  }
}

export function createPtySession(options: PtySessionOptions): PtySession {
  return new PtySession(options);
}
