"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker?.register) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_STARTED") {
        console.info("Background sync started");
      }
    };

    serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (!registration) {
          return;
        }
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
      .catch((error: unknown) => {
        console.warn("Service worker indisponível; o sistema continuará online.", error);
      });

    serviceWorker.addEventListener?.("message", handleMessage);
    return () => {
      serviceWorker.removeEventListener?.("message", handleMessage);
    };
  }, []);

  return null;
}
