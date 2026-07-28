"use client";

import { RefreshCw, WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        backgroundColor: "#0D1B2A",
        color: "#fff",
      }}
    >
      <WifiOff size={64} style={{ marginBottom: "1.5rem", opacity: 0.6 }} />
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Sem conexão</h1>
      <p style={{ opacity: 0.7, marginBottom: "1.5rem", maxWidth: "400px" }}>
        Você está offline. Verifique sua conexão com a internet e tente novamente.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1.5rem",
          backgroundColor: "#F5A623",
          color: "#0D1B2A",
          border: "none",
          borderRadius: "8px",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <RefreshCw size={18} /> Tentar novamente
      </button>
    </main>
  );
}
