import React, { useState, useEffect } from "react";

const TerminalPad: React.FC = () => {
  const [amount, setAmount] = useState<string>("");
  const [stablecoinValue, setStablecoinValue] = useState<number>(0);

  useEffect(() => {
    const rate = 1; // Example: 1 USD = 1 USDC
    setStablecoinValue(amount ? parseFloat(amount) * rate : 0);
  }, [amount]);

  const handleKeyPress = (num: string): void => {
    setAmount((prev) => prev + num);
  };

  const clearInput = (): void => setAmount("");

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white">
      <h2 className="text-xl mb-4">Enter Amount</h2>
      <div className="text-3xl mb-2">{amount || "0.00"}</div>
      <div className="text-green-600 mb-6">
        ≈ {stablecoinValue.toFixed(2)} USDC
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
          <button
            key={num}
            onClick={() => handleKeyPress(num.toString())}
            className="bg-gray-200 text-xl p-4 rounded"
          >
            {num}
          </button>
        ))}
        <button
          onClick={clearInput}
          className="col-span-3 bg-red-400 text-white p-4 rounded"
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default TerminalPad;
