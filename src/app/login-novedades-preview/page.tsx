"use client";

// TEMPORAL: vista de prueba de la ventana de novedades. Borrar tras revisar.
import { useState } from "react";
import { Modal } from "@/components/ui";
import { UpdateBody, UpdateReactions } from "@/components/update-card";
import { APP_UPDATES } from "@/lib/updates";

export default function Page() {
  const [i, setI] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [k, setK] = useState(0);
  const u = APP_UPDATES[i]!;
  return (
    <div className="p-4">
      <button id="next" onClick={() => { setI((i + 1) % APP_UPDATES.length); setK(k + 1); }}>next</button>
      <button id="admin" onClick={() => setAdmin(!admin)}>admin</button>
      <Modal
        key={k}
        open
        onClose={() => undefined}
        placement="center"
        size="sm"
        dismissible={admin}
        footer={
          admin ? (
            <div className="space-y-3">
              <UpdateReactions onReact={() => undefined} />
              <p className="text-center text-[11px] text-muted">Vista previa: no cuenta como vista ni reacción.</p>
            </div>
          ) : (
            <UpdateReactions onReact={() => undefined} />
          )
        }
      >
        <UpdateBody update={u} />
      </Modal>
    </div>
  );
}
