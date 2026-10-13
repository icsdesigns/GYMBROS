"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Diario de los cambios de estructura de un entreno en curso (series y
 * ejercicios añadidos o quitados), para poder "Descartar cambios".
 *
 * Cada operación guarda lo justo para deshacerla. Se deshacen en orden inverso
 * al que se hicieron, que es la única forma de que los números de serie vuelvan
 * a cuadrar. Se recuerda en el dispositivo (clave por entreno) para que un
 * recargo de la página no deje cambios sin poder descartar.
 */
export type RemovedSetSnapshot = {
  setId: string;
  workoutExerciseId: string;
  setNumber: number;
  reps: number;
  weight: number;
  completed: boolean;
  touched: boolean;
};

export type EditOp =
  | { type: "addSet"; setId: string; workoutExerciseId: string }
  | { type: "addExercise"; workoutExerciseId: string }
  | { type: "removeSet"; snapshot: RemovedSetSnapshot };

const KEY_PREFIX = "gymbros:workout-edits:";
const keyFor = (workoutId: string) => `${KEY_PREFIX}${workoutId}`;

/** Lo guardado para este entreno; `null` si el dispositivo no deja leerlo. */
function load(workoutId: string): EditOp[] | null {
  try {
    const raw = localStorage.getItem(keyFor(workoutId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as EditOp[]) : [];
  } catch {
    return null;
  }
}

/**
 * Solo hay un entreno abierto a la vez: los diarios de otros entrenos (que se
 * terminaron en otro dispositivo o se cerraron solos) ya no sirven.
 */
function dropOthers(workoutId: string) {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(KEY_PREFIX) && k !== keyFor(workoutId)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* sin memoria del dispositivo: nada que limpiar */
  }
}

function save(workoutId: string, ops: EditOp[]) {
  try {
    if (ops.length === 0) localStorage.removeItem(keyFor(workoutId));
    else localStorage.setItem(keyFor(workoutId), JSON.stringify(ops));
  } catch {
    /* sin memoria del dispositivo: el diario vive solo mientras la página siga abierta */
  }
}

export function useWorkoutEditJournal(workoutId: string | undefined) {
  const [ops, setOps] = useState<EditOp[]>([]);

  // Recupera el diario de este entreno al abrir la página y sigue los cambios
  // que hagan otras pestañas del mismo dispositivo sobre el mismo entreno
  useEffect(() => {
    if (!workoutId) {
      setOps([]);
      return;
    }
    dropOthers(workoutId);
    setOps(load(workoutId) ?? []);
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyFor(workoutId) || e.key === null) setOps(load(workoutId) ?? []);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [workoutId]);

  const update = useCallback(
    (fn: (current: EditOp[]) => EditOp[]) => {
      // Se parte de lo guardado, no solo de lo de esta pestaña: así dos
      // pestañas abiertas no se pisan el diario la una a la otra. Se hace fuera
      // del actualizador de estado, que React puede llamar dos veces.
      const stored = workoutId ? load(workoutId) : null;
      if (!workoutId || stored === null) {
        setOps((current) => fn(current));
        return;
      }
      const next = fn(stored);
      save(workoutId, next);
      setOps(next);
    },
    [workoutId],
  );

  const recordAddSet = useCallback(
    (setId: string, workoutExerciseId: string) =>
      update((cur) =>
        // Una serie de un ejercicio añadido ya se deshace al quitar el ejercicio
        cur.some((o) => o.type === "addExercise" && o.workoutExerciseId === workoutExerciseId)
          ? cur
          : [...cur, { type: "addSet", setId, workoutExerciseId }],
      ),
    [update],
  );

  const recordAddExercise = useCallback(
    (workoutExerciseId: string) =>
      update((cur) => [...cur, { type: "addExercise", workoutExerciseId }]),
    [update],
  );

  const recordRemoveSet = useCallback(
    (snapshot: RemovedSetSnapshot) =>
      update((cur) => {
        // Quitar una serie que se había añadido en este entreno es anular el añadido
        if (cur.some((o) => o.type === "addSet" && o.setId === snapshot.setId)) {
          return cur.filter((o) => !(o.type === "addSet" && o.setId === snapshot.setId));
        }
        // Ni hace falta recordar las series de un ejercicio que se añadió después
        if (cur.some((o) => o.type === "addExercise" && o.workoutExerciseId === snapshot.workoutExerciseId)) {
          return cur;
        }
        return [...cur, { type: "removeSet", snapshot }];
      }),
    [update],
  );

  const clear = useCallback(() => update(() => []), [update]);

  return { ops, recordAddSet, recordAddExercise, recordRemoveSet, clear };
}
