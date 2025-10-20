import { enableIndexedDbPersistence } from "firebase/firestore";

import { firebaseDb } from "./firebase-client";

let persistencePromise: Promise<void> | null = null;

export function ensureFirestorePersistence(): Promise<void> | void {
  if (typeof window === "undefined") {
    return;
  }

  if (!persistencePromise) {
    persistencePromise = enableIndexedDbPersistence(firebaseDb).catch(error => {
      if ((error as { code?: string })?.code === "failed-precondition") {
        console.warn(
          "Firestore persistence desabilitada: múltiplas abas abertas. A aplicação continuará funcionando sem cache offline.",
        );
      } else if ((error as { code?: string })?.code === "unimplemented") {
        console.warn(
          "Firestore persistence não suportada neste navegador. A aplicação continuará funcionando sem cache offline.",
        );
      } else {
        console.warn("Não foi possível habilitar a persistência do Firestore", error);
      }
      persistencePromise = null;
    });
  }

  return persistencePromise;
}
