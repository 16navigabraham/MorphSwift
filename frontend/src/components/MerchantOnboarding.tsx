import React, { useEffect } from "react";
import { Magic } from "magic-sdk";

const magic = new Magic("YOUR_MAGIC_PUBLISHABLE_KEY");

const MerchantOnboarding: React.FC = () => {
  useEffect(() => {
    // Silent key generation happens automatically with Magic
  }, []);

  const loginWithGoogle = async (): Promise<void> => {
    await magic.oauth.loginWithRedirect({
      provider: "google",
      redirectURI: window.location.origin + "/terminal",
    });
  };

  const loginWithEmail = async (): Promise<void> => {
    const email = prompt("Enter your email:");
    if (email) {
      await magic.auth.loginWithMagicLink({ email });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <h1 className="text-2xl font-bold mb-6">Merchant Login</h1>
      <button
        onClick={loginWithGoogle}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        Login with Google
      </button>
      <button
        onClick={loginWithEmail}
        className="bg-green-500 text-white px-4 py-2 rounded"
      >
        Login with Email Link
      </button>
    </div>
  );
};

export default MerchantOnboarding;
