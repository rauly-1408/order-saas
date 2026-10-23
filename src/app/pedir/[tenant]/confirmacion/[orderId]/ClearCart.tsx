"use client";

import { useEffect } from "react";
import { useCart } from "@/store/cart";

// Tras pagar online el carrito se vacía aquí (si el pago fallaba, se conservaba
// para volver a intentarlo).
export default function ClearCart() {
  const clear = useCart((s) => s.clear);
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
