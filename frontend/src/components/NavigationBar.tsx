import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  UserIcon,
  CalculatorIcon,
  QrCodeIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

const NavigationBar: React.FC = () => {
  const location = useLocation();

  const navItems = [
    {
      path: "/onboarding",
      label: "Login",
      icon: <UserIcon className="h-6 w-6" />,
    },
    {
      path: "/terminal",
      label: "Terminal",
      icon: <CalculatorIcon className="h-6 w-6" />,
    },
    {
      path: "/checkout",
      label: "Checkout",
      icon: <QrCodeIcon className="h-6 w-6" />,
    },
    {
      path: "/ledger",
      label: "Ledger",
      icon: <ClipboardDocumentListIcon className="h-6 w-6" />,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-md flex justify-around py-2">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`flex flex-col items-center flex-1 py-2 ${
            location.pathname === item.path
              ? "text-blue-600 font-bold"
              : "text-gray-600"
          }`}
        >
          {item.icon}
          <span className="text-sm">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
};

export default NavigationBar;
