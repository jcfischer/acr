/**
 * CLI Progress Bar Utility
 *
 * Provides a visual progress bar for terminal output.
 */

export interface ProgressBarOptions {
  /** Total width of the bar in characters (default: 40) */
  width?: number;
  /** Character for completed portion (default: █) */
  completeChar?: string;
  /** Character for incomplete portion (default: ░) */
  incompleteChar?: string;
  /** Show percentage (default: true) */
  showPercent?: boolean;
  /** Show count (default: true) */
  showCount?: boolean;
  /** Label prefix */
  label?: string;
}

/**
 * Create a progress bar string
 *
 * @param current - Current progress value
 * @param total - Total value
 * @param options - Display options
 * @returns Formatted progress bar string
 */
export function formatProgressBar(
  current: number,
  total: number,
  options: ProgressBarOptions = {}
): string {
  const {
    width = 40,
    completeChar = "█",
    incompleteChar = "░",
    showPercent = true,
    showCount = true,
    label = "",
  } = options;

  // Handle edge cases
  if (total <= 0) {
    const emptyBar = incompleteChar.repeat(width);
    return `${label}[${emptyBar}] 0%`;
  }

  const percent = Math.min(100, Math.round((current / total) * 100));
  const completed = Math.round((current / total) * width);
  const remaining = width - completed;

  const bar = completeChar.repeat(completed) + incompleteChar.repeat(remaining);

  const parts: string[] = [];
  if (label) parts.push(label);
  parts.push(`[${bar}]`);
  if (showPercent) parts.push(`${percent}%`);
  if (showCount) parts.push(`(${current}/${total})`);

  return parts.join(" ");
}

/**
 * Progress reporter for embedding operations
 */
export interface ProgressReporter {
  /** Called when progress updates */
  onProgress: (current: number, total: number, phase: string) => void;
  /** Called when a phase starts */
  onPhaseStart: (phase: string, total: number) => void;
  /** Called when a phase completes */
  onPhaseComplete: (phase: string, count: number) => void;
}

/**
 * Create a CLI progress reporter that writes to stdout
 *
 * @param options - Progress bar options
 * @returns ProgressReporter
 */
export function createCliProgressReporter(
  options: ProgressBarOptions = {}
): ProgressReporter {
  let lastLine = "";

  const clearLine = () => {
    if (lastLine) {
      process.stdout.write("\r" + " ".repeat(lastLine.length) + "\r");
    }
  };

  const writeLine = (line: string) => {
    clearLine();
    process.stdout.write(line);
    lastLine = line;
  };

  return {
    onProgress(current: number, total: number, phase: string) {
      const bar = formatProgressBar(current, total, {
        ...options,
        label: `   ${phase}: `,
      });
      writeLine(bar);
    },

    onPhaseStart(phase: string, total: number) {
      clearLine();
      console.log(`\n${phase}:`);
      if (total > 0) {
        const bar = formatProgressBar(0, total, {
          ...options,
          label: "   ",
        });
        writeLine(bar);
      }
    },

    onPhaseComplete(phase: string, count: number) {
      clearLine();
      console.log(`   ✓ ${count} items processed`);
    },
  };
}

/**
 * Progress callback type for indexing operations
 */
export type ProgressCallback = (
  current: number,
  total: number,
  phase: string
) => void;

/**
 * Simple progress spinner for indeterminate operations
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string = "";

  start(message: string) {
    this.message = message;
    this.frameIndex = 0;
    this.interval = setInterval(() => {
      process.stdout.write(
        `\r${this.frames[this.frameIndex]} ${this.message}`
      );
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  update(message: string) {
    this.message = message;
  }

  stop(finalMessage?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write("\r" + " ".repeat(this.message.length + 4) + "\r");
    if (finalMessage) {
      console.log(finalMessage);
    }
  }
}
