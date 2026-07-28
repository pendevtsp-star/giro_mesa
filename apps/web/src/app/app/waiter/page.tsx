"use client";

import dynamic from "next/dynamic";

const OrderStepper = dynamic(() => import("../../../components/order-stepper/OrderStepper"), {
  ssr: false,
});

export default function WaiterPage() {
  return <OrderStepper />;
}
