// src/schemas/subscription.schemas.js
import { z } from 'zod';

/** Transacción firmada de StoreKit 2 (Transaction.jwsRepresentation). */
export const appleVerifySchema = z.object({
  signed_transaction:  z.string().min(20, 'signed_transaction es requerido.'),
  signed_renewal_info: z.string().min(20).optional().nullable(),
});

/** Compra de Google Play Billing. */
export const googleVerifySchema = z.object({
  purchase_token: z.string().min(10, 'purchase_token es requerido.'),
  product_id:     z.string().trim().min(1).max(120).optional().nullable(),
});
