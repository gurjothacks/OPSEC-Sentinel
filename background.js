"use strict";

// OPSEC Sentinel - background entry (Firefox MV3 event page).
console.log("[opsec] background script loaded");
//
// Firefox does not expose DOM/WebRTC APIs inside MV3 service workers, so the
// background is an event page (background.scripts). It owns the central
// NetworkIdentity state and drives the toolbar action. It is woken by
// alarms, messages, onStartup and onInstalled, and suspended when idle.

import("./src/services/network-identity.js")
  .then(async (mod) => {
    const actionApi = browser.action || browser.browserAction;
    const service = await mod.NetworkIdentityService.load({
      storage: browser.storage,
      alarms: browser.alarms,
      action: actionApi,
      fetchImpl: fetch
    });

    browser.runtime.onInstalled.addListener(() => {
      service.refresh({ force: true });
    });
    browser.runtime.onStartup.addListener(() => {
      service.refresh({ force: true });
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm && alarm.name === "opsec-refresh") service.refresh();
    });

    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg.type !== "string") return undefined;
      const run = async () => {
        switch (msg.type) {
          case "opsec:getState":
            if (service.shouldAutoRefresh()) service.refresh();
            return { ok: true, state: service.getState() };
          case "opsec:refresh":
            await service.refresh({ force: true });
            return { ok: true, state: service.getState() };
          case "opsec:ackChange":
            await service.ackChange();
            return { ok: true, state: service.getState() };
          case "opsec:setSettings":
            await service.setSettings(msg.settings);
            return { ok: true, state: service.getState() };
          default:
            return { ok: false, error: "unknown message type" };
        }
      };
      run().then(
        (res) => sendResponse(res),
        (e) => sendResponse({ ok: false, error: String((e && e.message) || "error") })
      );
      return true; // async response
    });

    // Test/debug hook: expose the live service on the background window so the
    // RDP harness can drive scenario checks. Shipped artifact keeps this; it
    // exposes no secrets and no console logging.
    globalThis.__opsec = service;

    await service.init();
  })
  .catch((e) => {
    console.error("[opsec] background failed to start", e);
  });