import { FESTIVAL_EVENT_IDS, type FestivalEventId } from "@/config/events/types";
import { MY_CREATION_ENTRY_KEYS, MY_CREATION_ID_PATTERN, MY_CREATIONS_MAX_ENTRIES } from "@/config/myCreations.config";
import { MY_CREATIONS_STORAGE_KEY } from "@/config/ownership.config";
import { isClientZoneId } from "@/core/world/zoneManager";
import type { PublicCreation } from "@/services/api/creationTypes";
import { getBrowserLocalStorage } from "./deviceOwnerToken";

/** One krathong this device created (owner decision 12). Public fields only: no coord, no wish text, no token or hash. */
export interface MyCreationEntry {
  readonly id: string; // lowercase uuid (MY_CREATION_ID_PATTERN)
  readonly eventId: FestivalEventId;
  readonly zoneId: number; // isClientZoneId
  readonly createdAt: string; // ISO-8601, server time (from the POST response)
  readonly expiresAt: string; // ISO-8601, later than createdAt
}
export type MyCreationSource = Pick<PublicCreation, "id" | "eventId" | "zoneId" | "createdAt" | "expiresAt">;
export type MyCreationRecordResult =
  | { readonly recorded: false }
  | { readonly recorded: true; readonly persisted: boolean }; // persisted false = memory fallback (page lifetime only)

export interface MyCreationsVault {
  /** Unexpired entries of `eventId`, newest first (createdAt desc, then id asc). Never throws, never writes. */
  list(eventId: FestivalEventId, nowMs: number): readonly MyCreationEntry[];
  /** Adds (or keeps) one entry, prunes expired ones, keeps at most MY_CREATIONS_MAX_ENTRIES, notifies subscribers. Never throws. */
  record(source: MyCreationSource, nowMs: number): MyCreationRecordResult;
  /** Called after every successful record. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}
export interface MyCreationsVaultOptions {
  readonly storage: Storage | null; // null = no usable storage
  readonly maxEntries?: number; // default MY_CREATIONS_MAX_ENTRIES
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Allowlist copy (by field name, no spread) or null. Accepts objects with extra fields (e.g. a full PublicCreation). */
export function toMyCreationEntry(source: unknown): MyCreationEntry | null {
  if (!isPlainObject(source)) return null;
  const { id, eventId, zoneId, createdAt, expiresAt } = source;
  if (typeof id !== "string" || !MY_CREATION_ID_PATTERN.test(id)) return null;
  if (typeof eventId !== "string" || !(FESTIVAL_EVENT_IDS as readonly string[]).includes(eventId)) return null;
  if (!isClientZoneId(zoneId)) return null;
  if (!isIsoDate(createdAt) || !isIsoDate(expiresAt)) return null;
  if (!(Date.parse(expiresAt) > Date.parse(createdAt))) return null;
  return Object.freeze({ id, eventId: eventId as FestivalEventId, zoneId, createdAt, expiresAt });
}

const SORTED_ENTRY_KEYS = [...MY_CREATION_ENTRY_KEYS].sort();

/** Parses the stored string. Bad input gives []. Drops entries whose key set is not exactly MY_CREATION_ENTRY_KEYS; keeps the first of duplicate ids. */
export function parseMyCreationEntries(raw: string | null): readonly MyCreationEntry[] {
  if (raw === null) return Object.freeze([]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Object.freeze([]);
  }
  if (!Array.isArray(parsed)) return Object.freeze([]);
  const seen = new Set<string>();
  const out: MyCreationEntry[] = [];
  for (const el of parsed as unknown[]) {
    if (!isPlainObject(el)) continue;
    const keys = Object.keys(el).sort();
    if (keys.length !== SORTED_ENTRY_KEYS.length || keys.some((k, i) => k !== SORTED_ENTRY_KEYS[i])) continue;
    const entry = toMyCreationEntry(el);
    if (entry === null || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return Object.freeze(out);
}

function sortNewestFirst(entries: readonly MyCreationEntry[]): MyCreationEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : 1));
}

export function createMyCreationsVault(options: MyCreationsVaultOptions): MyCreationsVault {
  const { storage } = options;
  const maxEntries = options.maxEntries ?? MY_CREATIONS_MAX_ENTRIES;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError("maxEntries");
  let memory: readonly MyCreationEntry[] | null = null; // set only when a write failed
  const listeners = new Set<() => void>();

  function readAll(): readonly MyCreationEntry[] {
    if (memory !== null) return memory;
    if (storage === null) return [];
    try {
      return parseMyCreationEntries(storage.getItem(MY_CREATIONS_STORAGE_KEY));
    } catch {
      return [];
    }
  }

  return {
    list(eventId, nowMs) {
      const entries = readAll().filter((e) => e.eventId === eventId && Date.parse(e.expiresAt) > nowMs);
      return Object.freeze(sortNewestFirst(entries));
    },
    record(source, nowMs) {
      const entry = toMyCreationEntry(source);
      if (entry === null || Date.parse(entry.expiresAt) <= nowMs) return { recorded: false };
      const next = sortNewestFirst([
        entry,
        ...readAll().filter((e) => e.id !== entry.id && Date.parse(e.expiresAt) > nowMs),
      ]).slice(0, maxEntries);
      let persisted = false;
      if (storage === null) {
        memory = Object.freeze(next);
      } else {
        try {
          storage.setItem(MY_CREATIONS_STORAGE_KEY, JSON.stringify(next));
          memory = null;
          persisted = true;
        } catch {
          memory = Object.freeze(next);
        }
      }
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          /* a failing subscriber must not break recording */
        }
      }
      return { recorded: true, persisted };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let singleton: MyCreationsVault | null = null;

/** Lazily created browser singleton. Throws on the server, like the token vault. */
export function getMyCreationsVault(): MyCreationsVault {
  if (typeof window === "undefined") throw new Error("MyCreationsVault is client-only");
  singleton ??= createMyCreationsVault({ storage: getBrowserLocalStorage() });
  return singleton;
}

/** What MFW-23's release orchestrator offers (structural). */
export interface CreationSavedSource {
  onCreationSaved(listener: (creation: PublicCreation) => void): () => void;
}

/** Records every saved creation into the vault. Returns the unsubscribe. */
export function installMyCreationsRecorder(
  source: CreationSavedSource,
  vault: MyCreationsVault = getMyCreationsVault(),
  now: () => number = Date.now,
): () => void {
  return source.onCreationSaved((creation) => {
    vault.record(creation, now());
  });
}
