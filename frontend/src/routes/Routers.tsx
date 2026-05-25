import React from "react";
import { Routes, Route } from "react-router-dom";
import MerchantOnboarding from "../components/MerchantOnboarding";
import TerminalPad from "../components/TerminalPad";
import DynamicQRCheckout from "../components/DynamicQRCheckout";
import EarningsLedger from "../components/EarningsLedger";

const Router: React.FC = () => {
  return (
    <Routes>
      <Route path="/onboarding" element={<MerchantOnboarding />} />
      <Route path="/terminal" element={<TerminalPad />} />
      <Route
        path="/checkout"
        element={
          <DynamicQRCheckout payload={{ amount: 100, currency: "USD" }} />
        }
      />
      <Route path="/ledger" element={<EarningsLedger />} />
    </Routes>
  );
};

export default Router;
