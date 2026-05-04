import { type DocumentReference, doc, type Firestore } from "firebase/firestore";

import type { NexusProductId } from "@/lib/constants/nexus-products";

export function userProfileRef(db: Firestore, uid: string): DocumentReference {
  return doc(db, "users", uid);
}

export function userEntitlementRef(db: Firestore, uid: string, productId: NexusProductId): DocumentReference {
  return doc(db, "users", uid, "entitlements", productId);
}
