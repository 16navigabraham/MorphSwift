import React, { useState, useEffect } from "react";
import QRCode from "qrcode.react";

interface DynamicQRCheckoutProps {
  payload: Record<string, unknown>;
}

const DynamicQRCheckout: React.FC<DynamicQRCheckoutProps> = ({ payload }) => {
  const [paid, setPaid] = useState<boolean>(false);

  useEffect(() => {
    // Simulate listening to blockchain events
    const timer = setTimeout(() => setPaid(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
      {!paid ? (
        <>
          <QRCode value={JSON.stringify(payload)} size={200} />
          <div className="mt-4 animate-spin border-4 border-blue-400 border-t-transparent rounded-full w-10 h-10"></div>
          <p className="mt-2 text-gray-600">Waiting for payment...</p>
        </>
      ) : (
        <div className="text-green-600 text-3xl font-bold">
          ✔ Payment Received
        </div>
      )}
    </div>
  );
};

export default DynamicQRCheckout;
