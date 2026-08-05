"use client";

export function CookiePreferenceReset() {
  return (
    <button
      className="button secondary"
      type="button"
      onClick={() => {
        window.localStorage.removeItem("giromesa:cookie-consent");
        window.location.reload();
      }}
    >
      Revisar preferências de cookies
    </button>
  );
}
