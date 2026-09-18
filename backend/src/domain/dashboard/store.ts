import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { logger } from "../../lib/logger";
import type { Dashboard, DashboardRevision } from "./types";

const MAX_REVISIONS = 20;

type Snapshot = {
  dashboards: Dashboard[];
  revisions: Record<string, DashboardRevision[]>;
};

const empty = (): Snapshot => ({ dashboards: [], revisions: {} });

export class DashboardStore {
  private state: Snapshot = empty();
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path: string | null) {}

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.path) return;
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      this.state = {
        dashboards: Array.isArray(parsed.dashboards) ? parsed.dashboards : [],
        revisions: parsed.revisions && typeof parsed.revisions === "object" ? parsed.revisions : {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err: error, path: this.path }, "Dashboard store unreadable; starting empty");
      }
      this.state = empty();
    }
  }

  // Serialized through a promise chain so concurrent saves cannot interleave writes.
  private persist() {
    if (!this.path) return;
    const path = this.path;
    const payload = JSON.stringify(this.state, null, 2);
    this.writing = this.writing
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, payload, "utf8");
        await rename(temporary, path);
      })
      .catch((error) => {
        logger.error({ err: error, path }, "Failed to persist dashboards");
      });
  }

  async flush() {
    await this.writing;
  }

  async list(): Promise<Dashboard[]> {
    await this.load();
    return [...this.state.dashboards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Dashboard | undefined> {
    await this.load();
    return this.state.dashboards.find((dashboard) => dashboard.id === id);
  }

  async save(dashboard: Dashboard): Promise<Dashboard> {
    await this.load();
    const index = this.state.dashboards.findIndex((item) => item.id === dashboard.id);
    if (index >= 0) {
      const previous = this.state.dashboards[index]!;
      const history = this.state.revisions[dashboard.id] ?? [];
      history.push({ version: previous.version, savedAt: previous.updatedAt, dashboard: previous });
      this.state.revisions[dashboard.id] = history.slice(-MAX_REVISIONS);
      this.state.dashboards[index] = dashboard;
    } else {
      this.state.dashboards.push(dashboard);
    }
    this.persist();
    return dashboard;
  }

  async remove(id: string): Promise<boolean> {
    await this.load();
    const before = this.state.dashboards.length;
    this.state.dashboards = this.state.dashboards.filter((dashboard) => dashboard.id !== id);
    delete this.state.revisions[id];
    const removed = this.state.dashboards.length < before;
    if (removed) this.persist();
    return removed;
  }

  async revisions(id: string): Promise<DashboardRevision[]> {
    await this.load();
    return [...(this.state.revisions[id] ?? [])].reverse();
  }

  async reset() {
    this.state = empty();
    this.loaded = true;
    this.persist();
    await this.flush();
  }
}

let shared: DashboardStore | null = null;

export function dashboardStore() {
  if (!shared) {
    const configured = process.env["DASHBOARD_STORE_PATH"];
    shared = new DashboardStore(configured === "" ? null : resolve(configured ?? ".data/dashboards.json"));
  }
  return shared;
}

export function setDashboardStore(store: DashboardStore | null) {
  shared = store;
}
