"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker?.register) {
      return;
    }

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

    return undefined;
  }, []);

  return null;
}
