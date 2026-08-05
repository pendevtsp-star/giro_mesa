"use client";

import { useEffect, useState } from "react";

const consentKey = "giromesa:cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(consentKey) === null);
  }, []);

  if (!visible) return null;

  const choose = (value: "accepted" | "rejected") => {
    window.localStorage.setItem(consentKey, value);
    setVisible(false);
  };

  return (
    <section className="cookie-consent" aria-label="Preferências de cookies">
      <strong>Preferências de cookies</strong>
      <p>
        Usamos apenas recursos essenciais neste momento. Analytics e marketing permanecem
        desativados até seu consentimento.
      </p>
      <div>
        <button
          className="button secondary compact"
          type="button"
          onClick={() => choose("rejected")}
        >
          Recusar opcionais
        </button>
        <button className="button primary compact" type="button" onClick={() => choose("accepted")}>
          Aceitar opcionais
        </button>
        <a href="/cookies">Saiba mais</a>
      </div>
    </section>
  );
}
