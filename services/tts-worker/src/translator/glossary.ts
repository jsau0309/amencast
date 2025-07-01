// services/gpu-worker/src/translator/glossary.ts

// The glossary provides consistent translations for key theological and biblical terms.
export const glossary: { [key: string]: { [lang: string]: string } } = {
  "Paul":      { es: "Pablo",      de: "Paulus",      it: "Paolo" },
  "Peter":     { es: "Pedro",      de: "Petrus",      it: "Pietro" },
  "Mary":      { es: "María",      de: "Maria",       it: "Maria" },
  "John":      { es: "Juan",       de: "Johannes",    it: "Giovanni" },
  "James":     { es: "Santiago",   de: "Jakobus",     it: "Giacomo" },
  "Jesus":     { es: "Jesús",      de: "Jesus",       it: "Gesù" },
  "Holy Spirit": { es: "Espíritu Santo", de: "Heiliger Geist", it: "Spirito Santo" },
  "God":       { es: "Dios",       de: "Gott",        it: "Dio" },
  "Lord":      { es: "Señor",      de: "Herr",        it: "Signore" },
  "Moses":     { es: "Moisés",     de: "Mose",        it: "Mosè" },
  "Abraham":   { es: "Abraham",    de: "Abraham",     it: "Abramo" },
  "Isaac":     { es: "Isaac",      de: "Isaak",       it: "Isacco" },
  "Jacob":     { es: "Jacob",      de: "Jakob",       it: "Giacobbe" },
  "Joseph":    { es: "José",       de: "Josef",       it: "Giuseppe" },
  "David":     { es: "David",      de: "David",       it: "Davide" },
  "Solomon":   { es: "Salomón",    de: "Salomo",      it: "Salomone" },
  "Noah":      { es: "Noé",        de: "Noah",        it: "Noè" },
  "Jerusalem": { es: "Jerusalén",  de: "Jerusalem",   it: "Gerusalemme" },
  "Bethlehem": { es: "Belén",      de: "Bethlehem",   it: "Betlemme" },
  "Sin":       { es: "Pecado",     de: "Sünde",       it: "Peccato" },
  "Salvation": { es: "Salvación",  de: "Erlösung",    it: "Salvezza" },
  "Kingdom of God": { es: "Reino de Dios", de: "Reich Gottes", it: "Regno di Dio" },
  "Disciple":  { es: "Discípulo",  de: "Jünger",      it: "Discepolo" },
  "Apostle":   { es: "Apóstol",    de: "Apostel",     it: "Apostolo" },
  "Grace":     { es: "Gracia",     de: "Gnade",       it: "Grazia" },
  "Faith":     { es: "Fe",         de: "Glaube",      it: "Fede" },
  "Hope":      { es: "Esperanza",  de: "Hoffnung",    it: "Speranza" },
  "Love":      { es: "Amor",       de: "Liebe",       it: "Amore" },
  "Prayer":    { es: "Oración",    de: "Gebet",       it: "Preghiera" },
  "Cross":     { es: "Cruz",       de: "Kreuz",       it: "Croce" },
  "Resurrection": { es: "Resurrección", de: "Auferstehung", it: "Resurrezione" },
  "Heaven":    { es: "Cielo",      de: "Himmel",      it: "Cielo" },
  "Hell":      { es: "Infierno",   de: "Hölle",       it: "Inferno" },
  "Angel":     { es: "Ángel",      de: "Engel",       it: "Angelo" },
  "Satan":     { es: "Satanás",    de: "Satan",       it: "Satana" },
  "Prophet":   { es: "Profeta",    de: "Prophet",     it: "Profeta" }
};

/**
 * Builds a system message containing glossary terms for a specific target language.
 * @param languageCode The target language (e.g., 'es', 'de').
 * @returns A string formatted for inclusion in the system prompt, or an empty string if language not supported.
 */
export function buildGlossaryInjection(languageCode: string): string {
    const supportedLanguages = ['es', 'de', 'it'];
    if (!supportedLanguages.includes(languageCode)) {
        return '';
    }

    const terms = Object.entries(glossary)
      .map(([en, langs]) => `- ${en} -> ${langs[languageCode]}`)
      .join('\n');
  
    return `You MUST use the following glossary for translation consistency:\n${terms}\n---`;
} 