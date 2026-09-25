"use strict";

// Minimal fetch wrapper: hard timeout, no caching, no credentials, no redirects.
// Every response body is treated as untrusted and validated by callers.

export async function fetchText(url, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error"
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.kind = "http";
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    if (typeof text !== "string" || text.length > 1_000_000) {
      const err = new Error("response too large");
      err.kind = "invalid";
      throw err;
    }
    return text;
  } catch (e) {
    if (e && e.name === "AbortError") {
      const err = new Error("request timed out");
      err.kind = "timeout";
      throw err;
    }
    if (!e || !e.kind) {
      const err = new Error("network error");
      err.kind = "network";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("invalid JSON");
    err.kind = "invalid";
    throw err;
  }
}