// Biblical and theological terms glossary for consistent translation

export interface GlossaryEntry {
  es: string;
  it: string;
  de: string;
}

export const glossary: Record<string, GlossaryEntry> = {
  // Biblical Names
  "Paul": { es: "Pablo", it: "Paolo", de: "Paulus" },
  "Peter": { es: "Pedro", it: "Pietro", de: "Petrus" },
  "Mary": { es: "María", it: "Maria", de: "Maria" },
  "John": { es: "Juan", it: "Giovanni", de: "Johannes" },
  "James": { es: "Santiago", it: "Giacomo", de: "Jakobus" },
  "Jesus": { es: "Jesús", it: "Gesù", de: "Jesus" },
  "Moses": { es: "Moisés", it: "Mosè", de: "Mose" },
  "Abraham": { es: "Abraham", it: "Abramo", de: "Abraham" },
  "Isaac": { es: "Isaac", it: "Isacco", de: "Isaak" },
  "Jacob": { es: "Jacob", it: "Giacobbe", de: "Jakob" },
  "Joseph": { es: "José", it: "Giuseppe", de: "Josef" },
  "David": { es: "David", it: "Davide", de: "David" },
  "Solomon": { es: "Salomón", it: "Salomone", de: "Salomo" },
  "Noah": { es: "Noé", it: "Noè", de: "Noah" },
  
  // Places
  "Jerusalem": { es: "Jerusalén", it: "Gerusalemme", de: "Jerusalem" },
  "Bethlehem": { es: "Belén", it: "Betlemme", de: "Bethlehem" },
  "Nazareth": { es: "Nazaret", it: "Nazaret", de: "Nazareth" },
  "Galilee": { es: "Galilea", it: "Galilea", de: "Galiläa" },
  "Jordan": { es: "Jordán", it: "Giordano", de: "Jordan" },
  
  // Theological Terms
  "Holy Spirit": { es: "Espíritu Santo", it: "Spirito Santo", de: "Heiliger Geist" },
  "God": { es: "Dios", it: "Dio", de: "Gott" },
  "Lord": { es: "Señor", it: "Signore", de: "Herr" },
  "Christ": { es: "Cristo", it: "Cristo", de: "Christus" },
  "Messiah": { es: "Mesías", it: "Messia", de: "Messias" },
  "Savior": { es: "Salvador", it: "Salvatore", de: "Erlöser" },
  "Sin": { es: "Pecado", it: "Peccato", de: "Sünde" },
  "Salvation": { es: "Salvación", it: "Salvezza", de: "Erlösung" },
  "Kingdom of God": { es: "Reino de Dios", it: "Regno di Dio", de: "Reich Gottes" },
  "Kingdom of Heaven": { es: "Reino de los Cielos", it: "Regno dei Cieli", de: "Himmelreich" },
  "Grace": { es: "Gracia", it: "Grazia", de: "Gnade" },
  "Faith": { es: "Fe", it: "Fede", de: "Glaube" },
  "Hope": { es: "Esperanza", it: "Speranza", de: "Hoffnung" },
  "Love": { es: "Amor", it: "Amore", de: "Liebe" },
  "Prayer": { es: "Oración", it: "Preghiera", de: "Gebet" },
  "Cross": { es: "Cruz", it: "Croce", de: "Kreuz" },
  "Resurrection": { es: "Resurrección", it: "Resurrezione", de: "Auferstehung" },
  "Heaven": { es: "Cielo", it: "Cielo", de: "Himmel" },
  "Hell": { es: "Infierno", it: "Inferno", de: "Hölle" },
  "Angel": { es: "Ángel", it: "Angelo", de: "Engel" },
  "Satan": { es: "Satanás", it: "Satana", de: "Satan" },
  "Devil": { es: "Diablo", it: "Diavolo", de: "Teufel" },
  "Prophet": { es: "Profeta", it: "Profeta", de: "Prophet" },
  "Apostle": { es: "Apóstol", it: "Apostolo", de: "Apostel" },
  "Disciple": { es: "Discípulo", it: "Discepolo", de: "Jünger" },
  "Church": { es: "Iglesia", it: "Chiesa", de: "Kirche" },
  "Gospel": { es: "Evangelio", it: "Vangelo", de: "Evangelium" },
  "Scripture": { es: "Escritura", it: "Scrittura", de: "Schrift" },
  "Bible": { es: "Biblia", it: "Bibbia", de: "Bibel" },
  "Testament": { es: "Testamento", it: "Testamento", de: "Testament" },
  "Covenant": { es: "Pacto", it: "Patto", de: "Bund" },
  "Baptism": { es: "Bautismo", it: "Battesimo", de: "Taufe" },
  "Communion": { es: "Comunión", it: "Comunione", de: "Abendmahl" },
  "Holy Communion": { es: "Santa Comunión", it: "Santa Comunione", de: "Heiliges Abendmahl" },
  
  // Common phrases
  "Praise the Lord": { es: "Alabado sea el Señor", it: "Sia lodato il Signore", de: "Gelobt sei der Herr" },
  "Thanks be to God": { es: "Gracias a Dios", it: "Grazie a Dio", de: "Gott sei Dank" },
  "In Jesus' name": { es: "En el nombre de Jesús", it: "Nel nome di Gesù", de: "In Jesu Namen" },
  "Amen": { es: "Amén", it: "Amen", de: "Amen" },
  "Hallelujah": { es: "Aleluya", it: "Alleluia", de: "Halleluja" }
};

/**
 * Gets the glossary injection for a specific language
 */
export function getGlossaryPrompt(targetLanguage: string): string {
  const langCode = targetLanguage.toLowerCase();
  
  // Check if we support this language
  if (!['es', 'it', 'de'].includes(langCode)) {
    return '';
  }
  
  const entries = Object.entries(glossary)
    .map(([english, translations]) => {
      const translation = translations[langCode as keyof GlossaryEntry];
      return `- "${english}" → "${translation}"`;
    })
    .join('\n');
  
  return `IMPORTANT: Use these exact translations for the following terms:\n${entries}\n`;
}

/**
 * Language-specific translation instructions
 */
export function getLanguageInstructions(targetLanguage: string): string {
  const langCode = targetLanguage.toLowerCase();
  
  const instructions: Record<string, string> = {
    es: `Spanish Translation Rules:
- Use formal "usted" for addressing the congregation
- Keep biblical references in Reina-Valera 1960 (RVR-60) style
- Maintain reverent and formal tone
- Use Latin American Spanish (avoid Spain-specific terms)`,
    
    it: `Italian Translation Rules:
- Use formal "Lei" for addressing the congregation
- Keep biblical references in Nuova Riveduta or CEI style
- Maintain reverent and elevated language
- Use standard Italian (avoid regional dialects)`,
    
    de: `German Translation Rules:
- Use formal "Sie" for addressing the congregation
- Keep biblical references in Luther Bible style
- Maintain reverent and formal tone
- Use High German (Hochdeutsch)`
  };
  
  return instructions[langCode] || '';
}