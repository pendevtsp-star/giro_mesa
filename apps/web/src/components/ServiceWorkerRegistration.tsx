"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "activated") {
                  window.location.reload();
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error("SW registration failed:", err);
        });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_STARTED") {
          console.log("Background sync started");
        }
      });
    }
  }, []);

  return null;
}
