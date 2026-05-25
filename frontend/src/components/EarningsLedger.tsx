import React, { useState } from "react";

interface Transaction {
  id: number;
  date: string;
  amount: string;
}

const EarningsLedger: React.FC = () => {
  const [transactions] = useState<Transaction[]>([
    { id: 1, date: "2026-05-25", amount: "50 USDC" },
    { id: 2, date: "2026-05-24", amount: "30 USDC" },
  ]);

  const withdraw = (): void => {
    alert("Withdrawal initiated!");
  };

  return (
    <div className="p-6 bg-gray-100 h-screen">
      <h2 className="text-2xl font-bold mb-4">Earnings Ledger</h2>
      <ul className="mb-6">
        {transactions.map((tx) => (
          <li
            key={tx.id}
            className="flex justify-between bg-white p-2 mb-2 rounded shadow"
          >
            <span>{tx.date}</span>
            <span>{tx.amount}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={withdraw}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Withdraw
      </button>
    </div>
  );
};

export default EarningsLedger;
