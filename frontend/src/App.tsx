import React from "react";
import { BrowserRouter } from "react-router-dom";
import Router from "./routes/Router";
import NavigationBar from "./components/NavigationBar";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="pb-16">
        {" "}
        {/* padding so content doesn't overlap nav */}
        <Router />
      </div>
      <NavigationBar />
    </BrowserRouter>
  );
};

export default App;
