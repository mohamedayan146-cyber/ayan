import { useState } from "react";

const translations = {
  en: { greeting: "Hello!" },
  es: { greeting: "¡Hola!" },
};

const App = () => {
  const [language, setLanguage] = useState("en");

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "es" : "en"));
  };

  return (
    <div>
      <button onClick={toggleLanguage}>
        Switch to {language === "en" ? "Spanish" : "English"}
      </button>
      <h1>{translations[language].greeting}</h1>
    </div>
  );
};

export default App;